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
        o.status,
        o.estimated_wait_minutes,
        o.total_amount,
        o.created_at,
        o.updated_at
       FROM orders o
       JOIN restaurants r ON o.restaurant_id = r.id
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
        oi.unit_price
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
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

    res.json({
      success: true,
      order: {
        ...order,
        items,
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

module.exports = {
  createOrder,
  getOrderById,
};