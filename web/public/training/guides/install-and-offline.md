# Install the app and work offline

Relationship Manager is a **progressive web app**: it installs like a native app and keeps working without a connection.

## Installing

- **Chrome / Edge (desktop)** — click the install icon in the address bar, or use **Install app** in the account menu at the bottom of the rail.
- **Android** — Chrome shows an "Add to Home screen" prompt; or use the browser menu.
- **iPhone / iPad** — Safari → Share → **Add to Home Screen**.
- **macOS** — Safari → File → **Add to Dock**.

The installed app opens in its own window with the Relationship Manager icon, supports the window-controls overlay, and registers shortcuts for Network, Import and People.

## Offline behaviour

A service worker caches the app shell on first visit and keeps a copy of every API response you've loaded.

- Pages you've visited open offline with the data you last saw.
- An **offline banner** appears at the top; actions that need the server fail with a clear message until you're back online.
- Training videos are cached after the first play.
- When a new version is deployed, a **Reload** banner appears; reload to update.

## Appearance

**Settings → Appearance** — choose light, dark or system, and pick an accent **seed colour**. The entire Material 3 palette (primary, secondary, tertiary, surfaces) is derived from the seed, in the spirit of Material You dynamic colour. Preferences are stored per browser.

## Your data

**Settings → Data → Export workspace** downloads everything — people, relationships, interactions, tags — as JSON. The People page exports CSV. Nothing leaves your server unless you connect an integration.

## Keyboard & accessibility

- `Esc` closes dialogs and sheets.
- Every control has a label; focus rings follow the primary colour.
- Reduced-motion preferences are respected.
