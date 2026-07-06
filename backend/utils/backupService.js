const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const db = require("../config/db");
const { ensureBackupSchema } = require("./backupSchema");

const BACKUP_FORMAT = "shopmate_lk_backup";
const BACKUP_VERSION = 1;

const quoteIdentifier = (identifier) => `\`${String(identifier).replace(/`/g, "``")}\``;

const forbiddenBackupColumns = new Set([
  "password",
  "login_password",
  "login_password_hash",
  "password_hash",
  "reset_token",
  "reset_token_hash",
  "reset_token_expires_at",
  "jwt_secret",
  "secret",
]);

const shopScopedTables = [
  "product_categories",
  "customers",
  "suppliers",
  "products",
  "sales",
  "credit_records",
  "supplier_transactions",
  "expenses",
  "purchase_orders",
  "purchase_order_items",
  "goods_received_notes",
  "grn_items",
  "stock_batches",
  "buying_price_history",
  "stock_adjustments",
  "stock_reconciliations",
  "stock_reconciliation_items",
  "stock_movements",
  "sales_returns",
  "payment_verifications",
  "sale_item_batches",
];

const childTables = [
  {
    key: "sale_items",
    table: "sale_items",
    selectSql: `
      SELECT sale_items.*
      FROM sale_items
      INNER JOIN sales ON sales.id = sale_items.sale_id
      WHERE sales.shop_id = ?
      ORDER BY sale_items.id ASC
    `,
  },
  {
    key: "sales_return_items",
    table: "sales_return_items",
    selectSql: `
      SELECT sales_return_items.*
      FROM sales_return_items
      INNER JOIN sales_returns
        ON sales_returns.id = sales_return_items.return_id
      WHERE sales_returns.shop_id = ?
      ORDER BY sales_return_items.id ASC
    `,
  },
];

const backupTableDefinitions = [
  ...shopScopedTables.map((table) => ({
    key: table,
    table,
    shopScoped: true,
  })),
  ...childTables,
];

const restoreOrder = [
  "product_categories",
  "customers",
  "suppliers",
  "products",
  "sales",
  "sale_items",
  "credit_records",
  "supplier_transactions",
  "expenses",
  "purchase_orders",
  "purchase_order_items",
  "goods_received_notes",
  "grn_items",
  "stock_batches",
  "buying_price_history",
  "stock_adjustments",
  "stock_reconciliations",
  "stock_reconciliation_items",
  "stock_movements",
  "sales_returns",
  "sales_return_items",
  "payment_verifications",
  "sale_item_batches",
];

