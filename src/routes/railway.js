const express = require("express");
const router = express.Router();
const { getRailwayStatus } = require("../controllers/RailwayController");

router.get("/status", getRailwayStatus);

module.exports = router;
