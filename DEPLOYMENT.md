# Focussive — Build & Deployment Guide

A unified guide covering mobile app builds (local & cloud), backend deployment (Heroku, Fly.io), database configuration, and Chrome extension setup for the **Focussive** monorepo.

---

## 📑 Table of Contents
1. [Quick Reference Cheatsheet](#-quick-reference-cheatsheet)
2. [Mobile App Builds (Android)](#-mobile-app-builds-android)
   - [Local Builds](#local-builds-fast--free)
   - [Cloud Builds with EAS](#cloud-builds-with-eas-no-android-sdk-required)
   - [Local vs Cloud Comparison](#local-vs-cloud-builds-comparison)
   - [Native Modules & Expo Go Warning](#-important-native-modules--expo-go)
3. [Backend Deployment](#-backend-deployment)
   - [Heroku (Active Production)](#1-heroku-active-production)
   - [Fly.io (Docker Containerized)](#2-flyio-containerized-deployment)
   - [Environment Variables](#backend-environment-variables)
4. [Database Configuration & Migrations](#-database-configuration--migrations)
5. [Browser Extension Build](#-browser-extension-build)
6. [Client API Configuration](#-client-api-configuration)
7. [Troubleshooting & Gotchas](#-troubleshooting--gotchas)

---

## ⚡ Quick Reference Cheatsheet

### Workspace Root Commands
```bash
# Install dependencies across all packages
pnpm install

# Typecheck the whole monorepo
pnpm typecheck

# Run backend locally
pnpm dev:backend

# Start Expo Metro bundler
pnpm dev:mobile

# Build shared TypeScript package
pnpm build:shared

# Local Android builds
pnpm build:mobile              # Debug APK (runs on connected device/emulator)
pnpm build:mobile:release      # Release APK (optimized standalone APK)

# Cloud Android builds (EAS)
pnpm build:mobile:dev          # Development client APK
pnpm build:mobile:preview      # Internal preview APK
pnpm build:mobile:prod         # Production AAB for Google Play Store
pnpm build:mobile:prod-apk     # Standalone production APK
```

---

## 📱 Mobile App Builds (Android)

Focussive Mobile is built with **Expo SDK 56**, **React Native 0.85**, and custom local native modules (`@focussive/app-blocker` and `@focussive/installed-apps`).

### Local Builds (Fast & Free)

**Prerequisites:**
- Android Studio & Android SDK (platform tools, build tools, NDK)
- Java JDK 17+
- Connected Android device with USB debugging enabled OR Android Emulator

#### 1. Debug APK (Development & Testing)
From workspace root:
```bash
pnpm build:mobile
# Or: pnpm -F @focussive/mobile android
# Or: cd packages/mobile && pnpm android
```
- **Output:** `packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Starts the Metro bundler and automatically installs the debug APK onto your connected device.

#### 2. Release APK (Optimized, Standalone)
From workspace root:
```bash
pnpm build:mobile:release
# Or: pnpm -F @focussive/mobile android:release
# Or: cd packages/mobile && npx expo run:android --variant release
```
- **Output:** `packages/mobile/android/app/build/outputs/apk/release/app-release.apk`
- Bundles JS bytecode into the APK so it runs fully standalone without any Metro bundler connection.

#### 3. Play Store Bundle (AAB)
```bash
cd packages/mobile/android
./gradlew bundleRelease        # On Windows: .\gradlew bundleRelease
cd ../../..
```
- **Output:** `packages/mobile/android/app/build/outputs/bundle/release/app-release.aab`

#### 4. Installing APK directly via ADB
```bash
# Install Debug APK
adb install -r packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# Install Release APK
adb install -r packages/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

### Cloud Builds with EAS (No Android SDK Required)

Expo Application Services (EAS) builds your APK or AAB in the cloud on Expo servers.

**Prerequisites:**
```bash
# Install EAS CLI globally (one-time)
npm install -g eas-cli

# Login to your Expo account
eas login
```

#### Build Profiles (configured in `packages/mobile/eas.json`):

| Target | Root Script | Direct EAS Command | Output | Purpose |
|--------|-------------|--------------------|--------|---------|
| **Dev Client** | `pnpm build:mobile:dev` | `eas build --platform android --profile development` | APK | Dev client with native code embedded |
| **Preview** | `pnpm build:mobile:preview` | `eas build --platform android --profile preview` | APK | Test APK to share with testers |
| **Production AAB** | `pnpm build:mobile:prod` | `eas build --platform android --profile production` | AAB | Submitting to Google Play Store |
| **Production APK** | `pnpm build:mobile:prod-apk` | `eas build --platform android --profile production-apk` | APK | Standalone production APK without Play Store |

---

### Local vs Cloud Builds Comparison

| Feature | Local Build (`pnpm build:mobile`) | Cloud Build (`eas build`) |
|---------|-----------------------------------|---------------------------|
| **Speed** | ⚡ Fast (1-3 minutes) | ⏳ ~8-12 minutes queue & build |
| **Cost** | 🆓 100% Free & Unlimited | 🆓 30 free builds/month on Expo free tier |
| **Offline** | ✅ Works completely offline | ❌ Requires internet connection |
| **Tooling** | Requires Android SDK & JDK 17 | Zero SDK tools required on your machine |
| **Best For** | Daily coding, rapid iteration | Sharing with testers, CI/CD, release builds |

---

### ⚠️ IMPORTANT: Native Modules & Expo Go

> [!WARNING]
> **Focussive CANNOT be run inside standard Expo Go.**

Focussive contains custom native Android code:
1. **`@focussive/installed-apps`**: Native package manager queries (`QUERY_ALL_PACKAGES`) to fetch installed applications and app icons.
2. **`@focussive/app-blocker`**:
   - Background foreground service (`AppBlockerService`) with `PACKAGE_USAGE_STATS` to detect when blocked apps are launched.
   - Blocking screen overlay activity (`BlockOverlayActivity`) with `SYSTEM_ALERT_WINDOW`.
   - Native locked notifications with live chronometer countdowns (`SessionNotifications`):
     - **Reminder Notification**: Background `#7C8CA6`, locked (`FLAG_NO_CLEAR` & `FLAG_ONGOING_EVENT`), dark red countdown timer (`#8B1E1E`).
     - **Running Session Notification**: Background `#1E2235`, locked (`FLAG_NO_CLEAR` & `FLAG_ONGOING_EVENT`), light red countdown timer (`#F87171`).

**Always build a native development build (`pnpm build:mobile` or `pnpm build:mobile:dev`) when testing.**

---

## 🌐 Backend Deployment

The Focussive backend is built with **Node.js 22**, **Express**, and **TypeScript**, using **CommonJS** modules. It depends on `@focussive/shared` across the monorepo workspace.

### 1. Heroku (Active Production)
The production backend is currently deployed on Heroku:
**Live URL:** `https://focussive-backend-cd9ac796ce02.herokuapp.com`

#### How Heroku Deployment Works:
1. **`Procfile`** at root declares the web dyno command:
   ```procfile
   web: node packages/backend/dist/server.js
   ```
2. **`package.json`** defines automated build hooks:
   - `"heroku-prebuild": "npm install -g pnpm"` — Installs `pnpm` in the Heroku build environment.
   - `"heroku-postbuild": "pnpm install && pnpm -F @focussive/shared build && pnpm -F @focussive/backend build"` — Compiles the monorepo shared package and backend.
   - `"start": "node packages/backend/dist/server.js"` — Default startup command.

#### Heroku Deployment Commands:
```bash
# Push master to Heroku remote
git push heroku master

# View live Heroku logs
heroku logs --tail --app focussive-backend-cd9ac796ce02

# Restart Heroku dynos
heroku restart --app focussive-backend-cd9ac796ce02
```

---

### 2. Fly.io (Containerized Deployment)
Fly.io provides containerized deployment in the Singapore region (`sin`), close to Supabase `ap-southeast-1`.

- **Configuration:** `fly.toml`
- **Dockerfile:** `packages/backend/Dockerfile` (monorepo multi-stage build caching workspace layers)

#### Fly.io Deployment Commands:
```bash
# Deploy to Fly.io
fly deploy

# Set secrets
fly secrets set SUPABASE_URL="..." SUPABASE_SECRET_KEY="..." JWT_SECRET="..." JWT_REFRESH_SECRET="..."

# View Fly.io logs
fly logs
```

---

### Backend Environment Variables

Set these environment variables in your hosting provider (Heroku / Fly.io) or `.env` for local development:

| Variable | Description | Example / Notes |
|----------|-------------|-----------------|
| `SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase Service Role Secret Key | Secret service key (bypasses RLS) |
| `JWT_SECRET` | Secret key used to sign access tokens | High-entropy random string |
| `JWT_REFRESH_SECRET`| Secret key used to sign refresh tokens | High-entropy random string |
| `PORT` | HTTP port for Express server | `8080` (Fly/Heroku auto-assigns `PORT`) |
| `NODE_ENV` | Runtime environment | `production` |
| `CORS_ORIGINS` | Comma-separated allowed origins | Leave blank to allow mobile & extensions |

---

## 🗄️ Database Configuration & Migrations

The backend uses **Supabase PostgreSQL**.

### 1. Base Schema
Execute `packages/backend/src/db/schema.sql` in the Supabase SQL Editor to establish:
- `users` — User authentication & preferences
- `sessions` — Focus sessions with recurrence and timing
- `violations` — Recorded app and website access violations
- `app_groups` & `website_groups` — Blocklists and schedules

### 2. Required Migrations
If migrating an existing database, ensure the following columns and tables exist:
- **Session History Counts:**
  ```sql
  ALTER TABLE session_history ADD COLUMN IF NOT EXISTS app_violations_count INTEGER DEFAULT 0;
  ALTER TABLE session_history ADD COLUMN IF NOT EXISTS web_violations_count INTEGER DEFAULT 0;
  ```
- **Breaks Tracking:**
  ```sql
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS allow_breaks BOOLEAN DEFAULT false;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_break_time INTEGER DEFAULT 5;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS remaining_break_time INTEGER DEFAULT 300;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_on_break BOOLEAN DEFAULT false;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS break_ends_at TIMESTAMPTZ;
  ```

---

## 🧩 Browser Extension Build

The Chrome extension tracks website visits, blocks distraction URLs during active sessions, and syncs via QR code login.

### Building Extension
From workspace root:
```bash
pnpm build:extension
# Or: cd packages/extension && pnpm build
```
- **Output:** `packages/extension/dist`

### Installing in Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the directory: `packages/extension/dist`.
5. The Focussive extension icon will appear in your Chrome toolbar.

---

## 🔌 Client API Configuration

Make sure mobile and extension clients point to the active backend endpoint:

### Mobile Client (`packages/mobile/app.json`)
```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://focussive-backend-cd9ac796ce02.herokuapp.com"
    }
  }
}
```

### Chrome Extension (`packages/extension/src/utils/api.ts`)
```typescript
const API_URL = 'https://focussive-backend-cd9ac796ce02.herokuapp.com';
```

---

## 🛠️ Troubleshooting & Gotchas

### 1. "InstalledApps module is null" or App Blocker not working
- **Cause:** Running the app in standard Expo Go, or native dependencies weren't compiled.
- **Fix:** Build a local native APK (`pnpm build:mobile`) or EAS dev build (`pnpm build:mobile:dev`). Do not use Expo Go.

### 2. Notification design/locking changes not appearing on device
- **Cause:** Changes to native Android drawables (`notification_bg.xml`, `notification_reminder_bg.xml`), layout XMLs, or `SessionNotifications.kt` live in native Java/Kotlin and cannot be reloaded with JS Fast Refresh.
- **Fix:** Run a full native rebuild and reinstall: `pnpm build:mobile`.

### 3. Monorepo Build Error: `Cannot find module '@focussive/shared'`
- **Cause:** The shared package TypeScript source wasn't compiled before the backend or client build.
- **Fix:** Run `pnpm build:shared` (or `pnpm -F @focussive/shared build`).

### 4. CommonJS vs ES Modules Runtime Errors
- **Cause:** Node.js CommonJS incompatibility (`ERR_UNSUPPORTED_DIR_IMPORT`, `import.meta`).
- **Fix:** Both `@focussive/backend` and `@focussive/shared` use `"module": "CommonJS"` with `"moduleResolution": "node"`. Do not add `"type": "module"` to `packages/backend/package.json` or `packages/shared/package.json`.

### 5. CORS Errors with Browser Extension
- **Cause:** Extension requests do not send an origin header or send `chrome-extension://<id>`.
- **Fix:** Custom CORS middleware in `packages/backend/src/server.ts` allows any `chrome-extension://` origin automatically.
