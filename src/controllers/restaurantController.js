const pool = require("../config/database");

const getRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, address, phone, email, created_at
       FROM restaurants
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      restaurants: result.rows,
    });
  } catch (error) {
    console.error("Error fetching restaurants:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurants",
    });
  }
};

const createRestaurant = async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;

    if (!name || !address) {
      return res.status(400).json({
        success: false,
        message: "Restaurant name and address are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO restaurants (name, address, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, address, phone, email, created_at`,
      [name, address, phone || null, email || null]
    );

    res.status(201).json({
      success: true,
      restaurant: result.rows[0],
    });
  } catch (error) {
    console.error("Create restaurant error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create restaurant",
    });
  }
};

module.exports = {
  getRestaurants,
  createRestaurant,
};