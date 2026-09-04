const pool = require("../config/database");

const getRestaurantStaff = async (req, res) => {
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
        rs.id,
        rs.user_id,
        u.name,
        u.email,
        rs.role,
        rs.restaurant_id
       FROM restaurant_staff rs
       JOIN users u ON rs.user_id = u.id
       WHERE rs.restaurant_id = $1
       ORDER BY rs.role, u.name`,
      [restaurant_id]
    );

    res.json({
      success: true,
      staff: result.rows,
    });
  } catch (error) {
    console.error("Error fetching restaurant staff:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurant staff",
    });
  }
};

module.exports = {
  getRestaurantStaff,
};