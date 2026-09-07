const express = require("express");

const {
  addStaff,
  getMyStaff,
  removeStaff,
} = require("../controllers/adminController");

const {
  authenticateToken,
  requireRole,
} = require("../middleware/authMiddleware");

const router = express.Router();


// Everything in this route requires ADMIN
router.use(authenticateToken);
router.use(requireRole("ADMIN"));


// Staff management
router.get("/staff", getMyStaff);

router.post("/staff", addStaff);

router.delete("/staff/:staffId", removeStaff);


module.exports = router;