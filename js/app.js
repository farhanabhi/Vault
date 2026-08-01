/**
 * Vault — app.js
 * All application state lives in memory only while unlocked.
 * Nothing in this file makes a network request.
 */
(function () {
  'use strict';

  const escapeHTML = VaultMarkdown.escapeHTML;
  const escapeAttr = VaultMarkdown.escapeHTML;

  const DEFAULT_TAGS = ['Documents', 'Cards', 'Passwords', 'Notes', 'Photos', 'Other'];
  const TAG_PALETTE = ['#c9a464', '#7c93b0', '#4fbf7a', '#e5484d', '#8a7cf0', '#e0b04f', '#5fb8c9', '#c97cae'];

  const overlay = document.getElementById('overlay');
  const sheetContainer = document.getElementById('sheetContainer');

  const state = {
    cryptoKey: null,
    authMode: null,
    settings: null,
    entries: [],
    currentView: 'all',
    activeTagFilter: null,
    searchQuery: '',
    setupPinFirst: '',
    lockFailCount: 0,
    lockThrottleUntil: 0,
    activeBlobUrls: new Set()
  };

  let setupPinPad = null;
  let lockPinPad = null;
  let inactivityTimeout = null;

  // ------------------------------------------------------------------
  // Small utilities
  // ------------------------------------------------------------------
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function tagColor(tag) {
    let hash = 0;
    const s = tag || 'Other';
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return TAG_PALETTE[hash % TAG_PALETTE.length];
  }

  function getAllTagOptions() {
    const custom = (state.settings && state.settings.customTags) || [];
    return [...DEFAULT_TAGS, ...custom];
  }

  function guessTagForMime(mime) {
    if (!mime) return 'Other';
    if (mime.startsWith('image/')) return 'Photos';
    if (mime === 'application/pdf' || mime.includes('word') || mime.includes('document') || mime === 'text/plain') return 'Documents';
    return 'Other';
  }

  function fileIconFor(mime) {
    if (mime && mime.startsWith('image/')) return VaultIcons.image;
    if (mime === 'application/pdf') return VaultIcons.pdf;
    return VaultIcons.file;
  }

  function paintIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      if (VaultIcons[name]) el.innerHTML = VaultIcons[name];
    });
  }

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------
  let toastTimeout = null;
  function showToast(msg, danger) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('is-danger', !!danger);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => { el.hidden = true; }, 220);
    }, 2200);
  }

  // ------------------------------------------------------------------
  // Screen management
  // ------------------------------------------------------------------
  function showScreen(id) {
    ['screen-setup', 'screen-lock', 'screen-main', 'screen-settings'].forEach((s) => {
      document.getElementById(s).hidden = s !== id;
    });
  }

  // ------------------------------------------------------------------
  // Overlay / bottom sheet
  // ------------------------------------------------------------------
  function openSheet(html, opts) {
    opts = opts || {};
    sheetContainer.innerHTML = html;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (opts.onMount) opts.onMount(sheetContainer);
  }

  function closeSheet() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    sheetContainer.innerHTML = '';
    document.body.style.overflow = '';
    revokeActiveBlobUrls();
    if (overlay._pendingResolve) {
      const fn = overlay._pendingResolve;
      overlay._pendingResolve = null;
      fn();
    }
  }

  function revokeActiveBlobUrls() {
    state.activeBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    state.activeBlobUrls.clear();
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      openSheet(`
        <div class="sheet-handle"></div>
        <div class="confirm-body">
          <div class="confirm-icon">${opts.icon || VaultIcons.warning}</div>
          <h2>${escapeHTML(opts.title)}</h2>
          <p>${escapeHTML(opts.message)}</p>
        </div>
        <div class="sheet-actions">
          <button class="btn btn-secondary" id="confirmCancelBtn">${escapeHTML(opts.cancelLabel || 'Cancel')}</button>
          <button class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" id="confirmOkBtn">${escapeHTML(opts.confirmLabel || 'Continue')}</button>
        </div>
      `, {
        onMount(root) {
          let resolved = false;
          root.querySelector('#confirmCancelBtn').addEventListener('click', () => { resolved = true; closeSheet(); resolve(false); });
          root.querySelector('#confirmOkBtn').addEventListener('click', () => { resolved = true; closeSheet(); resolve(true); });
          overlay._pendingResolve = () => { if (!resolved) resolve(false); };
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // PIN dial component (signature element)
  // ------------------------------------------------------------------
  const PIN_LENGTH = 6;

  function createPinPad(root, opts) {
    let digits = '';
    root.innerHTML = `
      <div class="pinpad">
        <div class="dial">
          <div class="dial-dots">${Array.from({ length: PIN_LENGTH }).map(() => '<span class="dial-dot"></span>').join('')}</div>
        </div>
        <div class="keypad"></div>
      </div>`;
    const dial = root.querySelector('.dial');
    const dots = Array.from(root.querySelectorAll('.dial-dot'));
    const keypad = root.querySelector('.keypad');

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
    keypad.innerHTML = keys.map((k) => {
      if (k === '') return '<span></span>';
      if (k === 'back') return `<button type="button" class="key key-ghost" data-key="back" aria-label="Backspace">${VaultIcons.backspace}</button>`;
      return `<button type="button" class="key" data-key="${k}">${k}</button>`;
    }).join('');

    function updateDots() {
      dial.style.setProperty('--fill', String(Math.round((digits.length / PIN_LENGTH) * 100)));
      dots.forEach((d, i) => d.classList.toggle('is-filled', i < digits.length));
    }

    function reset() {
      digits = '';
      updateDots();
    }

    function shake() {
      dial.classList.remove('is-shake');
      void dial.offsetWidth;
      dial.classList.add('is-shake');
      if (navigator.vibrate) navigator.vibrate([40, 50, 40]);
    }

    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.key');
      if (!btn) return;
      const k = btn.getAttribute('data-key');
      if (k === 'back') {
        digits = digits.slice(0, -1);
        updateDots();
        return;
      }
      if (digits.length >= PIN_LENGTH) return;
      digits += k;
      updateDots();
      if (digits.length === PIN_LENGTH) {
        const final = digits;
        setTimeout(() => { if (opts.onComplete) opts.onComplete(final); }, 130);
      }
    });

    updateDots();
    return { reset, shake, getDigits: () => digits };
  }

  // ------------------------------------------------------------------
  // Setup screen
  // ------------------------------------------------------------------
  function initSetupScreen() {
    const modeSwitch = document.getElementById('setupModeSwitch');
    const pinArea = document.getElementById('setupPinArea');
    const pwArea = document.getElementById('setupPasswordArea');

    function setMode(mode) {
      modeSwitch.querySelectorAll('.segmented-btn').forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      pinArea.hidden = mode !== 'pin';
      pwArea.hidden = mode !== 'password';
      if (mode === 'pin') mountPinStage('create');
    }

    function mountPinStage(stage) {
      pinArea.innerHTML = `<p class="muted" style="text-align:center;margin-bottom:18px;">${stage === 'create' ? 'Choose a 6-digit PIN' : 'Confirm your PIN'}</p><div id="setupPinPadHost"></div>`;
      setupPinPad = createPinPad(document.getElementById('setupPinPadHost'), {
        onComplete: async (digits) => {
          if (stage === 'create') {
            state.setupPinFirst = digits;
            mountPinStage('confirm');
          } else if (digits === state.setupPinFirst) {
            await finalizeSetup(digits, 'pin');
          } else {
            setupPinPad.shake();
            showToast('PINs did not match — try again', true);
            state.setupPinFirst = '';
            mountPinStage('create');
          }
        }
      });
    }

    modeSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (btn) setMode(btn.dataset.mode);
    });

    const pw1 = document.getElementById('setupPw1');
    const pw2 = document.getElementById('setupPw2');
    const submitBtn = document.getElementById('setupPwSubmit');
    const meterBar = document.querySelector('#strengthMeter span');

    function evalStrength() {
      const val = pw1.value;
      let score = 0;
      if (val.length >= 8) score++;
      if (val.length >= 12) score++;
      if (/[0-9]/.test(val) && /[a-zA-Z]/.test(val)) score++;
      if (/[^a-zA-Z0-9]/.test(val)) score++;
      const pct = [0, 25, 55, 80, 100][score];
      const colors = ['#5c6270', '#e5484d', '#e0b04f', '#7c93b0', '#4fbf7a'];
      meterBar.style.setProperty('--w', pct + '%');
      meterBar.style.setProperty('--bar', colors[score]);
      submitBtn.disabled = !(pw1.value.length >= 6 && pw1.value === pw2.value);
    }
    pw1.addEventListener('input', evalStrength);
    pw2.addEventListener('input', evalStrength);
    submitBtn.addEventListener('click', async () => { await finalizeSetup(pw1.value, 'password'); });

    setMode('pin');
  }

  async function finalizeSetup(secret, mode) {
    const salt = VaultCrypto.newSalt();
    const key = await VaultCrypto.deriveKey(secret, salt);
    const verifier = await VaultCrypto.encrypt(key, 'VAULT_UNLOCK_OK');
    await VaultDB.putMeta({ key: 'auth', salt, iterations: VaultCrypto.PBKDF2_ITERATIONS, authMode: mode, verifierIV: verifier.iv, verifierCipher: verifier.data });
    const defaultSettings = { customTags: [], autoLockMinutes: 2, createdAt: Date.now() };
    const encSettings = await VaultCrypto.encrypt(key, defaultSettings);
    await VaultDB.putMeta({ key: 'settings', iv: encSettings.iv, cipher: encSettings.data });
    state.cryptoKey = key;
    state.authMode = mode;
    state.settings = defaultSettings;
    state.entries = [];
    showToast('Vault created');
    enterMainApp();
  }

  // ------------------------------------------------------------------
  // Lock screen
  // ------------------------------------------------------------------
  function initLockScreenUI(authRec) {
    state.authMode = authRec.authMode;
    state.lockFailCount = 0;
    document.getElementById('lockTitle').textContent = authRec.authMode === 'pin' ? 'Enter your PIN' : 'Enter your password';
    hideLockError();

    const pinArea = document.getElementById('lockPinArea');
    const pwArea = document.getElementById('lockPasswordArea');

    if (authRec.authMode === 'pin') {
      pinArea.hidden = false;
      pwArea.hidden = true;
      pinArea.innerHTML = '';
      lockPinPad = createPinPad(pinArea, { onComplete: (digits) => attemptUnlock(digits) });
    } else {
      pinArea.hidden = true;
      pwArea.hidden = false;
      const input = document.getElementById('lockPwInput');
      input.value = '';
      document.getElementById('lockPwSubmit').onclick = () => attemptUnlock(input.value);
    }
  }

  function showLockError(msg) {
    const el = document.getElementById('lockError');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideLockError() {
    document.getElementById('lockError').hidden = true;
  }

  async function attemptUnlock(secret) {
    if (Date.now() < state.lockThrottleUntil) {
      const wait = Math.ceil((state.lockThrottleUntil - Date.now()) / 1000);
      showLockError(`Too many attempts. Try again in ${wait}s.`);
      if (lockPinPad) lockPinPad.reset();
      return;
    }
    const authRec = await VaultDB.getMeta('auth');
    try {
      const key = await VaultCrypto.deriveKey(secret, authRec.salt, authRec.iterations);
      await VaultCrypto.decrypt(key, authRec.verifierIV, authRec.verifierCipher);
      state.cryptoKey = key;
      state.lockFailCount = 0;
      hideLockError();
      await loadSettingsAndEntries();
      enterMainApp();
    } catch (e) {
      state.lockFailCount++;
      if (state.authMode === 'pin' && lockPinPad) { lockPinPad.shake(); lockPinPad.reset(); }
      if (state.lockFailCount >= 5) {
        const delaySec = Math.min(30, 5 * (state.lockFailCount - 4));
        state.lockThrottleUntil = Date.now() + delaySec * 1000;
        showLockError(`Too many attempts. Try again in ${delaySec}s.`);
      } else {
        showLockError(state.authMode === 'pin' ? 'Incorrect PIN' : 'Incorrect password');
      }
    }
  }

  async function loadSettingsAndEntries() {
    const settingsRec = await VaultDB.getMeta('settings');
    state.settings = await VaultCrypto.decrypt(state.cryptoKey, settingsRec.iv, settingsRec.cipher, false);
    const rawEntries = await VaultDB.getAllEntries();
    const decrypted = [];
    for (const e of rawEntries) {
      try {
        const meta = await VaultCrypto.decrypt(state.cryptoKey, e.metaIV, e.metaCipher, false);
        decrypted.push(Object.assign({ id: e.id, type: e.type, createdAt: e.createdAt, updatedAt: e.updatedAt }, meta));
      } catch (err) {
        console.error('Failed to decrypt entry', e.id, err);
      }
    }
    decrypted.sort((a, b) => b.updatedAt - a.updatedAt);
    state.entries = decrypted;
  }

  async function lockVault() {
    if (!state.cryptoKey) return;
    stopInactivityTimer();
    closeSheet();
    state.cryptoKey = null;
    state.entries = [];
    state.activeTagFilter = null;
    state.searchQuery = '';
    const authRec = await VaultDB.getMeta('auth');
    initLockScreenUI(authRec);
    showScreen('screen-lock');
  }

  // ------------------------------------------------------------------
  // Inactivity / visibility auto-lock
  // ------------------------------------------------------------------
  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

  function startInactivityTimer() {
    restartInactivityTimer();
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, restartInactivityTimer, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', lockVault);
  }
  function stopInactivityTimer() {
    clearTimeout(inactivityTimeout);
    ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, restartInactivityTimer));
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', lockVault);
  }
  function restartInactivityTimer() {
    clearTimeout(inactivityTimeout);
    const minutes = (state.settings && state.settings.autoLockMinutes) || 2;
    inactivityTimeout = setTimeout(lockVault, minutes * 60 * 1000);
  }
  function handleVisibilityChange() {
    if (document.hidden) lockVault();
  }

  // ------------------------------------------------------------------
  // Main app shell
  // ------------------------------------------------------------------
  function enterMainApp() {
    state.currentView = 'all';
    state.activeTagFilter = null;
    state.searchQuery = '';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === 'all'));
    document.getElementById('searchBar').hidden = true;
    document.getElementById('searchInput').value = '';
    showScreen('screen-main');
    renderTagBar();
    renderList();
    startInactivityTimer();
  }

  function renderTagBar() {
    const tagBar = document.getElementById('tagBar');
    const tags = getAllTagOptions();
    const allBtn = `<button class="tag-chip${!state.activeTagFilter ? ' is-active' : ''}" data-tag="">All tags</button>`;
    const chips = tags.map((t) => `<button class="tag-chip${state.activeTagFilter === t ? ' is-active' : ''}" data-tag="${escapeAttr(t)}"><span class="dot" style="background:${tagColor(t)}"></span>${escapeHTML(t)}</button>`);
    tagBar.innerHTML = allBtn + chips.join('');
  }

  function getFilteredEntries() {
    let list = state.entries;
    if (state.currentView === 'notes') list = list.filter((e) => e.type === 'note');
    if (state.currentView === 'files') list = list.filter((e) => e.type === 'file');
    if (state.activeTagFilter) list = list.filter((e) => (e.tag || 'Other') === state.activeTagFilter);
    if (state.searchQuery) {
      const q = state.searchQuery;
      list = list.filter((e) => {
        const hay = [e.title, e.filename, e.tag, e.content].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }

  function entryRowHTML(e) {
    const isNote = e.type === 'note';
    const icon = isNote ? VaultIcons.note : fileIconFor(e.mimeType);
    const sizeText = isNote ? '' : formatBytes(e.size);
    const title = e.title || (isNote ? 'Untitled note' : e.filename) || 'Untitled';
    return `
      <div class="item-row" data-id="${e.id}">
        <div class="item-icon ${isNote ? 'type-note' : ''}">${icon}</div>
        <div class="item-body">
          <div class="item-title">${escapeHTML(title)}</div>
          <div class="item-meta">
            <span class="tag-dot" style="background:${tagColor(e.tag || 'Other')}"></span>
            <span>${escapeHTML(e.tag || 'Other')}</span>
            <span>·</span>
            <span>${formatDate(e.updatedAt)}</span>
            ${sizeText ? `<span>·</span><span>${sizeText}</span>` : ''}
          </div>
        </div>
        <button class="item-delete" data-delete-id="${e.id}" aria-label="Delete">${VaultIcons.trash}</button>
      </div>`;
  }

  function renderList() {
    const list = getFilteredEntries();
    const listItems = document.getElementById('listItems');
    const emptyState = document.getElementById('emptyState');
    const emptySub = document.getElementById('emptySub');
    if (!list.length) {
      listItems.innerHTML = '';
      emptyState.hidden = false;
      if (state.searchQuery) emptySub.textContent = 'No matches for your search.';
      else if (state.activeTagFilter) emptySub.textContent = `No items tagged "${state.activeTagFilter}" yet.`;
      else if (state.currentView === 'notes') emptySub.textContent = 'Tap + to write your first note.';
      else if (state.currentView === 'files') emptySub.textContent = 'Tap + to upload your first file.';
      else emptySub.textContent = 'Tap + to add your first note or file.';
    } else {
      emptyState.hidden = true;
      listItems.innerHTML = list.map(entryRowHTML).join('');
    }
  }

  function handleListClick(e) {
    const delBtn = e.target.closest('.item-delete');
    if (delBtn) {
      e.stopPropagation();
      confirmDeleteEntry(delBtn.getAttribute('data-delete-id'));
      return;
    }
    const row = e.target.closest('.item-row');
    if (row) openEntry(row.getAttribute('data-id'));
  }

  function openEntry(id) {
    const entry = state.entries.find((x) => x.id === id);
    if (!entry) return;
    if (entry.type === 'note') openNoteEditor(id);
    else openFileViewer(id);
  }

  function confirmDeleteEntry(id) {
    const entry = state.entries.find((x) => x.id === id);
    if (!entry) return;
    const title = entry.title || entry.filename || 'Untitled';
    confirmDialog({
      icon: VaultIcons.trash,
      title: `Delete this ${entry.type === 'note' ? 'note' : 'file'}?`,
      message: `"${title}" will be permanently removed from this device. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true
    }).then(async (ok) => {
      if (!ok) return;
      await VaultDB.deleteEntry(id);
      state.entries = state.entries.filter((x) => x.id !== id);
      renderList();
      showToast('Deleted');
    });
  }

  // ------------------------------------------------------------------
  // Add sheet
  // ------------------------------------------------------------------
  function openAddSheet() {
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h2>Add to Vault</h2><button class="icon-btn" data-close aria-label="Close">${VaultIcons.close}</button></div>
      <div class="add-options">
        <button class="add-option" id="addNoteOption"><span class="add-option-icon">${VaultIcons.note}</span>New Note</button>
        <button class="add-option" id="addFileOption"><span class="add-option-icon">${VaultIcons.upload}</span>Upload File</button>
      </div>
      <input type="file" id="hiddenFileInput" hidden accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,.csv" />
    `, {
      onMount(root) {
        root.querySelector('#addNoteOption').addEventListener('click', () => { closeSheet(); openNoteEditor(null); });
        const fileInput = root.querySelector('#hiddenFileInput');
        root.querySelector('#addFileOption').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          closeSheet();
          if (file) await handleFileUpload(file);
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // Notes
  // ------------------------------------------------------------------
  function openNoteEditor(entryId) {
    const existing = entryId ? state.entries.find((x) => x.id === entryId) : null;
    const allTags = getAllTagOptions();
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h2>${existing ? 'Edit Note' : 'New Note'}</h2><button class="icon-btn" data-close aria-label="Close">${VaultIcons.close}</button></div>
      <div class="form-field">
        <label for="noteTitleInput">Title</label>
        <input type="text" id="noteTitleInput" placeholder="Untitled note" value="${existing ? escapeAttr(existing.title || '') : ''}" />
      </div>
      <div class="form-field">
        <label for="noteTagSelect">Tag</label>
        <select id="noteTagSelect">${allTags.map((t) => `<option value="${escapeAttr(t)}" ${existing && existing.tag === t ? 'selected' : ''}>${escapeHTML(t)}</option>`).join('')}</select>
      </div>
      <div class="editor-toolbar">
        <button type="button" class="btn-small is-active" data-editor-mode="write">Write</button>
        <button type="button" class="btn-small" data-editor-mode="preview">Preview</button>
      </div>
      <div class="form-field" id="noteWriteWrap">
        <textarea id="noteContentInput" placeholder="Write in markdown… **bold**, *italic*, # heading, - list">${existing ? escapeHTML(existing.content || '') : ''}</textarea>
      </div>
      <div class="md-preview" id="notePreview" hidden></div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-primary" id="saveNoteBtn">Save</button>
      </div>
      ${existing ? `<button class="btn btn-secondary btn-block" id="deleteNoteBtn" style="margin-top:10px;color:var(--danger);">Delete Note</button>` : ''}
    `, {
      onMount(root) {
        const writeWrap = root.querySelector('#noteWriteWrap');
        const preview = root.querySelector('#notePreview');
        const textarea = root.querySelector('#noteContentInput');
        root.querySelectorAll('[data-editor-mode]').forEach((btn) => {
          btn.addEventListener('click', () => {
            root.querySelectorAll('[data-editor-mode]').forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            if (btn.dataset.editorMode === 'preview') {
              preview.innerHTML = VaultMarkdown.render(textarea.value) || '<p class="muted">Nothing to preview yet.</p>';
              writeWrap.hidden = true;
              preview.hidden = false;
            } else {
              writeWrap.hidden = false;
              preview.hidden = true;
            }
          });
        });
        root.querySelector('#saveNoteBtn').addEventListener('click', () => saveNote(entryId, root));
        const delBtn = root.querySelector('#deleteNoteBtn');
        if (delBtn) delBtn.addEventListener('click', () => { closeSheet(); confirmDeleteEntry(entryId); });
        root.querySelector('#noteTitleInput').focus();
      }
    });
  }

  async function saveNote(entryId, root) {
    const title = root.querySelector('#noteTitleInput').value.trim() || 'Untitled note';
    const tag = root.querySelector('#noteTagSelect').value;
    const content = root.querySelector('#noteContentInput').value;
    const now = Date.now();
    const meta = { title, content, tag };
    const enc = await VaultCrypto.encrypt(state.cryptoKey, meta);
    const id = entryId || makeId();
    const existingCache = entryId ? state.entries.find((x) => x.id === id) : null;
    const createdAt = existingCache ? existingCache.createdAt : now;
    const record = { id, type: 'note', createdAt, updatedAt: now, metaIV: enc.iv, metaCipher: enc.data };
    await VaultDB.putEntry(record);
    const cacheEntry = Object.assign({ id, type: 'note', createdAt, updatedAt: now }, meta);
    const idx = state.entries.findIndex((x) => x.id === id);
    if (idx >= 0) state.entries[idx] = cacheEntry; else state.entries.unshift(cacheEntry);
    state.entries.sort((a, b) => b.updatedAt - a.updatedAt);
    closeSheet();
    renderList();
    showToast('Note saved');
  }

  // ------------------------------------------------------------------
  // Files
  // ------------------------------------------------------------------
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  async function handleFileUpload(file) {
    if (file.size > MAX_FILE_BYTES) {
      const proceed = await confirmDialog({
        icon: VaultIcons.warning,
        title: 'Large file',
        message: `"${file.name}" is ${formatBytes(file.size)}. Very large files can slow down this browser tab. Continue anyway?`,
        confirmLabel: 'Add anyway',
        danger: false
      });
      if (!proceed) return;
    }
    showToast('Encrypting…');
    try {
      const buf = await file.arrayBuffer();
      const dataEnc = await VaultCrypto.encrypt(state.cryptoKey, buf, true);
      const metaObj = { title: file.name, filename: file.name, tag: guessTagForMime(file.type), mimeType: file.type || 'application/octet-stream', size: file.size };
      const metaEnc = await VaultCrypto.encrypt(state.cryptoKey, metaObj);
      const now = Date.now();
      const id = makeId();
      const record = { id, type: 'file', createdAt: now, updatedAt: now, metaIV: metaEnc.iv, metaCipher: metaEnc.data, dataIV: dataEnc.iv, dataCipher: dataEnc.data };
      await VaultDB.putEntry(record);
      const cacheEntry = Object.assign({ id, type: 'file', createdAt: now, updatedAt: now }, metaObj);
      state.entries.unshift(cacheEntry);
      state.entries.sort((a, b) => b.updatedAt - a.updatedAt);
      renderList();
      showToast('File added');
    } catch (e) {
      console.error(e);
      showToast('Could not add that file', true);
    }
  }

  function openFileViewer(id) {
    const cacheEntry = state.entries.find((x) => x.id === id);
    if (!cacheEntry) return;
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h2 style="word-break:break-word;">${escapeHTML(cacheEntry.title || cacheEntry.filename)}</h2><button class="icon-btn" data-close aria-label="Close">${VaultIcons.close}</button></div>
      <div class="file-meta-row"><span>${escapeHTML(cacheEntry.tag || 'Other')}</span><span>${formatBytes(cacheEntry.size)}</span></div>
      <div class="file-preview-area" id="filePreviewArea">
        <div class="file-preview-fallback"><div class="file-preview-fallback-icon">${VaultIcons.file}</div><p class="muted">Decrypting…</p></div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" id="fileDeleteBtn">Delete</button>
        <button class="btn btn-primary" id="fileDownloadBtn">Download</button>
      </div>
    `, {
      onMount(root) {
        root.querySelector('#fileDeleteBtn').addEventListener('click', () => { closeSheet(); confirmDeleteEntry(id); });
        decryptAndPreviewFile(id, cacheEntry, root);
      }
    });
  }

  async function decryptAndPreviewFile(id, cacheEntry, root) {
    const area = root.querySelector('#filePreviewArea');
    let record;
    try {
      record = await VaultDB.getEntry(id);
      const buf = await VaultCrypto.decrypt(state.cryptoKey, record.dataIV, record.dataCipher, true);
      const blob = new Blob([buf], { type: cacheEntry.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      state.activeBlobUrls.add(url);

      if (cacheEntry.mimeType && cacheEntry.mimeType.startsWith('image/')) {
        area.innerHTML = `<img src="${url}" alt="${escapeAttr(cacheEntry.title || '')}" />`;
      } else if (cacheEntry.mimeType === 'application/pdf') {
        area.innerHTML = `<iframe src="${url}" title="PDF preview"></iframe>`;
      } else {
        area.innerHTML = `<div class="file-preview-fallback"><div class="file-preview-fallback-icon">${VaultIcons.file}</div><p class="muted">No inline preview for this file type.</p></div>`;
      }

      const dlBtn = root.querySelector('#fileDownloadBtn');
      if (dlBtn) {
        dlBtn.addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = cacheEntry.filename || cacheEntry.title || 'file';
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('Download started');
        });
      }
    } catch (e) {
      console.error(e);
      area.innerHTML = `<div class="file-preview-fallback"><div class="file-preview-fallback-icon">${VaultIcons.warning}</div><p class="muted">Couldn't decrypt this file.</p></div>`;
    }
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  function wireSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    let debounceId = null;

    document.getElementById('searchToggleBtn').addEventListener('click', () => {
      searchBar.hidden = !searchBar.hidden;
      if (!searchBar.hidden) {
        searchInput.focus();
      } else {
        searchInput.value = '';
        state.searchQuery = '';
        renderList();
      }
    });
    document.getElementById('searchCloseBtn').addEventListener('click', () => {
      searchBar.hidden = true;
      searchInput.value = '';
      state.searchQuery = '';
      renderList();
    });
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        state.searchQuery = searchInput.value.trim().toLowerCase();
        renderList();
      }, 120);
    });
  }

  // ------------------------------------------------------------------
  // Bottom nav / topbar
  // ------------------------------------------------------------------
  function wireBottomNav() {
    document.getElementById('bottomNav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;
      const view = btn.dataset.view;
      if (view === 'settings') { openSettingsScreen(); return; }
      state.currentView = view;
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      showScreen('screen-main');
      renderList();
    });
  }

  function wireTopbarActions() {
    document.getElementById('lockNowBtn').addEventListener('click', lockVault);
  }

  // ------------------------------------------------------------------
  // Settings screen
  // ------------------------------------------------------------------
  function openSettingsScreen() {
    document.getElementById('autoLockSelect').value = String((state.settings && state.settings.autoLockMinutes) || 2);
    renderCustomTagChips();
    refreshStorageUsage();
    showScreen('screen-settings');
  }

  async function persistSettings() {
    const enc = await VaultCrypto.encrypt(state.cryptoKey, state.settings);
    await VaultDB.putMeta({ key: 'settings', iv: enc.iv, cipher: enc.data });
  }

  function renderCustomTagChips() {
    const wrap = document.getElementById('customTagChips');
    const custom = (state.settings && state.settings.customTags) || [];
    if (!custom.length) {
      wrap.innerHTML = '<p class="muted" style="font-size:12.5px;">No custom tags yet.</p>';
      return;
    }
    wrap.innerHTML = custom.map((t) => `
      <span class="chip-removable"><span style="width:7px;height:7px;border-radius:50%;background:${tagColor(t)};display:inline-block;"></span>${escapeHTML(t)}<button data-remove-tag="${escapeAttr(t)}" aria-label="Remove tag">${VaultIcons.close}</button></span>
    `).join('');
  }

  async function handleAddTag() {
    const input = document.getElementById('newTagInput');
    const name = input.value.trim();
    if (!name) return;
    const existing = getAllTagOptions().map((t) => t.toLowerCase());
    if (existing.includes(name.toLowerCase())) { showToast('That tag already exists', true); return; }
    if (state.settings.customTags.length >= 20) { showToast('Tag limit reached', true); return; }
    state.settings.customTags.push(name);
    await persistSettings();
    input.value = '';
    renderCustomTagChips();
    renderTagBar();
    showToast('Tag added');
  }

  async function handleRemoveTagClick(e) {
    const btn = e.target.closest('[data-remove-tag]');
    if (!btn) return;
    const tag = btn.getAttribute('data-remove-tag');
    state.settings.customTags = state.settings.customTags.filter((t) => t !== tag);
    await persistSettings();
    if (state.activeTagFilter === tag) state.activeTagFilter = null;
    renderCustomTagChips();
    renderTagBar();
    renderList();
  }

  async function handleAutoLockChange(e) {
    state.settings.autoLockMinutes = parseInt(e.target.value, 10) || 2;
    await persistSettings();
    restartInactivityTimer();
    showToast('Auto-lock updated');
  }

  async function refreshStorageUsage() {
    const el = document.getElementById('storageUsageText');
    const est = await VaultDB.estimateUsage();
    if (est && typeof est.usage === 'number') {
      el.textContent = `${formatBytes(est.usage)} used${est.quota ? ' of ' + formatBytes(est.quota) + ' available' : ''}`;
    } else {
      el.textContent = 'Not available in this browser';
    }
  }

  // ------------------------------------------------------------------
  // Change PIN / password
  // ------------------------------------------------------------------
  async function verifySecret(secret) {
    const authRec = await VaultDB.getMeta('auth');
    try {
      const key = await VaultCrypto.deriveKey(secret, authRec.salt, authRec.iterations);
      await VaultCrypto.decrypt(key, authRec.verifierIV, authRec.verifierCipher);
      return true;
    } catch (e) {
      return false;
    }
  }

  function openChangeSecretSheet() {
    renderChangeSecretVerifyStep();
  }

  function renderChangeSecretVerifyStep() {
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h2>Confirm it's you</h2><button class="icon-btn" data-close aria-label="Close">${VaultIcons.close}</button></div>
      <p class="muted" style="margin-bottom:16px;">Enter your current ${state.authMode === 'pin' ? 'PIN' : 'password'} to continue.</p>
      ${state.authMode === 'pin'
        ? `<div id="changeVerifyPinArea"></div>`
        : `<div class="pw-input-row"><input id="changeVerifyPwInput" type="password" autocomplete="current-password" placeholder="Current password" /></div>
           <button class="btn btn-primary btn-block" id="changeVerifyPwBtn">Continue</button>`}
      <p class="fineprint danger" id="changeVerifyError" hidden></p>
    `, {
      onMount(root) {
        if (state.authMode === 'pin') {
          const pad = createPinPad(root.querySelector('#changeVerifyPinArea'), {
            onComplete: async (digits) => {
              const ok = await verifySecret(digits);
              if (ok) { renderChangeSecretChooseStep(); }
              else {
                pad.shake();
                pad.reset();
                const err = root.querySelector('#changeVerifyError');
                err.hidden = false;
                err.textContent = 'Incorrect PIN';
              }
            }
          });
        } else {
          root.querySelector('#changeVerifyPwBtn').addEventListener('click', async () => {
            const val = root.querySelector('#changeVerifyPwInput').value;
            const ok = await verifySecret(val);
            if (ok) { renderChangeSecretChooseStep(); }
            else {
              const err = root.querySelector('#changeVerifyError');
              err.hidden = false;
              err.textContent = 'Incorrect password';
            }
          });
        }
      }
    });
  }

  function renderChangeSecretChooseStep() {
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="sheet-header"><h2>New PIN or password</h2><button class="icon-btn" data-close aria-label="Close">${VaultIcons.close}</button></div>
      <div class="segmented" id="changeModeSwitch">
        <button type="button" class="segmented-btn is-active" data-mode="pin">PIN</button>
        <button type="button" class="segmented-btn" data-mode="password">Password</button>
      </div>
      <div id="changePinArea"></div>
      <div id="changePwArea" class="password-area" hidden>
        <label class="field-label" for="changePw1">New password</label>
        <div class="pw-input-row"><input id="changePw1" type="password" autocomplete="new-password" placeholder="At least 8 characters" /></div>
        <label class="field-label" for="changePw2">Confirm password</label>
        <div class="pw-input-row"><input id="changePw2" type="password" autocomplete="new-password" placeholder="Re-enter password" /></div>
        <button class="btn btn-primary btn-block" id="changePwSubmit" disabled>Update Vault</button>
      </div>
    `, {
      onMount(root) {
        let mode = 'pin';
        let stage = 'create';
        let first = '';
        const pinArea = root.querySelector('#changePinArea');
        const pwArea = root.querySelector('#changePwArea');

        function mountPinStage(s) {
          stage = s;
          pinArea.innerHTML = `<p class="muted" style="text-align:center;margin:12px 0 18px;">${s === 'create' ? 'Choose a new 6-digit PIN' : 'Confirm your new PIN'}</p><div id="changePinPadHost"></div>`;
          const pad = createPinPad(root.querySelector('#changePinPadHost'), {
            onComplete: async (digits) => {
              if (stage === 'create') { first = digits; mountPinStage('confirm'); }
              else if (digits === first) { await performSecretChange(digits, 'pin'); }
              else { pad.shake(); showToast('PINs did not match', true); first = ''; mountPinStage('create'); }
            }
          });
        }

        root.querySelector('#changeModeSwitch').addEventListener('click', (e) => {
          const btn = e.target.closest('.segmented-btn');
          if (!btn) return;
          mode = btn.dataset.mode;
          root.querySelectorAll('#changeModeSwitch .segmented-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
          pinArea.hidden = mode !== 'pin';
          pwArea.hidden = mode !== 'password';
          if (mode === 'pin') mountPinStage('create');
        });

        const pw1 = root.querySelector('#changePw1');
        const pw2 = root.querySelector('#changePw2');
        const submit = root.querySelector('#changePwSubmit');
        function evalPw() { submit.disabled = !(pw1.value.length >= 6 && pw1.value === pw2.value); }
        pw1.addEventListener('input', evalPw);
        pw2.addEventListener('input', evalPw);
        submit.addEventListener('click', async () => { await performSecretChange(pw1.value, 'password'); });

        mountPinStage('create');
      }
    });
  }

  async function performSecretChange(newSecret, newMode) {
    showToast('Re-encrypting vault…');
    const oldKey = state.cryptoKey;
    const newSalt = VaultCrypto.newSalt();
    const newKey = await VaultCrypto.deriveKey(newSecret, newSalt);

    const rawEntries = await VaultDB.getAllEntries();
    for (const rec of rawEntries) {
      const meta = await VaultCrypto.decrypt(oldKey, rec.metaIV, rec.metaCipher, false);
      const metaEnc = await VaultCrypto.encrypt(newKey, meta);
      rec.metaIV = metaEnc.iv;
      rec.metaCipher = metaEnc.data;
      if (rec.type === 'file') {
        const fileBuf = await VaultCrypto.decrypt(oldKey, rec.dataIV, rec.dataCipher, true);
        const dataEnc = await VaultCrypto.encrypt(newKey, fileBuf, true);
        rec.dataIV = dataEnc.iv;
        rec.dataCipher = dataEnc.data;
      }
      await VaultDB.putEntry(rec);
    }

    const settingsEnc = await VaultCrypto.encrypt(newKey, state.settings);
    await VaultDB.putMeta({ key: 'settings', iv: settingsEnc.iv, cipher: settingsEnc.data });

    const verifierEnc = await VaultCrypto.encrypt(newKey, 'VAULT_UNLOCK_OK');
    await VaultDB.putMeta({ key: 'auth', salt: newSalt, iterations: VaultCrypto.PBKDF2_ITERATIONS, authMode: newMode, verifierIV: verifierEnc.iv, verifierCipher: verifierEnc.data });

    state.cryptoKey = newKey;
    state.authMode = newMode;
    closeSheet();
    showToast('PIN / password updated');
  }

  // ------------------------------------------------------------------
  // Backup export / import
  // ------------------------------------------------------------------
  function serializeMetaRow(row) {
    if (row.key === 'auth') {
      return {
        key: 'auth',
        salt: VaultCrypto.bufToBase64(row.salt),
        iterations: row.iterations,
        authMode: row.authMode,
        verifierIV: VaultCrypto.bufToBase64(row.verifierIV),
        verifierCipher: VaultCrypto.bufToBase64(row.verifierCipher)
      };
    }
    return { key: 'settings', iv: VaultCrypto.bufToBase64(row.iv), cipher: VaultCrypto.bufToBase64(row.cipher) };
  }

  function deserializeMetaRow(row) {
    if (row.key === 'auth') {
      return {
        key: 'auth',
        salt: new Uint8Array(VaultCrypto.base64ToBuf(row.salt)),
        iterations: row.iterations,
        authMode: row.authMode,
        verifierIV: new Uint8Array(VaultCrypto.base64ToBuf(row.verifierIV)),
        verifierCipher: VaultCrypto.base64ToBuf(row.verifierCipher)
      };
    }
    return { key: 'settings', iv: new Uint8Array(VaultCrypto.base64ToBuf(row.iv)), cipher: VaultCrypto.base64ToBuf(row.cipher) };
  }

  function serializeEntryRow(row) {
    const out = {
      id: row.id, type: row.type, createdAt: row.createdAt, updatedAt: row.updatedAt,
      metaIV: VaultCrypto.bufToBase64(row.metaIV), metaCipher: VaultCrypto.bufToBase64(row.metaCipher)
    };
    if (row.type === 'file') {
      out.dataIV = VaultCrypto.bufToBase64(row.dataIV);
      out.dataCipher = VaultCrypto.bufToBase64(row.dataCipher);
    }
    return out;
  }

  function deserializeEntryRow(row) {
    const out = {
      id: row.id, type: row.type, createdAt: row.createdAt, updatedAt: row.updatedAt,
      metaIV: new Uint8Array(VaultCrypto.base64ToBuf(row.metaIV)), metaCipher: VaultCrypto.base64ToBuf(row.metaCipher)
    };
    if (row.type === 'file') {
      out.dataIV = new Uint8Array(VaultCrypto.base64ToBuf(row.dataIV));
      out.dataCipher = VaultCrypto.base64ToBuf(row.dataCipher);
    }
    return out;
  }

  async function exportBackup() {
    const metaRows = await VaultDB.getAllMeta();
    const entryRows = await VaultDB.getAllEntries();
    const backup = {
      format: 'personal-vault-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: metaRows.map(serializeMetaRow),
      entries: entryRows.map(serializeEntryRow)
    };
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `vault-backup-${stamp}.vault`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Backup exported');
  }

  async function handleImportFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (backup.format !== 'personal-vault-backup' || !Array.isArray(backup.entries) || !Array.isArray(backup.meta)) {
        showToast('That file is not a valid Vault backup', true);
        return;
      }
      const proceed = await confirmDialog({
        icon: VaultIcons.importIcon,
        title: 'Replace vault with this backup?',
        message: `This backup has ${backup.entries.length} item(s) exported ${new Date(backup.exportedAt).toLocaleDateString()}. Everything currently in this vault will be replaced.`,
        confirmLabel: 'Import & Replace',
        danger: true
      });
      if (!proceed) return;
      await VaultDB.clearAll();
      for (const row of backup.meta) await VaultDB.putMeta(deserializeMetaRow(row));
      for (const row of backup.entries) await VaultDB.putEntry(deserializeEntryRow(row));
      showToast('Backup imported — reloading…');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      console.error(err);
      showToast('Import failed — file may be corrupted', true);
    }
  }

  // ------------------------------------------------------------------
  // Nuke vault
  // ------------------------------------------------------------------
  function openNukeSheet() {
    openSheet(`
      <div class="sheet-handle"></div>
      <div class="confirm-body">
        <div class="confirm-icon">${VaultIcons.skull}</div>
        <h2>Nuke this vault?</h2>
        <p>Every note and file on this device will be permanently erased. This cannot be undone unless you have an exported backup.</p>
        <div class="confirm-typebox"><input id="nukeConfirmInput" type="text" autocomplete="off" autocapitalize="off" placeholder="Type DELETE to confirm" /></div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" data-close>Cancel</button>
        <button class="btn btn-danger" id="nukeConfirmBtn" disabled>Delete Everything</button>
      </div>
    `, {
      onMount(root) {
        const input = root.querySelector('#nukeConfirmInput');
        const btn = root.querySelector('#nukeConfirmBtn');
        input.addEventListener('input', () => { btn.disabled = input.value.trim() !== 'DELETE'; });
        btn.addEventListener('click', performNuke);
      }
    });
  }

  async function performNuke() {
    stopInactivityTimer();
    revokeActiveBlobUrls();
    await VaultDB.destroyDatabase();
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) { /* ignore */ }
    }
    location.reload();
  }

  async function resetVaultFromLockScreen() {
    const ok = await confirmDialog({
      icon: VaultIcons.skull,
      title: 'Reset this vault?',
      message: 'This permanently erases everything stored on this device. There is no way to recover it without an exported backup.',
      confirmLabel: 'Erase Vault',
      danger: true
    });
    if (ok) await performNuke();
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------
  function wireEyeToggles() {
    document.querySelectorAll('[data-toggle-eye]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.toggleEye);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.classList.toggle('is-visible', show);
      });
    });
  }

  function wireOverlay() {
    overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) closeSheet();
    });
  }

  function wireSettingsScreen() {
    document.getElementById('settingsBackBtn').addEventListener('click', () => showScreen('screen-main'));
    document.getElementById('changeSecretBtn').addEventListener('click', openChangeSecretSheet);
    document.getElementById('exportBtn').addEventListener('click', exportBackup);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', handleImportFileChange);
    document.getElementById('nukeBtn').addEventListener('click', openNukeSheet);
    document.getElementById('autoLockSelect').addEventListener('change', handleAutoLockChange);
    document.getElementById('addTagBtn').addEventListener('click', handleAddTag);
    document.getElementById('newTagInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
    });
    document.getElementById('customTagChips').addEventListener('click', handleRemoveTagClick);
  }

  async function init() {
    if (!window.crypto || !window.crypto.subtle || !window.indexedDB) {
      document.body.innerHTML = '<div style="padding:48px 24px;text-align:center;color:#f2f3f5;font-family:-apple-system,sans-serif;max-width:420px;margin:0 auto;">This browser is missing security features Vault needs (Web Crypto and IndexedDB). Please open this page in an up-to-date browser over HTTPS.</div>';
      return;
    }

    paintIcons();
    wireEyeToggles();
    wireOverlay();
    wireBottomNav();
    wireTopbarActions();
    wireSettingsScreen();
    wireSearch();
    initSetupScreen();

    document.getElementById('fabAdd').addEventListener('click', openAddSheet);
    document.getElementById('listItems').addEventListener('click', handleListClick);
    document.getElementById('resetVaultLink').addEventListener('click', resetVaultFromLockScreen);

    const authRec = await VaultDB.getMeta('auth').catch(() => null);
    if (!authRec) {
      showScreen('screen-setup');
    } else {
      initLockScreenUI(authRec);
      showScreen('screen-lock');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
