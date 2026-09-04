const pool = require("../config/database");

const getMenuItems = async (req, res) => {
  try {
    const { restaurant_id } = req.query;

    if (!restaurant_id) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id is required",
      });
    }

    const result = await pool.query(
      `SELECT
        mi.id,
        mi.name,
        mi.description,
        mi.price,
        mi.preparation_time,
        mi.item_type,
        mi.available,
        c.id AS category_id,
        c.name AS category_name,
        c.parent_category_id
       FROM menu_items mi
       JOIN categories c ON mi.category_id = c.id
       WHERE mi.restaurant_id = $1
       ORDER BY c.parent_category_id NULLS FIRST, c.name ASC, mi.name ASC`,
      [restaurant_id]
    );

    res.json({
      success: true,
      menuItems: result.rows,
    });
  } catch (error) {
    console.error("Error fetching menu items:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch menu items",
    });
  }
};

const createMenuItem = async (req, res) => {
  try {
    const {
      restaurant_id,
      category_id,
      name,
      description,
      price,
      preparation_time,
      item_type,
    } = req.body;

    if (
      !restaurant_id ||
      !category_id ||
      !name ||
      price === undefined ||
      !preparation_time ||
      !item_type
    ) {
      return res.status(400).json({
        success: false,
        message:
          "restaurant_id, category_id, name, price, preparation_time and item_type are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO menu_items
       (restaurant_id, category_id, name, description, price, preparation_time, item_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        restaurant_id,
        category_id,
        name,
        description || null,
        price,
        preparation_time,
        item_type,
      ]
    );

    res.status(201).json({
      success: true,
      menuItem: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating menu item:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create menu item",
    });
  }
};

module.exports = {
  getMenuItems,
  createMenuItem,
};