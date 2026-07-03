# ShopMate LK Frontend

React + Vite frontend for ShopMate LK.

## Environment

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
```

For production, set `VITE_API_URL` to the deployed backend API URL before building.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` directory to your static hosting provider.
