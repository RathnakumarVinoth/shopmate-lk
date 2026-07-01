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

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.post("/", addSupplier);
router.get("/", getSuppliers);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

router.post("/transactions", addSupplierTransaction);
router.get("/transactions", getSupplierTransactions);
router.put("/transactions/:id/pay", paySupplierTransaction);
router.get("/summary", getSupplierSummary);

module.exports = router;