const deleteOrder = [
  {
    table: "sale_item_batches",
    sql: "DELETE FROM sale_item_batches WHERE shop_id = ?",
  },
  {
    table: "payment_verifications",
    sql: "DELETE FROM payment_verifications WHERE shop_id = ?",
  },
  {
    table: "sales_return_items",
    sql: `
      DELETE sales_return_items
      FROM sales_return_items
      INNER JOIN sales_returns
        ON sales_returns.id = sales_return_items.return_id
      WHERE sales_returns.shop_id = ?
    `,
  },
  {
    table: "sales_returns",
    sql: "DELETE FROM sales_returns WHERE shop_id = ?",
  },
  {
    table: "sale_items",
    sql: `
      DELETE sale_items
      FROM sale_items
      INNER JOIN sales ON sales.id = sale_items.sale_id
      WHERE sales.shop_id = ?
    `,
  },
  { table: "credit_records", sql: "DELETE FROM credit_records WHERE shop_id = ?" },
  { table: "stock_movements", sql: "DELETE FROM stock_movements WHERE shop_id = ?" },
  {
    table: "stock_reconciliation_items",
    sql: "DELETE FROM stock_reconciliation_items WHERE shop_id = ?",
  },
  {
    table: "stock_reconciliations",
    sql: "DELETE FROM stock_reconciliations WHERE shop_id = ?",
  },
  { table: "stock_adjustments", sql: "DELETE FROM stock_adjustments WHERE shop_id = ?" },
  { table: "stock_batches", sql: "DELETE FROM stock_batches WHERE shop_id = ?" },
  { table: "buying_price_history", sql: "DELETE FROM buying_price_history WHERE shop_id = ?" },
  { table: "grn_items", sql: "DELETE FROM grn_items WHERE shop_id = ?" },
  {
    table: "goods_received_notes",
    sql: "DELETE FROM goods_received_notes WHERE shop_id = ?",
  },
  { table: "purchase_order_items", sql: "DELETE FROM purchase_order_items WHERE shop_id = ?" },
  { table: "purchase_orders", sql: "DELETE FROM purchase_orders WHERE shop_id = ?" },
  { table: "supplier_transactions", sql: "DELETE FROM supplier_transactions WHERE shop_id = ?" },
  { table: "expenses", sql: "DELETE FROM expenses WHERE shop_id = ?" },
  { table: "sales", sql: "DELETE FROM sales WHERE shop_id = ?" },
  { table: "products", sql: "DELETE FROM products WHERE shop_id = ?" },
  { table: "product_categories", sql: "DELETE FROM product_categories WHERE shop_id = ?" },
  { table: "customers", sql: "DELETE FROM customers WHERE shop_id = ?" },
  { table: "suppliers", sql: "DELETE FROM suppliers WHERE shop_id = ?" },
];

const tableDefinitionsByKey = backupTableDefinitions.reduce((map, definition) => {
  map[definition.key] = definition;
  return map;
}, {});

const tableExists = async (connection, tableName) => {
  const [rows] = await connection.query("SHOW TABLES LIKE ?", [tableName]);
  return rows.length > 0;
};

const getColumnSet = async (connection, tableName) => {
  if (!(await tableExists(connection, tableName))) return null;

  const [columns] = await connection.query(
    `SHOW COLUMNS FROM ${quoteIdentifier(tableName)}`
  );
  return new Set(columns.map((column) => column.Field));
};

const getShop = async (connection, shopId) => {
  const [shops] = await connection.query(
    `SELECT id, shop_name, shop_code
     FROM shops
     WHERE id = ?
     LIMIT 1`,
    [shopId]
  );
  return shops[0] || null;
};

const formatJob = (job) =>
  job
    ? {
        id: job.id,
        shop_id: job.shop_id,
        shop_name: job.shop_name || null,
        requested_by: job.requested_by || null,
        requested_by_name: job.requested_by_name || null,
        backup_type: job.backup_type || "manual",
        status: job.status,
        storage_type: job.storage_type || null,
        file_name: job.file_name || null,
        checksum: job.checksum || null,
        size_bytes: Number(job.size_bytes || 0),
        record_count: Number(job.record_count || 0),
        started_at: job.started_at || null,
        completed_at: job.completed_at || null,
        error_message: job.error_message || null,
        created_at: job.created_at,
      }
    : null;

const formatRestoreJob = (job) =>
  job
    ? {
        id: job.id,
        shop_id: job.shop_id,
        shop_name: job.shop_name || null,
        requested_by: job.requested_by || null,
        requested_by_name: job.requested_by_name || null,
        backup_job_id: job.backup_job_id || null,
        status: job.status,
        source_file_name: job.source_file_name || null,
        checksum: job.checksum || null,
        record_count: Number(job.record_count || 0),
        started_at: job.started_at || null,
        completed_at: job.completed_at || null,
        error_message: job.error_message || null,
        created_at: job.created_at,
      }
    : null;

const getBackupDirectory = () => {
  if (!process.env.BACKUP_DIR) return null;

  const resolved = path.resolve(process.env.BACKUP_DIR);
  const workspace = path.resolve(__dirname, "..", "..");
  const relative = path.relative(workspace, resolved);

  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    const error = new Error("BACKUP_DIR must be outside the application workspace");
    error.statusCode = 500;
    throw error;
  }

  return resolved;
};

