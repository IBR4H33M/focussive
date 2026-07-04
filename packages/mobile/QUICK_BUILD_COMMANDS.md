# Quick Build Commands

## 🎯 TL;DR - Just want to build an APK?

### Option 1: Local Build (Fast & Free)
```bash
cd packages/mobile
pnpm android
```
**APK Location**: `android\app\build\outputs\apk\debug\app-debug.apk`

### Option 2: Cloud Build with EAS (No Android SDK needed)
```bash
cd packages/mobile
pnpm build:dev
```
EAS will build your APK in the cloud and give you a download link.

---

## 🏠 Local Build Commands

**Prerequisites**: Android SDK, Java JDK 17+

### From workspace root:
```bash
# Development APK (debug build)
pnpm -F @focussive/mobile android

# Production APK (release build)
pnpm -F @focussive/mobile android:release
```

### From packages/mobile directory:
```bash
cd packages/mobile

# Debug APK (for development/testing)
pnpm android

# Release APK (optimized, production-ready)
npx expo run:android --variant release

# App Bundle AAB (for Play Store)
cd android
.\gradlew bundleRelease
cd ..
```

### Output Locations:
- **Debug APK**: `android\app\build\outputs\apk\debug\app-debug.apk`
- **Release APK**: `android\app\build\outputs\apk\release\app-release.apk`
- **Release AAB**: `android\app\build\outputs\bundle\release\app-release.aab`

### Install APK on Device:
```bash
# Install debug APK
adb install android\app\build\outputs\apk\debug\app-debug.apk

# Install release APK
adb install android\app\build\outputs\apk\release\app-release.apk
```

---

## ☁️ Cloud Build Commands (EAS)

### From workspace root:
```bash
# Development APK (includes native modules, best for testing)
pnpm -F @focussive/mobile build:dev

# Preview APK (for beta testing)
pnpm -F @focussive/mobile build:preview

# Production AAB (for Play Store)
pnpm -F @focussive/mobile build:prod

# Production APK (for direct distribution)
pnpm -F @focussive/mobile build:prod-apk

# Check build status
pnpm -F @focussive/mobile build:status
```

### From packages/mobile directory:
```bash
cd packages/mobile

# Development APK
pnpm build:dev

# Preview APK
pnpm build:preview

# Production AAB
pnpm build:prod

# Production APK
pnpm build:prod-apk

# Check status
pnpm build:status
```

---

## 🔑 First Time? Run These:

```bash
# 1. Login to Expo
eas login

# 2. Build your first APK
cd packages/mobile
pnpm build:dev

# 3. Wait ~10 minutes, then download and install the APK
```

---

## 🆚 Local vs Cloud Build

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **Local** | ✅ Fast<br>✅ Free unlimited<br>✅ Works offline | ⚠️ Needs Android SDK<br>⚠️ Environment issues | Daily development |
| **Cloud (EAS)** | ✅ No SDK needed<br>✅ Consistent builds<br>✅ Easy sharing | ⚠️ Slower (~10 min)<br>⚠️ 30 builds/month limit | Team sharing, production |

## 🎯 Which Build Command Should I Use?

### Local Builds:
| Command | Output | Use When... |
|---------|--------|-------------|
| `pnpm android` | Debug APK | Daily development & testing |
| `expo run:android --variant release` | Release APK | Testing production build locally |
| `gradlew bundleRelease` | Release AAB | Creating Play Store bundle locally |

### Cloud Builds (EAS):
| Command | Output | Use When... |
|---------|--------|-------------|
| `pnpm build:dev` | Dev APK | Testing native features on real device |
| `pnpm build:preview` | Preview APK | Sharing with team/beta testers |
| `pnpm build:prod` | Prod AAB | Submitting to Play Store |
| `pnpm build:prod-apk` | Prod APK | Production but need APK file |

---

## 🐛 Problem? The native module not working?

If you see "InstalledApps module is null":
1. Stop using Expo Go
2. Build a development build: `pnpm build:dev`
3. Install the APK on your device
4. Native module will work! ✅

---

## 💰 Cost

- EAS Free tier: 30 builds/month
- Plenty for development and testing
- Check usage: https://expo.dev/settings/billing

---

For detailed info, see [README.md](./README.md)
