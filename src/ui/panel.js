(function () {
  'use strict';
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.panel) return;

  var hasOwn = Object.prototype.hasOwnProperty;

  function E(id) {
    if (typeof document === 'undefined') return undefined;
    return document.getElementById(id);
  }

  function safeNumber(v, def) {
    if (typeof v === 'number' && isFinite(v)) return v;
    return def;
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

  function unaccent(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function mergeDefaults() {
    var out = {};
    var i, k, src;
    for (i = 0; i < arguments.length; i++) {
      src = arguments[i];
      if (!src) continue;
      for (k in src) {
        if (hasOwn.call(src, k)) out[k] = src[k];
      }
    }
    return out;
  }

  var state = {
    settings: null,
    groups: [],
    draft: { text: '', imageIds: [], mode: 'groups' },
    mode: 'groups',
    dayRecord: null,
    saveTimer: null
  };

  function setNum(id, value) {
    var el = E(id);
    if (el) el.value = value == null ? '' : value;
  }

  function applyCols() {
    var cols = (state.settings && state.settings.ui && state.settings.ui.cols) || {};
    var compose = E('col-compose');
    var groups = E('col-groups');
    if (compose && cols.compose) compose.style.setProperty('--w-compose', String(cols.compose) + 'px');
    if (groups && cols.groups) groups.style.setProperty('--w-groups', String(cols.groups) + 'px');
  }

  function applyDomValues() {
    var s = state.settings || {};
    var ta = E('post-text');
    if (ta) ta.value = (state.draft && state.draft.text) || '';
    var tu = E('timeline-url');
    if (tu) tu.value = s.timelineUrl || '';
    var pt = E('postToTimeline');
    if (pt) pt.checked = s.postToTimeline === true;
    setNum('set-dailyCap', s.dailyCap);
    setNum('set-groupCooldownDays', s.groupCooldownDays);
    setNum('set-minDelaySec', s.minDelaySec);
    setNum('set-maxDelaySec', s.maxDelaySec);
    setNum('set-confirmWindowSec', s.confirmWindowSec);
    setNum('set-maxPerRun', s.maxPerRun);
    var presetIds = ['preset-safe', 'preset-medium', 'preset-fast'];
    var presetValues = ['safe', 'medium', 'fast'];
    var p = s.preset || 'safe';
    var i;
    var el;
    for (i = 0; i < presetIds.length; i++) {
      el = E(presetIds[i]);
      if (el) el.checked = presetValues[i] === p;
    }
    var rg = E('mode-groups');
    var rt = E('mode-timeline');
    if (rg) rg.checked = state.mode === 'groups';
    if (rt) rt.checked = state.mode === 'timeline';
    var tb = E('timeline-box');
    if (tb) tb.hidden = state.mode !== 'timeline';
    updateSpintaxHint();
  }

  function updateSpintaxHint() {
    var ta = E('post-text');
    var text = ta ? ta.value : '';
    var hint = E('spintax-hint');
    var prev = E('variant-preview');
    if (text.indexOf('{') >= 0 && root.spintax && root.spintax.validate && root.spintax.parse && root.spintax.size) {
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

  function renderStatus() {
    var run = root.engine ? root.engine.getRun() : null;
    var statusEl = E('status');
    var badgeEl = E('badge-daily');
    var progressEl = E('progress');
    var etaEl = E('eta');
    var btnStart = E('btn-start');
    var btnPause = E('btn-pause');
    var btnStop = E('btn-stop');
    var running = !!(run && run.status === 'running');
    if (btnPause) btnPause.hidden = !running;
    if (btnStop) btnStop.hidden = !running;
    if (btnStart) btnStart.hidden = running;
    if (statusEl) {
      if (run && run.status === 'paused') statusEl.textContent = 'Đã tạm dừng';
      else if (running) statusEl.textContent = root.engine.getInfo ? root.engine.getInfo() : 'Đang chạy...';
      else {
        var info = root.engine && typeof root.engine.getInfo === 'function' ? root.engine.getInfo() : '';
        if (info) statusEl.textContent = info;
        else if (run && run.items && run.items.length > 0) statusEl.textContent = 'Sẵn sàng — ' + run.items.length + ' mục trong hàng đợi';
        else statusEl.textContent = 'Sẵn sàng';
      }
    }
    if (badgeEl) {
      var cap = safeNumber((state.settings && state.settings.dailyCap), 20);
      var used = state.dayRecord && typeof state.dayRecord.count === 'number' ? state.dayRecord.count : 0;
      if (used >= cap) {
        badgeEl.textContent = '🔴 Hôm nay đủ ' + used + '/' + cap + ' bài';
      } else {
        badgeEl.textContent = '🟢 Hôm nay: ' + used + '/' + cap + ' bài';
      }
    }
    if (run && run.items && progressEl) {
      var total = run.items.length;
      var done = 0;
      var i;
      for (i = 0; i < run.items.length; i++) {
        var s = run.items[i].state;
        if (s === 'posted' || s === 'failed' || s === 'cancelled' || s === 'needs_manual' || s === 'skipped') done += 1;
      }
      progressEl.max = total;
      progressEl.value = done;
    }
    if (etaEl) {
      if (running) {
        var minD = safeNumber((state.settings && state.settings.minDelaySec), 60);
        var maxD = safeNumber((state.settings && state.settings.maxDelaySec), 180);
        etaEl.textContent = 'Khoảng ' + Math.round((minD + maxD) / 2) + 's mỗi mục';
      } else {
        etaEl.textContent = '';
      }
    }
  }

  function renderGroups() {
    var listEl = E('group-list');
    var filterEl = E('group-filter');
    var f = filterEl ? unaccent(filterEl.value) : '';
    var frag = document.createDocumentFragment();
    var i, g, label, input, nameSpan, selected = 0;
    if (!listEl) return;
    for (i = 0; i < state.groups.length; i++) {
      g = state.groups[i];
      if (f && unaccent((g.name || '') + ' ' + (g.key || '') + ' ' + (g.url || '')).indexOf(f) < 0) continue;
      if (g.enabled !== false) selected += 1;
      label = document.createElement('label');
      label.className = 'row';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('data-key', g.key);
      input.checked = g.enabled !== false;
      nameSpan = document.createElement('span');
      nameSpan.textContent = g.name || ('Nhóm ' + g.key);
      label.appendChild(input);
      label.appendChild(nameSpan);
      frag.appendChild(label);
    }
    listEl.innerHTML = '';
    listEl.appendChild(frag);
    var gc = E('group-count');
    if (gc) gc.textContent = selected + ' nhóm được chọn / ' + state.groups.length + ' nhóm';
  }

  function renderQueue() {
    var tbody = E('queue-rows');
    var run = root.engine ? root.engine.getRun() : null;
    var frag = document.createDocumentFragment();
    var i, item, tr, td, btn, ta;
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!run || !run.items) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'Chưa có hàng đợi — chọn nhóm hoặc chế độ Tường rồi bấm Bắt đầu';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (i = 0; i < run.items.length; i++) {
      item = run.items[i];
      tr = document.createElement('tr');
      td = document.createElement('td');
      td.textContent = i + 1;
      tr.appendChild(td);
      td = document.createElement('td');
      td.textContent = item.isTimeline ? 'Tường của tôi' : (item.name || item.key);
      tr.appendChild(td);
      td = document.createElement('td');
      td.textContent = (root.status && root.status.stateLabel ? root.status.stateLabel(item.state) : item.state);
      tr.appendChild(td);
      td = document.createElement('td');
      td.textContent = item.errorText || '';
      tr.appendChild(td);
      td = document.createElement('td');
      if (item.state === 'queued') {
        btn = document.createElement('button');
        btn.textContent = '↑';
        btn.title = 'Lên trên';
        (function (k) {
          btn.addEventListener('click', function () {
            if (root.engine) root.engine.moveItem(k, -1);
            renderQueue();
          });
        })(item.key);
        td.appendChild(btn);
        btn = document.createElement('button');
        btn.textContent = '↓';
        btn.title = 'Xuống dưới';
        (function (k) {
          btn.addEventListener('click', function () {
            if (root.engine) root.engine.moveItem(k, 1);
            renderQueue();
          });
        })(item.key);
        btn = document.createElement('button');
        btn.textContent = '✕';
        btn.title = 'Xóa';
        (function (k) {
          btn.addEventListener('click', function () {
            if (root.engine) root.engine.removeItem(k);
            renderQueue();
          });
        })(item.key);
        td.appendChild(btn);
        ta = document.createElement('textarea');
        ta.className = 'queue-text';
        ta.placeholder = 'Nội dung riêng cho mục này';
        ta.value = item.text || '';
        (function (k) {
          ta.addEventListener('input', function () {
            if (root.engine) root.engine.updateItemText(k, this.value);
          });
        })(item.key);
        td.appendChild(ta);
      } else {
        td.textContent = '—';
      }
      tr.appendChild(td);
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  var thumbRenderSeq = 0;

  function renderThumbs() {
    var container = E('thumbs');
    var ids = (state.draft && state.draft.imageIds) || [];
    var i;
    if (!container) return;
    var seq = ++thumbRenderSeq;
    container.innerHTML = '';
    if (!ids.length) return;
    for (i = 0; i < ids.length; i++) {
      appendThumb(container, ids[i], seq);
    }
  }

  // Tách riêng để mỗi ảnh có biến cục bộ: callback openDB/getAsset là bất đồng bộ,
  // nếu dùng chung var thì mọi callback sẽ append cùng một thẻ cuối cùng.
  // seq: lần render hiện tại; callback của lần render cũ bỏ qua để không append trùng.
  function appendThumb(container, id, seq) {
      var div, img, btn;
      div = document.createElement('div');
      div.className = 'thumb';
      img = document.createElement('img');
      img.alt = id;
      btn = document.createElement('button');
      btn.textContent = '✕';
      (function (thumbId) {
        btn.addEventListener('click', function () {
          removeDraftImage(thumbId);
        });
      })(id);
      if (typeof root.assets.openDB === 'function') {
        root.assets.openDB(function (db) {
          if (seq !== thumbRenderSeq) return;
          if (!db) {
            div.appendChild(img);
            div.appendChild(btn);
            container.appendChild(div);
            return;
          }
          root.assets.getAsset(db, id, function (err, asset) {
            if (seq !== thumbRenderSeq) return;
            if (!err && asset && asset.blob) {
              img.src = URL.createObjectURL(asset.blob);
            }
            div.appendChild(img);
            div.appendChild(btn);
            container.appendChild(div);
          });
        });
      } else {
        div.appendChild(img);
        div.appendChild(btn);
        container.appendChild(div);
      }
  }

  function removeDraftImage(id) {
    var ids = state.draft.imageIds;
    var newIds = [];
    var j;
    for (j = 0; j < ids.length; j++) {
      if (ids[j] !== id) newIds.push(ids[j]);
    }
    state.draft.imageIds = newIds;
    if (typeof root.assets.openDB === 'function') {
      root.assets.openDB(function (db) {
        if (db) root.assets.deleteAsset(db, id, function () {});
      });
    }
    scheduleSave();
    renderThumbs();
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
      scheduleSave();
      renderThumbs();
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
            }
            if (last) finished();
          });
        } else {
          state.draft.imageIds.push(id);
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

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ settings: state.settings, draft: state.draft }, function () { void chrome.runtime.lastError; });
      }
    }, 250);
  }

  function saveSettingsGroups() {
    if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ groups: state.groups }, function () { void chrome.runtime.lastError; });
    }
  }

  function setAllEnabled(enabled) {
    var i;
    for (i = 0; i < state.groups.length; i++) {
      state.groups[i].enabled = enabled;
    }
    saveSettingsGroups();
    renderGroups();
  }

  function addManualGroups() {
    var ta = E('group-urls');
    var lines, u, m, key, i, j, exists, added = 0;
    if (!ta) return;
    lines = ta.value.split('\n');
    for (i = 0; i < lines.length; i++) {
      u = lines[i].replace(/^\s+|\s+$/g, '');
      if (!u) continue;
      m = u.match(/groups\/([^/?#]+)/);
      key = m ? m[1] : null;
      if (!key) continue;
      exists = false;
      for (j = 0; j < state.groups.length; j++) {
        if (state.groups[j].key === key) { exists = true; break; }
      }
      if (exists) continue;
      state.groups.push({ key: key, url: u, name: key, enabled: true, lastPostedAt: 0 });
      added += 1;
    }
    if (added > 0) {
      saveSettingsGroups();
      ta.value = '';
      renderGroups();
    }
  }

  function startRun() {
    var ta = E('post-text');
    var text = ta ? ta.value : (state.draft.text || '');
    text = String(text).trim();
    var imageCount = (state.draft && state.draft.imageIds) ? state.draft.imageIds.length : 0;
    var statusEl = E('status');
    if (!text && imageCount === 0) {
      if (statusEl) statusEl.textContent = 'Chưa có nội dung';
      return;
    }
    if (state.mode === 'groups') {
      var selected = 0;
      var i;
      for (i = 0; i < state.groups.length; i++) {
        if (state.groups[i].enabled !== false) selected += 1;
      }
      if (selected === 0) {
        if (statusEl) statusEl.textContent = 'Chưa chọn nhóm nào';
        return;
      }
    }
    var cap = safeNumber((state.settings && state.settings.dailyCap), 20);
    var rt = E('mode-timeline');
    var isTimeline = !!(rt && rt.checked);
    state.mode = isTimeline ? 'timeline' : 'groups';
    chrome.storage.local.get(['safe:day:' + todayKey()], function (stored) {
      var rec = stored && stored['safe:day:' + todayKey()];
      var used = rec && typeof rec.count === 'number' ? rec.count : 0;
      if (used >= cap) {
        if (statusEl) statusEl.textContent = 'Hôm nay đã đủ ' + cap + ' bài';
        return;
      }
      state.settings = state.settings || {};
      if (isTimeline) {
        state.settings.postToTimeline = true;
      } else {
        state.settings.postToTimeline = E('postToTimeline') ? E('postToTimeline').checked === true : false;
      }
      state.settings.timelineUrl = E('timeline-url') ? E('timeline-url').value : '';
      state.settings.targetMode = state.mode;
      state.draft.text = text;
      state.draft.mode = state.mode;
      if (typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ settings: state.settings, draft: state.draft }, function () {
          void chrome.runtime.lastError;
          if (root.engine && typeof root.engine.start === 'function') {
            root.engine.start();
          }
        });
      } else if (root.engine && typeof root.engine.start === 'function') {
        root.engine.start();
      }
    });
  }

  function bindAll() {
    var el;
    var i;
    el = E('post-text');
    if (el) {
      el.addEventListener('input', (function (inputEl) {
        return function () {
          state.draft.text = inputEl.value;
          updateSpintaxHint();
          scheduleSave();
        };
      })(el));
    }
    el = E('post-images');
    if (el) { el.addEventListener('change', onImagesChange); }
    el = E('timeline-url');
    if (el) {
      el.addEventListener('input', (function (inputEl) {
        return function () {
          state.settings = state.settings || {};
          state.settings.timelineUrl = inputEl.value;
          scheduleSave();
        };
      })(el));
    }
    el = E('postToTimeline');
    if (el) {
      el.addEventListener('change', (function (inputEl) {
        return function () {
          state.settings = state.settings || {};
          state.settings.postToTimeline = inputEl.checked === true;
          scheduleSave();
        };
      })(el));
    }
    var numIds = ['set-dailyCap', 'set-groupCooldownDays', 'set-minDelaySec', 'set-maxDelaySec', 'set-confirmWindowSec', 'set-maxPerRun'];
    for (i = 0; i < numIds.length; i++) {
      el = E(numIds[i]);
      if (el) {
        el.addEventListener('input', (function (id, inputEl) {
          return function () {
            state.settings = state.settings || {};
            state.settings[id] = inputEl.value === '' ? null : Number(inputEl.value);
            scheduleSave();
          };
        })(numIds[i], el));
      }
    }
    var presetIds = ['preset-safe', 'preset-medium', 'preset-fast'];
    var presetValues = ['safe', 'medium', 'fast'];
    for (i = 0; i < presetIds.length; i++) {
      el = E(presetIds[i]);
      if (el) {
        el.addEventListener('change', (function (value) {
          return function () { applyPreset(value); };
        })(presetValues[i]));
      }
    }
    el = E('mode-groups');
    if (el) { el.addEventListener('click', function () { state.mode = 'groups'; E('timeline-box').hidden = true; scheduleSave(); }); }
    el = E('mode-timeline');
    if (el) { el.addEventListener('click', function () { state.mode = 'timeline'; E('timeline-box').hidden = false; scheduleSave(); }); }
    el = E('group-filter');
    if (el) { el.addEventListener('input', renderGroups); }
    el = E('group-list');
    if (el) {
      el.addEventListener('change', function (ev) {
        var target = ev && ev.target;
        if (!target || target.type !== 'checkbox') return;
        var key = target.getAttribute('data-key');
        var i;
        for (i = 0; i < state.groups.length; i++) {
          if (state.groups[i].key === key) {
            state.groups[i].enabled = target.checked === true;
            break;
          }
        }
        saveSettingsGroups();
        renderGroups();
      });
    }
    el = E('btn-select-all');
    if (el) { el.addEventListener('click', function () { setAllEnabled(true); }); }
    el = E('btn-select-none');
    if (el) { el.addEventListener('click', function () { setAllEnabled(false); }); }
    el = E('btn-scan');
    if (el) { el.addEventListener('click', scanGroups); }
    el = E('btn-add-groups');
    if (el) { el.addEventListener('click', addManualGroups); }
    el = E('btn-start');
    if (el) { el.addEventListener('click', startRun); }
    el = E('btn-pause');
    if (el) { el.addEventListener('click', function () { if (root.engine) root.engine.pause(); }); }
    el = E('btn-stop');
    if (el) { el.addEventListener('click', function () { if (root.engine) root.engine.stop(); }); }
    initSplitters();
  }

  function initSplitters() {
    var splitters = document.querySelectorAll ? document.querySelectorAll('.splitter') : [];
    var i;
    for (i = 0; i < splitters.length; i++) {
      (function (splitter) {
        var target = splitter.getAttribute('data-target');
        var startX, startW, curW;
        function onDown(e) {
          startX = e.clientX;
          var el = target === 'compose' ? E('col-compose') : E('col-groups');
          var rect = el.getBoundingClientRect();
          startW = rect.width;
          curW = startW;
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          document.addEventListener('pointercancel', onUp);
        }
        function onMove(e) {
          var dx = e.clientX - startX;
          var val = Math.max(120, startW + dx);
          curW = val;
          if (target === 'compose') {
            E('col-compose').style.setProperty('--w-compose', String(val) + 'px');
          } else {
            E('col-groups').style.setProperty('--w-groups', String(val) + 'px');
          }
        }
        function onUp() {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          state.settings = state.settings || {};
          state.settings.ui = state.settings.ui || {};
          state.settings.ui.cols = state.settings.ui.cols || {};
          if (target === 'compose') state.settings.ui.cols.compose = Math.round(curW);
          else state.settings.ui.cols.groups = Math.round(curW);
          scheduleSave();
        }
        splitter.addEventListener('pointerdown', onDown);
      })(splitters[i]);
    }
  }

  function scanGroups() {
    var btn = E('btn-scan');
    var statusEl = E('scan-status');
    if (btn) { btn.textContent = '⏳ Đang tìm nhóm...'; btn.disabled = true; }
    if (statusEl) statusEl.textContent = '';
    if (typeof chrome === 'undefined' || !chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      if (btn) { btn.textContent = '🔍 Tìm nhóm của tôi'; btn.disabled = false; }
      if (statusEl) statusEl.innerHTML = '❌ Không quét được nhóm (<code>no_chrome</code>)';
      renderGroups();
      return;
    }
    chrome.runtime.sendMessage({ v: 1, type: 'fbq:scan-groups', payload: { maxGroups: 300, maxScrolls: 20 } }, function (res) {
      if (btn) { btn.textContent = '🔍 Tìm nhóm của tôi'; btn.disabled = false; }
      if (!res || res.ok === false) {
        var code = res && res.payload && res.payload.code ? String(res.payload.code) : 'scan_failed';
        if (statusEl) statusEl.innerHTML = '❌ Không quét được nhóm (<code>' + code + '</code>)';
        renderGroups();
        return;
      }
      var count = res && res.payload && typeof res.payload.count === 'number' ? res.payload.count : 0;
      if (count === 0) {
        if (statusEl) statusEl.textContent = '⚠️ Không thấy nhóm nào — dán link nhóm thủ công ở dưới';
      } else {
        if (statusEl) statusEl.textContent = '✅ Tìm thấy ' + count + ' nhóm';
      }
      renderGroups();
    });
  }

  function applyPreset(name) {
    var presets = (root.safety && root.safety.PRESETS) || {};
    var p = presets[name];
    if (p) {
      state.settings = mergeDefaults(state.settings || {}, p);
    }
    state.settings.preset = name;
    scheduleSave();
    applyDomValues();
    renderAll();
  }

  var rendering = false;
  function renderAllSafe() {
    if (rendering) return;
    rendering = true;
    try { renderAll(); } finally { rendering = false; }
  }

  function renderAll() {
    renderGroups();
    renderQueue();
    renderStatus();
    renderThumbs();
    renderLog();
  }

  function renderLog() {
    var run = root.engine ? root.engine.getRun() : null;
    var el = E('log');
    if (!el) return;
    var entries = (run && run.log) || [];
    var lines = [];
    var i;
    var start = entries.length > 300 ? entries.length - 300 : 0;
    for (i = start; i < entries.length; i++) {
      var e = entries[i];
      var d = new Date(typeof e.t === 'number' ? e.t : Date.now());
      lines.push('[' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '] ' + (e.m || ''));
    }
    el.textContent = lines.join('\n');
    el.scrollTop = el.scrollHeight;
  }

  function boot() {
    if (typeof document === 'undefined') return;
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) {
      applyDomValues();
      bindAll();
      renderAll();
      if (root.engine && typeof root.engine.subscribe === 'function') {
        root.engine.subscribe(renderAllSafe);
      }
      return;
    }
    chrome.storage.local.get(null, function (all) {
      all = all || {};
      var patch = {};
      var rm = [];
      var list = [];
      var k;
      if (!Array.isArray(all.groups)) {
        for (k in all) {
          if (hasOwn.call(all, k) && k.indexOf('grp:') === 0 && all[k]) {
            var g = all[k];
            list.push({ key: g.key || k.slice(4), url: g.url || '', name: g.name || '', enabled: g.enabled !== false, lastPostedAt: g.lastPostedAt || 0 });
            rm.push(k);
          }
        }
        patch.groups = list;
      }
      for (k in all) {
        if (hasOwn.call(all, k) && k.indexOf('qitem:') === 0) rm.push(k);
      }
      var special = ['qmeta', 'autostartPending', 'ui:mode'];
      var s;
      for (s = 0; s < special.length; s++) {
        if (special[s] in all) rm.push(special[s]);
      }
      function afterMigrate() {
        state.settings = mergeDefaults(root.schema && root.schema.DEFAULT_SETTINGS, all.settings || {});
        state.groups = Array.isArray(all.groups) ? all.groups : (patch.groups && patch.groups.length ? patch.groups : []);
        state.draft = all.draft && typeof all.draft === 'object' ? all.draft : { text: '', imageIds: [], mode: 'groups' };
        state.mode = state.draft.mode || 'groups';
        state.dayRecord = null;
        var today = todayKey();
        if (all['safe:day:' + today]) state.dayRecord = all['safe:day:' + today];
        applyCols();
        applyDomValues();
        bindAll();
        renderAll();
        if (root.engine && typeof root.engine.subscribe === 'function') {
          root.engine.subscribe(renderAllSafe);
        }
      }
      var hasPatch = false;
      for (k in patch) {
        if (hasOwn.call(patch, k)) { hasPatch = true; break; }
      }
      if (hasPatch || rm.length) {
        chrome.storage.local.set(patch, function () {
          if (rm.length) chrome.storage.local.remove(rm, afterMigrate);
          else afterMigrate();
        });
      } else {
        afterMigrate();
      }
    });
  }

  boot();

  root.panel = { renderAll: renderAll, start: startRun };
  root.installed.panel = 1;
})();

if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.panel;
}