const getBackupRows = async (connection, definition, shopId) => {
  if (!(await tableExists(connection, definition.table))) return [];

  if (definition.selectSql) {
    const [rows] = await connection.query(definition.selectSql, [shopId]);
    return rows;
  }

  const [rows] = await connection.query(
    `SELECT *
     FROM ${quoteIdentifier(definition.table)}
     WHERE shop_id = ?
     ORDER BY id ASC`,
    [shopId]
  );
  return rows;
};

const createPayload = async (connection, shopId) => {
  const shop = await getShop(connection, shopId);

  if (!shop) {
    const error = new Error("Shop not found");
    error.statusCode = 404;
    throw error;
  }

  const tables = {};
  let recordCount = 0;

  for (const definition of backupTableDefinitions) {
    const rows = await getBackupRows(connection, definition, shopId);
    tables[definition.key] = rows;
    recordCount += rows.length;
  }

  return {
    payload: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      generated_at: new Date().toISOString(),
      metadata: {
        app: "ShopMate LK",
        shop_id: shop.id,
        shop_name: shop.shop_name,
        shop_code: shop.shop_code || null,
        tables: Object.keys(tables),
      },
      tables,
    },
    recordCount,
  };
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const saveBackupPayload = async ({ jobId, shopId, payloadText }) => {
  const backupDir = getBackupDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `shopmate-shop-${shopId}-backup-${jobId}-${timestamp}.json`;

  if (!backupDir) {
    return {
      storageType: "database",
      fileName,
      filePath: null,
      backupData: payloadText,
    };
  }

  await fs.mkdir(backupDir, { recursive: true });
  const filePath = path.join(backupDir, fileName);
  await fs.writeFile(filePath, payloadText, "utf8");

  return {
    storageType: "file",
    fileName,
    filePath,
    backupData: null,
  };
};

const createManualBackup = async ({ shopId, userId }) => {
  await ensureBackupSchema();
  const connection = db.promise();

  const [jobResult] = await connection.query(
    `INSERT INTO backup_jobs
     (shop_id, requested_by, backup_type, status, started_at)
     VALUES (?, ?, 'manual', 'running', NOW())`,
    [shopId, userId || null]
  );
  const jobId = jobResult.insertId;

  try {
    const { payload, recordCount } = await createPayload(connection, shopId);
    const payloadText = JSON.stringify(payload, null, 2);
    const checksum = sha256(payloadText);
    const sizeBytes = Buffer.byteLength(payloadText, "utf8");
    const storage = await saveBackupPayload({ jobId, shopId, payloadText });

    await connection.query(
      `UPDATE backup_jobs
       SET status = 'completed',
           storage_type = ?,
           file_name = ?,
           file_path = ?,
           backup_data = ?,
           checksum = ?,
           size_bytes = ?,
           record_count = ?,
           completed_at = NOW(),
           error_message = NULL
       WHERE id = ? AND shop_id = ?`,
      [
        storage.storageType,
        storage.fileName,
        storage.filePath,
        storage.backupData,
        checksum,
        sizeBytes,
        recordCount,
        jobId,
        shopId,
      ]
    );

    const [jobs] = await connection.query(
      `SELECT backup_jobs.*, shops.shop_name, users.name AS requested_by_name
       FROM backup_jobs
       LEFT JOIN shops ON shops.id = backup_jobs.shop_id
       LEFT JOIN users ON users.id = backup_jobs.requested_by
       WHERE backup_jobs.id = ? AND backup_jobs.shop_id = ?
       LIMIT 1`,
      [jobId, shopId]
    );

    return {
      job: formatJob(jobs[0]),
      payload,
    };
  } catch (error) {
    await connection.query(
      `UPDATE backup_jobs
       SET status = 'failed',
           completed_at = NOW(),
           error_message = ?
       WHERE id = ? AND shop_id = ?`,
      [error.message, jobId, shopId]
    );

    throw error;
  }
};

