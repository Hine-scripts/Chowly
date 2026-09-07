const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// ============================================
// GET ALL RESTAURANTS
// ============================================

const getRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        address,
        phone,
        email,
        created_at
       FROM restaurants
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      restaurants: result.rows,
    });
  } catch (error) {
    console.error("Get restaurants error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve restaurants",
    });
  }
};


// ============================================
// GET ONE RESTAURANT
// ============================================

const getRestaurantById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        address,
        phone,
        email,
        created_at
       FROM restaurants
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    res.json({
      success: true,
      restaurant: result.rows[0],
    });
  } catch (error) {
    console.error("Get restaurant error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve restaurant",
    });
  }
};


// ============================================
// REGISTER RESTAURANT + ADMIN
// ============================================

const registerRestaurant = async (req, res) => {
  const {
    restaurant_name,
    address,
    phone,
    restaurant_email,
    admin_name,
    admin_email,
    password,
  } = req.body;

  if (
    !restaurant_name ||
    !address ||
    !admin_name ||
    !admin_email ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Restaurant name, address, admin name, admin email and password are required",
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

    // Check whether admin email already exists
    const existingUser = await client.query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [admin_email]
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Create restaurant
    const restaurantResult = await client.query(
      `INSERT INTO restaurants
        (name, address, phone, email)
       VALUES
        ($1, $2, $3, $4)
       RETURNING
        id,
        name,
        address,
        phone,
        email`,
      [
        restaurant_name,
        address,
        phone || null,
        restaurant_email || null,
      ]
    );

    const restaurant = restaurantResult.rows[0];

    // Hash admin password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const userResult = await client.query(
      `INSERT INTO users
        (name, email, password_hash, role)
       VALUES
        ($1, $2, $3, $4)
       RETURNING
        id,
        name,
        email,
        role`,
      [
        admin_name,
        admin_email,
        passwordHash,
        "ADMIN",
      ]
    );

    const user = userResult.rows[0];

    // Connect admin to restaurant
    const staffResult = await client.query(
      `INSERT INTO restaurant_staff
        (user_id, restaurant_id, role)
       VALUES
        ($1, $2, $3)
       RETURNING
        id,
        user_id,
        restaurant_id,
        role`,
      [
        user.id,
        restaurant.id,
        "ADMIN",
      ]
    );

    const staff = staffResult.rows[0];

    await client.query("COMMIT");

    // Create login token
    const token = jwt.sign(
      {
        user_id: user.id,
        role: "ADMIN",
        restaurant_id: restaurant.id,
        staff_id: staff.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      success: true,
      message: "Restaurant registered successfully",
      token,
      restaurant,
      user,
      staff,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Restaurant registration error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to register restaurant",
      error: error.message,
    });
  } finally {
    client.release();
  }
};


// ============================================
// ADMIN / STAFF LOGIN
// ============================================

const staffLogin = async (req, res) => {
  const {
    email,
    password,
    restaurant_id,
  } = req.body;

  if (!email || !password || !restaurant_id) {
    return res.status(400).json({
      success: false,
      message: "Email, password and restaurant_id are required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT
        u.id AS user_id,
        u.name,
        u.email,
        u.password_hash,
        rs.id AS staff_id,
        rs.restaurant_id,
        rs.role,
        r.name AS restaurant_name
       FROM users u
       INNER JOIN restaurant_staff rs
         ON rs.user_id = u.id
       INNER JOIN restaurants r
         ON r.id = rs.restaurant_id
       WHERE u.email = $1
         AND rs.restaurant_id = $2`,
      [email, restaurant_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid staff credentials",
      });
    }

    const staff = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      staff.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid staff credentials",
      });
    }

    const token = jwt.sign(
      {
        user_id: staff.user_id,
        role: staff.role,
        restaurant_id: staff.restaurant_id,
        staff_id: staff.staff_id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: staff.user_id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
      restaurant: {
        id: staff.restaurant_id,
        name: staff.restaurant_name,
      },
      staff_id: staff.staff_id,
    });
  } catch (error) {
    console.error("Staff login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};


// ============================================
// GET CURRENT STAFF PROFILE
// ============================================

const getCurrentStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id AS user_id,
        u.name,
        u.email,
        rs.id AS staff_id,
        rs.role,
        rs.restaurant_id,
        r.name AS restaurant_name
       FROM users u
       INNER JOIN restaurant_staff rs
         ON rs.user_id = u.id
       INNER JOIN restaurants r
         ON r.id = rs.restaurant_id
       WHERE u.id = $1
         AND rs.restaurant_id = $2`,
      [
        req.user.user_id,
        req.user.restaurant_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff profile not found",
      });
    }

    res.json({
      success: true,
      staff: result.rows[0],
    });
  } catch (error) {
    console.error("Get current staff error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve staff profile",
    });
  }
};


module.exports = {
  getRestaurants,
  getRestaurantById,
  registerRestaurant,
  staffLogin,
  getCurrentStaff,
};