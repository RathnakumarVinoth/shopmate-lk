# ShopMate LK

ShopMate LK is a web-based POS and inventory management system designed for small businesses in Sri Lanka. The system helps shop owners manage products, create bills, update stock automatically, maintain customer credit records, and view daily sales and profit reports.

## Project Title

**ShopMate LK: A Web-Based POS and Inventory Management System for Small Businesses in Sri Lanka**

## Features

- User registration and login
- Shop owner dashboard
- Product management
- Stock quantity tracking
- Low-stock alerts
- POS billing system
- Automatic stock reduction after sales
- Sales history
- Credit customer management
- Credit payment tracking
- Daily sales and profit summary
- Clean React frontend interface

## Tech Stack

### Frontend

- React.js
- Vite
- Axios
- React Router DOM
- CSS

### Backend

- Node.js
- Express.js
- MySQL
- JWT Authentication
- bcryptjs
- dotenv
- cors

### Database

- MySQL

## Project Structure

```text
shopmate-lk/
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── server.js
│   └── package.json
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── .gitignore
└── README.md
```

## Main Modules

### 1. Authentication

Users can register and login securely. Passwords are encrypted using bcryptjs, and JWT tokens are used for protected routes.

### 2. Product Management

Shop owners can add, view, update, and delete products. Each product includes buying price, selling price, stock quantity, and low-stock limit.

### 3. POS Billing

The POS module allows users to select products, add them to a cart, create a bill, calculate total amount, calculate profit, and reduce stock automatically.

### 4. Credit Book

The credit book module helps shop owners manage customers who buy products on credit. It supports customer records, credit records, payments, balances, and credit status.

### 5. Dashboard

The dashboard shows today’s sales, today’s profit, bill count, total products, low-stock count, credit balance, total customers, and recent sales.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/RathnakumarVinoth/shopmate-lk.git
cd shopmate-lk
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` folder.

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=shopmate_lk
JWT_SECRET=shopmate_secret_key
```

Run the backend server:

```bash
node server.js
```

The backend will run on:

```text
http://localhost:5000
```

### 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file inside the `frontend` folder.

```env
VITE_API_URL=http://localhost:5000/api
```

Run the frontend:

```bash
npm run dev
```

The frontend will run on:

```text
http://localhost:5173
```

## Database Setup

Create a MySQL database:

```sql
CREATE DATABASE shopmate_lk;
USE shopmate_lk;
```

The system uses the following tables:

- users
- shops
- products
- sales
- sale_items
- customers
- credit_records

## API Endpoints

### Authentication APIs

```text
POST /api/auth/register
POST /api/auth/login
```

### Product APIs

```text
POST   /api/products
GET    /api/products
GET    /api/products/low-stock
PUT    /api/products/:id
DELETE /api/products/:id
```

### Sales APIs

```text
POST /api/sales
GET  /api/sales
GET  /api/sales/:id
```

### Credit APIs

```text
POST /api/credits/customers
GET  /api/credits/customers
POST /api/credits
GET  /api/credits
PUT  /api/credits/:id/pay
GET  /api/credits/summary
```

### Dashboard API

```text
GET /api/dashboard
```

## Screenshots

Add project screenshots here:

```text
Login Page
Dashboard
Products Page
POS Billing Page
Credit Book Page
MySQL Tables
Backend Running
Frontend Running
```

## Future Improvements

- Barcode scanner support
- Invoice PDF download
- WhatsApp bill sharing
- Supplier management
- Expense tracking
- Monthly reports
- Staff accounts
- Sinhala and Tamil language support
- Excel export
- Online payment integration
- Cloud deployment

## Author

Developed by **Pubudu Terance**

## License

This project is developed for educational and portfolio purposes.
