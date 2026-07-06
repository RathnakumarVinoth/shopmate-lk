const fs = require("fs/promises");
const path = require("path");

const db = require("../config/db");
const { ensureBackupSchema } = require("./backupSchema");
const {
  getSafeRequestPath,
  redactText,
  serializeSanitizedRequest,
} = require("./logSanitizer");
const { ensureMonitoringSchema } = require("./monitoringSchema");

const FAILED_STATUS_CODES = new Set([400, 401, 403, 404]);
const DEFAULT_REPEATED_ERROR_THRESHOLD = 5;

const toPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const getRepeatedErrorThreshold = () =>
  toPositiveInteger(
    process.env.MONITORING_500_ALERT_THRESHOLD,
    DEFAULT_REPEATED_ERROR_THRESHOLD
  );

const isFailedStatus = (statusCode) =>
  FAILED_STATUS_CODES.has(Number(statusCode)) || Number(statusCode) >= 500;

const safeMonitoringOperation = async (operation, fallback = null) => {
  try {
    return await operation();
  } catch (error) {
    console.error("Monitoring operation failed:", redactText(error.message));
    return fallback;
  }
};

const createAdminAlert = async ({
  shopId = null,
  alertType,
  severity = "medium",
  title,
  message,
  sourceType = null,
  sourceId = null,
  dedupeKey = null,
  reopen = false,
}) =>
  safeMonitoringOperation(async () => {
    await ensureMonitoringSchema();
    const connection = db.promise();

    if (dedupeKey) {
      const [existingRows] = await connection.query(
        "SELECT id FROM admin_alerts WHERE dedupe_key = ? LIMIT 1",
        [String(dedupeKey).slice(0, 191)]
      );

      if (existingRows.length > 0) {
        if (reopen) {
          await connection.query(
            `UPDATE admin_alerts
             SET occurrence_count = occurrence_count + 1,
                 severity = ?,
                 title = ?,
                 message = ?,
                 status = 'unread',
                 read_by = NULL,
                 read_at = NULL,
                 updated_at = NOW()
             WHERE id = ?`,
            [
              severity,
              redactText(title).slice(0, 255),
              redactText(message),
              existingRows[0].id,
            ]
          );
        }

        return existingRows[0].id;
      }
    }

    const [result] = await connection.query(
      `INSERT INTO admin_alerts
       (shop_id, alert_type, severity, title, message, source_type, source_id, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId || null,
        String(alertType || "system").slice(0, 100),
        String(severity || "medium").slice(0, 20),
        redactText(title || "System alert").slice(0, 255),
        redactText(message || "A system event requires attention."),
        sourceType ? String(sourceType).slice(0, 100) : null,
        sourceId || null,
        dedupeKey ? String(dedupeKey).slice(0, 191) : null,
      ]
    );

    return result.insertId;
  });

const recordErrorLog = async ({
  error,
  req,
  statusCode = 500,
  requestId = null,
  errorType = null,
  message = null,
}) =>
  safeMonitoringOperation(async () => {
    await ensureMonitoringSchema();
    const production = process.env.NODE_ENV === "production";
    const safeMessage = redactText(message || error?.message || "Unexpected server error");
    const stackTrace =
      !production && error?.stack ? redactText(error.stack).slice(0, 30000) : null;

    const [result] = await db.promise().query(
      `INSERT INTO error_logs
       (shop_id, user_id, request_id, error_type, message, stack_trace, method, path,
        status_code, request_data, ip_address, user_agent, environment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.shop_id || null,
        req?.user?.id || null,
        requestId || req?.monitoringRequestId || null,
        redactText(errorType || error?.name || "Error").slice(0, 100),
        safeMessage,
        stackTrace,
        req?.method || null,
        req ? getSafeRequestPath(req) : null,
        Number(statusCode || 500),
        req ? serializeSanitizedRequest(req) : null,
        req?.ip || null,
        req?.headers?.["user-agent"]
          ? redactText(req.headers["user-agent"]).slice(0, 500)
          : null,
        String(process.env.NODE_ENV || "development").slice(0, 30),
      ]
    );

    return result.insertId;
  });

const createRepeatedServerErrorAlert = async () => {
  const threshold = getRepeatedErrorThreshold();
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS error_count
     FROM api_request_logs
     WHERE status_code >= 500
       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
  );
  const errorCount = Number(rows[0]?.error_count || 0);

  if (errorCount < threshold) return null;

  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  return createAdminAlert({
    alertType: "repeated_server_errors",
    severity: "critical",
    title: "Repeated server errors detected",
    message: `${errorCount} failed requests with server errors were recorded in the last 10 minutes.`,
    sourceType: "api_request_logs",
    dedupeKey: `repeated-500-errors:${bucket}`,
    reopen: true,
  });
};

