const pool = require("../config/database");

const createOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      restaurant_id,
      customer_id,
      items,
    } = req.body;

    if (!restaurant_id || !customer_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id, customer_id and items are required",
      });
    }

    await client.query("BEGIN");

    let totalAmount = 0;
    let estimatedWaitMinutes = 0;

    // Create the order first
    const orderResult = await client.query(
      `INSERT INTO orders
       (restaurant_id, customer_id, status, total_amount, estimated_wait_minutes)
       VALUES ($1, $2, 'PENDING', 0, 0)
       RETURNING id`,
      [restaurant_id, customer_id]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      const {
        menu_item_id,
        quantity,
        option_ids = [],
      } = item;

      if (!menu_item_id || !quantity || quantity < 1) {
        throw new Error("Invalid menu item or quantity");
      }

      // Get the menu item's current price and preparation time
      const menuResult = await client.query(
        `SELECT price, preparation_time
         FROM menu_items
         WHERE id = $1
           AND restaurant_id = $2
           AND available = TRUE`,
        [menu_item_id, restaurant_id]
      );

      if (menuResult.rows.length === 0) {
        throw new Error(`Menu item ${menu_item_id} is unavailable`);
      }

      const menuItem = menuResult.rows[0];

      // Save the order item
      const orderItemResult = await client.query(
        `INSERT INTO order_items
         (order_id, menu_item_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          orderId,
          menu_item_id,
          quantity,
          menuItem.price,
        ]
      );

      const orderItemId = orderItemResult.rows[0].id;

      totalAmount += Number(menuItem.price) * quantity;

      estimatedWaitMinutes = Math.max(
        estimatedWaitMinutes,
        menuItem.preparation_time
      );

      // Save selected options
      for (const optionId of option_ids) {
        const optionResult = await client.query(
          `SELECT price, preparation_time
           FROM menu_options
           WHERE id = $1
             AND restaurant_id = $2
             AND available = TRUE`,
          [optionId, restaurant_id]
        );

        if (optionResult.rows.length === 0) {
          throw new Error(`Menu option ${optionId} is unavailable`);
        }

        const option = optionResult.rows[0];

        await client.query(
          `INSERT INTO order_item_options
           (order_item_id, menu_option_id, quantity, unit_price)
           VALUES ($1, $2, 1, $3)`,
          [
            orderItemId,
            optionId,
            option.price,
          ]
        );

        totalAmount += Number(option.price);

        estimatedWaitMinutes = Math.max(
          estimatedWaitMinutes,
          option.preparation_time || 0
        );
      }
    }

    // Update the order with the calculated values
    await client.query(
      `UPDATE orders
       SET total_amount = $1,
           estimated_wait_minutes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        totalAmount,
        estimatedWaitMinutes,
        orderId,
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: {
        id: orderId,
        total_amount: totalAmount,
        estimated_wait_minutes: estimatedWaitMinutes,
        status: "PENDING",
      },
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Create order error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create order",
    });
  } finally {
    client.release();
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await pool.query(
      `SELECT
        o.id,
        o.restaurant_id,
        r.name AS restaurant_name,
        o.customer_id,
        o.waiter_id,
        waiter_user.name AS waiter_name,
        o.status,
        o.estimated_wait_minutes,
        o.total_amount,
        o.created_at,
        o.updated_at
    FROM orders o
    JOIN restaurants r
        ON o.restaurant_id = r.id
    LEFT JOIN restaurant_staff waiter
        ON o.waiter_id = waiter.id
    LEFT JOIN users waiter_user
        ON waiter.user_id = waiter_user.id
    WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT
        oi.id,
        oi.menu_item_id,
        mi.name AS menu_item_name,
        oi.quantity,
        oi.unit_price,
        oi.chef_id,
        chef_user.name AS chef_name,
        oi.bartender_id,
        bartender_user.name AS bartender_name
    FROM order_items oi
    JOIN menu_items mi
        ON oi.menu_item_id = mi.id
    LEFT JOIN restaurant_staff chef
        ON oi.chef_id = chef.id
    LEFT JOIN users chef_user
        ON chef.user_id = chef_user.id
    LEFT JOIN restaurant_staff bartender
        ON oi.bartender_id = bartender.id
    LEFT JOIN users bartender_user
        ON bartender.user_id = bartender_user.id
    WHERE oi.order_id = $1
    ORDER BY oi.id`,
      [id]
    );

    const items = [];

    for (const item of itemsResult.rows) {
      const optionsResult = await pool.query(
        `SELECT
          oio.id,
          oio.menu_option_id,
          mo.name,
          oio.quantity,
          oio.unit_price
         FROM order_item_options oio
         JOIN menu_options mo ON oio.menu_option_id = mo.id
         WHERE oio.order_item_id = $1
         ORDER BY oio.id`,
        [item.id]
      );

      items.push({
        ...item,
        options: optionsResult.rows,
      });
    }

    const paymentResult = await pool.query(
        `SELECT
         id,
         amount,
         payment_method,
         status,
         transaction_reference,
         paid_at
    FROM payments
    WHERE order_id = $1
    ORDER BY id DESC
    LIMIT 1`,
    [id]
    );

const payment = paymentResult.rows[0] || null;

    res.json({
      success: true,
      order: {
        ...order,
        items,
        payment,
      },
    });
  } catch (error) {
    console.error("Get order error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });
  }
};

