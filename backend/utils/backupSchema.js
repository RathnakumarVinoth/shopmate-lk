const db = require("../config/db");

let backupSchemaReady = false;

const addColumnIfMissing = async (connection, table, existingColumns, name, definition) => {
  if (!existingColumns.has(name)) {
    await connection.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    existingColumns.add(name);
  }
};

const addIndexIfMissing = async (connection, table, name, definition) => {
  const [indexes] = await connection.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [
    name,
  ]);

  if (indexes.length === 0) {
    await connection.query(`ALTER TABLE ${table} ADD INDEX ${name} ${definition}`);
  }
};

const ensureBackupSchema = async () => {
  if (backupSchemaReady) return;

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      requested_by INT NULL,
      backup_type VARCHAR(30) NOT NULL DEFAULT 'manual',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      storage_type VARCHAR(30) NULL,
      file_name VARCHAR(255) NULL,
      file_path TEXT NULL,
      backup_data LONGTEXT NULL,
      checksum VARCHAR(128) NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      record_count INT NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_backup_jobs_shop_created (shop_id, created_at),
      INDEX idx_backup_jobs_status (status),
      INDEX idx_backup_jobs_requested_by (requested_by)
    )
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS restore_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      requested_by INT NULL,
      backup_job_id INT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      source_file_name VARCHAR(255) NULL,
      checksum VARCHAR(128) NULL,
      record_count INT NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_restore_jobs_shop_created (shop_id, created_at),
      INDEX idx_restore_jobs_status (status),
      INDEX idx_restore_jobs_requested_by (requested_by)
    )
  `);

  const [backupColumns] = await connection.query("SHOW COLUMNS FROM backup_jobs");
  const existingBackupColumns = new Set(backupColumns.map((column) => column.Field));

  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "shop_id", "shop_id INT NOT NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "requested_by", "requested_by INT NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "backup_type", "backup_type VARCHAR(30) NOT NULL DEFAULT 'manual'");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "status", "status VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "storage_type", "storage_type VARCHAR(30) NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "file_name", "file_name VARCHAR(255) NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "file_path", "file_path TEXT NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "backup_data", "backup_data LONGTEXT NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "checksum", "checksum VARCHAR(128) NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "size_bytes", "size_bytes BIGINT NOT NULL DEFAULT 0");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "record_count", "record_count INT NOT NULL DEFAULT 0");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "started_at", "started_at DATETIME NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "completed_at", "completed_at DATETIME NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "error_message", "error_message TEXT NULL");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(connection, "backup_jobs", existingBackupColumns, "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  const [restoreColumns] = await connection.query("SHOW COLUMNS FROM restore_jobs");
  const existingRestoreColumns = new Set(restoreColumns.map((column) => column.Field));

  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "shop_id", "shop_id INT NOT NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "requested_by", "requested_by INT NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "backup_job_id", "backup_job_id INT NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "status", "status VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "source_file_name", "source_file_name VARCHAR(255) NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "checksum", "checksum VARCHAR(128) NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "record_count", "record_count INT NOT NULL DEFAULT 0");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "started_at", "started_at DATETIME NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "completed_at", "completed_at DATETIME NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "error_message", "error_message TEXT NULL");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await addColumnIfMissing(connection, "restore_jobs", existingRestoreColumns, "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  await addIndexIfMissing(connection, "backup_jobs", "idx_backup_jobs_shop_created", "(shop_id, created_at)");
  await addIndexIfMissing(connection, "backup_jobs", "idx_backup_jobs_status", "(status)");
  await addIndexIfMissing(connection, "backup_jobs", "idx_backup_jobs_requested_by", "(requested_by)");
  await addIndexIfMissing(connection, "restore_jobs", "idx_restore_jobs_shop_created", "(shop_id, created_at)");
  await addIndexIfMissing(connection, "restore_jobs", "idx_restore_jobs_status", "(status)");
  await addIndexIfMissing(connection, "restore_jobs", "idx_restore_jobs_requested_by", "(requested_by)");

  backupSchemaReady = true;
};

module.exports = { ensureBackupSchema };
