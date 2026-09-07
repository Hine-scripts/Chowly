const express = require("express");

const {
  createOrder,
  getOrders,
  getOrderById,
  getRestaurantStaff,
  assignWaiter,
  assignPreparationStaff,
  updateOrderStatus,
  createComplaint,
  createRating,
  createPayment,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/", createOrder);

router.get("/", getOrders);

router.get("/staff", getRestaurantStaff);

router.get("/:id", getOrderById);

router.patch("/:id/waiter", assignWaiter);

router.patch(
  "/:orderId/items/:itemId/staff",
  assignPreparationStaff
);

router.patch("/:id/status", updateOrderStatus);

router.post(
  "/:orderId/complaints",
  createComplaint
);

router.post(
  "/:orderId/rating",
  createRating
);

router.post(
  "/:orderId/payment",
  createPayment
);

module.exports = router;