# Ring Light

A customizable ring light web app — turns any screen into an adjustable
fill light for video calls, selfies and photography. No build step, works
offline once loaded, installable as a PWA.

## Features

- **Intensity** — scales the lit pixels (0–100%). A web page can't exceed the
  device's own brightness, so for maximum output also raise your screen
  brightness; the first-run hint says so.
- **Color** — white mode with a 2000–7000 K temperature slider, or color mode
  with hue + saturation.
- **Shape** — an adjustable ring (size, thickness, edge softness) or a
  full-screen flood for maximum light.
- **Background** — defaults to black; changeable. Shows through the ring hole.
- **Drag gestures** — drag anywhere on the light: up/down sets intensity,
  left/right sets temperature or hue.
- **Immersive** — controls auto-hide after a few seconds (tap to toggle),
  Screen Wake Lock keeps the display on, Fullscreen where supported.
- **Offline** — a service worker caches the app; it runs without a network
  after the first visit.

## Run locally

It's a static site — open `index.html` over HTTP (service workers and the
Wake Lock API need a secure context, so `file://` won't fully work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push these files to a GitHub repository.
2. In the repo: **Settings → Pages → Build and deployment**, set
   **Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The app is served at `https://<user>.github.io/<repo>/`.

All paths are relative, so it works from a project subpath, a user/org site,
or a custom domain with no changes. `.nojekyll` keeps Pages from processing
the files.

### Updating

The service worker is network-first: when online it always fetches the latest
files. To push a new version, bump `CACHE` in `sw.js` (e.g. `ring-light-v2`)
so the old offline cache is discarded on activation.

## Browser support notes

- **Screen Wake Lock** — Chrome, Edge, Safari 16.4+. Degrades silently if absent.
- **Fullscreen API** — desktop and iPad. iPhone Safari has none; install via
  **Share → Add to Home Screen** for a chrome-free standalone window instead.
- **Smooth color transitions** use the registered `@property --ring-color`;
  unsupported browsers just apply changes instantly.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup and PWA metadata |
| `styles.css` | Styling, ring gradient geometry |
| `app.js` | State, rendering, gestures, wake lock, hints |
| `sw.js` | Service worker (network-first caching) |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons |
