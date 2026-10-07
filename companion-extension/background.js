// LazyLift Focus Shield Companion - Background Service Worker
// Uses Chrome Manifest V3 declarativeNetRequest API to block real network navigations.

const API_BASE = 'http://localhost:3000';
let activeSessionCache = null;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds declarativeNetRequest redirect rules for a list of domains.
 */
function buildBlockingRules(domains) {
  return domains.map((domain, index) => {
    const escaped = escapeRegex(domain);
    return {
      id: 1000 + index,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
        },
      },
      condition: {
        regexFilter: `^https?:\\/\\/([a-z0-9-]+\\.)*${escaped}(:\\d+)?(\\/.*)?$`,
        resourceTypes: ['main_frame'],
      },
    };
  });
}

/**
 * Syncs the current active focus session from LazyLift backend and updates dynamic blocking rules.
 */
async function syncFocusState() {
  try {
    const res = await fetch(`${API_BASE}/api/focus-mode/active`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.warn('[LazyLift Shield] Server returned', res.status);
      return;
    }
    const data = await res.json();
    const session = data.activeSession;

    // Fetch existing dynamic rules to clear
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((r) => r.id);

    if (session && Array.isArray(session.blockedDomains) && session.blockedDomains.length > 0) {
      activeSessionCache = session;
      const newRules = buildBlockingRules(session.blockedDomains);

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: newRules,
      });

      const endsAt = new Date(session.endsAt).getTime();
      const minsLeft = Math.max(1, Math.round((endsAt - Date.now()) / 60000));

      await chrome.action.setBadgeText({ text: `${minsLeft}m` });
      await chrome.action.setBadgeBackgroundColor({ color: '#6D28D9' });
      await chrome.action.setTitle({
        title: `LazyLift Focus Active: ${session.blockedDomains.length} site(s) shielded`,
      });
      console.log(`[LazyLift Shield] Active: ${newRules.length} sites blocked, ${minsLeft}m remaining.`);
    } else {
      activeSessionCache = null;
      if (existingRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingRuleIds,
        });
      }
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'LazyLift Focus Shield: Standby' });
      console.log('[LazyLift Shield] Standby: No active focus session.');
    }
  } catch (err) {
    // LL server may be temporarily offline
    console.debug('[LazyLift Shield] Sync check skipped:', err?.message || err);
  }
}

// Initial sync on startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LazyLift Shield] Installed successfully.');
  void syncFocusState();
  chrome.alarms.create('syncFocusTimer', { periodInMinutes: 0.25 }); // Every 15 seconds
});

// Periodic alarm sync
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncFocusTimer') {
    void syncFocusState();
  }
});

// Message listener for manual triggers or popup queries
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SYNC_NOW') {
    syncFocusState().then(() => sendResponse({ success: true, session: activeSessionCache }));
    return true; // asynchronous response
  }
  if (message.type === 'GET_STATUS') {
    sendResponse({ session: activeSessionCache });
    return false;
  }
});
