const express = require("express");
const router = express.Router();
const { getAdminDashboardData } = require("../controllers/AdminDashController");
const { verifyToken } = require("../middleware/auth");

router.get("/", verifyToken, getAdminDashboardData);

module.exports = router;
