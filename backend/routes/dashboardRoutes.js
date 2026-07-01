const express = require("express");

const { getDashboard } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", authMiddleware, allowRoles("owner", "staff"), getDashboard);

module.exports = router;
