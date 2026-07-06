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

## Thermal Printers and Cash Drawers

ShopMate uses browser print preview for 58mm and 80mm receipts. The operating
system printer driver is responsible for sending the printable page to the
thermal printer.

Web pages cannot reliably send raw ESC/POS bytes to arbitrary USB, network, or
Bluetooth printers. For a cash drawer connected through the printer, configure
the printer driver to open the drawer after a receipt print, or use a trusted
local print bridge.

`src/utils/escPos.js` provides ESC/POS initialize, paper-cut, receipt-byte, and
cash-drawer pulse command builders for a future local bridge or supported
WebUSB/Web Serial transport. ShopMate does not send these bytes automatically.
