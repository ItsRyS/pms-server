const express = require("express");
const router = express.Router();
const multer = require("multer");
const documentController = require("../controllers/documentController");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/upload", upload.single("file"), documentController.uploadDocument);
router.get("/", documentController.getDocuments);
router.delete("/:id", documentController.deleteDocument);
module.exports = router;
