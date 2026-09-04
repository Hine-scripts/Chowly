const express = require("express");

const {
  getMealComponents,
} = require("../controllers/mealController");

const router = express.Router();

router.get("/", getMealComponents);

module.exports = router;