(function () {
  'use strict';
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.popup) return;

  var hasOwn = Object.prototype.hasOwnProperty;
  var state = {
    settings: {},
    groups: {},
    mode: 'groups',
    dayRecord: null,
    draft: { text: '', imageIds: [], mode: 'groups' },
    running: false,
    postId: ''
  };
  var saveTimer = null;
  var thumbUrls = {};
  var PRESET_IDS = ['preset-safe', 'preset-medium', 'preset-fast'];
  var PRESET_VALUES = ['safe', 'medium', 'fast'];
  var NUM_IDS = ['set-dailyCap', 'set-groupCooldownDays', 'set-minDelaySec', 'set-maxDelaySec', 'set-confirmWindowSec', 'set-batchSize'];

  var DEFAULT_SETTINGS = (root.schema && root.schema.DEFAULT_SETTINGS) || {
    minDelaySec: 60,
    maxDelaySec: 180,
    confirmWindowSec: 10,
    maxPerRun: 50,
    retryBeforeClick: 1,
    stopAfterConsecutiveFailures: 3,
    maxImagesPerPost: 10,
    imageMaxEdgePx: 1600,
    imageJpegQuality: 0.82
  };

  // Fallback khi safety.js (của worker khác) chưa được nạp.
  var FALLBACK_DAILY_CAP = 20;
  var FALLBACK_PRESETS = {
    safe: { dailyCap: 20, minDelaySec: 90, maxDelaySec: 240, confirmWindowSec: 10, batchSize: 8, groupCooldownDays: 1 },
    medium: { dailyCap: 35, minDelaySec: 60, maxDelaySec: 150, confirmWindowSec: 6, batchSize: 12, groupCooldownDays: 0 },
    fast: { dailyCap: 60, minDelaySec: 30, maxDelaySec: 90, confirmWindowSec: 3, batchSize: 20, groupCooldownDays: 0 }
  };
  var SAFETY_DEFAULTS = (root.safety && root.safety.SAFETY_DEFAULTS) || {
    dailyCap: 20, minDelaySec: 90, maxDelaySec: 240, confirmWindowSec: 10, batchSize: 8
  };

  function mergeDefault() {
    var out = {};
    var i;
    var k;
    var src;
    for (i = 0; i < arguments.length; i++) {
      src = arguments[i];
      if (!src) continue;
      for (k in src) {
        if (hasOwn.call(src, k)) out[k] = src[k];
      }
    }
    return out;
  }

  function safeNumber(v, def) {
    if (typeof v === 'number' && isFinite(v)) return v;
    return def;
  }

  function E(id) {
    if (typeof document === 'undefined') return undefined;
    return document.getElementById(id);
  }

  function chromeOk() {
    return typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local && chrome.runtime && typeof chrome.runtime.sendMessage === 'function';
  }

  function localSet(items, cb) {
    if (!chromeOk()) { if (cb) cb(); return; }
    chrome.storage.local.set(items, cb);
  }

  function unaccent(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKeyFallback(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayKey() {
    if (root.safety && typeof root.safety.dayKey === 'function') {
      return root.safety.dayKey(Date.now());
    }
    return dayKeyFallback(Date.now());
  }

  function presetsOf() {
    return (root.safety && root.safety.PRESETS) || FALLBACK_PRESETS;
  }

  function remainingToday(settings) {
    var cap = safeNumber(settings && settings.dailyCap, FALLBACK_DAILY_CAP);
    if (root.safety && typeof root.safety.remainingToday === 'function') {
      return root.safety.remainingToday(state.dayRecord, cap);
    }
    var used = state.dayRecord && typeof state.dayRecord.count === 'number' ? state.dayRecord.count : 0;
    return Math.max(0, cap - used);
  }

  function setNum(id, value) {
    var el = E(id);
    if (el) el.value = value == null ? '' : value;
  }

  function setModeButtons() {
    var i;
    var el;
    var pressed;
    for (i = 0; i < 2; i++) {
      el = E(i === 0 ? 'mode-groups' : 'mode-timeline');
      if (!el) continue;
      pressed = (i === 0 && state.mode === 'groups') || (i === 1 && state.mode === 'timeline');
      el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (el.classList) el.classList.toggle('active', pressed);
    }
  }

  function applyDomValues() {
    var s = state.settings || {};
    var ta = E('post-text');
    if (ta) ta.value = state.draft.text || '';
    var tu = E('timelineUrl');
    if (tu) tu.value = s.timelineUrl || '';
    var pt = E('postToTimeline');
    if (pt) pt.checked = s.postToTimeline === true;
    setNum('set-dailyCap', s.dailyCap);
    setNum('set-groupCooldownDays', s.groupCooldownDays);
    setNum('set-minDelaySec', s.minDelaySec);
    setNum('set-maxDelaySec', s.maxDelaySec);
    setNum('set-confirmWindowSec', s.confirmWindowSec);
    setNum('set-batchSize', s.batchSize);
    var p = s.preset || 'safe';
    var i;
    var el;
    for (i = 0; i < PRESET_IDS.length; i++) {
      el = E(PRESET_IDS[i]);
      if (el) el.checked = PRESET_VALUES[i] === p;
    }
    setModeButtons();
  }

  function renderChecklist() {
    var list = E('group-checklist');
    if (!list) return;
    list.innerHTML = '';
    var frag = document.createDocumentFragment();
    var k;
    var g;
    var label;
    var input;
    var nameSpan;
    var sub;
    var dateStr;
    for (k in state.groups) {
      if (!hasOwn.call(state.groups, k)) continue;
      g = state.groups[k];
      label = document.createElement('label');
      label.className = 'row';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('data-key', k);
      input.checked = g.enabled !== false;
      nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = g.name || ('Nhóm ' + k);
      label.appendChild(input);
      label.appendChild(nameSpan);
      if (g.lastPostedAt) {
        sub = document.createElement('span');
        sub.className = 'sub';
        dateStr = new Date(g.lastPostedAt).toLocaleDateString ? new Date(g.lastPostedAt).toLocaleDateString('vi-VN') : String(g.lastPostedAt);
        sub.textContent = 'đã đăng ' + dateStr;
        label.appendChild(sub);
      }
      frag.appendChild(label);
    }
    list.appendChild(frag);
  }

  function applyFilter() {
    var filterEl = E('group-filter');
    var f = filterEl ? unaccent(filterEl.value) : '';
    var list = E('group-checklist');
    if (!list) return;
    var rows = list.querySelectorAll('.row');
    var i;
    var row;
    var input;
    var nameSpan;
    var text;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      input = row.querySelector('input[data-key]');
      nameSpan = row.querySelector('.name');
      text = unaccent((input ? input.getAttribute('data-key') : '') + ' ' + (nameSpan ? nameSpan.textContent : ''));
      row.style.display = f ? (text.indexOf(f) >= 0 ? '' : 'none') : '';
    }
  }

  function countEnabled() {
    var k;
    var n = 0;
    for (k in state.groups) {
      if (hasOwn.call(state.groups, k) && state.groups[k].enabled !== false) n += 1;
    }
    return n;
  }

  function showVariantPreview(text) {
    var prev = E('variant-preview');
    if (!prev) return;
    var ast;
    try {
      ast = root.spintax.parse(text);
    } catch (e) {
      prev.hidden = true;
      prev.textContent = '';
      return;
    }
    prev.hidden = false;
    prev.textContent = 'Mẫu 1: ' + root.spintax.render(ast, 1) + '\nMẫu 2: ' + root.spintax.render(ast, 2);
  }

  function renderAll() {
    var s = state.settings || {};
    var cap = safeNumber(s.dailyCap, FALLBACK_DAILY_CAP);
    var used = state.dayRecord && typeof state.dayRecord.count === 'number' ? state.dayRecord.count : 0;
    var badge = E('safety-badge');
    if (badge) {
      if (used >= cap) {
        badge.textContent = '🔴 Hôm nay đủ ' + used + '/' + cap + ' bài';
        badge.className = 'badge badge-danger';
      } else {
        badge.textContent = '🟢 Hôm nay: ' + used + '/' + cap + ' bài';
        badge.className = 'badge';
      }
    }
    setModeButtons();
    var tg = E('target-groups');
    if (tg) tg.hidden = state.mode !== 'groups';
    var tt = E('target-timeline');
    if (tt) tt.hidden = state.mode !== 'timeline';
    renderChecklist();
    applyFilter();
    var n = countEnabled();
    var caption = E('run-caption');
    if (caption) {
      if (state.mode === 'groups') {
        var minD = safeNumber(s.minDelaySec, 60);
        var maxD = safeNumber(s.maxDelaySec, 180);
        var mins = Math.max(1, Math.round(n * (minD + maxD) / 120));
        caption.textContent = 'Sẽ đăng vào ' + n + ' nhóm • khoảng ' + mins + ' phút';
      } else {
        caption.textContent = 'Sẽ đăng 1 bài lên tường của bạn';
      }
    }
    var gc = E('group-count');
    if (gc) gc.textContent = 'Đã chọn ' + n + '/' + Object.keys(state.groups).length;
    var stopBtn = E('btn-stop-run');
    if (stopBtn) stopBtn.hidden = state.running !== true;
    var text = E('post-text') ? E('post-text').value : (state.draft.text || '');
    var hint = E('spintax-hint');
    var prev = E('variant-preview');
    if (text.indexOf('{') >= 0) {
      if (root.spintax && root.spintax.validate && root.spintax.parse && root.spintax.size) {
        var v = root.spintax.validate(text);
        if (!v.ok) {
          if (hint) hint.textContent = 'Lỗi spintax: ' + (v.msg || '');
          if (prev) { prev.hidden = true; prev.textContent = ''; }
        } else {
          var total = root.spintax.size(root.spintax.parse(text));
          if (hint) hint.textContent = total + ' biến thể';
          showVariantPreview(text);
        }
      } else {
        if (hint) hint.textContent = '1 biến thể';
        if (prev) { prev.hidden = true; prev.textContent = ''; }
      }
    } else {
      if (hint) hint.textContent = '1 biến thể';
      if (prev) { prev.hidden = true; prev.textContent = ''; }
    }
  }

  function applyPreset(name) {
    var presets = presetsOf();
    var p = presets && presets[name];
    if (p) {
      state.settings = mergeDefault(state.settings || {}, p);
    }
    state.settings.preset = name;
    localSet({ settings: state.settings });
    applyDomValues();
    renderAll();
  }

  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var draft = {
        text: (E('post-text') ? E('post-text').value : state.draft.text) || '',
        imageIds: state.draft.imageIds,
        mode: state.mode
      };
      localSet({ settings: state.settings, draft: draft, 'ui:mode': state.mode });
    }, 250);
  }

  function renderThumbnails() {
    var container = E('image-list');
    if (!container) return;
    container.innerHTML = '';
    var frag = document.createDocumentFragment();
    var i;
    var id;
    var url;
    var div;
    var img;
    for (i = 0; i < state.draft.imageIds.length; i++) {
      id = state.draft.imageIds[i];
      url = thumbUrls[id];
      if (!url) continue;
      div = document.createElement('div');
      div.className = 'thumb';
      img = document.createElement('img');
      img.src = url;
      div.appendChild(img);
      frag.appendChild(div);
    }
    container.appendChild(frag);
  }

  function onImagesChange() {
    var input = E('post-images');
    var s = state.settings || {};
    var maxEdge = safeNumber(s.imageMaxEdgePx, 1600);
    var quality = safeNumber(s.imageJpegQuality, 0.82);
    var maxImg = safeNumber(s.maxImagesPerPost, 10);
    var files = input ? input.files : null;
    if (!files || files.length === 0) return;
    var remaining = files.length;
    var db = null;

    function finished() {
      autoSave();
      renderThumbnails();
    }

    function handleAsset(err, asset, fileUrl) {
      remaining -= 1;
      var last = remaining === 0;
      if (err || !asset) {
        if (fileUrl) { try { URL.revokeObjectURL(fileUrl); } catch (e) {} }
        if (last) finished();
        return;
      }
      function withDb(database) {
        if (!database || state.draft.imageIds.length >= maxImg) {
          if (fileUrl) { try { URL.revokeObjectURL(fileUrl); } catch (e) {} }
          if (last) finished();
          return;
        }
        var id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
        var blob = asset.blob;
        var mime = asset.mime || 'image/jpeg';
        if (typeof root.assets.putAsset === 'function') {
          root.assets.putAsset(database, id, {
            blob: blob,
            mime: mime,
            w: asset.w || 0,
            h: asset.h || 0,
            bytes: asset.bytes || 0,
            createdAt: Date.now()
          }, function (err2) {
            if (!err2) {
              state.draft.imageIds.push(id);
              thumbUrls[id] = fileUrl || URL.createObjectURL(blob);
            }
            if (last) finished();
          });
        } else {
          state.draft.imageIds.push(id);
          thumbUrls[id] = fileUrl || URL.createObjectURL(blob);
          if (last) finished();
        }
      }
      if (db) { withDb(db); return; }
      if (typeof root.assets.openDB !== 'function') { if (last) finished(); return; }
      root.assets.openDB(function (database, errOpen) {
        db = database || null;
        withDb(db);
      });
    }

    var i;
    var file;
    var url;
    for (i = 0; i < files.length; i++) {
      file = files[i];
      if (!file || file.type.slice(0, 6) !== 'image/') { remaining -= 1; if (remaining === 0) finished(); continue; }
      if (state.draft.imageIds.length >= maxImg) { remaining -= 1; if (remaining === 0) finished(); continue; }
      url = URL.createObjectURL(file);
      if (typeof root.assets.downscale === 'function') {
        root.assets.downscale(file, maxEdge, quality, function (err, asset) {
          handleAsset(err, asset, url);
        });
      } else {
        handleAsset(null, { blob: file, mime: file.type, w: 0, h: 0, bytes: file.size }, url);
      }
    }
  }

  function loadGroupsFromStorage(cb) {
    if (!chromeOk()) { if (cb) cb(); return; }
    chrome.storage.local.get(null, function (stored) {
      state.groups = {};
      if (stored) {
        var k;
        var g;
        for (k in stored) {
          if (hasOwn.call(stored, k) && k.slice(0, 4) === 'grp:') {
            g = stored[k];
            state.groups[k] = {
              key: g.key || k.slice(4),
              url: g.url || '',
              name: g.name || '',
              enabled: g.enabled !== false,
              lastPostedAt: g.lastPostedAt || 0
            };
          }
        }
      }
      if (cb) cb();
    });
  }

  function scanGroups() {
    var btn = E('btn-scan-groups');
    var status = E('scan-status');
    if (btn) { btn.textContent = '⏳ Đang tìm nhóm...'; btn.disabled = true; }
    if (status) status.textContent = '';
    if (!chromeOk()) {
      if (btn) { btn.textContent = '🔍 Tìm nhóm của tôi'; btn.disabled = false; }
      if (status) status.textContent = '❌ Không tìm được nhóm. Mở facebook.com rồi thử lại.';
      return;
    }
    chrome.runtime.sendMessage({ v: 1, type: 'fbq:scan-groups', payload: { maxGroups: 300, maxScrolls: 20 } }, function (res) {
      if (btn) { btn.textContent = '🔍 Tìm nhóm của tôi'; btn.disabled = false; }
      if (!res || res.ok === false) {
        var code = res && res.payload && res.payload.code ? res.payload.code : 'scan_failed';
        if (status) status.textContent = '❌ Không quét được nhóm (' + code + '). Kiểm tra bạn đã đăng nhập facebook.com.';
        return;
      }
      var count = res.payload && typeof res.payload.count === 'number' ? res.payload.count : 0;
      if (count === 0) {
        if (status) status.textContent = '⚠️ Không thấy nhóm nào. Tài khoản này chưa tham gia nhóm, hoặc Facebook chưa tải xong — thử lại, hoặc dán link nhóm thủ công.';
      } else {
        if (status) status.textContent = '✅ Tìm thấy ' + count + ' nhóm — tick nhóm muốn đăng.';
      }
      loadGroupsFromStorage(renderAll);
    });
  }

  function setFilteredEnabled(enabled) {
    var filterEl = E('group-filter');
    var f = filterEl ? unaccent(filterEl.value) : '';
    var k;
    var g;
    var text;
    var changed = false;
    for (k in state.groups) {
      if (!hasOwn.call(state.groups, k)) continue;
      g = state.groups[k];
      text = unaccent((g.name || '') + ' ' + k);
      if (!f || text.indexOf(f) >= 0) {
        if (g.enabled !== enabled) {
          g.enabled = enabled;
          changed = true;
          var upd = {};
          upd['grp:' + k] = g;
          localSet(upd);
        }
      }
    }
    if (!changed) renderAll();
  }

  function addManualGroups() {
    var ta = E('group-urls');
    if (!ta) return;
    var lines = ta.value.split('\n');
    var items = {};
    var added = 0;
    var i;
    var u;
    var m;
    var key;
    var g;
    for (i = 0; i < lines.length; i++) {
      u = lines[i].replace(/^\s+|\s+$/g, '');
      if (!u) continue;
      m = u.match(/groups\/([^/?#]+)/);
      key = m ? m[1] : u.replace(/^https?:\/\/[^/]+\/groups\//, '').replace(/\/$/, '');
      if (!key) continue;
      if (state.groups['grp:' + key]) continue;
      g = { key: key, url: u, name: key, enabled: true, lastPostedAt: 0 };
      state.groups['grp:' + key] = g;
      items['grp:' + key] = g;
      added += 1;
    }
    if (added > 0) {
      localSet(items);
      ta.value = '';
      renderAll();
    }
  }

  function setStatus(msg, kind) {
    var el = E('status');
    if (el) {
      el.textContent = msg;
      el.className = 'status' + (kind === 'error' ? ' status-error' : '');
    }
  }

  function normalizeTimelineUrl(v) {
    if (!v) return 'https://www.facebook.com/me';
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://www.facebook.com/' + v.replace(/^\/+/, '');
  }

  function startRun() {
    var text = (E('post-text') ? E('post-text').value : state.draft.text) || '';
    text = text.trim();
    if (!text && state.draft.imageIds.length === 0) {
      setStatus('Chưa có nội dung. Viết vài chữ hoặc chọn ảnh đã nhé.', 'error');
      return;
    }
    if (text.indexOf('{') >= 0 && root.spintax && root.spintax.validate) {
      var v = root.spintax.validate(text);
      if (!v.ok) {
        setStatus('Dấu ngoặc nhọn bị sai. Ví dụ đúng: {giá tốt|giá rẻ}', 'error');
        return;
      }
    }
    if (state.mode === 'groups') {
      if (countEnabled() === 0) {
        setStatus('Chưa chọn nhóm nào. Bấm "🔍 Tìm nhóm của tôi" rồi tick nhóm muốn đăng.', 'error');
        return;
      }
    }
    var cap = safeNumber((state.settings && state.settings.dailyCap), FALLBACK_DAILY_CAP);
    if (remainingToday(state.settings) < 1) {
      setStatus('Hôm nay đã đăng đủ ' + cap + ' bài. Nghỉ để tài khoản an toàn, mai đăng tiếp nhé.', 'error');
      return;
    }
    var postId = 'p' + Date.now();
    var postToTimeline = E('postToTimeline') ? E('postToTimeline').checked === true : false;
    var timelineUrl = normalizeTimelineUrl(E('timelineUrl') ? E('timelineUrl').value : '');
    state.settings = mergeDefault(state.settings || {}, {
      activePostId: postId,
      targetMode: state.mode,
      postToTimeline: postToTimeline,
      timelineUrl: timelineUrl
    });
    state.postId = postId;
    state.running = true;
    var items = {};
    items['post:' + postId] = { id: postId, text: text, imageIds: state.draft.imageIds.slice(), updatedAt: Date.now() };
    items.settings = state.settings;
    items.autostartPending = true;
    if (chromeOk()) {
      chrome.storage.local.remove('qmeta', function () { void chrome.runtime.lastError; });
    }
    localSet(items);
    if (chromeOk()) {
      chrome.runtime.sendMessage({ v: 1, type: 'fbq:start-run', payload: { autostart: true, postId: postId } });
    }
    setStatus('Đã bắt đầu. Theo dõi ở bảng tiến độ vừa mở.');
    renderAll();
  }

  function stopRun() {
    state.running = false;
    renderAll();
    if (chromeOk()) {
      chrome.runtime.sendMessage({ v: 1, type: 'fbq:stop-run' });
    }
  }

  function onChecklistChange(ev) {
    var target = ev && ev.target;
    if (!target || target.type !== 'checkbox') return;
    var key = target.getAttribute('data-key');
    if (!key) return;
    var g = state.groups[key];
    if (!g) return;
    g.enabled = target.checked === true;
    var upd = {};
    upd['grp:' + key] = g;
    localSet(upd);
    renderAll();
  }

  function bindAll() {
    var el;
    var i;
    el = E('post-text');
    if (el) {
      el.addEventListener('input', function () { autoSave(); renderAll(); });
      el.addEventListener('change', function () { autoSave(); renderAll(); });
    }
    el = E('timelineUrl');
    if (el) { el.addEventListener('input', autoSave); el.addEventListener('change', autoSave); }
    el = E('postToTimeline');
    if (el) { el.addEventListener('change', autoSave); }
    for (i = 0; i < NUM_IDS.length; i++) {
      el = E(NUM_IDS[i]);
      if (el) {
        el.addEventListener('input', autoSave);
        el.addEventListener('change', autoSave);
      }
    }
    for (i = 0; i < PRESET_IDS.length; i++) {
      el = E(PRESET_IDS[i]);
      if (el) {
        el.addEventListener('change', (function (value) { return function () { applyPreset(value); }; })(PRESET_VALUES[i]));
      }
    }
    el = E('mode-groups');
    if (el) { el.addEventListener('click', function () { state.mode = 'groups'; autoSave(); renderAll(); }); }
    el = E('mode-timeline');
    if (el) { el.addEventListener('click', function () { state.mode = 'timeline'; autoSave(); renderAll(); }); }
    el = E('group-filter');
    if (el) { el.addEventListener('input', applyFilter); }
    el = E('btn-select-all');
    if (el) { el.addEventListener('click', function () { setFilteredEnabled(true); }); }
    el = E('btn-deselect-all');
    if (el) { el.addEventListener('click', function () { setFilteredEnabled(false); }); }
    el = E('group-checklist');
    if (el) { el.addEventListener('change', onChecklistChange); }
    el = E('btn-scan-groups');
    if (el) { el.addEventListener('click', scanGroups); }
    el = E('btn-add-manual-groups');
    if (el) { el.addEventListener('click', addManualGroups); }
    el = E('post-images');
    if (el) { el.addEventListener('change', onImagesChange); }
    el = E('btn-start-run');
    if (el) { el.addEventListener('click', startRun); }
    el = E('btn-stop-run');
    if (el) { el.addEventListener('click', stopRun); }
    el = E('btn-open-runner');
    if (el) {
      el.addEventListener('click', function () {
        if (chromeOk()) {
          chrome.runtime.sendMessage({ v: 1, type: 'openRunner' });
        }
      });
    }
  }

  function init() {
    applyDomValues();
    renderAll();
    if (!chromeOk()) return;
    chrome.storage.local.get(null, function (stored) {
      stored = stored || {};
      state.settings = mergeDefault(DEFAULT_SETTINGS, SAFETY_DEFAULTS, stored.settings || {});
      state.groups = {};
      var k;
      var g;
      for (k in stored) {
        if (hasOwn.call(stored, k) && k.slice(0, 4) === 'grp:') {
          g = stored[k];
          state.groups[k] = {
            key: g.key || k.slice(4),
            url: g.url || '',
            name: g.name || '',
            enabled: g.enabled !== false,
            lastPostedAt: g.lastPostedAt || 0
          };
        }
      }
      state.draft = stored.draft && typeof stored.draft === 'object' ? stored.draft : { text: '', imageIds: [], mode: 'groups' };
      if (stored['ui:mode'] === 'groups' || stored['ui:mode'] === 'timeline') state.mode = stored['ui:mode'];
      state.dayRecord = null;
      var today = todayKey();
      if (stored['safe:day:' + today]) state.dayRecord = stored['safe:day:' + today];
      applyDomValues();
      renderAll();
    });
  }

  function boot() {
    if (typeof document !== 'undefined') {
      bindAll();
    }
    init();
  }

  boot();

  root.popup = { start: startRun, stop: stopRun, state: state };
  root.installed.popup = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.popup;
}
