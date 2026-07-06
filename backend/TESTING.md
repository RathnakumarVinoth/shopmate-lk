# Backend Testing

The backend integration tests use Node's built-in `node:test` runner against a real MySQL test database. They intentionally do not use the development or production database.

## Setup

1. Copy `backend/.env.test.example` to `backend/.env.test`.
2. Set local MySQL credentials in `backend/.env.test`.
3. Keep `DB_NAME` ending in `_test`, for example `shopmate_lk_test`.
4. Use a MySQL user that can create the test database and create/drop tables inside it.

The helper refuses to run unless `DB_NAME` ends with `_test`.

## Commands

```bash
cd backend
npm test
npm run test:watch
```

To run the API manually against the test database:

```bash
cd backend
npm run start:test
```

## Current Coverage

- Shop login success and wrong-password failure
- Role login with valid, missing, and invalid shop tokens
- Tampered `shop_id` cannot switch the authenticated shop
- Owner-only route access blocked for staff
- Product create/read/update/delete scoped by `shop_id`
- Cash POS sale stock reduction
- Failed card payment stock restoration and no double-restore
- Dashboard/report revenue excludes failed payments
- Existing tokens blocked after user deactivation
- Existing tokens blocked after shop disable
- Existing staff tokens reflect removed permissions
- Admin login and admin summary route still work

## Notes

Each test resets and seeds the dedicated test database with an admin, two shops, owner/staff users, products, a customer, and a supplier.
