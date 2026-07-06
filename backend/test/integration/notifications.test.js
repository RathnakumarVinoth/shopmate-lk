require("../helpers/loadTestEnv");

const assert = require("node:assert/strict");
const path = require("node:path");
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

const request = async (method, requestPath, { body, token } = {}) => {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

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

  return { status: response.status, body: json, text };
};

const expectStatus = (response, status) => {
  assert.equal(
    response.status,
    status,
    `Expected ${status}, got ${response.status}: ${response.text}`
  );
};

const shopLogin = async (shop) => {
  const response = await request("POST", "/api/shop-auth/login", {
    body: {
      login_email: shop.email,
      password: shop.password,
    },
  });
  expectStatus(response, 200);
  return response.body.shop_token;
};

const loginShopUser = async (shop, user) => {
  const shopToken = await shopLogin(shop);
  const response = await request("POST", "/api/auth/role-login", {
    body: {
      username: user.username,
      password: user.password,
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

const dispatchForShop = async (shopId, suffix) => {
  const { dispatchNotification } = require("../../utils/notificationService");
  return dispatchNotification({
    templateKey: "backup_success",
    audienceType: "shop_owner",
    shopId,
    variables: { shop_name: `Shop ${shopId}` },
    channels: ["in_app"],
    dedupeKey: `notification-test:${suffix}`,
  });
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

test("owner can view own notifications", async () => {
  await dispatchForShop(seed.shopA.id, "shop-a-own");
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const response = await request("GET", "/api/notifications", {
    token: owner.token,
  });

  expectStatus(response, 200);
  assert.ok(
    response.body.notifications.some(
      (notification) =>
        notification.template_key === "backup_success" &&
        notification.persisted === true
    )
  );
});

test("Shop A cannot view Shop B notifications", async () => {
  await dispatchForShop(seed.shopB.id, "shop-b-private");
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const response = await request("GET", "/api/notifications", {
    token: owner.token,
  });

  expectStatus(response, 200);
  assert.equal(
    response.body.notifications.some(
      (notification) => notification.message.includes("Shop 202")
    ),
    false
  );
});

test("mark notification as read works", async () => {
  await dispatchForShop(seed.shopA.id, "mark-read");
  const [[notification]] = await db.promise().query(
    `SELECT id
     FROM notifications
     WHERE shop_id = ? AND template_key = 'backup_success'
     ORDER BY id DESC
     LIMIT 1`,
    [seed.shopA.id]
  );
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const response = await request(
    "PATCH",
    `/api/notifications/${notification.id}/read`,
    { token: owner.token }
  );

  expectStatus(response, 200);
  const [[updated]] = await db.promise().query(
    "SELECT status, read_at FROM notifications WHERE id = ?",
    [notification.id]
  );
  assert.equal(updated.status, "read");
  assert.ok(updated.read_at);
});

test("notification preferences update works", async () => {
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const update = await request("PUT", "/api/notifications/preferences", {
    token: owner.token,
    body: {
      preferences: [
        {
          template_key: "low_stock",
          channel: "email",
          enabled: false,
        },
      ],
    },
  });

  expectStatus(update, 200);
  const preference = update.body.preferences
    .find((item) => item.template_key === "low_stock")
    .channels.find((channel) => channel.channel === "email");
  assert.equal(preference.enabled, false);
});

test("backup failure creates a notification delivery log", async () => {
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const previousBackupDir = process.env.BACKUP_DIR;
  process.env.BACKUP_DIR = path.resolve(__dirname, "../../..");

  try {
    const response = await request("POST", "/api/backups/manual", {
      token: owner.token,
    });
    expectStatus(response, 500);
  } finally {
    if (previousBackupDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = previousBackupDir;
  }

  const [[log]] = await db.promise().query(
    `SELECT status
     FROM notification_delivery_logs
     WHERE shop_id = ? AND template_key = 'backup_failure'
     ORDER BY id DESC
     LIMIT 1`,
    [seed.shopA.id]
  );
  assert.ok(log);
});

test("system alert creates an admin notification", async () => {
  const { createAdminAlert } = require("../../utils/monitoringService");
  await createAdminAlert({
    alertType: "test_system_error",
    severity: "high",
    title: "Test system alert",
    message: "A test failure needs review",
    dedupeKey: "notification-system-alert-test",
  });

  const admin = await loginAdmin();
  const response = await request("GET", "/api/admin/notifications", {
    token: admin.token,
  });

  expectStatus(response, 200);
  assert.ok(
    response.body.notifications.some(
      (notification) => notification.title === "System alert"
    )
  );
});

test("disabled channel creates skipped delivery log", async () => {
  const admin = await loginAdmin();
  const response = await request("POST", "/api/admin/notifications/test", {
    token: admin.token,
    body: { channels: ["sms"] },
  });

  expectStatus(response, 201);
  const [[log]] = await db.promise().query(
    `SELECT status
     FROM notification_delivery_logs
     WHERE template_key = 'test_notification' AND channel = 'sms'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.equal(log.status, "skipped");
});

test("non-admin cannot view global notification logs", async () => {
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const response = await request("GET", "/api/admin/notification-logs", {
    token: owner.token,
  });

  expectStatus(response, 403);
});

test("admin can send a test notification", async () => {
  const admin = await loginAdmin();
  const response = await request("POST", "/api/admin/notifications/test", {
    token: admin.token,
    body: { channels: ["in_app"] },
  });

  expectStatus(response, 201);
  assert.equal(response.body.deliveries[0].status, "sent");

  const [[notification]] = await db.promise().query(
    `SELECT id
     FROM notifications
     WHERE audience_type = 'admin' AND template_key = 'test_notification'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(notification);
});

test("sensitive fields are not stored in delivery payload", async () => {
  const admin = await loginAdmin();
  const response = await request("POST", "/api/admin/notifications/test", {
    token: admin.token,
    body: {
      channels: ["sms"],
      variables: {
        password: "DoNotStore#123",
        token: "secret-token-value",
      },
    },
  });

  expectStatus(response, 201);
  const [[log]] = await db.promise().query(
    `SELECT payload
     FROM notification_delivery_logs
     WHERE template_key = 'test_notification'
     ORDER BY id DESC
     LIMIT 1`
  );
  assert.ok(log.payload.includes("[REDACTED]"));
  assert.equal(log.payload.includes("DoNotStore#123"), false);
  assert.equal(log.payload.includes("secret-token-value"), false);
});
