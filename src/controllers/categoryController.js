const pool = require("../config/database");

const getCategories = async (req, res) => {
  try {
    const { restaurant_id } = req.query;

    if (!restaurant_id) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id is required",
      });
    }

    const result = await pool.query(
      `SELECT id, restaurant_id, name, parent_category_id, created_at
       FROM categories
       WHERE restaurant_id = $1
       ORDER BY parent_category_id NULLS FIRST, name ASC`,
      [restaurant_id]
    );

    res.json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Error fetching categories:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};

const createCategory = async (req, res) => {
  try {
    const { restaurant_id, name, parent_category_id } = req.body;

    if (!restaurant_id || !name) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id and name are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO categories (restaurant_id, name, parent_category_id)
       VALUES ($1, $2, $3)
       RETURNING id, restaurant_id, name, parent_category_id, created_at`,
      [restaurant_id, name, parent_category_id || null]
    );

    res.status(201).json({
      success: true,
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating category:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create category",
    });
  }
};

module.exports = {
  getCategories,
  createCategory,
};