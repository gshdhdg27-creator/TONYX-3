---
name: Vercel API routing
description: Vercel hosts only the static mini-app frontend. All /api/* calls return 404 in production unless VITE_API_BASE_URL is configured.
---

The mini-app is deployed on Vercel as a static site (outputDirectory: artifacts/mini-app/dist/public). The API server is NOT on Vercel.

**Why:** Vercel static hosting has no backend. Frontend calls to /api/mini/... return 404 in Telegram (which loads Vercel URL).

**How to apply:** 
1. Deploy API server separately (Replit Deployments recommended)
2. In Vercel Dashboard → Environment Variables add:
   - VITE_API_BASE_URL = https://<deployed-api-url>/api
   - NEON_DATABASE_URL = <neon connection string>
3. Redeploy Vercel

The fix is in main.tsx: `const apiBase = import.meta.env.VITE_API_BASE_URL` — when set, all /api/* fetch calls are prefixed with this URL.

**Diagnostic prompt to give agent:**
"В приложении TONYX появилась ошибка HTTP 404 на API роутах. Диагностируй: 1) git log origin/main совпадает с HEAD? 2) curl http://localhost:8080/api/mini/admin/stats -H 'X-Admin-Id: 7257793582' 3) psql NEON_DATABASE_URL — все колонки из schema/users.ts есть? 4) VITE_API_BASE_URL установлен в Vercel?"
