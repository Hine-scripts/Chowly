const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/database");
const restaurantRoutes = require("./routes/restaurantRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const menuRoutes = require("./routes/menuRoutes");
const mealRoutes = require("./routes/mealRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const staffRoutes = require("./routes/staffRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/meals", mealRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Chowly API",
  });
});

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      status: "success",
      message: "Chowly is connected to PostgreSQL",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      status: "error",
      message: "Could not connect to database",
      error: error.message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Chowly server is running on port ${PORT}`);
});