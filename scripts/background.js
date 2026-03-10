/**
 * background.js — Service Worker
 *
 * Responsibilities:
 *  • Receive PUSH_TO_GITHUB messages from content scripts.
 *  • Commit the solution file to GitHub via the REST API.
 *  • Notify the popup + content script with push status updates.
 */

'use strict';

const REPO_NAME = 'GFG-solutions'; // hardcoded — always push here

// ── Analytics tracker endpoint ───────────────────────────────────────────────
const TRACKER_URL = 'http://jobs.hidencloud.com:4001/track';

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
  const gh_repo = REPO_NAME; // always 'GFG-solutions'

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

    // ── Analytics (fire-and-forget, never blocks push) ────────────
    trackPush(gh_username).catch(() => {});

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
  const url = meta && meta.url ? meta.url : '';

  // ── Extract meta from description blob as fallback ────────────────────
  // GFG embeds "Difficulty: Easy Accuracy: 44.93% Submissions: 472K+ Points: 2 Average Time: 20m"
  // at the start of the raw description text when DOM selectors miss it.
  const raw = (description || '');
  const _pick = (key, rx) => {
    if (meta && meta[key]) return meta[key];
    const m = raw.match(rx);
    return m ? m[1].trim() : '';
  };

  // Use known difficulty words so we don't bleed into adjacent keywords (no spaces between them)
  const difficulty  = _pick('difficulty',  /Difficulty[:\s]*(Easy|Medium|Hard|Basic)/i);
  const accuracy    = _pick('accuracy',    /Accuracy[:\s]+([\d.]+%?)/i);
  const submissions = _pick('submissions', /Submissions[:\s]+([\d.KkMm+]+)/i);
  const points      = _pick('points',      /Points[:\s]+(\d+)/i);
  const averageTime = _pick('averageTime', /Average\s*Time[:\s]+(\d+\s*[a-zA-Z]+)/i);

  // ── Difficulty badge colour ────────────────────────────────────────────
  const diffLower = difficulty.toLowerCase();
  const badgeColor = diffLower.includes('easy')   ? '2ea043'
                   : diffLower.includes('medium') ? 'd29922'
                   : diffLower.includes('hard')   ? 'da3633'
                   : '8b949e';

  // ── Badge row ─────────────────────────────────────────────────────────
  const platformBadge = `![Platform](https://img.shields.io/badge/Platform-GeeksForGeeks-2f8d46?style=flat-square&logo=geeksforgeeks&logoColor=white)`;
  const langBadge     = `![Language](https://img.shields.io/badge/Language-${encodeURIComponent(language || 'N/A')}-58a6ff?style=flat-square)`;
  const diffBadge     = difficulty
    ? `![Difficulty](https://img.shields.io/badge/Difficulty-${encodeURIComponent(difficulty)}-${badgeColor}?style=flat-square)`
    : '';
  const statusBadge   = `![Status](https://img.shields.io/badge/Status-Accepted-2ea043?style=flat-square&logo=checkmarx&logoColor=white)`;

  const badges = [platformBadge, langBadge, diffBadge, statusBadge].filter(Boolean).join(' ');

  // ── Metadata table ────────────────────────────────────────────────────
  const tableRows = [];
  if (difficulty)  tableRows.push(`| Difficulty    | ${difficulty}  |`);
  if (accuracy)    tableRows.push(`| Accuracy      | ${accuracy}    |`);
  if (submissions) tableRows.push(`| Submissions   | ${submissions} |`);
  if (points)      tableRows.push(`| Points        | ${points}      |`);
  if (averageTime) tableRows.push(`| Average Time  | ${averageTime} |`);
  if (language)    tableRows.push(`| Language      | ${language}    |`);
  if (url)         tableRows.push(`| Link          | [View on GFG](${url}) |`);

  const metaTable = tableRows.length
    ? `| Attribute | Value |\n|-----------|-------|\n${tableRows.join('\n')}`
    : '';

  // ── Description parser ────────────────────────────────────────────────
  const descSection = buildDescriptionSection(description || '');

  // ── Code extension → language identifier for fenced block ─────────────
  const ext = fileName.split('.').pop();
  const fenceLang = ext === 'py'              ? 'python'
                  : ext === 'js'              ? 'javascript'
                  : ext === 'java'            ? 'java'
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
    `---`,
    ``,
    `## ✅ Solution`,
    ``,
    `> 📄 See full solution: [${fileName}](./${fileName})`,
    ``,
    `\`\`\`${fenceLang}`,
    `// Solution is in ${fileName}`,
    `\`\`\``,
    ``,
    `---`,
    ``,
    `<div align="center">`,
    `<sub>Auto-pushed by <a href="https://github.com/sidharth756/GFG-Hub"><strong>GFGHub</strong></a> &nbsp;·&nbsp; Made by <a href="https://github.com/sidharth756">sidharth756</a> &nbsp;|&nbsp; ${new Date().toUTCString()}</sub>`,
    `</div>`,
  ].filter(s => s !== null).join('\n');
}

/**
 * Parse the raw GFG description blob (no newlines) into clean markdown sections.
 * Sections detected: problem statement, examples, your task, constraints, complexity.
 */