const getBackupStatus = async (shopId) => {
  await ensureBackupSchema();
  const connection = db.promise();

  const [backups] = await connection.query(
    `SELECT backup_jobs.*, shops.shop_name, users.name AS requested_by_name
     FROM backup_jobs
     LEFT JOIN shops ON shops.id = backup_jobs.shop_id
     LEFT JOIN users ON users.id = backup_jobs.requested_by
     WHERE backup_jobs.shop_id = ?
     ORDER BY backup_jobs.created_at DESC, backup_jobs.id DESC
     LIMIT 1`,
    [shopId]
  );
  const [restores] = await connection.query(
    `SELECT restore_jobs.*, shops.shop_name, users.name AS requested_by_name
     FROM restore_jobs
     LEFT JOIN shops ON shops.id = restore_jobs.shop_id
     LEFT JOIN users ON users.id = restore_jobs.requested_by
     WHERE restore_jobs.shop_id = ?
     ORDER BY restore_jobs.created_at DESC, restore_jobs.id DESC
     LIMIT 1`,
    [shopId]
  );
  const [failureRows] = await connection.query(
    `SELECT COUNT(*) AS failed_count
     FROM backup_jobs
     WHERE shop_id = ? AND status = 'failed'`,
    [shopId]
  );

  return {
    latest_backup: formatJob(backups[0]),
    latest_restore: formatRestoreJob(restores[0]),
    failed_backup_count: Number(failureRows[0]?.failed_count || 0),
  };
};

const getBackupHistory = async (shopId) => {
  await ensureBackupSchema();
  const connection = db.promise();

  const [backupRows] = await connection.query(
    `SELECT backup_jobs.*, shops.shop_name, users.name AS requested_by_name
     FROM backup_jobs
     LEFT JOIN shops ON shops.id = backup_jobs.shop_id
     LEFT JOIN users ON users.id = backup_jobs.requested_by
     WHERE backup_jobs.shop_id = ?
     ORDER BY backup_jobs.created_at DESC, backup_jobs.id DESC`,
    [shopId]
  );
  const [restoreRows] = await connection.query(
    `SELECT restore_jobs.*, shops.shop_name, users.name AS requested_by_name
     FROM restore_jobs
     LEFT JOIN shops ON shops.id = restore_jobs.shop_id
     LEFT JOIN users ON users.id = restore_jobs.requested_by
     WHERE restore_jobs.shop_id = ?
     ORDER BY restore_jobs.created_at DESC, restore_jobs.id DESC`,
    [shopId]
  );

  return {
    backups: backupRows.map(formatJob),
    restores: restoreRows.map(formatRestoreJob),
  };
};

const getBackupDownload = async ({ shopId, backupId }) => {
  await ensureBackupSchema();
  const connection = db.promise();

  const [jobs] = await connection.query(
    `SELECT *
     FROM backup_jobs
     WHERE id = ? AND shop_id = ? AND status = 'completed'
     LIMIT 1`,
    [backupId, shopId]
  );

  if (jobs.length === 0) {
    const error = new Error("Backup not found");
    error.statusCode = 404;
    throw error;
  }

  const job = jobs[0];
  let payloadText = job.backup_data;

  if (!payloadText && job.storage_type === "file" && job.file_path) {
    payloadText = await fs.readFile(path.resolve(job.file_path), "utf8");
  }

  if (!payloadText) {
    const error = new Error("Backup file is not available");
    error.statusCode = 404;
    throw error;
  }

  return {
    job: formatJob(job),
    payloadText,
    fileName: job.file_name || `shopmate-backup-${backupId}.json`,
  };
};

const parseBackupInput = (input) => {
  if (!input) {
    const error = new Error("backup is required");
    error.statusCode = 400;
    throw error;
  }

  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      const error = new Error("Backup file must be valid JSON");
      error.statusCode = 400;
      throw error;
    }
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }

  const error = new Error("Backup file must be a JSON object");
  error.statusCode = 400;
  throw error;
};

