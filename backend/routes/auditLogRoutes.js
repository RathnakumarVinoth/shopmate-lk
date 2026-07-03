const express = require("express");

const { getAuditLogs } = require("../controllers/auditLogController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", authMiddleware, allowRoles("owner", "admin"), getAuditLogs);

module.exports = router;
