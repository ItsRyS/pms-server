const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/login", authController.login);
router.post("/register", authController.register);
router.post("/logout", authController.logout);
router.get("/check-session", verifyToken, (req, res) => {
  res.status(200).json({ isAuthenticated: true, user: req.user });
});

module.exports = router;
