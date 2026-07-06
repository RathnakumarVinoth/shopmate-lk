const path = require("path");
const dotenv = require("dotenv");

process.env.NODE_ENV = "test";

dotenv.config({
  path: path.resolve(__dirname, "../../.env.test"),
  override: false,
});

if (!process.env.DB_NAME || !process.env.DB_NAME.endsWith("_test")) {
  throw new Error(
    "Refusing to run tests without a dedicated test database. Set DB_NAME to a name ending in _test."
  );
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "shopmate-lk-local-test-secret";
}

if (!process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL = "http://localhost:5173";
}

module.exports = process.env;
