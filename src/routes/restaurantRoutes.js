const express = require("express");

const {
  getRestaurants,
  getRestaurantById,
  registerRestaurant,
  staffLogin,
  getCurrentStaff,
} = require("../controllers/restaurantController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const router = express.Router();


// Public restaurant discovery
router.get("/", getRestaurants);
// Restaurant registration
router.post("/register", registerRestaurant);
// Staff / Admin login
router.post("/staff-login", staffLogin);
// Current authenticated staff member
router.get("/me/profile", authenticateToken, getCurrentStaff);
router.get("/:id", getRestaurantById);

module.exports = router;