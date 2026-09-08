const pool = require("../config/database");

// ============================================
// ITEM-TYPE DETECTION HELPERS
//
// Drinks are identified by PARTY TYPE = 'DRINK'
// or a category containing drink/beverage/bar/
// alcoholic/non-alcoholic. Food is anything
// that is not a drink. These helpers are used
// by the order status logic so a Chef action
// only ever touches food items and a Bartender
// action only ever touches drink items.
// ============================================
function isDrinkItemLocal(item) {
  const itemType = String(
    item.item_type || ""
  ).toUpperCase();
  const category = String(
    item.category_name || ""
  ).toLowerCase();

  return (
    itemType === "DRINK" ||
    category.includes("drink") ||
    category.includes("beverage") ||
    category.includes("bar") ||
    category.includes("alcoholic") ||
    category.includes("non-alcoholic")
  );
}

function buildDrinkConditionForItems() {
  return `
    mi.item_type = 'DRINK'
    OR COALESCE(mi.item_type, '') ILIKE '%DRINK%'
    OR COALESCE(c.name, '') ILIKE '%drink%'
    OR COALESCE(c.name, '') ILIKE '%beverage%'
    OR COALESCE(c.name, '') ILIKE '%bar%'
    OR COALESCE(c.name, '') ILIKE '%alcoholic%'
    OR COALESCE(c.name, '') ILIKE '%non-alcoholic%'
  `;
}

