const express = require("express");

const {
  getProductStockMovements,
  getStockMovements,
  getStockSummary,
  restockProduct,
} = require("../controllers/stockController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("stock_access"));

router.post("/restock", restockProduct);
router.get("/movements", getStockMovements);
router.get("/summary", getStockSummary);
router.get("/product/:id", getProductStockMovements);

module.exports = router;
