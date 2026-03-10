/**
 * background.js — Service Worker
 *
 * Responsibilities:
 *  • Receive PUSH_TO_GITHUB messages from content scripts.
 *  • Commit the solution file to GitHub via the REST API.
 *  • Notify the popup + content script with push status updates.
 */

'use strict';

const REPO_NAME = 'GFG-solution'; // hardcoded — always push here

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'PUSH_TO_GITHUB') {
    handlePush(msg, sender.tab);
  }
});

// ── Core push logic ───────────────────────────────────────────────────────────
async function handlePush(msg, tab) {
  const { folderName, fileName, code, problemTitle, description, meta, language } = msg;
  const tabId = tab && tab.id;

  // Load stored credentials
  const { gh_token, gh_username } = await storageGet(['gh_token', 'gh_username']);
  const gh_repo = REPO_NAME; // always 'GFG-solution'

  if (!gh_token || !gh_username) {
    console.warn('[GFGHub] Not configured — open the extension popup to set up.');
    broadcastStatus({ type: 'PUSH_STATUS', status: 'error', problem: problemTitle, error: 'Not configured. Click the extension icon.' }, tabId);
    return;
  }

  // Notify popup + content script: loading
  broadcastStatus({ type: 'PUSH_STATUS', status: 'loading', problem: problemTitle }, tabId);

  try {
    const codePath = `${folderName}/${fileName}`;
    const content  = btoa(unescape(encodeURIComponent(code)));

    // ── Push code file ────────────────────────────────────────────
    const codeSha = await getFileSHA(gh_token, gh_username, gh_repo, codePath);
    const codeBody = {
      message: codeSha ? `Update solution: ${problemTitle}` : `Add solution: ${problemTitle}`,
      content,
      ...(codeSha ? { sha: codeSha } : {}),
    };
    const codeUrl = `https://api.github.com/repos/${gh_username}/${gh_repo}/contents/${encodeURIPath(codePath)}`;
    const codeRes = await fetch(codeUrl, {
      method : 'PUT',
      headers: {
        Authorization : `token ${gh_token}`,
        Accept        : 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(codeBody),
    });
    if (!codeRes.ok) {
      const e = await codeRes.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${codeRes.status}`);
    }

    // ── Push README.md ────────────────────────────────────────────
    const readmePath    = `${folderName}/README.md`;
    const readmeContent = buildReadme(problemTitle, language, fileName, description, meta);
    const readmeB64     = btoa(unescape(encodeURIComponent(readmeContent)));
    const readmeSha     = await getFileSHA(gh_token, gh_username, gh_repo, readmePath);
    const readmeBody    = {
      message: readmeSha ? `Update README: ${problemTitle}` : `Add README: ${problemTitle}`,
      content: readmeB64,
      ...(readmeSha ? { sha: readmeSha } : {}),
    };
    const readmeUrl = `https://api.github.com/repos/${gh_username}/${gh_repo}/contents/${encodeURIPath(readmePath)}`;
    await fetch(readmeUrl, {
      method : 'PUT',
      headers: {
        Authorization : `token ${gh_token}`,
        Accept        : 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(readmeBody),
    }).catch(() => {});  // README failure is non-fatal

    // ── Notify ────────────────────────────────────────────────────
    chrome.notifications.create({
      type   : 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
      title  : 'GFGHub — Pushed! 🎉',
      message: `"${problemTitle}" → ${gh_username}/${gh_repo}/${folderName}/`,
    });

    broadcastStatus({ type: 'PUSH_STATUS', status: 'success', problem: problemTitle }, tabId);

  } catch (err) {
    console.error('[GFGHub] Push failed:', err);
    broadcastStatus({ type: 'PUSH_STATUS', status: 'error', problem: problemTitle, error: err.message }, tabId);
  }
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

/** Returns the SHA of an existing file, or null if it doesn't exist. */
async function getFileSHA(token, username, repo, path) {
  const url = `https://api.github.com/repos/${username}/${repo}/contents/${encodeURIPath(path)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept       : 'application/vnd.github.v3+json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha || null;
}

/** Safely encode a file path for the GitHub Contents API. */
function encodeURIPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Build README.md markdown for a problem folder. */
function buildReadme(title, language, fileName, description, meta) {
  const url        = meta && meta.url        ? meta.url        : '';
  const difficulty = meta && meta.difficulty ? meta.difficulty : '';
  const accuracy   = meta && meta.accuracy   ? meta.accuracy   : '';
  const points     = meta && meta.points     ? meta.points     : '';

  // ── Difficulty badge colour ────────────────────────────────────────────
  const diffLower = difficulty.toLowerCase();
  const badgeColor = diffLower.includes('easy')   ? '2ea043'
                   : diffLower.includes('medium') ? 'd29922'
                   : diffLower.includes('hard')   ? 'da3633'
                   : '8b949e';

  // ── Badge row ─────────────────────────────────────────────────────────
  const platformBadge   = `![Platform](https://img.shields.io/badge/Platform-GeeksForGeeks-2f8d46?style=flat-square&logo=geeksforgeeks&logoColor=white)`;
  const langBadge       = `![Language](https://img.shields.io/badge/Language-${encodeURIComponent(language || 'N/A')}-58a6ff?style=flat-square)`;
  const diffBadge       = difficulty
    ? `![Difficulty](https://img.shields.io/badge/Difficulty-${encodeURIComponent(difficulty)}-${badgeColor}?style=flat-square)`
    : '';
  const statusBadge     = `![Status](https://img.shields.io/badge/Status-Accepted-2ea043?style=flat-square&logo=checkmarx&logoColor=white)`;

  const badges = [platformBadge, langBadge, diffBadge, statusBadge].filter(Boolean).join(' ');

  // ── Metadata table ────────────────────────────────────────────────────
  const tableRows = [];
  if (difficulty) tableRows.push(`| Difficulty | ${difficulty} |`);
  if (accuracy)   tableRows.push(`| Accuracy   | ${accuracy}   |`);
  if (points)     tableRows.push(`| Points     | ${points}     |`);
  if (language)   tableRows.push(`| Language   | ${language}   |`);
  if (url)        tableRows.push(`| Link       | [View on GFG](${url}) |`);

  const metaTable = tableRows.length
    ? `| Attribute | Value |\n|-----------|-------|\n${tableRows.join('\n')}`
    : '';

  // ── Description (clean up noise text GFG adds at top/bottom) ─────────
  let desc = (description || '').trim();
  // Remove the block that starts with "Try more examples Topic Tags..."
  desc = desc.replace(/Try more examples[\s\S]*$/i, '').trim();
  // Remove leading title+metadata line GFG prepends
  desc = desc.replace(/^[^\n]*Difficulty[^\n]*\n?/i, '').trim();

  const descSection = desc
    ? `## 📝 Problem Description\n\n${desc}\n`
    : '';

  // ── Code extension → language identifier for fenced block ─────────────
  const ext = fileName.split('.').pop();
  const fenceLang = ext === 'py' ? 'python'
                  : ext === 'js' ? 'javascript'
                  : ext === 'java' ? 'java'
                  : ext === 'cpp' || ext === 'c' ? 'cpp'
                  : ext;

  return [
    `<div align="center">`,
    ``,
    `# ${title}`,
    ``,
    badges,
    ``,
    `</div>`,
    ``,
    `---`,
    ``,
    metaTable ? `## 📊 Details\n\n${metaTable}\n` : '',
    descSection,
    `## ✅ Solution`,
    ``,
    `\`\`\`${fenceLang}`,
    `// See ${fileName}`,
    `\`\`\``,
    ``,
    `> Full solution in [${fileName}](./${fileName})`,
    ``,
    `---`,
    ``,
    `<div align="center">`,
    `<sub>Auto-pushed by <strong>GFGHub</strong> &nbsp;|&nbsp; ${new Date().toUTCString()}</sub>`,
    `</div>`,
  ].filter(s => s !== null).join('\n');
}

// ── Storage helper (promisified) ──────────────────────────────────────────────
function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

// ── Broadcast to popup AND the originating GFG tab's content script ──────────
function broadcastStatus(payload, tabId) {
  // To popup (may be closed — ignore error)
  chrome.runtime.sendMessage(payload).catch(() => {});
  // To the content script on the GFG tab
  if (tabId) {
    chrome.tabs.sendMessage(tabId, payload).catch(() => {});
  }
}
