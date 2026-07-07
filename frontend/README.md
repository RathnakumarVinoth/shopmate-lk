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

ShopMate currently supports 58mm and 80mm receipts through browser print
preview. The operating system printer driver is responsible for sending the
printable page to the thermal printer.

For cash drawers, connect the drawer to the thermal printer drawer port
(typically RJ11/RJ12), then configure the printer driver or printer utility to
open the drawer after receipt print. Browser print alone may not open the
drawer unless the printer driver performs the drawer kick.

`src/utils/escPos.js` provides ESC/POS initialize, paper-cut, receipt-byte, and
cash-drawer pulse command builders for a future local bridge or supported
WebUSB/Web Serial transport. ShopMate can prepare these bytes, but without a
trusted transport it does not send raw ESC/POS commands to hardware.
