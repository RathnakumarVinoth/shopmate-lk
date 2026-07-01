const express = require("express");

const {
  addExpense,
  deleteExpense,
  getExpenseSummary,
  getExpenses,
  updateExpense,
} = require("../controllers/expenseController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, addExpense);
router.get("/", authMiddleware, getExpenses);
router.get("/summary", authMiddleware, getExpenseSummary);
router.put("/:id", authMiddleware, updateExpense);
router.delete("/:id", authMiddleware, deleteExpense);

module.exports = router;
