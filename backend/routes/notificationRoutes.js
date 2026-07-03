const express = require("express");

const { getNotifications } = require("../controllers/notificationController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", authMiddleware, allowRoles("owner", "staff", "admin"), getNotifications);

module.exports = router;
