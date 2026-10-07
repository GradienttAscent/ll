document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  const syncBtn = document.getElementById('syncBtn');

  function renderStatus(session) {
    if (session && Array.isArray(session.blockedDomains) && session.blockedDomains.length > 0) {
      badge.textContent = 'Active';
      badge.className = 'status-badge status-active';
      const endsAt = new Date(session.endsAt).getTime();
      const minsLeft = Math.max(1, Math.round((endsAt - Date.now()) / 60000));
      text.innerHTML = `<strong>Focusing:</strong> ${minsLeft}m left<br>` +
        `<strong>Blocking ${session.blockedDomains.length} sites:</strong><br>` +
        `<small style="color: #c4b5fd;">${session.blockedDomains.join(', ')}</small>`;
    } else {
      badge.textContent = 'Standby';
      badge.className = 'status-badge status-idle';
      text.textContent = 'No focus session active. Start a session in LazyLift to enable real website blocking.';
    }
  }

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res && res.session) {
      renderStatus(res.session);
    } else {
      renderStatus(null);
    }
  });

  syncBtn.addEventListener('click', () => {
    syncBtn.textContent = 'Syncing...';
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (res) => {
      syncBtn.textContent = 'Sync Now';
      renderStatus(res?.session || null);
    });
  });
});
