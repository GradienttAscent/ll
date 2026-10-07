// Parses query parameter for domain and shows live countdown
(function() {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain');
  if (domain) {
    document.getElementById('domainText').textContent = domain;
  }

  const countdownEl = document.getElementById('countdown');
  const taskBannerEl = document.getElementById('taskBanner');

  async function updateTimer() {
    try {
      const res = await fetch('http://localhost:3000/api/focus-mode/active');
      if (!res.ok) return;
      const data = await res.json();
      const session = data.activeSession;
      if (!session) {
        countdownEl.textContent = '00:00';
        taskBannerEl.textContent = 'Focus session finished.';
        return;
      }

      if (session.taskTitle) {
        taskBannerEl.textContent = 'Locked into: ' + session.taskTitle;
      }

      const diff = Math.max(0, new Date(session.endsAt).getTime() - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      countdownEl.textContent =
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    } catch {
      countdownEl.textContent = 'Active';
    }
  }

  updateTimer();
  setInterval(updateTimer, 1000);
})();
