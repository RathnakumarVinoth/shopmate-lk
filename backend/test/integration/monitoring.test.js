require("../helpers/loadTestEnv");

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

const {
  ensureTestDatabase,
  resetAndSeed,
} = require("../helpers/testDatabase");

let app;
let db;
let server;
let baseUrl;
let seed;

const closeServer = () =>
  new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });

const closeDatabase = () =>
  new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.end((error) => (error ? reject(error) : resolve()));
  });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const request = async (method, requestPath, { body, token } = {}) => {
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return {
    status: response.status,
    body: json,
    text,
  };
};

const expectStatus = (response, status) => {
  assert.equal(
    response.status,
    status,
    `Expected ${status}, got ${response.status}: ${response.text}`
  );
};

const waitForRow = async (sql, values = [], timeoutMs = 2500) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [rows] = await db.promise().query(sql, values);
    if (rows.length > 0) return rows[0];
    await delay(25);
  }

  throw new Error(`Timed out waiting for query result: ${sql}`);
};

const shopLogin = async () => {
  const response = await request("POST", "/api/shop-auth/login", {
    body: {
      login_email: seed.shopA.email,
      password: seed.shopA.password,
    },
  });
  expectStatus(response, 200);
  return response.body.shop_token;
};

const loginOwner = async () => {
  const shopToken = await shopLogin();
  const response = await request("POST", "/api/auth/role-login", {
    body: {
      username: seed.shopA.owner.username,
      password: seed.shopA.owner.password,
      shop_token: shopToken,
    },
  });
  expectStatus(response, 200);
  return response.body;
};

const loginAdmin = async () => {
  const response = await request("POST", "/api/auth/login", {
    body: {
      email: seed.admin.email,
      password: seed.admin.password,
    },
  });
  expectStatus(response, 200);
  return response.body;
};

before(async () => {
  await ensureTestDatabase();
  app = require("../../app");
  db = require("../../config/db");

  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  seed = await resetAndSeed(db.promise());
});

after(async () => {
  await closeServer();
  await closeDatabase();
});

test("super admin can access system health", async () => {
  const admin = await loginAdmin();
  const response = await request("GET", "/api/admin/system-health", {
    token: admin.token,
  });

  expectStatus(response, 200);
  assert.equal(response.body.health.api.status, "ok");
});

test("non-admin cannot access system health", async () => {
  const owner = await loginOwner();
  const response = await request("GET", "/api/admin/system-health", {
    token: owner.token,
  });

  expectStatus(response, 403);
  await waitForRow(
    "SELECT id FROM api_request_logs WHERE path = '/api/admin/system-health' AND status_code = 403"
  );
});

test("failed API request creates api_request_log", async () => {
  const response = await request("GET", "/api/route-that-does-not-exist");
  expectStatus(response, 404);

  const row = await waitForRow(
    "SELECT * FROM api_request_logs WHERE path = '/api/route-that-does-not-exist' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(row.status_code, 404);
  assert.equal(row.method, "GET");
});

test("unexpected backend error creates error_log", async () => {
  const response = await request("POST", "/api/test/monitoring-error", {
    body: {
      password: "NeverStoreThis#1",
      token: "NeverStoreThisToken",
    },
  });
  expectStatus(response, 500);
  assert.equal(response.body.stack, undefined);

  const row = await waitForRow(
    "SELECT * FROM error_logs WHERE path = '/api/test/monitoring-error' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(row.error_type, "MonitoringTestError");
  assert.equal(row.status_code, 500);
});

test("sensitive fields are redacted from logs", async () => {
  const rawPassword = "NeverLogPassword#1";
  const rawToken = "NeverLogTokenValue";
  const response = await request("POST", "/api/auth/login", {
    body: {
      email: seed.admin.email,
      password: rawPassword,
      token: rawToken,
    },
  });
  expectStatus(response, 401);

  const row = await waitForRow(
    "SELECT request_data FROM api_request_logs WHERE path = '/api/auth/login' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(row.request_data.includes(rawPassword), false);
  assert.equal(row.request_data.includes(rawToken), false);
  assert.match(row.request_data, /\[REDACTED\]/);
  assert.equal(row.request_data.toLowerCase().includes("authorization"), false);
});

test("admin can list alerts", async () => {
  await db.promise().query(
    `INSERT INTO admin_alerts
     (alert_type, severity, title, message, dedupe_key)
     VALUES ('backup_failure', 'high', 'Backup failed', 'Test backup failure', 'test-backup-failure')`
  );
  const admin = await loginAdmin();
  const response = await request("GET", "/api/admin/system-alerts", {
    token: admin.token,
  });

  expectStatus(response, 200);
  assert.ok(response.body.alerts.some((alert) => alert.title === "Backup failed"));
  assert.equal(response.body.pagination.total, 1);
});

test("admin can mark alert as read", async () => {
  const [result] = await db.promise().query(
    `INSERT INTO admin_alerts
     (alert_type, severity, title, message)
     VALUES ('restore_failure', 'critical', 'Restore failed', 'Test restore failure')`
  );
  const admin = await loginAdmin();
  const response = await request(
    "PATCH",
    `/api/admin/system-alerts/${result.insertId}/read`,
    { token: admin.token }
  );

  expectStatus(response, 200);
  const [rows] = await db.promise().query(
    "SELECT status, read_by, read_at FROM admin_alerts WHERE id = ?",
    [result.insertId]
  );
  assert.equal(rows[0].status, "read");
  assert.equal(rows[0].read_by, 1);
  assert.ok(rows[0].read_at);
});

test("system health includes database status", async () => {
  const admin = await loginAdmin();
  const response = await request("GET", "/api/admin/system-health", {
    token: admin.token,
  });

  expectStatus(response, 200);
  assert.equal(response.body.health.database.status, "ok");
  assert.ok(Number.isInteger(response.body.health.database.latency_ms));
});

test("system health includes backup status when backup module exists", async () => {
  await db.promise().query(
    `INSERT INTO backup_jobs
     (shop_id, requested_by, backup_type, status, storage_type, file_name,
      size_bytes, record_count, started_at, completed_at)
     VALUES (?, ?, 'manual', 'completed', 'database', 'health-test.json',
             1024, 12, NOW(), NOW())`,
    [seed.shopA.id, seed.shopA.owner.id]
  );
  const admin = await loginAdmin();
  const response = await request("GET", "/api/admin/system-health", {
    token: admin.token,
  });

  expectStatus(response, 200);
  assert.equal(response.body.health.last_backup.status, "completed");
  assert.equal(response.body.health.last_backup.file_name, "health-test.json");
  assert.equal(response.body.health.last_backup.record_count, 12);
});
