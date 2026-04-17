# Mango Traceability App

Local dev: runs Vite (frontend) and Express backend concurrently.

Install & run:

```bash
cd ~/Desktop/mango-traceability-app
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api/...

Notes:
- Images uploaded via `/api/upload` are stored in `server/uploads`.
- App falls back to `localStorage` when backend unavailable for offline use.
- CSV import available via `/api/import` endpoint.
