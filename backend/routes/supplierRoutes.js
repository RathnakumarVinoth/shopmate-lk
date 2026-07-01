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

const router = express.Router();

router.post("/", authMiddleware, addSupplier);
router.get("/", authMiddleware, getSuppliers);
router.put("/:id", authMiddleware, updateSupplier);
router.delete("/:id", authMiddleware, deleteSupplier);

router.post("/transactions", authMiddleware, addSupplierTransaction);
router.get("/transactions", authMiddleware, getSupplierTransactions);
router.put("/transactions/:id/pay", authMiddleware, paySupplierTransaction);
router.get("/summary", authMiddleware, getSupplierSummary);

module.exports = router;
