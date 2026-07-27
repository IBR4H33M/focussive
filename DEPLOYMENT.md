# Deployment Guide — Render Backend

## Overview
The Focussive backend is deployed on [Render.com](https://render.com) at `https://focussive.onrender.com`. This document covers the deployment setup, issues encountered, and fixes applied.

## Architecture
- **Backend:** Node.js + Express (packages/backend)
- **Shared Library:** TypeScript utilities used by backend, mobile, and extension (packages/shared)
- **Database:** Supabase PostgreSQL (via `SUPABASE_SECRET_KEY`)
- **Module System:** CommonJS (both backend and shared)

## Deployment Configuration

### Render Service Settings
**Build Command:**
```bash
pnpm install && pnpm -F @focussive/shared build && pnpm -F @focussive/backend build
```

**Start Command:**
```bash
pnpm -F @focussive/backend start
```

**Environment Variables** (set in Render dashboard):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SECRET_KEY` — Service role key (from Supabase → Settings → API)
- `JWT_SECRET` — Secret for signing JWTs
- `JWT_REFRESH_SECRET` — Secret for refresh tokens
- `CORS_ORIGINS` — Leave empty (mobile/extension are auto-allowed)
- `NODE_ENV` — `production`

### Key Configuration Files

**`render.yaml`** (root)
```yaml
buildCommand: pnpm install && pnpm -F @focussive/shared build && pnpm -F @focussive/backend build
startCommand: pnpm -F @focussive/backend start
```
*(Note: Render ignores this file if the service was created via dashboard UI. Settings must be entered manually in Render's web interface.)*

**`packages/shared/tsconfig.json`**
```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**`packages/backend/tsconfig.json`**
```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": false
  }
}
```

**`packages/backend/package.json`** — NO `"type": "module"` (CommonJS, not ES modules)

## Issues Encountered & Fixes

### 1. Missing Exports in `@focussive/shared`
**Problem:** Backend, mobile, and extension were importing functions (`isValidEmail`, `formatCountdown`, `getRemainingSeconds`, etc.) that never existed in the shared package source. This worked locally because stale cached `dist/` builds masked the gap.

**Root Cause:** Pre-existing authoring gaps in the shared package — incomplete implementation.

**Fix:** Implemented all missing functions and types in `packages/shared/src/utils.ts` and `packages/shared/src/types.ts`:
- `isValidEmail()` — email format validation
- `isValidPassword()` — password strength check
- `generateQRCode()` — random 32-char alphanumeric
- `isSessionOverlap()` — session collision detection
- `formatCountdown()` — convert seconds to "MM:SS" or "H:MM:SS"
- `getRemainingSeconds()` — seconds until active session ends
- `formatTime()` — format "HH:mm" as "2:30 PM"
- `formatDate()` — format ISO timestamp as "Jul 27, 2026"
- `isBlockedWebsite()` — check if URL matches blocked domains
- `DayOfWeek` type — union of weekday strings
- `ViolationAction.MARK_NECESSARY` — enum value for "mark as necessary" action

**Lesson:** Fresh builds (like Render's) expose what local caching hides. Test with `rm -rf dist && tsc` to simulate.

---

### 2. TypeScript Emitting No Output
**Problem:** Build succeeded but `dist/server.js` didn't exist, causing `node dist/server.js` to fail.

**Root Cause:** Backend's `tsconfig.json` had `"noEmit": true`, which tells TypeScript to type-check only and skip JavaScript emission.

**Fix:** Removed `"noEmit": true` from `packages/backend/tsconfig.json`.

**Lesson:** `noEmit: true` is for type-checking-only passes (like CI lint jobs), not production builds.

---

### 3. ES Modules Incompatibility with Node.js
**Problem:** Runtime error `ERR_UNSUPPORTED_DIR_IMPORT: Directory import ... is not supported resolving ES modules`. Then `ERR_MODULE_NOT_FOUND` when shared was ES modules but backend was CommonJS.

**Root Cause:** Backend was configured for ES modules (`"type": "module"` in package.json, `"module": "ESNext"` in tsconfig). ES modules require:
1. Explicit `.js` extensions on all relative imports
2. No directory imports (must be `./routes/index.js`, not `./routes`)
3. Support for `import.meta.url` syntax

Node.js CommonJS has none of these requirements and doesn't support `import.meta`.

**Fix:** 
- Changed both packages to CommonJS:
  - Removed `"type": "module"` from `package.json` files
  - Changed `"module": "CommonJS"` and `"moduleResolution": "node"` in `tsconfig.json` files
  - Removed all `.js` extensions from relative imports
  - Replaced `import.meta.url` with CommonJS's built-in `__dirname` global

**Files Changed:**
- `packages/backend/tsconfig.json` — module/moduleResolution
- `packages/backend/package.json` — removed `"type": "module"`
- `packages/backend/src/server.ts` — removed `import.meta.url` usage
- `packages/backend/src/test-db.ts` — removed `import.meta.url` usage
- `packages/backend/src/test-db-connection.ts` — removed `import.meta.url` usage
- All `packages/backend/src/**/*.ts` — removed `.js` extensions from imports
- `packages/shared/tsconfig.json` — module/moduleResolution
- `packages/shared/package.json` — removed `"type": "module"`

**Lesson:** Node.js backends should use CommonJS unless you have a specific reason for ES modules (e.g., top-level await, native ESM-only packages). CommonJS is simpler, more compatible, and the default.

---

### 4. CORS Wildcard Bug
**Problem:** Chrome extension sends requests with no `Origin` header, but backend's CORS config treated `chrome-extension://*` as a literal string (not a wildcard pattern).

**Root Cause:** The `cors` npm package does exact string matching, not wildcard glob matching.

**Fix:** Implemented custom CORS logic in `packages/backend/src/server.ts`:
```javascript
cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // No Origin = OK (mobile, curl, etc.)
    if (origin.startsWith("chrome-extension://")) return callback(null, true); // Any extension ID
    if (origins.length === 0 || origins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
})
```

**Lesson:** Don't rely on CORS package wildcards for dynamic patterns. Implement custom logic when needed.

---

## Updating App Clients

### Mobile
The `apiUrl` in `packages/mobile/app.json` is already set to `https://focussive.onrender.com`. Rebuild to apply:
```bash
cd packages/mobile
npx expo run:android --device
```

### Browser Extension
The `API_URL` in `packages/extension/src/utils/api.ts` is already set to `https://focussive.onrender.com`. Reload from `chrome://extensions`.

---

## Database Schema

The backend requires the schema defined in `packages/backend/src/db/schema.sql`. Ensure this has been run in your Supabase project. Key tables:
- `users` — accounts
- `sessions` — focus sessions
- `violations` — app/website access violations
- `session_history` — completed session records (must include `app_violations_count` and `web_violations_count` columns added via migration)

---

## Monitoring & Debugging

**Render Logs:** View real-time logs in Render's dashboard → your service → Logs.

**Health Check:** 
```bash
curl https://focussive.onrender.com/sessions
```
(Will fail with 401 Unauthorized if not authenticated — that's expected. If it times out or 502s, the backend is down.)

**Cold Starts:** Render's free tier spins down after 15 minutes of inactivity. First request after idle takes ~30 seconds. Use Fly.io if this is unacceptable.

---

## Future Deployments

When pushing changes:
1. All fixes to `packages/shared/**/*.ts` require a rebuild of both shared and backend.
2. Changes to `packages/backend/src/**/*.ts` only require rebuilding backend (shared is unchanged).
3. Render will auto-redeploy if GitHub is connected; otherwise trigger manually.
4. Test locally with `rm -rf packages/shared/dist packages/backend/dist && pnpm -F @focussive/shared build && pnpm -F @focussive/backend build`.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module '@focussive/shared'` | Shared wasn't built | `pnpm -F @focussive/shared build` before building backend |
| `ERR_MODULE_NOT_FOUND: ... imported from ... (ES modules)` | Mixed module systems | Ensure both packages use CommonJS (`"module": "CommonJS"` in tsconfig) |
| `node dist/server.js` not found | TypeScript didn't emit | Remove `"noEmit": true` from tsconfig |
| `Cannot find module ... .js` (CommonJS) | `.js` extensions in imports | Remove `.js` from relative imports in CommonJS |
| `import.meta.url is not defined` | ES module syntax in CommonJS | Use `__dirname` global or `process.cwd()` instead |
| `CORS error from extension` | Wildcard pattern not matching | Implement custom CORS logic, not string matching |

---

## References
- Render Docs: https://render.com/docs
- Supabase API: https://supabase.com/docs/reference/javascript
- Node.js CommonJS vs ESM: https://nodejs.org/api/esm.html

