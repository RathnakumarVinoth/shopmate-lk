const db = require("../config/db");

let ensured = false;

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

const ensureSalesPaymentColumns = async () => {
  if (ensured) return;

  const connection = db.promise();
  const [columns] = await connection.query("SHOW COLUMNS FROM sales");
  const existingColumns = new Set(columns.map((column) => column.Field));

  for (const column of paymentColumns) {
    if (!existingColumns.has(column.name)) {
      await connection.query(column.definition);
    }
  }

  ensured = true;
};

module.exports = { ensureSalesPaymentColumns };
