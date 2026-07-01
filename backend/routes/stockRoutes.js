const express = require("express");

const {
  getProductStockMovements,
  getStockMovements,
  getStockSummary,
  restockProduct,
} = require("../controllers/stockController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.post("/restock", restockProduct);
router.get("/movements", getStockMovements);
router.get("/summary", getStockSummary);
router.get("/product/:id", getProductStockMovements);

module.exports = router;
