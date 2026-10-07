# LazyLift Focus Shield Companion (Manifest V3)

The **LazyLift Focus Shield Companion** is a Manifest V3 browser extension that performs **genuine network-level website blocking** during active study focus sessions.

Unlike superficial overlays, CSS blur tricks, or client-side redirects, the Companion utilizes the browser's native `chrome.declarativeNetRequest` engine to intercept and redirect requests to distracting domains (such as YouTube, Instagram, Reddit, WhatsApp Web, and custom student sites) directly to a calm focus recovery screen (`blocked.html`).

---

## Installation Guide (Chrome / Edge / Brave / Chromium)

1. Open your Chromium-based browser and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle located at top-right).
3. Click **Load unpacked** (top-left).
4. Select the `companion-extension/` directory from this repository:
   ```text
   ~/college repos/ll/companion-extension
   ```
5. The extension will appear with the shield icon: **LazyLift Focus Shield Companion**.

---

## How It Works

1. **Automatic Synchronization**:
   - The extension's background service worker polls `http://localhost:3000/api/focus-mode/active` every 15 seconds.
2. **Dynamic Rule Injection**:
   - When you start a focus session in the LazyLift web app, the backend saves the session and your selected distraction list.
   - The extension converts these domains into dynamic `declarativeNetRequest` regex rules (`^https?://([a-z0-9-]+\.)?domain\.com/`).
   - The extension badge turns purple and displays remaining minutes (`25m`).
3. **True Blocking**:
   - Any attempt to open a blocked website instantly redirects to the distraction guard page displaying your session countdown and task title.
4. **Session Settlement**:
   - When the timer runs out or you click **Stop Focus Session** in LazyLift, the dynamic rules are automatically flushed and full browsing is restored.
