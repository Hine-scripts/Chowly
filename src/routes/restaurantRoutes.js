const express = require("express");

const {
  getRestaurants,
  createRestaurant,
} = require("../controllers/restaurantController");

const router = express.Router();

router.get("/", getRestaurants);
router.post("/", createRestaurant);

module.exports = router;