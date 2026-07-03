const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

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

router.get("/categories", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getCategories);
router.post("/categories", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), addCategory);
router.put("/categories/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), updateCategory);
router.delete("/categories/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), deleteCategory);
router.post("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), addProduct);
router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getProducts);
router.get("/search-code/:code", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getProductByCode);
router.get("/low-stock", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getLowStockProducts);
router.put("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), updateProduct);
router.delete("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_manage"), deleteProduct);

module.exports = router;
