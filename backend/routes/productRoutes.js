const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const {
  addProduct,
  addCategory,
  deleteCategory,
  getCategories,
  getProducts,
  getProductByCode,
  getLowStockProducts,
  updateProduct,
  updateCategory,
  deleteProduct,
} = require("../controllers/productController");

router.get("/categories", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), requireModule("products"), getCategories);
router.post("/categories", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), addCategory);
router.put("/categories/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), updateCategory);
router.delete("/categories/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), deleteCategory);
router.post("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), requireModule("products"), addProduct);
router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), requireModule("products"), getProducts);
router.get("/search-code/:code", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), requireModule("products"), getProductByCode);
router.get("/low-stock", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), requireModule("low_stock"), getLowStockProducts);
router.put("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), requireModule("products"), updateProduct);
router.delete("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), requireModule("products"), deleteProduct);

module.exports = router;
