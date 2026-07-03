# ShopMate LK Deployment Guide

This guide prepares ShopMate LK for local development and cloud deployment.

## Local Setup

Install backend dependencies:

```bash
cd backend
npm install
npm run dev
```

Install frontend dependencies:

```bash
cd frontend
npm install
npm run dev
```

Default local URLs:

- Backend API: `http://localhost:5000/api`
- Frontend: `http://localhost:5173`
- Health check: `http://localhost:5000/api/health`

## Backend Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=shopmate_lk
JWT_SECRET=replace_with_strong_secret
FRONTEND_URL=http://localhost:5173
```

Production notes:

- Set `NODE_ENV=production`.
- Use a strong random `JWT_SECRET`.
- Set `FRONTEND_URL` to the deployed frontend origin, for example `https://app.example.com`.
- Never commit `backend/.env`.

## Frontend Environment Variables

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

For production, set `VITE_API_URL` to the deployed backend API URL, for example:

```env
VITE_API_URL=https://api.example.com/api
```

Vite injects environment variables at build time, so rebuild the frontend after changing `VITE_API_URL`.

## MySQL Database Setup

1. Create a MySQL database:

```sql
CREATE DATABASE shopmate_lk;
```

2. Configure `backend/.env` with the database host, port, username, password, and database name.

3. Import or create the ShopMate LK tables used by the app.

4. Create the super admin account:

```bash
cd backend
node scripts/createAdmin.js
```

Default seed credentials:

- Email: `admin@shopmate.lk`
- Password: `admin123`

Change this password after first login in a real deployment.

## Backend Deployment Steps

1. Push the backend code to your hosting provider.
2. Configure the backend environment variables.
3. Install dependencies:

```bash
npm install
```

4. Start the server:

```bash
npm start
```

5. Confirm the health check:

```bash
curl https://your-backend-domain.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "message": "ShopMate LK API running",
  "environment": "production"
}
```

## Frontend Deployment Steps

1. Set `VITE_API_URL` to the deployed backend API URL.
2. Install dependencies:

```bash
npm install
```

3. Build the frontend:

```bash
npm run build
```

4. Deploy the generated `dist/` folder to static hosting.
5. For local production preview:

```bash
npm run preview
```

## Build Commands

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run build
npm run preview
```

## Health Check Endpoint

Endpoint:

```text
GET /api/health
```

Example local URL:

```text
http://localhost:5000/api/health
```

## Common Errors And Fixes

`Invalid token` or forced logout:

- Confirm `JWT_SECRET` is set and unchanged between server restarts.
- Clear browser local storage and log in again after changing `JWT_SECRET`.

Database connection failed:

- Confirm `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- Confirm the MySQL server allows connections from the deployed backend.
- Confirm firewall or cloud database allowlist settings.

CORS error in browser:

- In production, set backend `FRONTEND_URL` to the exact frontend origin.
- Set frontend `VITE_API_URL` to the backend API URL ending with `/api`.

Frontend calls local API in production:

- Update `frontend/.env` or hosting environment variables.
- Rebuild with `npm run build`.

Subscription login blocked:

- Check the shop in the Super Admin panel.
- `is_enabled` must be enabled.
- `subscription_status` must not be `expired` or `suspended`.
- `subscription_expiry_date`, if set, must be in the future.