const validateNoForbiddenFields = (tableName, row) => {
  for (const key of Object.keys(row || {})) {
    if (forbiddenBackupColumns.has(key.toLowerCase())) {
      const error = new Error(`Backup contains forbidden field ${tableName}.${key}`);
      error.statusCode = 400;
      throw error;
    }
  }
};

const validateBackupPayload = (backup, targetShopId) => {
  if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    const error = new Error("Invalid ShopMate backup format");
    error.statusCode = 400;
    throw error;
  }

  const backupShopId = Number(backup.metadata?.shop_id);

  if (!Number.isInteger(backupShopId) || backupShopId <= 0) {
    const error = new Error("Backup metadata is missing a valid shop_id");
    error.statusCode = 400;
    throw error;
  }

  if (Number(targetShopId) !== backupShopId) {
    const error = new Error("Backup shop does not match the restore target shop");
    error.statusCode = 403;
    throw error;
  }

  if (!backup.tables || typeof backup.tables !== "object" || Array.isArray(backup.tables)) {
    const error = new Error("Backup tables payload is required");
    error.statusCode = 400;
    throw error;
  }

  for (const tableName of Object.keys(backup.tables)) {
    if (!tableDefinitionsByKey[tableName]) {
      const error = new Error(`Unsupported backup table: ${tableName}`);
      error.statusCode = 400;
      throw error;
    }

    if (!Array.isArray(backup.tables[tableName])) {
      const error = new Error(`Backup table ${tableName} must be an array`);
      error.statusCode = 400;
      throw error;
    }

    const definition = tableDefinitionsByKey[tableName];

    for (const row of backup.tables[tableName]) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        const error = new Error(`Backup table ${tableName} contains an invalid row`);
        error.statusCode = 400;
        throw error;
      }

      validateNoForbiddenFields(tableName, row);

      if (
        definition.shopScoped &&
        row.shop_id !== undefined &&
        Number(row.shop_id) !== backupShopId
      ) {
        const error = new Error(`Backup table ${tableName} contains another shop's data`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const idsByTable = (tableName) =>
    new Set((backup.tables[tableName] || []).map((row) => Number(row.id)).filter(Boolean));
  const ids = {
    product_categories: idsByTable("product_categories"),
    customers: idsByTable("customers"),
    suppliers: idsByTable("suppliers"),
    products: idsByTable("products"),
    sales: idsByTable("sales"),
    sale_items: idsByTable("sale_items"),
    purchase_orders: idsByTable("purchase_orders"),
    purchase_order_items: idsByTable("purchase_order_items"),
    goods_received_notes: idsByTable("goods_received_notes"),
    stock_batches: idsByTable("stock_batches"),
    stock_reconciliations: idsByTable("stock_reconciliations"),
    sales_returns: idsByTable("sales_returns"),
  };
  const checkReference = ({
    tableName,
    row,
    field,
    parentTable,
    parentIds,
    nullable = false,
  }) => {
    const value = row[field];

    if (value === undefined || value === null || value === "") {
      if (nullable) return;

      const error = new Error(`${tableName}.${field} is required`);
      error.statusCode = 400;
      throw error;
    }

    if (!parentIds.has(Number(value))) {
      const error = new Error(`${tableName}.${field} does not reference backup ${parentTable}`);
      error.statusCode = 400;
      throw error;
    }
  };
  const validateRows = (tableName, validator) => {
    for (const row of backup.tables[tableName] || []) {
      validator(row);
    }
  };

  validateRows("products", (row) => {
    checkReference({
      tableName: "products",
      row,
      field: "category_id",
      parentTable: "product_categories",
      parentIds: ids.product_categories,
      nullable: true,
    });
  });
  validateRows("sales", (row) => {
    checkReference({
      tableName: "sales",
      row,
      field: "customer_id",
      parentTable: "customers",
      parentIds: ids.customers,
      nullable: true,
    });
  });
  validateRows("sale_items", (row) => {
    checkReference({
      tableName: "sale_items",
      row,
      field: "sale_id",
      parentTable: "sales",
      parentIds: ids.sales,
    });
    checkReference({
      tableName: "sale_items",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
  });
  validateRows("credit_records", (row) => {
    checkReference({
      tableName: "credit_records",
      row,
      field: "customer_id",
      parentTable: "customers",
      parentIds: ids.customers,
      nullable: true,
    });
    checkReference({
      tableName: "credit_records",
      row,
      field: "sale_id",
      parentTable: "sales",
      parentIds: ids.sales,
      nullable: true,
    });
  });
  validateRows("supplier_transactions", (row) => {
    checkReference({
      tableName: "supplier_transactions",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
      nullable: true,
    });
  });
  validateRows("purchase_orders", (row) => {
    checkReference({
      tableName: "purchase_orders",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
    });
  });
  validateRows("purchase_order_items", (row) => {
    checkReference({
      tableName: "purchase_order_items",
      row,
      field: "purchase_order_id",
      parentTable: "purchase_orders",
      parentIds: ids.purchase_orders,
    });
    checkReference({
      tableName: "purchase_order_items",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
  });
  validateRows("goods_received_notes", (row) => {
    checkReference({
      tableName: "goods_received_notes",
      row,
      field: "purchase_order_id",
      parentTable: "purchase_orders",
      parentIds: ids.purchase_orders,
    });
    checkReference({
      tableName: "goods_received_notes",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
    });
  });
  validateRows("grn_items", (row) => {
    checkReference({
      tableName: "grn_items",
      row,
      field: "grn_id",
      parentTable: "goods_received_notes",
      parentIds: ids.goods_received_notes,
    });
    checkReference({
      tableName: "grn_items",
      row,
      field: "purchase_order_item_id",
      parentTable: "purchase_order_items",
      parentIds: ids.purchase_order_items,
    });
    checkReference({
      tableName: "grn_items",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
  });
  validateRows("stock_batches", (row) => {
    checkReference({
      tableName: "stock_batches",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "stock_batches",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
    });
    checkReference({
      tableName: "stock_batches",
      row,
      field: "purchase_order_id",
      parentTable: "purchase_orders",
      parentIds: ids.purchase_orders,
    });
    checkReference({
      tableName: "stock_batches",
      row,
      field: "grn_id",
      parentTable: "goods_received_notes",
      parentIds: ids.goods_received_notes,
    });
  });
  validateRows("buying_price_history", (row) => {
    checkReference({
      tableName: "buying_price_history",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "buying_price_history",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
    });
    checkReference({
      tableName: "buying_price_history",
      row,
      field: "purchase_order_id",
      parentTable: "purchase_orders",
      parentIds: ids.purchase_orders,
      nullable: true,
    });
    checkReference({
      tableName: "buying_price_history",
      row,
      field: "grn_id",
      parentTable: "goods_received_notes",
      parentIds: ids.goods_received_notes,
      nullable: true,
    });
  });
  validateRows("stock_adjustments", (row) => {
    checkReference({
      tableName: "stock_adjustments",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "stock_adjustments",
      row,
      field: "batch_id",
      parentTable: "stock_batches",
      parentIds: ids.stock_batches,
      nullable: true,
    });
  });
  validateRows("stock_reconciliation_items", (row) => {
    checkReference({
      tableName: "stock_reconciliation_items",
      row,
      field: "reconciliation_id",
      parentTable: "stock_reconciliations",
      parentIds: ids.stock_reconciliations,
    });
    checkReference({
      tableName: "stock_reconciliation_items",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "stock_reconciliation_items",
      row,
      field: "batch_id",
      parentTable: "stock_batches",
      parentIds: ids.stock_batches,
      nullable: true,
    });
  });
  validateRows("stock_movements", (row) => {
    checkReference({
      tableName: "stock_movements",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "stock_movements",
      row,
      field: "supplier_id",
      parentTable: "suppliers",
      parentIds: ids.suppliers,
      nullable: true,
    });
    checkReference({
      tableName: "stock_movements",
      row,
      field: "batch_id",
      parentTable: "stock_batches",
      parentIds: ids.stock_batches,
      nullable: true,
    });
  });
  validateRows("sales_returns", (row) => {
    checkReference({
      tableName: "sales_returns",
      row,
      field: "sale_id",
      parentTable: "sales",
      parentIds: ids.sales,
    });
  });
  validateRows("sales_return_items", (row) => {
    checkReference({
      tableName: "sales_return_items",
      row,
      field: "return_id",
      parentTable: "sales_returns",
      parentIds: ids.sales_returns,
    });
    checkReference({
      tableName: "sales_return_items",
      row,
      field: "sale_item_id",
      parentTable: "sale_items",
      parentIds: ids.sale_items,
    });
    checkReference({
      tableName: "sales_return_items",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
  });
  validateRows("payment_verifications", (row) => {
    checkReference({
      tableName: "payment_verifications",
      row,
      field: "sale_id",
      parentTable: "sales",
      parentIds: ids.sales,
    });
  });
  validateRows("sale_item_batches", (row) => {
    checkReference({
      tableName: "sale_item_batches",
      row,
      field: "sale_id",
      parentTable: "sales",
      parentIds: ids.sales,
    });
    checkReference({
      tableName: "sale_item_batches",
      row,
      field: "sale_item_id",
      parentTable: "sale_items",
      parentIds: ids.sale_items,
    });
    checkReference({
      tableName: "sale_item_batches",
      row,
      field: "product_id",
      parentTable: "products",
      parentIds: ids.products,
    });
    checkReference({
      tableName: "sale_item_batches",
      row,
      field: "batch_id",
      parentTable: "stock_batches",
      parentIds: ids.stock_batches,
    });
  });

  return backupShopId;
};

const insertRows = async ({ connection, tableName, rows, targetShopId }) => {
  if (!rows?.length) return 0;

  const columns = await getColumnSet(connection, tableName);
  if (!columns) return 0;

  let insertedCount = 0;

  for (const row of rows) {
    const nextRow = { ...row };

    if (columns.has("shop_id")) {
      nextRow.shop_id = targetShopId;
    }

    const fieldNames = Object.keys(nextRow).filter((field) => columns.has(field));

    if (fieldNames.length === 0) continue;

    const placeholders = fieldNames.map(() => "?").join(", ");
    const values = fieldNames.map((field) => nextRow[field]);

    await connection.query(
      `INSERT INTO ${quoteIdentifier(tableName)}
       (${fieldNames.map(quoteIdentifier).join(", ")})
       VALUES (${placeholders})`,
      values
    );
    insertedCount += 1;
  }

  return insertedCount;
};

const restoreBackup = async ({
  backupInput,
  targetShopId,
  userId,
  backupJobId = null,
  sourceFileName = null,
}) => {
  await ensureBackupSchema();
  const backup = parseBackupInput(backupInput);
  const backupShopId = validateBackupPayload(backup, targetShopId);
  const payloadText = JSON.stringify(backup);
  const checksum = sha256(payloadText);
  const connection = db.promise();
  let restoreJobId = null;

  const [restoreJobResult] = await connection.query(
    `INSERT INTO restore_jobs
     (shop_id, requested_by, backup_job_id, status, source_file_name, checksum, started_at)
     VALUES (?, ?, ?, 'running', ?, ?, NOW())`,
    [backupShopId, userId || null, backupJobId, sourceFileName, checksum]
  );
  restoreJobId = restoreJobResult.insertId;

  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    for (const deleteDefinition of deleteOrder) {
      if (await tableExists(connection, deleteDefinition.table)) {
        await connection.query(deleteDefinition.sql, [backupShopId]);
      }
    }

    let recordCount = 0;

    for (const tableName of restoreOrder) {
      const definition = tableDefinitionsByKey[tableName];
      if (!definition) continue;
      recordCount += await insertRows({
        connection,
        tableName: definition.table,
        rows: backup.tables[tableName] || [],
        targetShopId: backupShopId,
      });
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.query(
      `UPDATE restore_jobs
       SET status = 'completed',
           record_count = ?,
           completed_at = NOW(),
           error_message = NULL
       WHERE id = ? AND shop_id = ?`,
      [recordCount, restoreJobId, backupShopId]
    );
    await connection.commit();

    const [jobs] = await db.promise().query(
      `SELECT restore_jobs.*, shops.shop_name, users.name AS requested_by_name
       FROM restore_jobs
       LEFT JOIN shops ON shops.id = restore_jobs.shop_id
       LEFT JOIN users ON users.id = restore_jobs.requested_by
       WHERE restore_jobs.id = ? AND restore_jobs.shop_id = ?
       LIMIT 1`,
      [restoreJobId, backupShopId]
    );

    return {
      restore: formatRestoreJob(jobs[0]),
      record_count: recordCount,
    };
  } catch (error) {
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Restore rollback failed:", rollbackError.message);
    }

    await db.promise().query(
      `UPDATE restore_jobs
       SET status = 'failed',
           completed_at = NOW(),
           error_message = ?
       WHERE id = ? AND shop_id = ?`,
      [error.message, restoreJobId, backupShopId]
    );

    error.restoreJobRecorded = true;
    throw error;
  }
};

const createFailedRestoreJob = async ({ shopId, userId, sourceFileName, errorMessage }) => {
  if (!shopId) return null;

  await ensureBackupSchema();
  const [result] = await db.promise().query(
    `INSERT INTO restore_jobs
     (shop_id, requested_by, status, source_file_name, completed_at, error_message)
     VALUES (?, ?, 'failed', ?, NOW(), ?)`,
    [shopId, userId || null, sourceFileName || null, errorMessage]
  );

  return result.insertId;
};

const getAdminBackupStatus = async () => {
  await ensureBackupSchema();
  const connection = db.promise();

  const [rows] = await connection.query(`
    SELECT
      shops.id AS shop_id,
      shops.shop_name,
      shops.shop_code,
      shops.subscription_status,
      shops.is_enabled,
      backup_jobs.id AS backup_id,
      backup_jobs.status AS backup_status,
      backup_jobs.file_name,
      backup_jobs.size_bytes,
      backup_jobs.record_count,
      backup_jobs.completed_at,
      backup_jobs.error_message,
      users.name AS requested_by_name
    FROM shops
    LEFT JOIN backup_jobs
      ON backup_jobs.id = (
        SELECT latest_jobs.id
        FROM backup_jobs AS latest_jobs
        WHERE latest_jobs.shop_id = shops.id
        ORDER BY latest_jobs.created_at DESC, latest_jobs.id DESC
        LIMIT 1
      )
    LEFT JOIN users ON users.id = backup_jobs.requested_by
    ORDER BY shops.id DESC
  `);

  return rows.map((row) => ({
    shop_id: row.shop_id,
    shop_name: row.shop_name,
    shop_code: row.shop_code || null,
    subscription_status: row.subscription_status || null,
    is_enabled: Boolean(Number(row.is_enabled ?? 1)),
    latest_backup: row.backup_id
      ? {
          id: row.backup_id,
          status: row.backup_status,
          file_name: row.file_name || null,
          size_bytes: Number(row.size_bytes || 0),
          record_count: Number(row.record_count || 0),
          completed_at: row.completed_at || null,
          error_message: row.error_message || null,
          requested_by_name: row.requested_by_name || null,
        }
      : null,
  }));
};

module.exports = {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createFailedRestoreJob,
  createManualBackup,
  getAdminBackupStatus,
  getBackupDownload,
  getBackupHistory,
  getBackupStatus,
  parseBackupInput,
  restoreBackup,
  validateBackupPayload,
};
