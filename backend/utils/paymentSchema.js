const db = require("../config/db");

let ensuredSalesColumns = false;
let ensuredPaymentVerifications = false;

const paymentColumns = [
  {
    name: "payment_status",
    definition:
      "ALTER TABLE sales ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'verified'",
  },
  {
    name: "payment_reference",
    definition: "ALTER TABLE sales ADD COLUMN payment_reference VARCHAR(100) NULL",
  },
  {
    name: "approval_code",
    definition: "ALTER TABLE sales ADD COLUMN approval_code VARCHAR(50) NULL",
  },
  {
    name: "card_last_four",
    definition: "ALTER TABLE sales ADD COLUMN card_last_four VARCHAR(4) NULL",
  },
  {
    name: "verified_by",
    definition: "ALTER TABLE sales ADD COLUMN verified_by INT NULL",
  },
  {
    name: "verified_at",
    definition: "ALTER TABLE sales ADD COLUMN verified_at DATETIME NULL",
  },
];

const paymentVerificationColumns = [
  {
    name: "sale_id",
    definition: "ALTER TABLE payment_verifications ADD COLUMN sale_id INT NULL",
  },
  {
    name: "shop_id",
    definition: "ALTER TABLE payment_verifications ADD COLUMN shop_id INT NULL",
  },
  {
    name: "payment_method",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN payment_method VARCHAR(50) NULL",
  },
  {
    name: "amount",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0",
  },
  {
    name: "reference_no",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN reference_no VARCHAR(100) NULL",
  },
  {
    name: "status",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'",
  },
  {
    name: "verified_by",
    definition: "ALTER TABLE payment_verifications ADD COLUMN verified_by INT NULL",
  },
  {
    name: "verified_at",
    definition: "ALTER TABLE payment_verifications ADD COLUMN verified_at DATETIME NULL",
  },
  {
    name: "failed_at",
    definition: "ALTER TABLE payment_verifications ADD COLUMN failed_at DATETIME NULL",
  },
  {
    name: "created_at",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  },
  {
    name: "updated_at",
    definition:
      "ALTER TABLE payment_verifications ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  },
];

const ensureSalesPaymentColumns = async () => {
  if (ensuredSalesColumns) return;

  const connection = db.promise();
  const [columns] = await connection.query("SHOW COLUMNS FROM sales");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const column of paymentColumns) {
    if (!existingColumns.has(column.name)) {
      await connection.query(column.definition);
    }
  }

  ensuredSalesColumns = true;
};

const ensurePaymentVerificationTable = async () => {
  if (ensuredPaymentVerifications) return;

  const connection = db.promise();

  await connection.query(`
    CREATE TABLE IF NOT EXISTS payment_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      shop_id INT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      reference_no VARCHAR(100) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      verified_by INT NULL,
      verified_at DATETIME NULL,
      failed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_payment_verification_sale (sale_id),
      INDEX idx_payment_verifications_shop_status (shop_id, status)
    )
  `);

  const [columns] = await connection.query("SHOW COLUMNS FROM payment_verifications");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const column of paymentVerificationColumns) {
    if (!existingColumns.has(column.name)) {
      await connection.query(column.definition);
    }
  }

  ensuredPaymentVerifications = true;
};

module.exports = { ensurePaymentVerificationTable, ensureSalesPaymentColumns };
