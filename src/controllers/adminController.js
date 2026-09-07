const pool = require("../config/database");
const bcrypt = require("bcryptjs");


// ============================================
// ADD STAFF TO ADMIN'S RESTAURANT
// ============================================

const addStaff = async (req, res) => {
  const {
    name,
    email,
    password,
    role,
  } = req.body;

  const restaurantId = req.user.restaurant_id;

  const allowedRoles = ["WAITER", "CHEF", "BARTENDER"];

  if (!name || !email || !password || !role) {
    return res.status(400).json({
      success: false,
      message: "Name, email, password and role are required",
    });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid staff role",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check whether user already exists
    const existingUser = await client.query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email]
    );

    let user;

    if (existingUser.rows.length > 0) {
      const existingUserId = existingUser.rows[0].id;

      // Check whether this user already belongs
      // to this restaurant
      const existingStaff = await client.query(
        `SELECT id
         FROM restaurant_staff
         WHERE user_id = $1
         AND restaurant_id = $2`,
        [existingUserId, restaurantId]
      );

      if (existingStaff.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "This user is already staff at this restaurant",
        });
      }

      user = {
        id: existingUserId,
      };
    } else {
      const passwordHash = await bcrypt.hash(password, 10);

      const userResult = await client.query(
        `INSERT INTO users
          (name, email, password_hash, role)
         VALUES
          ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [
          name,
          email,
          passwordHash,
          role,
        ]
      );

      user = userResult.rows[0];
    }

    const staffResult = await client.query(
      `INSERT INTO restaurant_staff
        (user_id, restaurant_id, role)
       VALUES
        ($1, $2, $3)
       RETURNING id, user_id, restaurant_id, role`,
      [
        user.id,
        restaurantId,
        role,
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Staff member added successfully",
      staff: staffResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Add staff error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to add staff member",
      error: error.message,
    });
  } finally {
    client.release();
  }
};


// ============================================
// GET ADMIN'S RESTAURANT STAFF
// ============================================

const getMyStaff = async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const result = await pool.query(
      `SELECT
        rs.id AS staff_id,
        u.id AS user_id,
        u.name,
        u.email,
        rs.role,
        rs.restaurant_id,
        rs.created_at
       FROM restaurant_staff rs
       INNER JOIN users u
         ON u.id = rs.user_id
       WHERE rs.restaurant_id = $1
       ORDER BY rs.role, u.name`,
      [restaurantId]
    );

    res.json({
      success: true,
      restaurant_id: restaurantId,
      staff: result.rows,
    });
  } catch (error) {
    console.error("Get admin staff error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve staff",
    });
  }
};


// ============================================
// REMOVE STAFF FROM ADMIN'S RESTAURANT
// ============================================

const removeStaff = async (req, res) => {
  const staffId = req.params.staffId;
  const restaurantId = req.user.restaurant_id;

  try {
    const result = await pool.query(
      `DELETE FROM restaurant_staff
       WHERE id = $1
       AND restaurant_id = $2
       AND role != 'ADMIN'
       RETURNING id, user_id, role`,
      [staffId, restaurantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found or cannot be removed",
      });
    }

    res.json({
      success: true,
      message: "Staff member removed successfully",
    });
  } catch (error) {
    console.error("Remove staff error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to remove staff member",
    });
  }
};


module.exports = {
  addStaff,
  getMyStaff,
  removeStaff,
};