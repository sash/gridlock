# GridLock — native shell (React Native / Expo)

Ships the complete web game as a single offline HTML asset inside a React
Native WebView, with native haptics wired over the bridge (light tap on
placement, medium/heavy on clears, success buzz on perfect clears).

The game itself — rendering, audio, save/restore — is the exact same code as
the web build; nothing is forked. `localStorage` persists via the WebView's
DOM storage under a stable origin.

## Build & run

```bash
# 1. from the repo root: build the single-file game into native/assets/
npm run build:native

# 2. run on a device/simulator
cd native
npm install
npx expo start            # Expo Go (note: Expo Go ≠ full haptics on Android)
npx expo run:ios          # native dev build
npx expo run:android
```

## Store distribution

Uses [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm i -g eas-cli
eas login
eas build --platform ios       # App Store / TestFlight
eas build --platform android   # Play Store AAB
eas submit                     # upload to the stores
```

Bundle IDs are set in `app.json` (`app.gridlock.game`). Remember to re-run
`npm run build:native` from the repo root before every release build — the
HTML asset is generated, not committed.
