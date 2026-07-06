const db = require("../config/db");
const { ensureBackupSchema } = require("../utils/backupSchema");
const { redactText } = require("../utils/logSanitizer");
const { ensureMonitoringSchema } = require("../utils/monitoringSchema");
const {
  createAdminAlert,
  getStorageUsage,
  syncOperationalAlerts,
} = require("../utils/monitoringService");

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const getPagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE)
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

const paginationResponse = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  total_pages: Math.max(1, Math.ceil(total / limit)),
});

const optionalPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const buildLogFilters = (query, allowedStatuses = null) => {
  const clauses = [];
  const values = [];
  const shopId = optionalPositiveInteger(query.shop_id);
  const statusCode = Number(query.status_code);

  if (shopId) {
    clauses.push("shop_id = ?");
    values.push(shopId);
  }

  if (
    allowedStatuses &&
    Number.isInteger(statusCode) &&
    allowedStatuses(statusCode)
  ) {
    clauses.push("status_code = ?");
    values.push(statusCode);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
};

exports.getSystemHealth = async (req, res, next) => {
  const checkedAt = new Date().toISOString();
  const startedAt = process.hrtime.bigint();
  let database = {
    status: "ok",
    latency_ms: 0,
    message: "Database connection is healthy",
  };

  try {
    await db.promise().query("SELECT 1 AS healthy");
    database.latency_ms = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000)
    );
  } catch (error) {
    database = {
      status: "down",
      latency_ms: null,
      message: "Database connection failed",
    };

    await createAdminAlert({
      alertType: "database_connection_issue",
      severity: "critical",
      title: "Database connection issue",
      message: redactText(error.message),
      sourceType: "database",
      dedupeKey: `database-connection:${Math.floor(Date.now() / 600000)}`,
      reopen: true,
    });

    return res.json({
      message: "System health fetched with degraded database status",
      health: {
        api: {
          status: "degraded",
          uptime_seconds: Math.floor(process.uptime()),
          checked_at: checkedAt,
        },
        database,
        last_backup: null,
        recent_error_count: null,
        failed_api_request_count: null,
        unread_alert_count: null,
        storage: null,
        retention: {
          strategy:
            "Keep monitoring logs for 90 days; schedule a database cleanup job before production scale.",
          configured_days: Number(process.env.MONITORING_RETENTION_DAYS || 90),
        },
      },
    });
  }

  try {
    await ensureMonitoringSchema();
    await ensureBackupSchema();
    await syncOperationalAlerts();

    const [
      [backupRows],
      [errorCountRows],
      [requestCountRows],
      [alertCountRows],
    ] = await Promise.all([
      db.promise().query(
        `SELECT id, shop_id, status, storage_type, file_name, size_bytes,
                record_count, completed_at, error_message, created_at
         FROM backup_jobs
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      ),
      db.promise().query(
        `SELECT COUNT(*) AS total
         FROM error_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      ),
      db.promise().query(
        `SELECT COUNT(*) AS total
         FROM api_request_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      ),
      db.promise().query(
        "SELECT COUNT(*) AS total FROM admin_alerts WHERE status = 'unread'"
      ),
    ]);

    let storage;
    try {
      storage = {
        status: "ok",
        ...(await getStorageUsage()),
      };
    } catch (storageError) {
      storage = {
        status: "unavailable",
        message: "Storage usage could not be calculated",
      };
      console.error("Storage health check failed:", redactText(storageError.message));
    }

    return res.json({
      message: "System health fetched successfully",
      health: {
        api: {
          status: "ok",
          uptime_seconds: Math.floor(process.uptime()),
          checked_at: checkedAt,
        },
        database,
        last_backup: backupRows[0]
          ? {
              ...backupRows[0],
              size_bytes: Number(backupRows[0].size_bytes || 0),
              record_count: Number(backupRows[0].record_count || 0),
            }
          : null,
        recent_error_count: Number(errorCountRows[0]?.total || 0),
        failed_api_request_count: Number(requestCountRows[0]?.total || 0),
        unread_alert_count: Number(alertCountRows[0]?.total || 0),
        storage,
        retention: {
          strategy:
            "Keep monitoring logs for 90 days; schedule a database cleanup job before production scale.",
          configured_days: Number(process.env.MONITORING_RETENTION_DAYS || 90),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getSystemAlerts = async (req, res, next) => {
  try {
    await ensureMonitoringSchema();
    await syncOperationalAlerts();

    const { page, limit, offset } = getPagination(req.query);
    const clauses = [];
    const values = [];

    if (["read", "unread"].includes(req.query.status)) {
      clauses.push("admin_alerts.status = ?");
      values.push(req.query.status);
    }

    if (["low", "medium", "high", "critical"].includes(req.query.severity)) {
      clauses.push("admin_alerts.severity = ?");
      values.push(req.query.severity);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS total FROM admin_alerts ${where}`,
        values
      ),
      db.promise().query(
        `SELECT admin_alerts.*, shops.shop_name, users.name AS read_by_name
         FROM admin_alerts
         LEFT JOIN shops ON shops.id = admin_alerts.shop_id
         LEFT JOIN users ON users.id = admin_alerts.read_by
         ${where}
         ORDER BY admin_alerts.status = 'unread' DESC,
                  admin_alerts.created_at DESC,
                  admin_alerts.id DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      ),
    ]);
    const total = Number(countRows[0]?.total || 0);

    return res.json({
      message: "System alerts fetched successfully",
      alerts: rows,
      pagination: paginationResponse({ page, limit, total }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.markSystemAlertRead = async (req, res, next) => {
  const alertId = optionalPositiveInteger(req.params.id);
  if (!alertId) {
    return res.status(400).json({ message: "Valid alert id is required" });
  }

  try {
    await ensureMonitoringSchema();
    const [result] = await db.promise().query(
      `UPDATE admin_alerts
       SET status = 'read', read_by = ?, read_at = NOW()
       WHERE id = ?`,
      [req.user.id, alertId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "System alert not found" });
    }

    return res.json({ message: "System alert marked as read" });
  } catch (error) {
    return next(error);
  }
};

exports.getErrorLogs = async (req, res, next) => {
  try {
    await ensureMonitoringSchema();
    const { page, limit, offset } = getPagination(req.query);
    const filters = buildLogFilters(
      req.query,
      (statusCode) => statusCode >= 400 && statusCode <= 599
    );
    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS total FROM error_logs ${filters.where}`,
        filters.values
      ),
      db.promise().query(
        `SELECT id, shop_id, user_id, request_id, error_type, message, stack_trace,
                method, path, status_code, request_data, ip_address, user_agent,
                environment, created_at
         FROM error_logs
         ${filters.where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...filters.values, limit, offset]
      ),
    ]);
    const total = Number(countRows[0]?.total || 0);

    return res.json({
      message: "Error logs fetched successfully",
      logs: rows,
      pagination: paginationResponse({ page, limit, total }),
    });
  } catch (error) {
    return next(error);
  }
};

exports.getApiRequestLogs = async (req, res, next) => {
  try {
    await ensureMonitoringSchema();
    const { page, limit, offset } = getPagination(req.query);
    const filters = buildLogFilters(
      req.query,
      (statusCode) =>
        [400, 401, 403, 404].includes(statusCode) || statusCode >= 500
    );
    const [[countRows], [rows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(*) AS total FROM api_request_logs ${filters.where}`,
        filters.values
      ),
      db.promise().query(
        `SELECT id, shop_id, user_id, request_id, method, path, status_code,
                response_time_ms, request_data, ip_address, user_agent, created_at
         FROM api_request_logs
         ${filters.where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...filters.values, limit, offset]
      ),
    ]);
    const total = Number(countRows[0]?.total || 0);

    return res.json({
      message: "Failed API request logs fetched successfully",
      logs: rows,
      pagination: paginationResponse({ page, limit, total }),
    });
  } catch (error) {
    return next(error);
  }
};
