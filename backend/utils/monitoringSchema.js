const db = require("../config/db");

let monitoringSchemaReady = false;

const addColumnIfMissing = async (connection, table, columns, name, definition) => {
  if (columns.has(name)) return;

  await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  columns.add(name);
};

const addIndexIfMissing = async (connection, table, indexName, definition) => {
  const [indexes] = await connection.query(
    `SHOW INDEX FROM ${table} WHERE Key_name = ?`,
    [indexName]
  );

  if (indexes.length === 0) {
    await connection.query(`ALTER TABLE ${table} ADD INDEX ${indexName} ${definition}`);
  }
};

const ensureMonitoringSchema = async () => {
  if (monitoringSchemaReady) return;

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      user_id INT NULL,
      request_id VARCHAR(64) NULL,
      error_type VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      stack_trace LONGTEXT NULL,
      method VARCHAR(10) NULL,
      path VARCHAR(500) NULL,
      status_code INT NOT NULL DEFAULT 500,
      request_data TEXT NULL,
      ip_address VARCHAR(100) NULL,
      user_agent VARCHAR(500) NULL,
      environment VARCHAR(30) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_error_logs_created (created_at),
      INDEX idx_error_logs_status_created (status_code, created_at),
      INDEX idx_error_logs_shop_created (shop_id, created_at),
      INDEX idx_error_logs_request_id (request_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS api_request_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      user_id INT NULL,
      request_id VARCHAR(64) NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      status_code INT NOT NULL,
      response_time_ms INT NOT NULL DEFAULT 0,
      request_data TEXT NULL,
      ip_address VARCHAR(100) NULL,
      user_agent VARCHAR(500) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_api_request_logs_created (created_at),
      INDEX idx_api_request_logs_status_created (status_code, created_at),
      INDEX idx_api_request_logs_shop_created (shop_id, created_at),
      INDEX idx_api_request_logs_request_id (request_id)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NULL,
      alert_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      source_type VARCHAR(100) NULL,
      source_id BIGINT NULL,
      dedupe_key VARCHAR(191) NULL,
      occurrence_count INT NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'unread',
      read_by INT NULL,
      read_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_admin_alert_dedupe (dedupe_key),
      INDEX idx_admin_alerts_status_created (status, created_at),
      INDEX idx_admin_alerts_type_created (alert_type, created_at),
      INDEX idx_admin_alerts_shop_created (shop_id, created_at),
      INDEX idx_admin_alerts_severity (severity)
    )
  `);

  const tableColumns = {};

  for (const table of ["error_logs", "api_request_logs", "admin_alerts"]) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
    tableColumns[table] = new Set(columns.map((column) => column.Field));
  }

  const errorColumns = tableColumns.error_logs;
  await addColumnIfMissing(connection, "error_logs", errorColumns, "shop_id", "shop_id INT NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "user_id", "user_id INT NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "request_id", "request_id VARCHAR(64) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "error_type", "error_type VARCHAR(100) NOT NULL DEFAULT 'Error'");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "message", "message TEXT NOT NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "stack_trace", "stack_trace LONGTEXT NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "method", "method VARCHAR(10) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "path", "path VARCHAR(500) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "status_code", "status_code INT NOT NULL DEFAULT 500");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "request_data", "request_data TEXT NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "ip_address", "ip_address VARCHAR(100) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "user_agent", "user_agent VARCHAR(500) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "environment", "environment VARCHAR(30) NULL");
  await addColumnIfMissing(connection, "error_logs", errorColumns, "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  const requestColumns = tableColumns.api_request_logs;
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "shop_id", "shop_id INT NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "user_id", "user_id INT NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "request_id", "request_id VARCHAR(64) NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "method", "method VARCHAR(10) NOT NULL DEFAULT 'GET'");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "path", "path VARCHAR(500) NOT NULL DEFAULT '/'");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "status_code", "status_code INT NOT NULL DEFAULT 500");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "response_time_ms", "response_time_ms INT NOT NULL DEFAULT 0");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "request_data", "request_data TEXT NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "ip_address", "ip_address VARCHAR(100) NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "user_agent", "user_agent VARCHAR(500) NULL");
  await addColumnIfMissing(connection, "api_request_logs", requestColumns, "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  const alertColumns = tableColumns.admin_alerts;
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "shop_id", "shop_id INT NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "alert_type", "alert_type VARCHAR(100) NOT NULL DEFAULT 'system'");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "severity", "severity VARCHAR(20) NOT NULL DEFAULT 'medium'");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "title", "title VARCHAR(255) NOT NULL DEFAULT 'System alert'");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "message", "message TEXT NOT NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "source_type", "source_type VARCHAR(100) NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "source_id", "source_id BIGINT NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "dedupe_key", "dedupe_key VARCHAR(191) NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "occurrence_count", "occurrence_count INT NOT NULL DEFAULT 1");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "status", "status VARCHAR(20) NOT NULL DEFAULT 'unread'");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "read_by", "read_by INT NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "read_at", "read_at DATETIME NULL");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(connection, "admin_alerts", alertColumns, "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  await addIndexIfMissing(connection, "error_logs", "idx_error_logs_created", "(created_at)");
  await addIndexIfMissing(connection, "error_logs", "idx_error_logs_status_created", "(status_code, created_at)");
  await addIndexIfMissing(connection, "error_logs", "idx_error_logs_shop_created", "(shop_id, created_at)");
  await addIndexIfMissing(connection, "error_logs", "idx_error_logs_request_id", "(request_id)");
  await addIndexIfMissing(connection, "api_request_logs", "idx_api_request_logs_created", "(created_at)");
  await addIndexIfMissing(connection, "api_request_logs", "idx_api_request_logs_status_created", "(status_code, created_at)");
  await addIndexIfMissing(connection, "api_request_logs", "idx_api_request_logs_shop_created", "(shop_id, created_at)");
  await addIndexIfMissing(connection, "api_request_logs", "idx_api_request_logs_request_id", "(request_id)");
  await addIndexIfMissing(connection, "admin_alerts", "idx_admin_alerts_status_created", "(status, created_at)");
  await addIndexIfMissing(connection, "admin_alerts", "idx_admin_alerts_type_created", "(alert_type, created_at)");
  await addIndexIfMissing(connection, "admin_alerts", "idx_admin_alerts_shop_created", "(shop_id, created_at)");
  await addIndexIfMissing(connection, "admin_alerts", "idx_admin_alerts_severity", "(severity)");

  const [dedupeIndexes] = await connection.query(
    "SHOW INDEX FROM admin_alerts WHERE Key_name = 'unique_admin_alert_dedupe'"
  );
  if (dedupeIndexes.length === 0) {
    await connection.query(
      "ALTER TABLE admin_alerts ADD UNIQUE INDEX unique_admin_alert_dedupe (dedupe_key)"
    );
  }

  monitoringSchemaReady = true;
};

module.exports = { ensureMonitoringSchema };
