const express = require("express");

const { getLoginActivity } = require("../controllers/loginActivityController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", authMiddleware, allowRoles("owner", "admin"), getLoginActivity);

module.exports = router;
