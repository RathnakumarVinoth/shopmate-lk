const express = require("express");

const {
  getFastMovingProducts,
  getPurchaseSuggestionSummary,
  getPurchaseSuggestions,
} = require("../controllers/purchaseSuggestionController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.get("/", getPurchaseSuggestions);
router.get("/fast-moving", getFastMovingProducts);
router.get("/summary", getPurchaseSuggestionSummary);

module.exports = router;
