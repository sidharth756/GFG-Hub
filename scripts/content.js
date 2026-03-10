/**
 * content.js — GFGHub
 *
 * Three-layer approach for maximum reliability:
 *
 *  Layer 1 — Submit-button click listener
 *    Hooks GFG's own "Submit" button. When clicked, starts polling the DOM
 *    for the verdict text ("Correct Answer", "Accepted", etc.)
 *
 *  Layer 2 — MutationObserver (text-based, not class-based)
 *    Watches any new nodes whose text contains verdict keywords.
 *
 *  Layer 3 — Manual "Push to GFGHub" floating button
 *    Always visible on problem pages. User can click it any time to
 *    push the current code regardless of verdict detection.
 */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────────

  const ACCEPTED_TEXTS = [
    'correct answer',
    'accepted',
    'problem solved',
    'all test cases passed',
    'congratulations',
  ];

  const LANG_MAP = {
    'c++': { name: 'C++', ext: 'cpp' },
    'cpp': { name: 'C++', ext: 'cpp' },
    'c'  : { name: 'C', ext: 'c' },
    'java': { name: 'Java', ext: 'java' },
    'python': { name: 'Python', ext: 'py' },
    'python3': { name: 'Python3', ext: 'py' },
    'py' : { name: 'Python', ext: 'py' },
    'javascript': { name: 'JavaScript', ext: 'js' },
    'js' : { name: 'JavaScript', ext: 'js' },
  };

  // ── Constants ─────────────────────────────────────────────────────────────────
  const TOOLBAR_BTN_ID = 'gfghub-toolbar-btn';

  // SVG icon path snippets used inside the toolbar button
  const ICON_GH    = `<path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>`;
  const ICON_CHECK = `<path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>`;
  const ICON_X     = `<path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>`;
  const ICON_SPIN  = `<path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5.75.75 0 0 1 1.5 0 8 8 0 1 1-8-8 .75.75 0 0 1 0 1.5z"/>`;

  // ── State ─────────────────────────────────────────────────────────────────────
  let _pushCooldown   = false;
  let _isWatching     = false;
  let _pollTimer      = null;
  let _autoTriggered  = false;
  let _autoSlug       = '';
  let _toastTimer     = null;
  let _accepted       = false;  // true only after GFG shows accepted verdict

  // ── Entry point ───────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    injectToastElement();    // Always inject toast so feedback is always visible
    injectToolbarButton();   // PRIMARY: button next to Submit in GFG toolbar
    // Floating button is only injected as fallback inside injectToolbarButton()
    hookSubmitButton();
    hookMutationObserver();
    observeURLChanges(() => {
      injectToolbarButton();
      hookSubmitButton();
    });
  }

  function injectToastElement() {
    if (document.getElementById('gfghub-toast')) return;
    const style = document.createElement('style');
    style.id = 'gfghub-toast-style';
    style.textContent = `
      #gfghub-toast {
        position: fixed;
        bottom: 82px;
        right: 28px;
        z-index: 9999999;
        background: #161b22;
        color: #c9d1d9;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 300px;
        line-height: 1.5;
        box-shadow: 0 4px 16px rgba(0,0,0,.5);
        opacity: 0;
        transform: translateY(6px);
        transition: opacity .25s, transform .25s;
        pointer-events: none;
      }
      #gfghub-toast.show { opacity: 1; transform: translateY(0); }
      #gfghub-toast.t-success { border-color: #3fb950; color: #3fb950; }
      #gfghub-toast.t-error   { border-color: #f85149; color: #f85149; }
      #gfghub-toast.t-info    { border-color: #388bfd; color: #58a6ff; }
      @keyframes gfghub-spin { to { transform: rotate(360deg); } }
      .gfghub-spinning { animation: gfghub-spin 0.8s linear infinite; transform-origin: center; }
    `;
    document.head.appendChild(style);
    const toast = document.createElement('div');
    toast.id = 'gfghub-toast';
    document.body.appendChild(toast);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  TOOLBAR BUTTON — injected right next to GFG's Submit button
  //  New GFG UI: Submit button lives in a fixed BOTTOM action bar
  // ═════════════════════════════════════════════════════════════════════════

  function injectToolbarButton() {
    if (document.getElementById(TOOLBAR_BTN_ID)) return;

    // Retry every 400ms for up to 30s (GFG is a React SPA, DOM loads late)
    let attempts = 0;
    const tryInject = setInterval(() => {
      attempts++;
      const submitBtn = findSubmitButton();
      if (submitBtn) {
        clearInterval(tryInject);
        placeToolbarButton(submitBtn);
        return;
      }
      if (attempts > 75) {
        clearInterval(tryInject);
        // Toolbar injection timed out — fall back to floating button
        console.log('[GFGHub] Submit btn not found, using floating button fallback');
        injectFloatingButton();
      }
    }, 400);
  }

  function findSubmitButton() {
    // ── Strategy 1: GFG-specific known class patterns ──────────────────────
    const specificSelectors = [
      'button[class*="submitBtn"]',
      'button[class*="submit_btn"]',
      'button[class*="submitButton"]',
      'button[class*="submit-btn"]',
      '[class*="submitBtn"]:not(#gfghub-toolbar-btn)',
      '[class*="ui-submit-btn"]',
    ];
    for (const sel of specificSelectors) {
      const el = document.querySelector(sel);
      if (el && el.id !== TOOLBAR_BTN_ID) return el;
    }

    // ── Strategy 2: text content match (handles child spans/icons) ─────────
    const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
    const byText = allBtns.find((el) => {
      if (el.id === TOOLBAR_BTN_ID) return false;
      // Use innerText (only visible text) to avoid hidden aria/icon text
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t === 'submit' || t === 'submit code' || t === 'submit solution';
    });
    if (byText) return byText;

    // ── Strategy 3: look for the bottom action bar row (new GFG layout) ────
    // The bottom bar typically has: "Custom Input" | "Compile & Run" | "Submit"
    const compileBtn = allBtns.find((el) => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      return t.includes('compile') && t.includes('run');
    });
    if (compileBtn) {
      // Submit button is usually the next sibling button
      const siblings = Array.from(compileBtn.parentNode?.children || []);
      const idx = siblings.indexOf(compileBtn);
      for (let i = idx + 1; i < siblings.length; i++) {
        const s = siblings[i];
        if (s.tagName === 'BUTTON' || s.getAttribute('role') === 'button') {
          return s;
        }
      }
    }

    return null;
  }

  function placeToolbarButton(submitBtn) {
    if (document.getElementById(TOOLBAR_BTN_ID)) return;

    // Grab height + computed style from the real Submit button
    const computedH = submitBtn.offsetHeight || 36;
    const computedR = getComputedStyle(submitBtn).borderRadius || '4px';

    const btn = document.createElement('button');
    btn.id    = TOOLBAR_BTN_ID;
    btn.type  = 'button';

    btn.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px;
      padding: 0 16px;
      height: ${computedH}px;
      background: #24292e;
      color: #ffffff;
      border: 1.5px solid #444c56;
      border-radius: ${computedR};
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      margin-left: 8px;
      transition: background 0.18s, border-color 0.18s, transform 0.1s;
      white-space: nowrap;
      line-height: 1;
      vertical-align: middle;
      box-sizing: border-box;
      flex-shrink: 0;
    `;
    btn.title = 'Push code to GitHub (GFGHub)';
    btn.innerHTML = `
      <svg id="gfghub-tb-icon" width="15" height="15" viewBox="0 0 16 16" fill="currentColor"
           xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
        ${ICON_GH}
      </svg>
      <span id="gfghub-tb-label">Push</span>
    `;

    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) {
        btn.style.background    = '#2ea043';
        btn.style.borderColor   = '#2ea043';
        btn.style.transform     = 'translateY(-1px)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.disabled) {
        btn.style.background    = '#24292e';
        btn.style.borderColor   = '#444c56';
        btn.style.transform     = '';
      }
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pushCurrentCode({ manual: true });
    });

    // Insert immediately AFTER the Submit button in its parent
    const parent = submitBtn.parentNode;
    if (parent) {
      parent.insertBefore(btn, submitBtn.nextSibling);
      console.log('[GFGHub] ✓ Push button injected next to Submit');
    }
  }

  function setToolbarBtnState(state, text) {
    const btn   = document.getElementById(TOOLBAR_BTN_ID);
    const label = document.getElementById('gfghub-tb-label');
    const icon  = document.getElementById('gfghub-tb-icon');
    if (!btn || !label) return;
    btn.disabled          = false;
    btn.style.opacity     = '1';
    btn.style.borderColor = '#444c56';
    if (icon) icon.classList.remove('gfghub-spinning');

    switch (state) {
      case 'idle':
        btn.style.background = '#24292e';
        btn.style.borderColor = '#444c56';
        label.textContent    = 'Push';
        if (icon) icon.innerHTML = ICON_GH;
        break;
      case 'pushing':
        btn.style.background  = '#388bfd';
        btn.style.borderColor = '#388bfd';
        btn.disabled          = true;
        btn.style.opacity     = '0.85';
        label.textContent     = 'Pushing…';
        if (icon) { icon.innerHTML = ICON_SPIN; icon.classList.add('gfghub-spinning'); }
        break;
      case 'success':
        btn.style.background  = '#2ea043';
        btn.style.borderColor = '#2ea043';
        label.textContent     = 'Pushed!';
        if (icon) icon.innerHTML = ICON_CHECK;
        // Stay green — no auto-revert
        break;
      case 'error':
        btn.style.background  = '#da3633';
        btn.style.borderColor = '#da3633';
        label.textContent     = 'Failed';
        if (icon) icon.innerHTML = ICON_X;
        setTimeout(() => setToolbarBtnState('idle'), 5000);
        break;
      case 'detected':
        btn.style.background  = '#9a6700';
        btn.style.borderColor = '#d29922';
        label.textContent     = text || 'Push now';
        if (icon) icon.innerHTML = ICON_GH;
        break;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LAYER 3 — Floating "Push to GFGHub" button
  // ═════════════════════════════════════════════════════════════════════════

  function injectFloatingButton() {
    if (document.getElementById('gfghub-btn')) return;

    const style = document.createElement('style');
    style.id = 'gfghub-styles';
    style.textContent = `
      #gfghub-btn {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #24292e;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        transition: background .2s, transform .15s, box-shadow .2s;
        user-select: none;
        line-height: 1;
      }
      #gfghub-btn:hover {
        background: #2ea043;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(46,160,67,.45);
      }
      #gfghub-btn:active { transform: translateY(0); }
      #gfghub-btn.gfghub-pushing {
        background: #388bfd; cursor: default; pointer-events: none;
      }
      #gfghub-btn.gfghub-success {
        background: #2ea043;
        animation: gfghub-pop .35s ease;
      }
      #gfghub-btn.gfghub-error { background: #da3633; }
      @keyframes gfghub-pop {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      #gfghub-toast {
        position: fixed;
        bottom: 82px;
        right: 28px;
        z-index: 999998;
        background: #161b22;
        color: #c9d1d9;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 280px;
        line-height: 1.5;
        box-shadow: 0 4px 16px rgba(0,0,0,.4);
        opacity: 0;
        transform: translateY(6px);
        transition: opacity .25s, transform .25s;
        pointer-events: none;
      }
      #gfghub-toast.show { opacity: 1; transform: translateY(0); }
      #gfghub-toast.t-success { border-color: #3fb950; color: #3fb950; }
      #gfghub-toast.t-error   { border-color: #f85149; color: #f85149; }
      #gfghub-toast.t-info    { border-color: #388bfd; color: #58a6ff; }
      #gfghub-btn .gfghub-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #3fb950;
        display: none;
        flex-shrink: 0;
        animation: gfghub-pulse 1.4s infinite;
      }
      #gfghub-btn.gfghub-detected .gfghub-dot { display: block; }
      @keyframes gfghub-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(63,185,80,.7); }
        70%  { box-shadow: 0 0 0 6px rgba(63,185,80,0); }
        100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); }
      }
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'gfghub-btn';
    btn.title = 'Push current code to GitHub (GFGHub)';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
           xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
        <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53
          5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49
          -2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
          1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78
          -.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08
          -2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09
          2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
          1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0
          1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16
          8c0-4.42-3.58-8-8-8z"/>
      </svg>
      <span class="gfghub-label">GFGHub</span>
      <span class="gfghub-dot"></span>
    `;
    btn.addEventListener('click', () => pushCurrentCode({ manual: true }));
    document.body.appendChild(btn);

    const toast = document.createElement('div');
    toast.id = 'gfghub-toast';
    document.body.appendChild(toast);
  }

  function setButtonState(state, labelText) {
    // Update floating button
    const btn = document.getElementById('gfghub-btn');
    if (btn) {
      btn.classList.remove('gfghub-pushing', 'gfghub-success', 'gfghub-error', 'gfghub-detected');
      const label = btn.querySelector('.gfghub-label');
      switch (state) {
        case 'idle':
          if (label) label.textContent = 'GFGHub'; break;
        case 'detected':
          btn.classList.add('gfghub-detected');
          if (label) label.textContent = labelText || 'Push now!'; break;
        case 'pushing':
          btn.classList.add('gfghub-pushing');
          if (label) label.textContent = 'Pushing…'; break;
        case 'success':
          btn.classList.add('gfghub-success');
          if (label) label.textContent = '✓ Pushed!';
          // Stay green — no auto-revert
          break;
        case 'error':
          btn.classList.add('gfghub-error');
          if (label) label.textContent = '✕ Failed';
          setTimeout(() => setButtonState('idle'), 5000); break;
      }
    }
    // Sync toolbar button too
    setToolbarBtnState(state, labelText);
  }

  function showToast(msg, type = 'info', duration = 4000) {
    const toast = document.getElementById('gfghub-toast');
    if (!toast) return;
    clearTimeout(_toastTimer);
    toast.className = `show t-${type}`;
    toast.textContent = msg;
    _toastTimer = setTimeout(() => {
      toast.className = '';
    }, duration);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LAYER 1 — Hook GFG's Submit button → poll for verdict
  // ═════════════════════════════════════════════════════════════════════════

  function hookSubmitButton() {
    let attempts = 0;
    const tryHook = setInterval(() => {
      attempts++;
      const btn = findSubmitButton();
      if (btn) {
        clearInterval(tryHook);
        attachSubmitListener(btn);
      }
      if (attempts > 40) clearInterval(tryHook);
    }, 500);
  }

  function attachSubmitListener(btn) {
    if (btn.__gfghub_hooked) return;
    btn.__gfghub_hooked = true;
    btn.addEventListener('click', () => {
      if (_isWatching) return;
      _isWatching = true;
      showToast('⏳ Waiting for verdict…', 'info', 18000);
      pollForVerdict();
    });
  }

  function pollForVerdict() {
    let elapsed = 0;
    const MAX   = 30000;
    const TICK  = 700;

    clearInterval(_pollTimer);
    _pollTimer = setInterval(() => {
      elapsed += TICK;
      const { found, el } = detectVerdictInDOM();
      if (found) {
        clearInterval(_pollTimer);
        _isWatching = false;
        clearTimeout(_toastTimer);

        if (isAcceptedElement(el)) {
          handleAccepted();
        } else {
          showToast('Not accepted. Fix the solution and try again.', 'error', 4000);
          setButtonState('idle');
        }
        return;
      }
      if (elapsed >= MAX) {
        clearInterval(_pollTimer);
        _isWatching = false;
        showToast('Verdict not detected. Click GFGHub to push manually.', 'info', 5000);
        setButtonState('detected', 'Push manually');
      }
    }, TICK);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LAYER 2 — MutationObserver (text-based)
  // ═════════════════════════════════════════════════════════════════════════

  function hookMutationObserver() {
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (isAcceptedElement(node)) {
            handleAccepted();
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── Verdict utilities ─────────────────────────────────────────────────────────

  function detectVerdictInDOM() {
    const allEls = document.body.getElementsByTagName('*');
    for (const el of allEls) {
      // Only look at "leaf-like" elements to avoid picking up full page text
      if (el.children.length > 6) continue;
      const t = (el.textContent || '').toLowerCase().trim();
      if (t.length === 0 || t.length > 200) continue;
      if (ACCEPTED_TEXTS.some((kw) => t.includes(kw))) return { found: true, el };
      if (
        t.includes('wrong answer') || t.includes('time limit') ||
        t.includes('memory limit') || t.includes('runtime error') ||
        t.includes('compilation error')
      ) return { found: true, el };
    }
    return { found: false, el: null };
  }

  function isAcceptedElement(el) {
    if (!el) return false;
    const text = (el.textContent || '').toLowerCase();
    const hasAccepted = ACCEPTED_TEXTS.some((t) => text.includes(t));
    const isWrong = (
      text.includes('wrong answer')      ||
      text.includes('time limit')        ||
      text.includes('memory limit')      ||
      text.includes('runtime error')     ||
      text.includes('compilation error') ||
      text.includes('incorrect')
    );
    return hasAccepted && !isWrong;
  }

  function handleAccepted() {
    const slug = getProblemSlug();
    if (!slug) return;
    if (slug === _autoSlug && _autoTriggered) return;
    _autoSlug      = slug;
    _autoTriggered = true;
    _accepted      = true;   // unlock the Push button
    setTimeout(() => { _autoTriggered = false; }, 8000);

    clearTimeout(_toastTimer);
    showToast('✓ Accepted! Auto-pushing to GitHub…', 'success', 6000);
    setButtonState('pushing');
    // Small delay so the verdict animation settles before we read the DOM
    setTimeout(() => pushCurrentCode({ manual: false }), 800);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Push to GitHub
  // ═════════════════════════════════════════════════════════════════════════

  function pushCurrentCode({ manual }) {
    if (_pushCooldown) {
      showToast('Push already in progress…', 'info', 2000);
      return;
    }

    // Block push until GFG shows an accepted verdict
    if (!_accepted) {
      showToast('⚠️ Submit your solution first. Push is only allowed after GFG shows Accepted.', 'error', 5000);
      return;
    }

    const slug         = getProblemSlug();
    const langInfo     = getLanguage();
    const code         = getCode();
    const problemTitle = getProblemTitle();
    const description  = getProblemDescription();
    const meta         = getProblemMeta();
    const safeTitle    = sanitizeTitle(problemTitle || slug);

    if (!slug) {
      showToast('Could not detect problem from URL.', 'error');
      return;
    }
    if (!code || code.trim().length < 5) {
      console.warn('[GFGHub] getCode() failed. DOM check:',
        '.cm-content:', !!document.querySelector('.cm-content'),
        '.cm-line count:', document.querySelectorAll('.cm-line').length,
        '.view-line count:', document.querySelectorAll('.view-lines .view-line').length,
        '.ace_line count:', document.querySelectorAll('.ace_content .ace_line').length
      );
      showToast('Could not read code from editor. Make sure there is code in the editor.', 'error', 5000);
      return;
    }

    chrome.storage.sync.get(['gh_token', 'gh_username'], (data) => {
      if (!data.gh_token || !data.gh_username) {
        showToast('GFGHub not set up. Click the extension icon in the toolbar.', 'error', 5000);
        return;
      }
      _pushCooldown = true;
      setTimeout(() => { _pushCooldown = false; }, 8000);
      setButtonState('pushing');

      chrome.runtime.sendMessage({
        type        : 'PUSH_TO_GITHUB',
        folderName  : safeTitle,
        fileName    : `${safeTitle}.${langInfo.ext}`,
        code,
        language    : langInfo.name,
        problemTitle: problemTitle || slug,
        description,
        meta,
        manual,
      }).catch((err) => {
        console.error('[GFGHub] sendMessage failed:', err);
        _pushCooldown = false;
        setButtonState('error');
        showToast('Extension error. Try reloading the page.', 'error', 5000);
      });
    });
  }

  // ── Background response listener ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'PUSH_STATUS') return;
    if (msg.status === 'success') {
      setButtonState('success');
      showToast(`✓ Pushed: ${msg.problem}`, 'success', 5000);
    } else if (msg.status === 'error') {
      setButtonState('error');
      showToast(`✕ Push failed: ${msg.error}`, 'error', 5000);
    } else if (msg.status === 'loading') {
      setButtonState('pushing');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  Extractors: slug, title, language, code
  // ═════════════════════════════════════════════════════════════════════════

  function getProblemSlug() {
    const m = window.location.pathname.match(/\/problems\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /** Convert URL slug to readable title: "find-length-of-loop" → "Find Length Of Loop" */
  function slugToTitle(slug) {
    return slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function getProblemTitle() {
    const slug = getProblemSlug();

    // If any matched element contains these words it's a breadcrumb/nav element, not the title
    const BAD_PATTERNS = /\b(easy|medium|hard|basic|c\+\+|java|python|javascript|sql|accuracy|submissions?|solution)\b/i;

    const selectors = [
      '[class*="ProblemPage"] h1',
      '[class*="problem-statement"] h1',
      '[class*="problem-statement"] h2',
      '[class*="problemTitle"]',
      '[class*="problem_title"]',
      '.problems_header_content__title',
      '.problem-name',
      'h1[class*="title"]',
      '.header_content h2',
      'h1',
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (!el) continue;
      const t = el.textContent.trim()
        .replace(/\s*\d{3,}\s*$/, '')  // strip trailing IDs like "4004"
        .replace(/\s+/g, ' ')
        .trim();
      if (t && t.length > 2 && t.length < 120 && !BAD_PATTERNS.test(t)) return t;
    }

    // Reliable fallback: derive title directly from the URL slug
    return slug ? slugToTitle(slug) : 'Solution';
  }

  function getLanguage() {
    // 1. Check <select> dropdowns (legacy GFG)
    for (const sel of document.querySelectorAll('select')) {
      const val  = (sel.value || '').toLowerCase().trim();
      if (LANG_MAP[val]) return LANG_MAP[val];
      const text = (sel.options[sel.selectedIndex]?.text || '').toLowerCase().trim();
      if (LANG_MAP[text]) return LANG_MAP[text];
    }
    // 2. New GFG UI: custom language dropdown trigger (button/div showing active lang)
    const langSelectors = [
      '[class*="languageSelector"]', '[class*="LanguageSelector"]',
      '[class*="language-selector"]', '[class*="lang-selector"]',
      '[class*="language_dropdown"]', '[class*="languageSection"]',
      '[class*="selectedLanguage"]', '[class*="language-btn"]',
      '[class*="lang_dropdown"]', '[class*="langBtn"]',
      '[id*="language"]',
    ];
    for (const s of langSelectors) {
      const el = document.querySelector(s);
      if (!el) continue;
      // Use innerText (visible text only, not hidden child spans)
      const t = (el.innerText || el.textContent || '').toLowerCase().trim();
      for (const key of Object.keys(LANG_MAP)) {
        if (t === key || t.startsWith(key + ' ') || t.endsWith(' ' + key)) return LANG_MAP[key];
      }
      // broader match as fallback
      for (const key of Object.keys(LANG_MAP)) {
        if (t.includes(key)) return LANG_MAP[key];
      }
    }
    // 3. Scan the editor toolbar area for any element whose text is exactly a language name
    const toolbar = document.querySelector('[class*="editor_toolbar"], [class*="editorToolbar"], [class*="EditorToolbar"], [class*="editor-header"]');
    if (toolbar) {
      const t = (toolbar.innerText || '').toLowerCase();
      for (const key of Object.keys(LANG_MAP)) {
        if (t.includes(key)) return LANG_MAP[key];
      }
    }
    return { name: 'C++', ext: 'cpp' }; // GFG default
  }

  function getCode() {
    // NOTE: Content scripts run in an isolated JS world — window.monaco / window.ace
    // are NOT accessible. All strategies below read the DOM directly.

    // ── Strategy 1: CodeMirror 6 (.cm-content[contenteditable]) ──────────────
    // GFG's current editor. Each line is a .cm-line inside .cm-content.
    const cmContent = document.querySelector('.cm-content[contenteditable]');
    if (cmContent) {
      const lines = Array.from(cmContent.querySelectorAll('.cm-line'));
      if (lines.length > 0) {
        const code = lines.map(l => l.textContent).join('\n');
        if (code.trim()) return code;
      }
      // fallback: innerText of entire content area
      const raw = (cmContent.innerText || cmContent.textContent || '').trim();
      if (raw) return raw;
    }

    // ── Strategy 2: CodeMirror 6 — any .cm-editor wrapper ─────────────────────
    for (const ed of document.querySelectorAll('.cm-editor')) {
      const content = ed.querySelector('.cm-content');
      if (!content) continue;
      const lines = Array.from(content.querySelectorAll('.cm-line'));
      const code  = lines.map(l => l.textContent).join('\n');
      if (code.trim()) return code;
    }

    // ── Strategy 3: CodeMirror 5 — DOM lines ──────────────────────────────────
    for (const cmEl of document.querySelectorAll('.CodeMirror')) {
      // JS API (only works in page world, usually undefined in content scripts)
      if (cmEl.CodeMirror) {
        const v = cmEl.CodeMirror.getValue();
        if (v && v.trim()) return v;
      }
      // DOM fallback
      const lines = Array.from(cmEl.querySelectorAll('.CodeMirror-line'));
      if (lines.length > 0) {
        const code = lines.map(l => l.textContent).join('\n');
        if (code.trim()) return code;
      }
    }

    // ── Strategy 4: Monaco — read sorted .view-line DOM nodes ─────────────────
    // Monaco renders each line as a div.view-line with a `top` px style.
    const monacoLines = document.querySelectorAll('.view-lines .view-line');
    if (monacoLines.length > 0) {
      const sorted = Array.from(monacoLines).sort((a, b) => {
        return (parseInt(a.style.top) || 0) - (parseInt(b.style.top) || 0);
      });
      const code = sorted.map(l => l.textContent).join('\n');
      if (code.trim()) return code;
    }

    // ── Strategy 5: ACE editor — .ace_line DOM nodes ──────────────────────────
    const aceLines = document.querySelectorAll('.ace_content .ace_line');
    if (aceLines.length > 0) {
      const code = Array.from(aceLines).map(l => l.textContent).join('\n');
      if (code.trim()) return code;
    }

    // ── Strategy 6: Textarea ──────────────────────────────────────────────────
    for (const ta of document.querySelectorAll('textarea')) {
      if (ta.value && ta.value.trim().length > 5) return ta.value;
    }

    // ── Strategy 7: Any contenteditable inside an editor container ────────────
    for (const ed of document.querySelectorAll('[contenteditable="true"]')) {
      if (!ed.closest('[class*="editor"], [class*="Editor"]')) continue;
      const t = (ed.innerText || ed.textContent || '').trim();
      if (t.length > 5) return t;
    }

    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Strip chars that are invalid in GitHub filenames/folder names */
  function sanitizeTitle(title) {
    return title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // invalid filename chars
      .replace(/\s+/g, ' ')                     // collapse whitespace
      .trim()
      .slice(0, 100) || 'solution';
  }

  /** Extract the problem description text from the GFG page */
  function getProblemDescription() {
    const selectors = [
      '[class*="problem-statement"]',
      '[class*="problemStatement"]',
      '[class*="ProblemStatement"]',
      '[class*="problem_statement"]',
      '[class*="question_content"]',
      '[class*="questionContent"]',
      '[class*="content__"]',
      '.problems_problem_content__Xm_eO',
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t.length > 20) return t;
      }
    }
    return '';
  }

  /** Extract difficulty, accuracy, points etc from the GFG page header */
  function getProblemMeta() {
    const meta = { difficulty: '', accuracy: '', submissions: '', points: '', averageTime: '', url: window.location.href };
    // Difficulty badge
    const diffSelectors = [
      '[class*="difficulty"]', '[class*="Difficulty"]',
      '[class*="level"]',
    ];
    for (const s of diffSelectors) {
      const el = document.querySelector(s);
      if (el) {
        const t = (el.innerText || '').trim();
        if (t && t.length < 30) { meta.difficulty = t; break; }
      }
    }
    // Accuracy, points, submissions, average time — scan header area
    const header = document.querySelector(
      '[class*="problems_header"], [class*="problemHeader"], [class*="ProblemHeader"]'
    );
    if (header) {
      const raw = (header.innerText || '');
      const accM  = raw.match(/Accuracy[:\s]+([\d.]+%?)/i);
      if (accM) meta.accuracy    = accM[1];
      const ptM   = raw.match(/Points[:\s]+(\d+)/i);
      if (ptM)  meta.points      = ptM[1];
      const subM  = raw.match(/Submissions[:\s]+([\d.KkMm+]+)/i);
      if (subM) meta.submissions = subM[1];
      const avgM  = raw.match(/Average\s+Time[:\s]+([^\n]+)/i);
      if (avgM) meta.averageTime = avgM[1].trim();
    }
    return meta;
  }

  // ── SPA navigation watcher ────────────────────────────────────────────────────
  function observeURLChanges(cb) {
    let lastURL = location.href;
    new MutationObserver(() => {
      if (location.href !== lastURL) {
        lastURL = location.href;
        // Reset accepted flag when navigating to a new problem
        _accepted = false;
        setTimeout(() => {
          injectFloatingButton();
          cb();
        }, 1200);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
