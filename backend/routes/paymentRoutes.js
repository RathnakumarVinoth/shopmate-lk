const express = require("express");

const {
  failPayment,
  getPendingPayments,
  verifyPayment,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.get("/pending", authMiddleware, allowRoles("owner", "admin"), requirePermission("payment_verification_access"), getPendingPayments);
router.put("/:sale_id/verify", authMiddleware, allowRoles("owner", "admin"), requirePermission("payment_verification_access"), verifyPayment);
router.put("/:sale_id/fail", authMiddleware, allowRoles("owner", "admin"), requirePermission("payment_verification_access"), failPayment);

module.exports = router;