const recordFailedApiRequest = async ({ req, res, startedAt, requestId }) => {
  const statusCode = Number(res.statusCode || 200);
  if (!isFailedStatus(statusCode)) return null;

  return safeMonitoringOperation(async () => {
    await ensureMonitoringSchema();
    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    const responseTimeMs = Math.max(
      0,
      Math.round(Number(elapsedNanoseconds) / 1_000_000)
    );

    const [result] = await db.promise().query(
      `INSERT INTO api_request_logs
       (shop_id, user_id, request_id, method, path, status_code, response_time_ms,
        request_data, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user?.shop_id || null,
        req.user?.id || null,
        requestId || req.monitoringRequestId || null,
        String(req.method || "GET").slice(0, 10),
        getSafeRequestPath(req),
        statusCode,
        responseTimeMs,
        serializeSanitizedRequest(req),
        req.ip || null,
        req.headers?.["user-agent"]
          ? redactText(req.headers["user-agent"]).slice(0, 500)
          : null,
      ]
    );

    if (statusCode >= 500 && !res.locals.monitoringErrorLogged) {
      await recordErrorLog({
        req,
        statusCode,
        requestId,
        errorType: "HttpResponseError",
        message: `Request completed with status ${statusCode}`,
      });
      res.locals.monitoringErrorLogged = true;
    }

    if (statusCode >= 500) {
      await createRepeatedServerErrorAlert();
    }

    return result.insertId;
  });
};

const syncOperationalAlerts = async ({ shopId = null } = {}) =>
  safeMonitoringOperation(async () => {
    await ensureMonitoringSchema();
    await ensureBackupSchema();
    const connection = db.promise();
    const shopFilter = shopId ? " AND shop_id = ?" : "";
    const values = shopId ? [shopId] : [];

    const [[backupFailures], [restoreFailures]] = await Promise.all([
      connection.query(
        `SELECT id, shop_id, error_message, completed_at, created_at
         FROM backup_jobs
         WHERE status = 'failed'${shopFilter}
         ORDER BY id DESC
         LIMIT 50`,
        values
      ),
      connection.query(
        `SELECT id, shop_id, error_message, completed_at, created_at
         FROM restore_jobs
         WHERE status = 'failed'${shopFilter}
         ORDER BY id DESC
         LIMIT 50`,
        values
      ),
    ]);

    for (const failure of backupFailures) {
      await createAdminAlert({
        shopId: failure.shop_id,
        alertType: "backup_failure",
        severity: "high",
        title: "Backup failed",
        message: failure.error_message || `Backup ${failure.id} failed.`,
        sourceType: "backup_job",
        sourceId: failure.id,
        dedupeKey: `backup-failure:${failure.id}`,
      });
    }

    for (const failure of restoreFailures) {
      await createAdminAlert({
        shopId: failure.shop_id,
        alertType: "restore_failure",
        severity: "critical",
        title: "Restore failed",
        message: failure.error_message || `Restore ${failure.id} failed.`,
        sourceType: "restore_job",
        sourceId: failure.id,
        dedupeKey: `restore-failure:${failure.id}`,
      });
    }

    return {
      backup_failures: backupFailures.length,
      restore_failures: restoreFailures.length,
    };
  }, { backup_failures: 0, restore_failures: 0 });

const getStorageUsage = async () => {
  const connection = db.promise();
  const databaseName = process.env.DB_NAME || "";
  let databaseBytes = 0;
  let backupDatabaseBytes = 0;
  let backupFileBytes = 0;
  let diskTotalBytes = null;
  let diskFreeBytes = null;

  if (databaseName) {
    const [databaseRows] = await connection.query(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS size_bytes
       FROM information_schema.tables
       WHERE table_schema = ?`,
      [databaseName]
    );
    databaseBytes = Number(databaseRows[0]?.size_bytes || 0);
  }

  await ensureBackupSchema();
  const [backupRows] = await connection.query(
    `SELECT
       COALESCE(SUM(CASE WHEN storage_type = 'database' THEN size_bytes ELSE 0 END), 0)
         AS database_size_bytes,
       COALESCE(SUM(CASE WHEN storage_type = 'file' THEN size_bytes ELSE 0 END), 0)
         AS file_size_bytes
     FROM backup_jobs
     WHERE status = 'completed'`
  );
  backupDatabaseBytes = Number(backupRows[0]?.database_size_bytes || 0);
  backupFileBytes = Number(backupRows[0]?.file_size_bytes || 0);

  const configuredBackupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : null;
  const diskTarget = configuredBackupDir || process.cwd();

  if (typeof fs.statfs === "function") {
    try {
      const stats = await fs.statfs(diskTarget);
      diskTotalBytes = Number(stats.blocks) * Number(stats.bsize);
      diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
    } catch (error) {
      if (!["ENOENT", "ENOSYS"].includes(error.code)) throw error;
    }
  }

  return {
    database_bytes: databaseBytes,
    backup_database_bytes: backupDatabaseBytes,
    backup_file_bytes: backupFileBytes,
    disk_total_bytes: diskTotalBytes,
    disk_free_bytes: diskFreeBytes,
    backup_directory_configured: Boolean(configuredBackupDir),
  };
};

module.exports = {
  createAdminAlert,
  getStorageUsage,
  isFailedStatus,
  recordErrorLog,
  recordFailedApiRequest,
  syncOperationalAlerts,
};