function buildDescriptionSection(raw) {
  if (!raw) return '';

  let text = raw.trim();

  // Strip leading metadata blob (GFG has no spaces between fields):
  // e.g. "Anagram Difficulty: EasyAccuracy: 44.93%Submissions: 472K+Points: 2Average Time: 20m Given..."
  // Use match()+slice() — more reliable than ^.*? lazy replacement
  const _avgM = text.match(/Average\s*Time:\s*\d+\s*[a-zA-Z]+/i);
  if (_avgM) {
    text = text.slice(_avgM.index + _avgM[0].length).trim();
  } else {
    const _ptM = text.match(/Points:\s*\d+/i);
    if (_ptM) text = text.slice(_ptM.index + _ptM[0].length).trim();
  }
  // Strip trailing noise
  text = text.replace(/Try more examples[\s\S]*$/i, '').trim();
  text = text.replace(/\s+/g, ' ').trim();   // collapse extra whitespace

  if (!text) return '';

  // ── Find section start indices ────────────────────────────────────────
  const find = (pattern) => {
    const m = text.match(pattern);
    return m ? { index: m.index, length: m[0].length } : null;
  };

  const exMatch   = find(/\bExamples?\s*\d*\s*:/i);
  const taskMatch = find(/\bYour\s+Task\s*:/i);
  const consMatch = find(/\bConstraints?\s*:/i);
  const timeMatch = find(/\bExpected\s+Time\s+Complexity\s*:/i);
  const spaceMatch= find(/\bExpected\s+Auxiliary\s+Space\s*:/i);

  // ── Boundary helpers ──────────────────────────────────────────────────
  const anchors = [exMatch, taskMatch, consMatch, timeMatch, spaceMatch]
    .filter(Boolean)
    .map(m => m.index)
    .sort((a, b) => a - b);

  const nextAnchorAfter = (pos) => anchors.find(i => i > pos) ?? text.length;

  // ── Extract slices ────────────────────────────────────────────────────
  const mainEnd    = anchors.length ? anchors[0] : text.length;
  const mainText   = text.slice(0, mainEnd).trim();

  let examplesText = '';
  if (exMatch) {
    const end = nextAnchorAfter(exMatch.index);
    examplesText = text.slice(exMatch.index + exMatch.length, end).trim();
  }

  let taskText = '';
  if (taskMatch) {
    const end = nextAnchorAfter(taskMatch.index);
    taskText = text.slice(taskMatch.index + taskMatch.length, end).trim();
  }

  let consText = '';
  if (consMatch) {
    const end = nextAnchorAfter(consMatch.index);
    consText = text.slice(consMatch.index + consMatch.length, end).trim();
  }

  // Complexity: grab from Expected Time to end (covers both Time + Space)
  let complexText = '';
  const complexStart = timeMatch || spaceMatch;
  if (complexStart) {
    complexText = text.slice(complexStart.index).trim();
    // Nicely split Time and Space onto separate lines
    complexText = complexText
      .replace(/\bExpected\s+Time\s+Complexity\s*:/i,     '- **Expected Time Complexity:** ')
      .replace(/\bExpected\s+Auxiliary\s+Space\s*:/i, '\n- **Expected Auxiliary Space:** ');
  }

  // ── Format examples ───────────────────────────────────────────────────
  let examplesSection = '';
  if (examplesText) {
    // Split on "Example N:" to handle multiple examples
    const parts = examplesText.split(/\bExample\s+\d+\s*:/i).filter(p => p.trim());
    // If there's only one part with no splits, treat the whole block as examples
    const blocks = parts.length ? parts : [examplesText];

    const formatted = blocks.map((block, i) => {
      let b = block.trim();
      // Split into Input / Output / Explanation lines
      b = b
        .replace(/\bInput\s*\d*\s*:/gi,       '\n**Input:**\n```\n')
        .replace(/\bOutput\s*\d*\s*:/gi,       '\n```\n**Output:**\n```\n')
        .replace(/\bExplanation\s*\d*\s*:/gi,  '\n```\n**Explanation:**\n');

      // If we opened a ``` for output close it
      if ((b.match(/```/g) || []).length % 2 !== 0) b += '\n```';

      const label = blocks.length > 1 ? `**Example ${i + 1}:**\n\n` : '';
      return `${label}${b.trim()}`;
    }).join('\n\n---\n\n');

    examplesSection = `### 🔢 Examples\n\n${formatted}\n`;
  }

  // ── Assemble ──────────────────────────────────────────────────────────
  const parts = [];

  parts.push(`## 📝 Problem Description\n`);

  if (mainText) {
    parts.push(`${mainText}\n`);
  }

  if (examplesSection) {
    parts.push(examplesSection);
  }

  if (taskText) {
    parts.push(`### 🎯 Your Task\n\n${taskText}\n`);
  }

  if (consText) {
    parts.push(`### 📌 Constraints\n\n\`\`\`\n${consText}\n\`\`\`\n`);
  }

  if (complexText) {
    parts.push(`### ⏱️ Complexity\n\n${complexText}\n`);
  }

  return parts.join('\n');
}

// ── Storage helper (promisified) ──────────────────────────────────────────────
function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

// ── Analytics tracker ────────────────────────────────────────────────────────
/**
 * Sends github_username to YOUR Cloudflare Worker.
 * The Worker holds all DB credentials server-side — nothing secret is in
 * this file. Users loading the extension in dev mode cannot change what
 * the Worker does or access the database.
 * Fails silently — never blocks or affects the push flow.
 */
async function trackPush(username) {
  if (!username || TRACKER_URL.includes('YOUR_SUBDOMAIN')) return;
  console.log(`[GFGHub] trackPush called for: ${username}`);
  console.log(`[GFGHub] TRACKER_URL = ${TRACKER_URL}`);
  try {
    const res = await fetch(TRACKER_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        username,
        version: '1.0.0',
        ts     : new Date().toISOString(),
      }),
    });
    console.log(`[GFGHub] Track HTTP status: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    console.log(`[GFGHub] Track response:`, JSON.stringify(data));
  } catch (err) {
    console.error(`[GFGHub] Track FAILED — ${err.name}: ${err.message}`);
  }
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
