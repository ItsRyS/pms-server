const express = require("express");
const router = express.Router();
const { getAdminDashboardData } = require("../controllers/AdminDashController");
const { verifyToken } = require("../middleware/auth"); // ตรวจสอบ Token

// Route สำหรับดึงข้อมูลแดชบอร์ดของแอดมิน
router.get("/", verifyToken, getAdminDashboardData);

module.exports = router;
