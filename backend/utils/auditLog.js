const db = require("../config/db");

let auditLogsTableReady = false;

const ensureAuditLogsTable = async () => {
  if (auditLogsTableReady) return;

  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      user_id INT NULL,
      user_name VARCHAR(100) NULL,
      user_role VARCHAR(50) NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NULL,
      entity_id INT NULL,
      description TEXT NULL,
      ip_address VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_shop_created (shop_id, created_at),
      INDEX idx_audit_logs_action (action),
      INDEX idx_audit_logs_entity_type (entity_type),
      INDEX idx_audit_logs_user_id (user_id)
    )
  `);

  auditLogsTableReady = true;
};

const getUserDetails = async ({ user_id, user_name, user_role, shop_id }) => {
  if (!user_id || (user_name && user_role)) {
    return { user_name: user_name || null, user_role: user_role || null, shop_id };
  }

  const [users] = await db.promise().query(
    "SELECT name, role, shop_id FROM users WHERE id = ? LIMIT 1",
    [user_id]
  );

  const user = users[0] || {};

  return {
    user_name: user_name || user.name || null,
    user_role: user_role || user.role || null,
    shop_id: shop_id === undefined ? user.shop_id || null : shop_id,
  };
};

const createAuditLog = async ({
  shop_id,
  user_id,
  user_name,
  user_role,
  action,
  entity_type,
  entity_id,
  description,
  ip_address,
}) => {
  try {
    if (!action) return;

    await ensureAuditLogsTable();

    const userDetails = await getUserDetails({
      user_id,
      user_name,
      user_role,
      shop_id,
    });

    await db.promise().query(
      `INSERT INTO audit_logs
       (shop_id, user_id, user_name, user_role, action, entity_type, entity_id, description, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userDetails.shop_id || null,
        user_id || null,
        userDetails.user_name,
        userDetails.user_role,
        action,
        entity_type || null,
        entity_id || null,
        description || null,
        ip_address || null,
      ]
    );
  } catch (error) {
    console.error("Create audit log error:", error.message);
  }
};

const createAuditLogFromRequest = (req, details) =>
  createAuditLog({
    shop_id: req.user?.shop_id ?? null,
    user_id: req.user?.id ?? null,
    user_name: req.user?.name || null,
    user_role: req.user?.role || null,
    ip_address: req.ip,
    ...details,
  });

module.exports = {
  createAuditLog,
  createAuditLogFromRequest,
  ensureAuditLogsTable,
};
