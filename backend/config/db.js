const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});
const promisePool = pool.promise();

const createPromiseContext = () => {
  let transactionConnection = null;

  const getTransactionConnection = async () => {
    if (!transactionConnection) {
      transactionConnection = await promisePool.getConnection();
    }

    return transactionConnection;
  };

  return {
    query: (...args) =>
      transactionConnection
        ? transactionConnection.query(...args)
        : promisePool.query(...args),
    execute: (...args) =>
      transactionConnection
        ? transactionConnection.execute(...args)
        : promisePool.execute(...args),
    beginTransaction: async () => {
      const connection = await getTransactionConnection();
      return connection.beginTransaction();
    },
    commit: async () => {
      if (!transactionConnection) return;

      try {
        await transactionConnection.commit();
      } finally {
        transactionConnection.release();
        transactionConnection = null;
      }
    },
    rollback: async () => {
      if (!transactionConnection) return;

      try {
        await transactionConnection.rollback();
      } finally {
        transactionConnection.release();
        transactionConnection = null;
      }
    },
    getConnection: (...args) => promisePool.getConnection(...args),
  };
};

const db = {
  query: (...args) => pool.query(...args),
  execute: (...args) => pool.execute(...args),
  getConnection: (...args) => pool.getConnection(...args),
  promise: createPromiseContext,
  end: (...args) => pool.end(...args),
};

pool.getConnection((err, connection) => {
  if (err) {
    console.error(
      `MySQL connection failed for ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || ""}: ${err.message}`
    );
    return;
  }

  connection.release();
  console.log("MySQL Database Connected");
});

module.exports = db;
