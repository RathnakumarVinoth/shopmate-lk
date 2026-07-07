const express = require("express");

const {
  addSupplier,
  addSupplierTransaction,
  deleteSupplier,
  getSupplierSummary,
  getSupplierTransactions,
  getSuppliers,
  paySupplierTransaction,
  updateSupplier,
} = require("../controllers/supplierController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("suppliers_access"), requireModule("suppliers"));

router.post("/", addSupplier);
router.get("/", getSuppliers);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

router.post("/transactions", addSupplierTransaction);
router.get("/transactions", getSupplierTransactions);
router.put("/transactions/:id/pay", paySupplierTransaction);
router.get("/summary", getSupplierSummary);

module.exports = router;
