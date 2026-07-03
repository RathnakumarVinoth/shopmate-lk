const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  addProduct,
  getProducts,
  getProductByCode,
  getLowStockProducts,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

router.post("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), addProduct);
router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getProducts);
router.get("/search-code/:code", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getProductByCode);
router.get("/low-stock", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getLowStockProducts);
router.put("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), updateProduct);
router.delete("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), deleteProduct);

module.exports = router;
