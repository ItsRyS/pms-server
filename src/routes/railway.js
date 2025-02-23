const express = require("express");
const router = express.Router();
const { getRailwayServiceStatus } = require("../controllers/RailwayController");

router.get("/status", getRailwayServiceStatus);

module.exports = router;
