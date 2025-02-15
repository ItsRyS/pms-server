const express = require("express");
const router = express.Router();
const multer = require("multer");
const documentController = require("../controllers/documentController");

// ✅ ใช้ Memory Storage เพื่อส่งไฟล์ไป Supabase โดยตรง
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.post("/upload", upload.single("file"), documentController.uploadDocument);
router.get("/", documentController.getDocuments);
router.delete("/:id", documentController.deleteDocument);

module.exports = router;
