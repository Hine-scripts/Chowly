const express = require("express");

const {
  getMenuItems,
  createMenuItem,
} = require("../controllers/menuController");

const router = express.Router();

router.get("/", getMenuItems);
router.post("/", createMenuItem);

module.exports = router;