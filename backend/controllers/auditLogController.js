const db = require("../config/db");
const { ensureAuditLogsTable } = require("../utils/auditLog");

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

exports.getAuditLogs = async (req, res) => {
  const { date_from, date_to } = req.query;
  const action = optionalText(req.query.action);
  const entityType = optionalText(req.query.entity_type);
  const userId = optionalText(req.query.user_id);

  if (userId && !isPositiveInteger(userId)) {
    return res.status(400).json({ message: "user_id must be a positive integer" });
  }

  const conditions = [];
  const values = [];

  if (req.user.role !== "admin") {
    conditions.push("shop_id = ?");
    values.push(req.user.shop_id);
  }

  if (date_from) {
    conditions.push("DATE(created_at) >= ?");
    values.push(date_from);
  }

  if (date_to) {
    conditions.push("DATE(created_at) <= ?");
    values.push(date_to);
  }

  if (action) {
    conditions.push("action = ?");
    values.push(action);
  }

  if (userId) {
    conditions.push("user_id = ?");
    values.push(Number(userId));
  }

  if (entityType) {
    conditions.push("entity_type = ?");
    values.push(entityType);
  }

  try {
    await ensureAuditLogsTable();

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [logs] = await db.promise().query(
      `SELECT id, shop_id, user_id, user_name, user_role, action, entity_type,
              entity_id, description, ip_address, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      values
    );

    return res.json({
      message: "Audit logs fetched successfully",
      logs,
    });
  } catch (error) {
    console.error("Get audit logs error:", error.message);
    return res.status(500).json({ message: "Server error while fetching audit logs" });
  }
};
