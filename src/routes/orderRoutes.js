const express = require("express");

const {
  createOrder,
  getOrderById,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/", createOrder);
router.get("/:id", getOrderById);

module.exports = router;