// ============================================
// RECALCULATE ORDER STATUS FROM ITEM STATUSES
//
// The overall order status is derived from the
// preparation status of EVERY order item:
//
//   - ALL items READY           -> READY
//   - any item PREPARING/READY  -> PREPARING
//   - no item started yet       -> leave as-is
//
// This is the function that prevents one staff
// member's action from marking the whole order
// (including the other role's items) as done.
// ============================================
async function recalculateOrderStatus(orderId) {
  const itemsResult = await pool.query(
    `
    SELECT
      oi.status,
      mi.item_type,
      c.name AS category_name
    FROM order_items oi
    INNER JOIN menu_items mi
      ON mi.id = oi.menu_item_id
    LEFT JOIN categories c
      ON c.id = mi.category_id
    WHERE oi.order_id = $1
    `,
    [orderId]
  );

  if (itemsResult.rows.length === 0) {
    return;
  }

  const statuses = itemsResult.rows.map(
    (item) => item.status || "PENDING"
  );

  const allReady = statuses.every(
    (itemStatus) => itemStatus === "READY"
  );

  const anyPreparing = statuses.some(
    (itemStatus) =>
      itemStatus === "PREPARING" ||
      itemStatus === "READY"
  );

  let newStatus = null;

  if (allReady) {
    newStatus = "READY";
  } else if (anyPreparing) {
    newStatus = "PREPARING";
  } else {
    // Every item is still PENDING; the order
    // status should not change here.
    return;
  }

  const orderResult = await pool.query(
    `
    SELECT status
    FROM orders
    WHERE id = $1
    `,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    return;
  }

  const currentStatus = orderResult.rows[0].status;

  const statusOrder = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "SERVED",
    "COMPLETED",
    "CANCELLED",
  ];

  const currentIndex =
    statusOrder.indexOf(currentStatus);
  const newIndex = statusOrder.indexOf(newStatus);

  // Only advance the order state forward.
  if (newIndex > currentIndex) {
    await pool.query(
      `
      UPDATE orders
      SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [newStatus, orderId]
    );
  }
}

// ============================================
// CREATE ORDER
// ============================================
const createOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      restaurant_id,
      customer_id,
      customer_name,
      customer_phone,
      table_number,
      special_request,
      items,
    } = req.body;

    if (!restaurant_id) {
      return res.status(400).json({
        message: "Restaurant is required",
      });
    }

    if (!customer_id) {
      return res.status(400).json({
        message: "Customer is required",
      });
    }

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({
        message: "Customer name is required",
      });
    }

    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({
        message: "Customer phone number is required",
      });
    }

    if (!table_number || !table_number.trim()) {
      return res.status(400).json({
        message: "Table number is required",
      });
    }

    if (
      !special_request ||
      !String(special_request).trim()
    ) {
      return res.status(400).json({
        message: "Special request or note is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Order must contain at least one item",
      });
    }

    await client.query("BEGIN");

    const restaurantResult = await client.query(
      `
      SELECT id
      FROM restaurants
      WHERE id = $1
      `,
      [restaurant_id]
    );

    if (restaurantResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    const customerResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [customer_id]
    );

    if (customerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Customer not found",
      });
    }

    const orderResult = await client.query(
      `
      INSERT INTO orders
      (
        restaurant_id,
        customer_id,
        customer_name,
        customer_phone,
        table_number,
        special_request,
        status,
        total_amount,
        estimated_wait_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, 0)
      RETURNING id
      `,
      [
        restaurant_id,
        customer_id,
        customer_name.trim(),
        customer_phone.trim(),
        table_number.trim(),
        String(special_request).trim(),
      ]
    );

    const orderId = orderResult.rows[0].id;

    let totalAmount = 0;
    let estimatedWaitMinutes = 0;

    for (const item of items) {
      const {
        menu_item_id,
        quantity,
        option_ids = [],
      } = item;

      if (!menu_item_id) {
        throw new Error(
          "Every order item must have a menu_item_id"
        );
      }

      const itemQuantity = Number(quantity);

      if (
        !Number.isInteger(itemQuantity) ||
        itemQuantity <= 0
      ) {
        throw new Error(
          `Invalid quantity for menu item ${menu_item_id}`
        );
      }

      const menuItemResult = await client.query(
        `
        SELECT
          id,
          price,
          preparation_time
        FROM menu_items
        WHERE id = $1
          AND restaurant_id = $2
          AND available = TRUE
        `,
        [
          menu_item_id,
          restaurant_id,
        ]
      );

      if (menuItemResult.rows.length === 0) {
        throw new Error(
          `Menu item ${menu_item_id} is unavailable or does not belong to this restaurant`
        );
      }

      const menuItem =
        menuItemResult.rows[0];

      const orderItemResult = await client.query(
        `
        INSERT INTO order_items
        (
          order_id,
          menu_item_id,
          quantity,
          unit_price
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          orderId,
          menu_item_id,
          itemQuantity,
          menuItem.price,
        ]
      );

      const orderItemId =
        orderItemResult.rows[0].id;

      let itemPreparationTime =
        Number(
          menuItem.preparation_time
        ) || 0;

      totalAmount +=
        Number(menuItem.price) *
        itemQuantity;

      if (Array.isArray(option_ids)) {
        for (const optionId of option_ids) {
          const optionResult =
            await client.query(
              `
              SELECT
                mo.id,
                mo.price,
                mo.preparation_time
              FROM menu_options mo
              INNER JOIN menu_item_options mio
                ON mio.menu_option_id = mo.id
              WHERE mo.id = $1
                AND mio.menu_item_id = $2
                AND mo.restaurant_id = $3
                AND mo.available = TRUE
              `,
              [
                optionId,
                menu_item_id,
                restaurant_id,
              ]
            );

          if (optionResult.rows.length === 0) {
            throw new Error(
              `Option ${optionId} is invalid for menu item ${menu_item_id}`
            );
          }

          const option =
            optionResult.rows[0];

          if (option.price === null) {
            throw new Error(
              `Option ${optionId} does not have a price`
            );
          }

          await client.query(
            `
            INSERT INTO order_item_options
            (
              order_item_id,
              menu_option_id,
              quantity,
              unit_price
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
              orderItemId,
              optionId,
              1,
              option.price,
            ]
          );

          totalAmount +=
            Number(option.price);

          itemPreparationTime +=
            Number(
              option.preparation_time
            ) || 0;
        }
      }

      estimatedWaitMinutes =
        Math.max(
          estimatedWaitMinutes,
          itemPreparationTime
        );
    }

    await client.query(
      `
      UPDATE orders
      SET
        total_amount = $1,
        estimated_wait_minutes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [
        totalAmount,
        estimatedWaitMinutes,
        orderId,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message:
        "Order created successfully",

      order: {
        id: orderId,
        restaurant_id:
          Number(restaurant_id),
        customer_id:
          Number(customer_id),
        customer_name:
          customer_name.trim(),
        customer_phone:
          customer_phone.trim(),
        table_number:
          table_number.trim(),
        special_request:
          String(special_request).trim(),
        total_amount:
          totalAmount,
        estimated_wait_minutes:
          estimatedWaitMinutes,
        status: "PENDING",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Create order error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to create order",
    });
  } finally {
    client.release();
  }
};


// ============================================
// GET ALL ORDERS
// ============================================
const getOrders = async (req, res) => {
  try {
    const { restaurant_id } =
      req.query;

    const values = [];
    let restaurantFilter = "";

    if (restaurant_id) {
      values.push(
        Number(restaurant_id)
      );

      restaurantFilter =
        `WHERE o.restaurant_id = $${values.length}`;
    }

    const result =
      await pool.query(
        `
        SELECT
          o.id,
          o.restaurant_id,
          r.name AS restaurant_name,

          o.customer_id,
          o.customer_name,
          o.customer_phone,
          o.table_number,
          o.special_request,

          o.waiter_id,
          waiter_user.name AS waiter_name,

          o.status,
          o.estimated_wait_minutes,
          o.total_amount,

          o.created_at,
          o.updated_at,

          COUNT(oi.id) AS item_count,

          COALESCE(
            (
              SELECT p.status
              FROM payments p
              WHERE p.order_id = o.id
              ORDER BY p.id DESC
              LIMIT 1
            ),
            'UNPAID'
          ) AS payment_status,

          (
            SELECT p.payment_method
            FROM payments p
            WHERE p.order_id = o.id
              AND p.status = 'PAID'
            ORDER BY p.id DESC
            LIMIT 1
          ) AS payment_method

        FROM orders o

        INNER JOIN restaurants r
          ON r.id = o.restaurant_id

        LEFT JOIN restaurant_staff waiter_staff
          ON waiter_staff.id = o.waiter_id

        LEFT JOIN users waiter_user
          ON waiter_user.id =
            waiter_staff.user_id

        LEFT JOIN order_items oi
          ON oi.order_id = o.id

        ${restaurantFilter}

        GROUP BY
          o.id,
          r.name,
          waiter_user.name

        ORDER BY
          CASE o.status
            WHEN 'PENDING' THEN 1
            WHEN 'CONFIRMED' THEN 2
            WHEN 'PREPARING' THEN 3
            WHEN 'READY' THEN 4
            WHEN 'SERVED' THEN 5
            WHEN 'COMPLETED' THEN 6
            WHEN 'CANCELLED' THEN 7
            ELSE 8
          END,
          o.created_at ASC
        `,
        values
      );

    return res.json(
      result.rows
    );
  } catch (error) {
    console.error(
      "Get orders error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch orders",
    });
  }
};


// ============================================
// GET RESTAURANT STAFF
// ============================================
const getRestaurantStaff = async (
  req,
  res
) => {
  try {
    const { restaurant_id } =
      req.query;

    if (!restaurant_id) {
      return res.status(400).json({
        message:
          "Restaurant is required",
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          rs.id,
          rs.user_id,
          rs.restaurant_id,
          rs.role,
          u.name
        FROM restaurant_staff rs
        INNER JOIN users u
          ON u.id = rs.user_id
        WHERE rs.restaurant_id = $1
          AND rs.role IN (
            'WAITER',
            'CHEF',
            'BARTENDER',
            'ADMIN'
          )
        ORDER BY
          CASE rs.role
            WHEN 'WAITER' THEN 1
            WHEN 'CHEF' THEN 2
            WHEN 'BARTENDER' THEN 3
            WHEN 'ADMIN' THEN 4
            ELSE 5
          END,
          u.name ASC
        `,
        [restaurant_id]
      );

    return res.json({
      staff: result.rows,
    });
  } catch (error) {
    console.error(
      "Get restaurant staff error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch restaurant staff",
    });
  }
};


// ============================================
// GET SINGLE ORDER
// ============================================
const getOrderById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const orderResult =
      await pool.query(
        `
        SELECT
          o.id,
          o.restaurant_id,
          r.name AS restaurant_name,

          o.customer_id,
          o.customer_name,
          o.customer_phone,
          o.table_number,
          o.special_request,

          o.waiter_id,
          waiter_user.name AS waiter_name,

          o.status,
          o.estimated_wait_minutes,
          o.total_amount,

          o.created_at,
          o.updated_at

        FROM orders o

        INNER JOIN restaurants r
          ON r.id = o.restaurant_id

        LEFT JOIN restaurant_staff waiter_staff
          ON waiter_staff.id = o.waiter_id

        LEFT JOIN users waiter_user
          ON waiter_user.id =
            waiter_staff.user_id

        WHERE o.id = $1
        `,
        [id]
      );

    if (
      orderResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const order =
      orderResult.rows[0];

    const itemsResult =
      await pool.query(
        `
        SELECT
          oi.id,
          oi.menu_item_id,
          mi.name AS menu_item_name,
          mi.item_type,
          oi.status AS preparation_status,

          mi.category_id,
          c.name AS category_name,

          oi.quantity,
          oi.unit_price,

          oi.chef_id,
          chef_user.name AS chef_name,

          oi.bartender_id,
          bartender_user.name AS bartender_name

        FROM order_items oi

        INNER JOIN menu_items mi
          ON mi.id = oi.menu_item_id

        LEFT JOIN categories c
          ON c.id = mi.category_id

        LEFT JOIN restaurant_staff chef_staff
          ON chef_staff.id = oi.chef_id

        LEFT JOIN users chef_user
          ON chef_user.id =
            chef_staff.user_id

        LEFT JOIN restaurant_staff bartender_staff
          ON bartender_staff.id =
            oi.bartender_id

        LEFT JOIN users bartender_user
          ON bartender_user.id =
            bartender_staff.user_id

        WHERE oi.order_id = $1

        ORDER BY oi.id ASC
        `,
        [id]
      );

    const items = [];

    for (
      const item of itemsResult.rows
    ) {
      const optionsResult =
        await pool.query(
          `
          SELECT
            oio.id,
            oio.menu_option_id,
            mo.name AS name,
            oio.quantity,
            oio.unit_price
          FROM order_item_options oio
          INNER JOIN menu_options mo
            ON mo.id =
              oio.menu_option_id
          WHERE oio.order_item_id = $1
          ORDER BY oio.id ASC
          `,
          [item.id]
        );

      items.push({
        ...item,
        options:
          optionsResult.rows,
      });
    }

    const paymentResult =
      await pool.query(
        `
        SELECT
          id,
          amount,
          payment_method,
          status,
          transaction_reference,
          paid_at
        FROM payments
        WHERE order_id = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [id]
      );

    const complaintResult =
      await pool.query(
        `
        SELECT
          id,
          customer_id,
          description,
          status,
          created_at
        FROM complaints
        WHERE order_id = $1
        ORDER BY created_at DESC
        `,
        [id]
      );

    const ratingResult =
      await pool.query(
        `
        SELECT
          id,
          customer_id,
          rating,
          comment,
          created_at
        FROM ratings
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [id]
      );

    return res.json({
      ...order,
      items,
      payment:
        paymentResult.rows[0] ||
        null,
      complaints:
        complaintResult.rows,
      rating:
        ratingResult.rows[0] ||
        null,
    });
  } catch (error) {
    console.error(
      "Get order error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch order",
    });
  }
};


// ============================================
// ASSIGN WAITER
// ============================================
const assignWaiter = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { waiter_id } =
      req.body;

    if (!waiter_id) {
      return res.status(400).json({
        message:
          "Waiter is required",
      });
    }

    const orderResult =
      await pool.query(
        `
        SELECT restaurant_id
        FROM orders
        WHERE id = $1
        `,
        [id]
      );

    if (
      orderResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const restaurantId =
      orderResult.rows[0]
        .restaurant_id;

    const waiterResult =
      await pool.query(
        `
        SELECT id
        FROM restaurant_staff
        WHERE id = $1
          AND restaurant_id = $2
          AND role = 'WAITER'
        `,
        [
          waiter_id,
          restaurantId,
        ]
      );

    if (
      waiterResult.rows.length === 0
    ) {
      return res.status(400).json({
        message:
          "Invalid waiter for this restaurant",
      });
    }

    const result =
      await pool.query(
        `
        UPDATE orders
        SET
          waiter_id = $1,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
        `,
        [
          waiter_id,
          id,
        ]
      );

    return res.json({
      message:
        "Waiter assigned successfully",
      order:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Assign waiter error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to assign waiter",
    });
  }
};


// ============================================
// ASSIGN CHEF / BARTENDER
//
// ONE CHEF PER ORDER (FOOD ITEMS) and
// ONE BARTENDER PER ORDER (DRINK ITEMS).
//
// Assigning a chef applies that chef to ALL food
// items on the order; assigning a bartender applies
// that bartender to ALL drink items on the order.
// Reassigning therefore REPLACES the previous
// assignment instead of mixing multiple staff on
// the same order.
//
// The food/drink classification is duplicated from
// the customer-facing logic so it always matches:
// drinks are identified by PARTY TYPE = 'DRINK' or
// a category containing drink/beverage/bar/alcoholic.
// Food assignments only ever write chef_id and
// bartender assignments only ever write bartender_id
// so the two roles never overwrite each other.
// ============================================
const assignPreparationStaff = async (
  req,
  res
) => {
  try {
    const {
      orderId,
      itemId,
    } = req.params;

    const {
      chef_id,
      bartender_id,
    } = req.body;

    if (
      !chef_id &&
      !bartender_id
    ) {
      return res.status(400).json({
        message:
          "Chef or bartender is required",
      });
    }

    const orderItemResult =
      await pool.query(
        `
        SELECT
          oi.id,
          oi.order_id,
          o.restaurant_id,
          mi.item_type,
          c.name AS category_name
        FROM order_items oi
        INNER JOIN orders o
          ON o.id = oi.order_id
        INNER JOIN menu_items mi
          ON mi.id =
            oi.menu_item_id
        LEFT JOIN categories c
          ON c.id =
            mi.category_id
        WHERE oi.id = $1
          AND oi.order_id = $2
        `,
        [
          itemId,
          orderId,
        ]
      );

    if (
      orderItemResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order item not found",
      });
    }

    const item =
      orderItemResult.rows[0];

    const restaurantId =
      item.restaurant_id;

    const category =
      String(
        item.category_name || ""
      ).toLowerCase();

    const isDrink =
      String(
        item.item_type || ""
      ).toUpperCase() ===
        "DRINK" ||
      category.includes("drink") ||
      category.includes("beverage") ||
      category.includes("bar") ||
      category.includes("alcoholic") ||
      category.includes("non-alcoholic");

    if (
      chef_id &&
      isDrink
    ) {
      return res.status(400).json({
        message:
          "Drink items must be assigned to a bartender",
      });
    }

    if (
      bartender_id &&
      !isDrink
    ) {
      return res.status(400).json({
        message:
          "Food items must be assigned to a chef",
      });
    }

    if (chef_id) {
      const chefResult =
        await pool.query(
          `
          SELECT id
          FROM restaurant_staff
          WHERE id = $1
            AND restaurant_id = $2
            AND role = 'CHEF'
          `,
          [
            chef_id,
            restaurantId,
          ]
        );

      if (
        chefResult.rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Invalid chef for this restaurant",
        });
      }
    }

    if (bartender_id) {
      const bartenderResult =
        await pool.query(
          `
          SELECT id
          FROM restaurant_staff
          WHERE id = $1
            AND restaurant_id = $2
            AND role = 'BARTENDER'
          `,
          [
            bartender_id,
            restaurantId,
          ]
        );

      if (
        bartenderResult.rows.length === 0
      ) {
        return res.status(400).json({
          message:
            "Invalid bartender for this restaurant",
        });
      }
    }

    if (chef_id) {
      await pool.query(
        `
        UPDATE order_items AS oi
        SET chef_id = $1
        FROM (
          SELECT item.id
          FROM (
            SELECT
              oi.id,
              mi.item_type,
              c.name AS category
            FROM order_items oi
            INNER JOIN menu_items mi
              ON mi.id = oi.menu_item_id
            LEFT JOIN categories c
              ON c.id = mi.category_id
            WHERE oi.order_id = $2
          ) AS item
          WHERE NOT (
            item.item_type = 'DRINK'
          ) AND NOT (
            COALESCE(item.category, '') ILIKE '%drink%'
          ) AND NOT (
            COALESCE(item.category, '') ILIKE '%beverage%'
          ) AND NOT (
            COALESCE(item.category, '') ILIKE '%bar%'
          ) AND NOT (
            COALESCE(item.category, '') ILIKE '%alcoholic%'
          ) AND NOT (
            COALESCE(item.category, '') ILIKE '%non-alcoholic%'
          )
        ) AS classified
        WHERE oi.id = classified.id
        `,
        [
          chef_id,
          orderId,
        ]
      );
    }

    if (bartender_id) {
      await pool.query(
        `
        UPDATE order_items AS oi
        SET bartender_id = $1
        FROM (
          SELECT item.id
          FROM (
            SELECT
              oi.id,
              mi.item_type,
              c.name AS category
            FROM order_items oi
            INNER JOIN menu_items mi
              ON mi.id = oi.menu_item_id
            LEFT JOIN categories c
              ON c.id = mi.category_id
            WHERE oi.order_id = $2
          ) AS item
          WHERE (
            item.item_type = 'DRINK'
          ) OR (
            COALESCE(item.category, '') ILIKE '%drink%'
          ) OR (
            COALESCE(item.category, '') ILIKE '%beverage%'
          ) OR (
            COALESCE(item.category, '') ILIKE '%bar%'
          ) OR (
            COALESCE(item.category, '') ILIKE '%alcoholic%'
          ) OR (
            COALESCE(item.category, '') ILIKE '%non-alcoholic%'
          )
        ) AS classified
        WHERE oi.id = classified.id
        `,
        [
          bartender_id,
          orderId,
        ]
      );
    }

    return res.json({
      message:
        "Preparation staff assigned successfully",

      /*
       * When a chef was assigned every food item now
       * belongs to that chef. When a bartender was
       * assigned every drink item now belongs to that
       * bartender.
       */
      item:
        orderItemResult.rows[0],
    });
  } catch (error) {
    console.error(
      "Assign preparation staff error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to assign preparation staff",
    });
  }
};


// ============================================
// UPDATE ORDER STATUS
//
// Order-level transitions (CONFIRMED, SERVED,
// CANCELLED) are handled by WAITER/ADMIN and
// update the orders table directly.
//
// Preparation transitions (PREPARING, READY)
// are driven by the CHEF and BARTENDER. Those
// updates touch ONLY the items belonging to the
// acting role:
//
//   - CHEF marking PREPARING/READY affects only
//     food items.
//   - BARTENDER marking PREPARING/READY affects
//     only drink items.
//   - ADMIN (no role sent) affects all items.
//
// After the item-level update the overall order
// status is re-calculated from every item, so a
// single Chef action can never mark drinks (or
// the whole mixed order) as READY.
// ============================================
const updateOrderStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { status, role } =
      req.body;

    const allowedStatuses = [
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "SERVED",
      "CANCELLED",
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid order status",
      });
    }

    const orderResult =
      await pool.query(
        `
        SELECT
          id,
          status,
          restaurant_id
        FROM orders
        WHERE id = $1
        `,
        [id]
      );

    if (
      orderResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const currentStatus =
      orderResult.rows[0]
        .status;

    if (
      status === "SERVED" &&
      currentStatus !== "READY"
    ) {
      return res.status(400).json({
        message:
          "An order must be READY before it can be marked as SERVED",
      });
    }

    if (
      status === "READY" &&
      ![
        "CONFIRMED",
        "PREPARING",
        "READY",
      ].includes(currentStatus)
    ) {
      return res.status(400).json({
        message:
          "An order must be at least CONFIRMED before its items can be marked as READY",
      });
    }

    if (
      status === "PREPARING" &&
      ![
        "CONFIRMED",
        "PREPARING",
      ].includes(currentStatus)
    ) {
      return res.status(400).json({
        message:
          "An order must be CONFIRMED before preparation starts",
      });
    }

    if (
      status === "CONFIRMED" &&
      ![
        "PENDING",
        "CONFIRMED",
      ].includes(currentStatus)
    ) {
      return res.status(400).json({
        message:
          "Only pending orders can be confirmed",
      });
    }

    if (
      status === "CANCELLED" &&
      [
        "COMPLETED",
        "CANCELLED",
      ].includes(currentStatus)
    ) {
      return res.status(400).json({
        message:
          "This order can no longer be cancelled",
      });
    }

    if (status === "COMPLETED") {
      return res.status(400).json({
        message:
          "Orders are completed automatically after successful payment",
      });
    }

    // ============================================
    // PREPARATION TRANSITIONS (PREPARING / READY)
    // ============================================
    if (
      status === "PREPARING" ||
      status === "READY"
    ) {
      const drinkCondition =
        buildDrinkConditionForItems();

      if (role === "CHEF") {
        // Mark only food items.
        await pool.query(
          `
          UPDATE order_items AS oi
          SET status = $1
          FROM menu_items mi
          LEFT JOIN categories c
            ON c.id =
              mi.category_id
          WHERE oi.order_id = $2
            AND oi.menu_item_id =
              mi.id
            AND NOT (
              ${drinkCondition}
            )
          `,
          [status, id]
        );
      } else if (
        role === "BARTENDER"
      ) {
        // Mark only drink items.
        await pool.query(
          `
          UPDATE order_items AS oi
          SET status = $1
          FROM menu_items mi
          LEFT JOIN categories c
            ON c.id =
              mi.category_id
          WHERE oi.order_id = $2
            AND oi.menu_item_id =
              mi.id
            AND (
              ${drinkCondition}
            )
          `,
          [status, id]
        );
      } else {
        // ADMIN or no role: mark every item.
        await pool.query(
          `
          UPDATE order_items
          SET status = $1
          WHERE order_id = $2
          `,
          [status, id]
        );
      }

      // Recalculate the overall order status
      // from the preparation status of every
      // item on the order.
      await recalculateOrderStatus(id);

      const updatedOrderResult =
        await pool.query(
          `
          SELECT *
          FROM orders
          WHERE id = $1
          `,
          [id]
        );

      return res.json({
        message:
          "Order status updated successfully",
        order:
          updatedOrderResult.rows[0],
      });
    }

    // ============================================
    // ORDER-LEVEL TRANSITIONS
    // (CONFIRMED / SERVED / CANCELLED)
    // ============================================
    const result =
      await pool.query(
        `
        UPDATE orders
        SET
          status = $1,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
        `,
        [
          status,
          id,
        ]
      );

    return res.json({
      message:
        "Order status updated successfully",
      order:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Update order status error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update order status",
    });
  }
};


// ============================================
// CREATE COMPLAINT
// ============================================
const createComplaint = async (
  req,
  res
) => {
  try {
    const { orderId } =
      req.params;

    const {
      customer_id,
      description,
      complaint,
      message,
    } = req.body;

    const orderResult =
      await pool.query(
        `
        SELECT
          id,
          customer_id,
          status
        FROM orders
        WHERE id = $1
        `,
        [orderId]
      );

    if (
      orderResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const order =
      orderResult.rows[0];

    const customerId =
      customer_id ||
      order.customer_id;

    if (
      Number(customerId) !==
      Number(order.customer_id)
    ) {
      return res.status(403).json({
        message:
          "You cannot complain about this order",
      });
    }

    const descriptionText =
      description ||
      complaint ||
      message;

    if (
      !descriptionText ||
      !descriptionText.trim()
    ) {
      return res.status(400).json({
        message:
          "Complaint description is required",
      });
    }

    const inactiveStatuses = [
      "COMPLETED",
      "CANCELLED",
    ];

    if (
      inactiveStatuses.includes(
        order.status
      )
    ) {
      return res.status(400).json({
        message:
          "Complaints can only be submitted while an order is active",
      });
    }

    const result =
      await pool.query(
        `
        INSERT INTO complaints
        (
          order_id,
          customer_id,
          description
        )
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [
          orderId,
          order.customer_id,
          descriptionText.trim(),
        ]
      );

    return res.status(201).json({
      message:
        "Complaint submitted successfully",
      complaint:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Create complaint error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to submit complaint",
    });
  }
};


// ============================================
// CREATE RATING
// ============================================
const createRating = async (
  req,
  res
) => {
  try {
    const { orderId } =
      req.params;

    const {
      customer_id,
      rating,
      comment,
      feedback,
    } = req.body;

    const numericRating =
      Number(rating);

    if (
      !Number.isInteger(
        numericRating
      ) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        message:
          "Rating must be between 1 and 5",
      });
    }

    const orderResult =
      await pool.query(
        `
        SELECT
          id,
          customer_id,
          status
        FROM orders
        WHERE id = $1
        `,
        [orderId]
      );

    if (
      orderResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const order =
      orderResult.rows[0];

    const customerId =
      customer_id ||
      order.customer_id;

    if (
      Number(customerId) !==
      Number(order.customer_id)
    ) {
      return res.status(403).json({
        message:
          "You cannot rate this order",
      });
    }

    const paymentResult =
      await pool.query(
        `
        SELECT id
        FROM payments
        WHERE order_id = $1
          AND status = 'PAID'
        LIMIT 1
        `,
        [orderId]
      );

    if (
      paymentResult.rows.length === 0
    ) {
      return res.status(400).json({
        message:
          "You can only rate an order after payment",
      });
    }

    const commentText =
      comment !== undefined
        ? comment
        : feedback || null;

    const existingRating =
      await pool.query(
        `
        SELECT id
        FROM ratings
        WHERE order_id = $1
          AND customer_id = $2
        `,
        [
          orderId,
          order.customer_id,
        ]
      );

    if (
      existingRating.rows.length > 0
    ) {
      return res.status(409).json({
        message:
          "This order has already been rated",
      });
    }

    const result =
      await pool.query(
        `
        INSERT INTO ratings
        (
          order_id,
          customer_id,
          rating,
          comment
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [
          orderId,
          order.customer_id,
          numericRating,
          commentText
            ? String(
                commentText
              ).trim()
            : null,
        ]
      );

    return res.status(201).json({
      message:
        "Rating submitted successfully",
      rating:
        result.rows[0],
    });
  } catch (error) {
    console.error(
      "Create rating error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to submit rating",
    });
  }
};


// ============================================
// CREATE PAYMENT
// ============================================
const createPayment = async (
  req,
  res
) => {
  const client =
    await pool.connect();

  try {
    const { orderId } =
      req.params;

    const { payment_method } =
      req.body;

    const normalizedPaymentMethod =
      String(
        payment_method || ""
      ).toUpperCase();

    const allowedMethods = [
      "CASH",
      "TRANSFER",
      "CARD",
    ];

    if (
      !allowedMethods.includes(
        normalizedPaymentMethod
      )
    ) {
      return res.status(400).json({
        message:
          "Payment method must be CASH, TRANSFER or CARD",
      });
    }

    await client.query(
      "BEGIN"
    );

    const orderResult =
      await client.query(
        `
        SELECT
          id,
          status,
          total_amount
        FROM orders
        WHERE id = $1
        FOR UPDATE
        `,
        [orderId]
      );

    if (
      orderResult.rows.length === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(404).json({
        message:
          "Order not found",
      });
    }

    const order =
      orderResult.rows[0];

    if (
      order.status !== "SERVED"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(400).json({
        message:
          "Payment can only be made after the order has been served",
      });
    }

    const existingPayment =
      await client.query(
        `
        SELECT id
        FROM payments
        WHERE order_id = $1
          AND status = 'PAID'
        LIMIT 1
        `,
        [orderId]
      );

    if (
      existingPayment.rows.length > 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(400).json({
        message:
          "This order has already been paid",
      });
    }

    const transactionReference =
      `CHOWLY-DEMO-${Date.now()}-${orderId}`;

    const paymentResult =
      await client.query(
        `
        INSERT INTO payments
        (
          order_id,
          amount,
          payment_method,
          status,
          transaction_reference,
          paid_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'PAID',
          $4,
          CURRENT_TIMESTAMP
        )
        RETURNING *
        `,
        [
          orderId,
          order.total_amount,
          normalizedPaymentMethod,
          transactionReference,
        ]
      );

    await client.query(
      `
      UPDATE orders
      SET
        status = 'COMPLETED',
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [orderId]
    );

    await client.query(
      "COMMIT"
    );

    return res.status(201).json({
      message:
        "Demo payment recorded successfully. Order completed.",
      payment:
        paymentResult.rows[0],
      order_status:
        "COMPLETED",
    });
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    console.error(
      "Create payment error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to process payment",
    });
  } finally {
    client.release();
  }
};


module.exports = {
  createOrder,
  getOrders,
  getRestaurantStaff,
  getOrderById,
  assignWaiter,
  assignPreparationStaff,
  updateOrderStatus,
  createComplaint,
  createRating,
  createPayment,
};