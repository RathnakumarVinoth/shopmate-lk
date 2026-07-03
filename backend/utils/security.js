const crypto = require("crypto");

const db = require("../config/db");

let securityTablesReady = false;

const passwordRuleMessage =
  "Password must be at least 8 characters and include uppercase, lowercase, number, and special character";

const validateStrongPassword = (password) => {
  const value = String(password || "");

  if (
    value.length < 8 ||
    !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    return passwordRuleMessage;
  }

  return null;
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateResetToken = () => crypto.randomBytes(32).toString("hex");

const ensureSecurityTables = async () => {
  if (securityTablesReady) return;

  const connection = db.promise();
  const [columns] = await connection.query("SHOW COLUMNS FROM users");
  const existingColumns = new Set(columns.map((column) => column.Field));

  if (!existingColumns.has("reset_token_hash")) {
    await connection.query("ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(255) NULL");
  }

  if (!existingColumns.has("reset_token_expires_at")) {
    await connection.query("ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME NULL");
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS login_activity (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      shop_id INT NULL,
      email VARCHAR(255) NULL,
      role VARCHAR(50) NULL,
      status VARCHAR(50) NOT NULL,
      message VARCHAR(255) NULL,
      ip_address VARCHAR(100) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_activity_shop_created (shop_id, created_at),
      INDEX idx_login_activity_user_created (user_id, created_at),
      INDEX idx_login_activity_status (status)
    )
  `);

  const [activityColumns] = await connection.query(
    "SHOW COLUMNS FROM login_activity"
  );
  const existingActivityColumns = new Set(
    activityColumns.map((column) => column.Field)
  );

  if (!existingActivityColumns.has("message")) {
    await connection.query(
      "ALTER TABLE login_activity ADD COLUMN message VARCHAR(255) NULL AFTER status"
    );
  }

  securityTablesReady = true;
};

const createLoginActivity = async ({
  user_id,
  shop_id,
  email,
  role,
  status,
  message,
  ip_address,
  user_agent,
}) => {
  try {
    await ensureSecurityTables();

    await db.promise().query(
      `INSERT INTO login_activity
       (user_id, shop_id, email, role, status, message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id || null,
        shop_id || null,
        email || null,
        role || null,
        status,
        message || null,
        ip_address || null,
        user_agent || null,
      ]
    );
  } catch (error) {
    console.error("Create login activity error:", error.message);
  }
};

module.exports = {
  createLoginActivity,
  ensureSecurityTables,
  generateResetToken,
  hashToken,
  passwordRuleMessage,
  validateStrongPassword,
};
