# ShopMate LK

ShopMate LK is a web-based POS and inventory management system for small businesses in Sri Lanka. It helps shop owners manage products, billing, stock, customer credit, suppliers, reports, subscriptions, and super admin shop control.

## Features

- User registration and JWT login
- Shop owner and staff POS workflows
- Product and stock management
- Low-stock purchase suggestions
- POS billing with payment verification
- Sales, returns, customer credit, supplier, expense, and report modules
- Super admin shop and subscription control
- React frontend and Express/MySQL backend

## Tech Stack

Frontend:

- React
- Vite
- Axios
- React Router DOM

Backend:

- Node.js
- Express
- MySQL
- JWT authentication
- bcryptjs
- dotenv
- cors
- helmet
- express-rate-limit

## Project Structure

```text
shopmate-lk/
  backend/
    config/
    controllers/
    middleware/
    routes/
    scripts/
    server.js
    package.json
  frontend/
    src/
    public/
    package.json
  DEPLOYMENT.md
  README.md
```

## Local Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Deployment

ShopMate LK includes production-ready environment examples, CORS configuration, MySQL pool configuration, security middleware, and a backend health check.

See [DEPLOYMENT.md](DEPLOYMENT.md) for cloud setup, environment variables, database setup, build commands, health check details, and common fixes.

## Backup Security

- Never commit SQL backups containing real shop, customer, sales, or staff data.
- Keep production backups outside GitHub and outside the application repository.
- Encrypt database backups before sharing or storing them in cloud drives.
- Rotate any database password, JWT secret, or API credential that was ever exposed in a backup or chat.
- Use `.env.example` for placeholder configuration only; keep real `.env` files private.
