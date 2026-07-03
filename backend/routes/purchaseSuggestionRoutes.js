const express = require("express");

const {
  getFastMovingProducts,
  getPurchaseSuggestionSummary,
  getPurchaseSuggestions,
} = require("../controllers/purchaseSuggestionController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("purchase_suggestions_access"));

router.get("/", getPurchaseSuggestions);
router.get("/fast-moving", getFastMovingProducts);
router.get("/summary", getPurchaseSuggestionSummary);

module.exports = router;
