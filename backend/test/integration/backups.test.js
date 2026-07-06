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

const request = async (method, path, { body, token } = {}) => {
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
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
    headers: response.headers,
  };
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
  assert.ok(response.body.shop_token);
  return response.body;
};

const roleLogin = async (shopToken, user) => {
  const response = await request("POST", "/api/auth/role-login", {
    body: {
      username: user.username,
      password: user.password,
      shop_token: shopToken,
    },
  });
  expectStatus(response, 200);
  assert.ok(response.body.token);
  return response.body;
};

const loginOwnerA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.owner);
};

const loginOwnerB = async () => {
  const shopSession = await shopLogin(seed.shopB);
  return roleLogin(shopSession.shop_token, seed.shopB.owner);
};

const loginStaffA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.staff);
};

const loginAdmin = async () => {
  const response = await request("POST", "/api/auth/login", {
    body: {
      email: seed.admin.email,
      password: seed.admin.password,
    },
  });
  expectStatus(response, 200);
  assert.ok(response.body.token);
  return response.body;
};

const createBackup = async (token) => {
  const response = await request("POST", "/api/backups/manual", { token });
  expectStatus(response, 201);
  assert.ok(response.body.backup.id);
  return response.body.backup;
};

const downloadBackup = async (token, backupId) => {
  const response = await request("GET", `/api/backups/${backupId}/download`, {
    token,
  });
  expectStatus(response, 200);
  assert.ok(response.body);
  return response;
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

test("owner creates manual backup", async () => {
  const owner = await loginOwnerA();

  const backup = await createBackup(owner.token);

  assert.equal(backup.shop_id, seed.shopA.id);
  assert.equal(backup.status, "completed");
  assert.equal(backup.storage_type, "database");
  assert.ok(backup.record_count > 0);

  const status = await request("GET", "/api/backups/status", {
    token: owner.token,
  });
  expectStatus(status, 200);
  assert.equal(status.body.status.latest_backup.id, backup.id);
});

test("backup includes only owner shop data", async () => {
  const owner = await loginOwnerA();
  const backup = await createBackup(owner.token);
  const download = await downloadBackup(owner.token, backup.id);
  const payload = download.body;

  assert.equal(payload.metadata.shop_id, seed.shopA.id);
  assert.ok(payload.tables.products.some((product) => product.id === seed.shopA.productId));
  assert.ok(!payload.tables.products.some((product) => product.id === seed.shopB.productId));
  assert.ok(payload.tables.products.every((product) => product.shop_id === seed.shopA.id));
  assert.ok(payload.tables.suppliers.every((supplier) => supplier.shop_id === seed.shopA.id));
});

test("backup excludes password hashes", async () => {
  const owner = await loginOwnerA();
  const backup = await createBackup(owner.token);
  const download = await downloadBackup(owner.token, backup.id);
  const backupText = JSON.stringify(download.body).toLowerCase();

  assert.equal(backupText.includes("password"), false);
  assert.equal(backupText.includes("login_password_hash"), false);
  assert.equal(backupText.includes("reset_token_hash"), false);
});

test("owner can download own backup", async () => {
  const owner = await loginOwnerA();
  const backup = await createBackup(owner.token);
  const download = await downloadBackup(owner.token, backup.id);

  assert.equal(download.body.format, "shopmate_lk_backup");
  assert.match(download.headers.get("content-disposition") || "", /attachment/);
});

test("shop A cannot download shop B backup", async () => {
  const ownerA = await loginOwnerA();
  const ownerB = await loginOwnerB();
  const backupB = await createBackup(ownerB.token);

  const response = await request("GET", `/api/backups/${backupB.id}/download`, {
    token: ownerA.token,
  });

  expectStatus(response, 404);
});

test("restore rejects invalid file", async () => {
  const owner = await loginOwnerA();

  const response = await request("POST", "/api/backups/restore", {
    token: owner.token,
    body: {
      file_name: "invalid.json",
      backup: { format: "not_shopmate" },
    },
  });
  expectStatus(response, 400);

  const [rows] = await db.promise().query(
    "SELECT status, error_message FROM restore_jobs WHERE shop_id = ? ORDER BY id DESC LIMIT 1",
    [seed.shopA.id]
  );
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error_message, /Invalid ShopMate backup format/);
});

test("staff cannot restore", async () => {
  const staff = await loginStaffA();

  const response = await request("POST", "/api/backups/restore", {
    token: staff.token,
    body: {
      backup: { format: "shopmate_lk_backup" },
    },
  });

  expectStatus(response, 403);
});

test("admin can view backup status", async () => {
  const owner = await loginOwnerA();
  await createBackup(owner.token);
  const admin = await loginAdmin();

  const response = await request("GET", "/api/admin/backups/status", {
    token: admin.token,
  });
  expectStatus(response, 200);

  assert.ok(Array.isArray(response.body.shops));
  const shopAStatus = response.body.shops.find((shop) => shop.shop_id === seed.shopA.id);
  assert.ok(shopAStatus);
  assert.equal(shopAStatus.latest_backup.status, "completed");
});
