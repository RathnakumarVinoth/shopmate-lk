const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

require("./config/db");

const authRoutes = require("./routes/authRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const adminRoutes = require("./routes/adminRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const creditRoutes = require("./routes/creditRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const exportRoutes = require("./routes/exportRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const loginActivityRoutes = require("./routes/loginActivityRoutes");
const productRoutes = require("./routes/productRoutes");
const purchasingRoutes = require("./routes/purchasingRoutes");
const purchaseSuggestionRoutes = require("./routes/purchaseSuggestionRoutes");
const reportRoutes = require("./routes/reportRoutes");
const returnRoutes = require("./routes/returnRoutes");
const saleRoutes = require("./routes/saleRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const shopAuthRoutes = require("./routes/shopAuthRoutes");
const staffRoutes = require("./routes/staffRoutes");
const stockRoutes = require("./routes/stockRoutes");
const supplierRoutes = require("./routes/supplierRoutes");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://shopmate-lk.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
].filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 1000 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 30 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
});

app.use(globalLimiter);

app.get("/", (req, res) => {
  res.send("ShopMate LK Backend Running");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "ShopMate LK API running",
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/shop-auth", authLimiter, shopAuthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/credits", creditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/login-activity", loginActivityRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchasing", purchasingRoutes);
app.use("/api/purchase-suggestions", purchaseSuggestionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/suppliers", supplierRoutes);

module.exports = app;
