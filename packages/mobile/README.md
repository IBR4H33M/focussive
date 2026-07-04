# Focussive Mobile

React Native app built with Expo.

## Quick Start

### Development
```bash
# Install dependencies (from workspace root)
pnpm install

# Start Metro bundler
pnpm dev:mobile

# Build and install on device
pnpm -F @focussive/mobile android
```

### Building APK

**Local build** (requires Android SDK + Java 17):
```bash
cd packages/mobile
pnpm android
```

**Cloud build** (no setup needed):
```bash
cd packages/mobile
pnpm build:dev
```

See [QUICK_BUILD_COMMANDS.md](./QUICK_BUILD_COMMANDS.md) for all build options.

## Project Structure

```
src/
├── app/              # Expo Router screens
│   ├── (auth)/      # Login, signup
│   ├── (tabs)/      # Main app tabs
│   └── session/     # Session management
├── components/       # Reusable components
├── context/         # React Context providers
└── utils/           # Utilities and API client
```

## Key Features

- Focus sessions with app/website blocking
- Native module for reading installed apps
- Browser extension QR code login
- Session history and analytics
- App groups and website groups management