const assignWaiter = async (req, res) => {
  try {
    const { id } = req.params;
    const { waiter_id } = req.body;

    if (!waiter_id) {
      return res.status(400).json({
        success: false,
        message: "waiter_id is required",
      });
    }

    const waiterResult = await pool.query(
      `SELECT id
       FROM restaurant_staff
       WHERE id = $1
         AND restaurant_id = (
           SELECT restaurant_id
           FROM orders
           WHERE id = $2
         )
         AND role = 'WAITER'`,
      [waiter_id, id]
    );

    if (waiterResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid waiter for this restaurant",
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET waiter_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, waiter_id, status, updated_at`,
      [waiter_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      message: "Waiter assigned successfully",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Assign waiter error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to assign waiter",
    });
  }
};

const assignPreparationStaff = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { chef_id, bartender_id } = req.body;

    if (!chef_id && !bartender_id) {
      return res.status(400).json({
        success: false,
        message: "chef_id or bartender_id is required",
      });
    }

    const itemResult = await pool.query(
      `SELECT
        oi.id,
        o.restaurant_id
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1
         AND oi.order_id = $2`,
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order item not found",
      });
    }

    const restaurantId = itemResult.rows[0].restaurant_id;

    if (chef_id) {
      const chefResult = await pool.query(
        `SELECT id
         FROM restaurant_staff
         WHERE id = $1
           AND restaurant_id = $2
           AND role = 'CHEF'`,
        [chef_id, restaurantId]
      );

      if (chefResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid chef for this restaurant",
        });
      }
    }

    if (bartender_id) {
      const bartenderResult = await pool.query(
        `SELECT id
         FROM restaurant_staff
         WHERE id = $1
           AND restaurant_id = $2
           AND role = 'BARTENDER'`,
        [bartender_id, restaurantId]
      );

      if (bartenderResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid bartender for this restaurant",
        });
      }
    }

    const result = await pool.query(
      `UPDATE order_items
       SET
         chef_id = COALESCE($1, chef_id),
         bartender_id = COALESCE($2, bartender_id)
       WHERE id = $3
         AND order_id = $4
       RETURNING id, order_id, menu_item_id, chef_id, bartender_id`,
      [chef_id || null, bartender_id || null, itemId, orderId]
    );

    res.json({
      success: true,
      message: "Preparation staff assigned successfully",
      item: result.rows[0],
    });
  } catch (error) {
    console.error("Assign preparation staff error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to assign preparation staff",
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "PENDING",
      "PREPARING",
      "READY",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed statuses: ${allowedStatuses.join(", ")}`,
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, status, estimated_wait_minutes, updated_at`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Update order status error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};

const createComplaint = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { customer_id, description } = req.body;

    if (!customer_id || !description) {
      return res.status(400).json({
        success: false,
        message: "customer_id and description are required",
      });
    }

    const orderResult = await pool.query(
      `SELECT id, customer_id
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderResult.rows[0].customer_id !== Number(customer_id)) {
      return res.status(403).json({
        success: false,
        message: "Customer does not belong to this order",
      });
    }

    const result = await pool.query(
      `INSERT INTO complaints
       (order_id, customer_id, description)
       VALUES ($1, $2, $3)
       RETURNING id, order_id, customer_id, description, status, created_at`,
      [orderId, customer_id, description]
    );

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      complaint: result.rows[0],
    });
  } catch (error) {
    console.error("Create complaint error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to submit complaint",
    });
  }
};

const createRating = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { customer_id, rating, comment } = req.body;

    if (!customer_id || !rating) {
      return res.status(400).json({
        success: false,
        message: "customer_id and rating are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const orderResult = await pool.query(
      `SELECT id, customer_id
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (orderResult.rows[0].customer_id !== Number(customer_id)) {
      return res.status(403).json({
        success: false,
        message: "Customer does not belong to this order",
      });
    }

    const result = await pool.query(
      `INSERT INTO ratings
       (order_id, customer_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING id, order_id, customer_id, rating, comment, created_at`,
      [orderId, customer_id, rating, comment || null]
    );

    res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
      rating: result.rows[0],
    });
  } catch (error) {
    console.error("Create rating error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to submit rating",
    });
  }
};

const createPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { payment_method } = req.body;

    const allowedPaymentMethods = [
        "CASH",
        "TRANSFER",
        "CARD",
        ];

    if (!payment_method || !allowedPaymentMethods.includes(payment_method)) {
        return res.status(400).json({
            success: false,
            message: `Invalid payment method. Allowed methods: ${allowedPaymentMethods.join(", ")}`,
        });
    }

    const orderResult = await pool.query(
      `SELECT id, total_amount
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    const existingPayment = await pool.query(
        `SELECT id, status
        FROM payments
        WHERE order_id = $1
            AND status = 'PAID'`,
        [orderId]
    );

    if (existingPayment.rows.length > 0) {
        return res.status(400).json({
            success: false,
            message: "This order has already been paid",
        });
    }

    const transactionReference = `CHOWLY-DEMO-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO payments
       (order_id, amount, payment_method, status, transaction_reference, paid_at)
       VALUES ($1, $2, $3, 'PAID', $4, CURRENT_TIMESTAMP)
       RETURNING id, order_id, amount, payment_method, status,
                 transaction_reference, paid_at`,
      [
        order.id,
        order.total_amount,
        payment_method,
        transactionReference,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Pretend payment recorded successfully",
      payment: {
        ...result.rows[0],
        is_pretend_payment: true,
      },
    });
  } catch (error) {
    console.error("Create payment error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to record payment",
    });
  }
};

module.exports = {
  createOrder,
  getOrderById,
  assignWaiter,
  assignPreparationStaff,
  updateOrderStatus,
  createComplaint,
  createRating,
  createPayment,
};