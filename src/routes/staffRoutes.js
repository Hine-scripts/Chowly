const express = require("express");

const {
  getRestaurantStaff,
} = require("../controllers/staffController");

const router = express.Router();

router.get("/", getRestaurantStaff);

module.exports = router;