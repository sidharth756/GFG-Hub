// ─── Constants ────────────────────────────────────────────────────────────────
const REPO_NAME = 'GFG-solutions';

// ─── Helpers ────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ['auth', 'setup', 'dashboard'].forEach((s) => {
    $(`screen-${s}`).classList.toggle('hidden', s !== name);
  });
}

function showError(msg) {
  const el = $('setup-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError() {
  $('setup-error').classList.add('hidden');
}

// ─── Init — go straight to dashboard if already set up ───────────────────────
chrome.storage.sync.get(['gh_token', 'gh_username', 'push_count', 'last_push'], (data) => {
  if (data.gh_token && data.gh_username) {
    // Ensure repo is always written (migration from old builds)
    chrome.storage.sync.set({ gh_repo: REPO_NAME });
    loadDashboard({ ...data, gh_repo: REPO_NAME });
  } else {
    showScreen('auth');
  }
});

// ─── Screen 1: Auth ──────────────────────────────────────────────────────────
$('btn-setup').addEventListener('click', () => showScreen('setup'));

// ─── Screen 2: Setup ─────────────────────────────────────────────────────────
$('btn-back-setup').addEventListener('click', () => {
  clearError();
  showScreen('auth');
});

$('btn-save').addEventListener('click', async () => {
  clearError();
  const token    = $('input-token').value.trim();
  const username = $('input-username').value.trim();

  if (!token || !username) {
    showError('Both fields are required.');
    return;
  }

  $('btn-save').textContent = 'Connecting…';
  $('btn-save').disabled = true;

  try {
    // Verify token
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userRes.ok) {
      throw new Error('Invalid token. Make sure it has "repo" scope.');
    }

    const userJson = await userRes.json();
    if (userJson.login.toLowerCase() !== username.toLowerCase()) {
      throw new Error(`Token belongs to "${userJson.login}", not "${username}".`);
    }

    // Ensure GFG-solutions repo exists (create silently if missing)
    await ensureRepoExists(token, userJson.login, REPO_NAME);

    // ── Save only token + username. repo is always REPO_NAME constant. ──
    await new Promise((resolve) =>
      chrome.storage.sync.set(
        { gh_token: token, gh_username: userJson.login, gh_repo: REPO_NAME, push_count: 0, last_push: null },
        resolve
      )
    );

    loadDashboard({ gh_token: token, gh_username: userJson.login, gh_repo: REPO_NAME, push_count: 0, last_push: null });
  } catch (err) {
    showError(err.message);
  } finally {
    $('btn-save').textContent = 'Connect GitHub';
    $('btn-save').disabled = false;
  }
});

async function ensureRepoExists(token, username, repo) {
  const res = await fetch(`https://api.github.com/repos/${username}/${repo}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 404) {
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repo,
        description: 'My GeeksForGeeks solutions — auto-pushed by GFGHub',
        private: false,
        auto_init: true,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(`Could not create repo "${repo}": ${err.message}`);
    }
  }
  // If already exists or other error, just continue
}

// ─── Screen 3: Dashboard ─────────────────────────────────────────────────────
function loadDashboard(data) {
  $('dash-username').textContent = data.gh_username || 'Connected';
  const repoLink = `https://github.com/${data.gh_username}/${REPO_NAME}`;
  $('dash-repo-link').href = repoLink;
  $('dash-repo-link').textContent = `${data.gh_username}/${REPO_NAME}`;
  $('stat-total').textContent = data.push_count || 0;

  if (data.last_push) {
    $('stat-last').textContent = data.last_push;
    $('last-push-info').classList.remove('hidden');
    $('last-push-name').textContent = `Last: ${data.last_push}`;
  }

  showScreen('dashboard');
}

$('btn-disconnect').addEventListener('click', () => {
  if (confirm('Disconnect GFGHub? Your GitHub repo will remain intact.')) {
    chrome.storage.sync.clear(() => showScreen('auth'));
  }
});

$('btn-edit-settings').addEventListener('click', () => {
  chrome.storage.sync.get(['gh_token', 'gh_username'], (data) => {
    $('input-token').value    = data.gh_token    || '';
    $('input-username').value = data.gh_username || '';
    clearError();
    showScreen('setup');
  });
});

// ─── Listen for push events from background ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PUSH_STATUS') {
    const el = $('push-status');
    el.classList.remove('hidden', 'success', 'error', 'loading');

    if (msg.status === 'loading') {
      el.classList.add('loading');
      el.textContent = `⏳ Pushing "${msg.problem}"…`;
    } else if (msg.status === 'success') {
      el.classList.add('success');
      el.textContent = `✓ Pushed "${msg.problem}"!`;
      chrome.storage.sync.get(['push_count'], (d) => {
        const n = (d.push_count || 0) + 1;
        chrome.storage.sync.set({ push_count: n, last_push: msg.problem });
        $('stat-total').textContent = n;
        $('stat-last').textContent = msg.problem;
      });
      setTimeout(() => el.classList.add('hidden'), 4000);
    } else if (msg.status === 'error') {
      el.classList.add('error');
      el.textContent = `✕ Failed: ${msg.error}`;
      setTimeout(() => el.classList.add('hidden'), 5000);
    }
  }
});
