(function () {
  'use strict';
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.engine) return;

  var Q = root.queue;
  var S = root.safety;
  var A = root.assets;
  var Sp = root.spintax;
  var H = root.hash;
  var Tr = root.transitions;
  var L = root.lease;

  function now() { return Date.now(); }

  var state = {
    run: null,
    settings: null,
    groups: [],
    tabId: null,
    timer: null,
    busy: false,
    paused: false,
    info: '',
    lease: null,
    subscribers: []
  };

  function localGet(keys, cb) {
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) {
      if (cb) cb({});
      return;
    }
    chrome.storage.local.get(keys, cb);
  }

  function localSet(items, cb) {
    if (typeof chrome === 'undefined' || !chrome || !chrome.storage || !chrome.storage.local) {
      if (cb) cb(); return;
    }
    chrome.storage.local.set(items, cb);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function setInfo(msg) {
    state.info = msg || '';
  }

  function logRun(msg) {
    if (!state.run) return;
    state.run.log.push({ t: now(), m: String(msg) });
  }

  function render() {
    var subs = state.subscribers;
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](); } catch (e) { /* subscriber không được làm hỏng engine */ }
    }
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function timeoutCode(msg) {
    if (msg && msg.type === 'fbq:submit') return 'no_response';
    return 'content_not_ready';
  }

  function send(tabId, msg, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve({ ok: false, payload: { code: timeoutCode(msg) } }); }
      }, timeoutMs || 30000);
      try {
        chrome.tabs.sendMessage(tabId, msg, function (res) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          void chrome.runtime.lastError;
          resolve(res && typeof res === 'object' ? res : { ok: false, payload: { code: timeoutCode(msg) } });
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, payload: { code: timeoutCode(msg) } }); }
      }
    });
  }

  function urlsMatch(a, b) {
    if (Q && typeof Q.urlsMatch === 'function') return Q.urlsMatch(a, b);
    var normalize = function (u) {
      var s = String(u == null ? '' : u);
      var q = s.indexOf('?');
      if (q >= 0) s = s.slice(0, q);
      var h = s.indexOf('#');
      if (h >= 0) s = s.slice(0, h);
      while (s.length > 1 && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
      return s;
    };
    var na = normalize(a);
    var nb = normalize(b);
    return na === nb || na.indexOf(nb) === 0 || nb.indexOf(na) === 0;
  }

  function ensureTab(item, cb) {
    if (typeof chrome === 'undefined' || !chrome || !chrome.tabs) {
      if (cb) cb(null);
      return;
    }
    var tid = state.tabId;
    function onCreated(tab) {
      if (tab && tab.id) {
        state.tabId = tab.id;
        state.busy = true;
        if (cb) cb(tab.id);
      } else if (cb) cb(null);
    }
    if (tid) {
      chrome.tabs.get(tid, function (tab) {
        void chrome.runtime.lastError;
        if (tab) {
          chrome.tabs.update(tid, { url: item.url, active: false }, function () {
            void chrome.runtime.lastError;
            state.busy = true;
            if (cb) cb(tid);
          });
        } else {
          chrome.tabs.create({ url: item.url, active: false }, onCreated);
        }
      });
    } else {
      chrome.tabs.create({ url: item.url, active: false }, onCreated);
    }
  }

  function waitReady(tabId, item) {
    var deadline = now() + 30000;
    var consecutive = 0;
    var activated = false;
    function attempt() {
      if (now() >= deadline) return Promise.resolve(false);
      return send(tabId, { v: 1, type: 'fbq:probe' }, 3000).then(function (res) {
        var url = String((res && res.payload && res.payload.url) || '');
        var onFb = url.indexOf('facebook.com') !== -1 && url.indexOf('/groups/') === -1;
        var matched = item.isTimeline ? onFb : urlsMatch(url, String(item.url || ''));
        if (matched && res && res.ok) return true;
        consecutive += 1;
        if (consecutive >= 3 && !activated) {
          activated = true;
          return new Promise(function (resolve) {
            chrome.tabs.update(tabId, { active: true }, function () {
              void chrome.runtime.lastError;
              resolve(sleep(800).then(attempt));
            });
          });
        }
        if (now() < deadline) return sleep(500).then(attempt);
        return false;
      });
    }
    return attempt();
  }

  function incrementDay() {
    if (!S || typeof S.dayKey !== 'function') return;
    var key = 'safe:day:' + S.dayKey(now());
    localGet([key], function (stored) {
      stored = stored || {};
      var rec = stored[key] || { count: 0, day: key };
      rec.count = (typeof rec.count === 'number' ? rec.count : 0) + 1;
      rec.day = key;
      var out = {};
      out[key] = rec;
      localSet(out);
    });
  }

  function findItem(key) {
    if (!state.run) return null;
    for (var i = 0; i < state.run.items.length; i++) {
      if (state.run.items[i].key === key) return state.run.items[i];
    }
    return null;
  }

  function currentItem() {
    if (!state.run) return null;
    for (var i = 0; i < state.run.items.length; i++) {
      var st = state.run.items[i].state;
      if (st === 'navigating' || st === 'filling' || st === 'countdown') return state.run.items[i];
    }
    return null;
  }

  function resolveText(item) {
    var raw = (item && item.text) ? String(item.text) : '';
    if (!raw && state.run && state.run.snapshotText) raw = String(state.run.snapshotText);
    var seed = (S && typeof S.textSeedForTarget === 'function')
      ? S.textSeedForTarget(state.run.id, item.key)
      : H.fnv1a(String(state.run.id) + '|' + String(item.key));
    try {
      if (S && typeof S.resolveText === 'function') return S.resolveText(raw, seed);
    } catch (e) { /* fallback dưới */ }
    return Sp.render(Sp.parse(raw), H.fnv1a(String(item.key) + '|' + String(state.run.id)));
  }

  function resolveImages(item) {
    return new Promise(function (resolve) {
      var ids = item && item.imageIds ? item.imageIds : [];
      if (!ids.length) return resolve([]);
      if (!A || typeof A.openDB !== 'function') return resolve([]);
      A.openDB(function (db) {
        if (!db) return resolve([]);
        var remaining = ids.length;
        var out = new Array(ids.length);
        var done = false;
        function maybe() {
          if (!done && remaining === 0) {
            done = true;
            resolve(out.filter(function (x) { return x != null; }));
          }
        }
        for (var i = 0; i < ids.length; i++) {
          (function (idx, id) {
            A.getAsset(db, id, function (err, asset) {
              if (!err && asset) {
                blobToBase64(asset.blob).then(function (b64) {
                  out[idx] = { b64: b64, mime: asset.mime || 'image/jpeg', name: id };
                  remaining -= 1;
                  maybe();
                }, function () {
                  remaining -= 1;
                  maybe();
                });
              } else {
                remaining -= 1;
                maybe();
              }
            });
          })(i, ids[i]);
        }
      });
    });
  }

  var saveTimer = null;
  function saveRun(immediate) {
    if (immediate) {
      clearTimeout(saveTimer);
      saveTimer = null;
      localSet({ run: state.run });
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      localSet({ run: state.run });
    }, 200);
  }

  function failItem(item, code, message) {
    var settings = state.settings || {};
    var probe = { clickedAt: item.clickedAt, attempts: Math.max(0, (item.attempts || 0) - 1) };
    var d = Tr && typeof Tr.decideFailure === 'function'
      ? Tr.decideFailure(probe, code, settings)
      : { state: item.clickedAt != null ? 'unknown' : 'failed', retry: false };
    item.state = d.state;
    item.errorCode = code || null;
    item.errorText = message || null;
    logRun('❌ ' + code + ' @ ' + (item.name || item.key));
    render();
    if (d.state === 'posted') {
      state.run.consecutiveFails = 0;
    } else {
      state.run.consecutiveFails = (state.run.consecutiveFails || 0) + 1;
    }
    item.lastStepAt = now();
    saveRun(true);
    render();
    afterItem(item);
  }

  function step2(item) {
    item.state = 'countdown';
    item.lastStepAt = now();
    saveRun();
    render();
    var activated = Promise.resolve();
    if (typeof chrome !== 'undefined' && chrome && chrome.tabs && state.tabId) {
      activated = new Promise(function (resolve) {
        chrome.tabs.update(state.tabId, { active: true }, function () {
          void chrome.runtime.lastError;
          resolve();
        });
      });
    }
    activated.then(function () {
      // COMMIT POINT: từ đây lượt có thể đã đăng thật. Chốt clickedAt xuống
      // storage (không qua saveRun debounce) rồi mới gửi lệnh submit.
      if (Tr && typeof Tr.beforeSubmit === 'function') Tr.beforeSubmit(item, now());
      render();
      return new Promise(function (resolve) {
        localSet({ run: state.run }, function () {
          void chrome.runtime.lastError;
          resolve();
        });
      });
    }).then(function () {
      return send(state.tabId, { v: 1, type: 'fbq:submit', payload: { confirmWindowSec: (state.settings && state.settings.confirmWindowSec) || 10, isTimeline: item.isTimeline === true } }, 120000);
    }).then(function (res) {
      if (res && res.payload && res.payload.cancelled === true) {
        item.state = 'cancelled';
        saveRun(true);
        render();
        afterItem(item);
        return;
      }
      if (!res || !res.ok) {
        var code = res && res.payload && res.payload.code;
        if (code === 'rate_limited') {
          var probe = { clickedAt: item.clickedAt, attempts: Math.max(0, (item.attempts || 0) - 1) };
          var d = (Tr && typeof Tr.decideFailure === 'function')
            ? Tr.decideFailure(probe, 'rate_limited', state.settings || {})
            : { state: item.clickedAt != null ? 'unknown' : 'queued', retry: false };
          item.state = d.state;
          item.errorCode = 'rate_limited';
          item.lastStepAt = now();
          saveRun(true);
          render();
          finish('stopped');
          // finish() ghi đè info tổng kết; giữ lại lý do dừng thực.
          setInfo('Đã dừng: bị giới hạn đăng bài');
          render();
          return;
        }
        failItem(item, code, res && res.payload && res.payload.message);
        return;
      }
      if (Tr && typeof Tr.applySubmitResult === 'function') {
        Tr.applySubmitResult(item, res && res.payload, now());
      } else {
        item.state = 'posted';
        item.postedAt = now();
      }
      if (item.state === 'posted') {
        logRun('✅ Đã đăng: ' + (item.name || item.key));
        state.run.consecutiveFails = 0;
      } else {
        logRun('❔ Không xác định: ' + (item.name || item.key));
        state.run.consecutiveFails = (state.run.consecutiveFails || 0) + 1;
      }
      render();
      if (item.clickedAt != null) {
        // Lượt unknown vẫn tính vào trần ngày và luật một nơi/ngày (KTD11).
        incrementDay();
        var g = null;
        for (var i = 0; i < state.groups.length; i++) {
          if (state.groups[i].key === item.key) { g = state.groups[i]; break; }
        }
        if (g) {
          g.lastPostedAt = now();
          localSet({ groups: state.groups });
        }
      }
      saveRun(true);
      render();
      afterItem(item);
    }).catch(function (e) {
      if (item.state === 'posted') {
        logRun('⚠️ Bỏ qua lỗi sau khi đã đăng: ' + (item.name || item.key));
        render();
        return;
      }
      failItem(item, 'engine_error', e && e.message ? e.message : String(e));
    });
  }

  function afterItem(item) {
    if (!state.run || state.run.status !== 'running') return;
    if (state.paused) { finish('paused'); return; }
    if (state.run.cancelRequested) { finish('stopped'); return; }
    if (state.run.consecutiveFails >= ((state.settings && state.settings.stopAfterConsecutiveFailures) || 3)) {
      finish('paused');
      return;
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.timer = null;
      loop();
    }, Q && typeof Q.computeDelayMs === 'function' ? Q.computeDelayMs(state.settings || {}, Math.random) : 5000);
  }

  function loop() {
    if (!state.run || state.run.status !== 'running') return;
    if (state.paused) { finish('paused'); return; }
    if (state.run.cancelRequested) { finish('stopped'); return; }
    var i = Q && typeof Q.nextIndex === 'function' ? Q.nextIndex(state.run) : -1;
    if (i < 0) { finish('done'); return; }
    var item = state.run.items[i];
    item.state = 'navigating';
    item.attempts = (item.attempts || 0) + 1;
    item.lastStepAt = now();
    saveRun();
    render();
    logRun('Đang mở: ' + (item.name || item.key));
    render();
    ensureTab(item, function (tabId) {
      if (!tabId) { failItem(item, 'content_not_ready'); return; }
      waitReady(tabId, item).then(function (ready) {
        if (!ready) throw { _content_not_ready: true };
        item.state = 'filling';
        item.lastStepAt = now();
        saveRun();
        render();
        return resolveImages(item).then(function (images) {
          return send(state.tabId, { v: 1, type: 'fbq:fill', payload: { text: resolveText(item), images: images, opts: { confirmWindowSec: (state.settings && state.settings.confirmWindowSec) || 10 }, isTimeline: item.isTimeline === true } }, 300000);
        });
        }).then(function (res) {
        if (!res || !res.ok) {
          failItem(item, (res && res.payload && res.payload.code) || 'fill_failed', (res && res.payload && res.payload.message) || null);
          return;
        }
        logRun('Đã điền bài');
        render();
        step2(item);
      }).catch(function (e) {
        if (e && e._content_not_ready) { failItem(item, 'content_not_ready'); return; }
        failItem(item, 'engine_error', e && e.message ? e.message : String(e));
      });
    });
  }

  function finish(status) {
    clearTimeout(state.timer);
    state.timer = null;
    if (!state.run) return;
    state.run.status = status;
    state.run.finishedAt = now();
    state.busy = false;
    saveRun(true);
    render();
    var run = state.run;
    var posted = 0;
    var failed = 0;
    var cancelled = 0;
    for (var i = 0; i < run.items.length; i++) {
      var s = run.items[i].state;
      if (s === 'posted') posted += 1;
      else if (s === 'failed') failed += 1;
      else if (s === 'cancelled') cancelled += 1;
    }
    if (typeof chrome !== 'undefined' && chrome && chrome.notifications && typeof chrome.notifications.create === 'function') {
      chrome.notifications.create('fbq-finish-' + now(), {
        type: 'basic',
        title: 'FB Group Poster',
        message: 'Hoàn tất: ' + posted + ' đăng, ' + failed + ' lỗi, ' + cancelled + ' hủy'
      }, function () { void chrome.runtime.lastError; });
    }
    setInfo('Hoàn tất: ' + posted + ' đăng, ' + failed + ' lỗi, ' + cancelled + ' hủy');
    logRun(state.info);
    render();
  }

  function start(cb) {
    var locks = (typeof navigator !== 'undefined' && navigator && navigator.locks) ? navigator.locks : null;
    startWithLocks(locks, cb);
  }

  function startWithLocks(locks, cb) {
    var today = (S && typeof S.dayKey === 'function') ? S.dayKey(now()) : String(now());
    var acquireP = (L && typeof L.acquire === 'function' && locks)
      ? L.acquire(locks, 'panel')
      : Promise.resolve({ held: false, owner: null });
    acquireP.then(function (handle) {
      if (!handle || !handle.held) {
        setInfo('Panel khác đang giữ lease — panel này chỉ xem.');
        render();
        if (cb) cb({ ok: false, reason: 'lease' });
        return;
      }
      state.lease = handle;
      localGet(['settings', 'groups', 'run', 'draft', 'safe:day:' + today], function (stored) {
        stored = stored || {};
        state.settings = stored.settings || null;
        state.groups = Array.isArray(stored.groups) ? stored.groups : [];
        var oldRun = stored.run || null;

        if (oldRun && oldRun.status === 'running') {
          var recovered = (Tr && typeof Tr.recoverOnStart === 'function')
            ? Tr.recoverOnStart(oldRun)
            : oldRun;
          state.run = recovered;
          saveRun(true);
          setInfo('Phục hồi phiên trước: lượt giữa chảy đã ghi không rõ.');
          render();
          if (cb) cb({ ok: true, resumed: true });
          loop();
          return;
        }

      var settings = state.settings || {};
      var draft = stored.draft || null;
      var dayRecord = stored['safe:day:' + today] || null;
      var dayCount = dayRecord && typeof dayRecord.count === 'number' ? dayRecord.count : 0;
      var timeline = {
        enabled: settings.postToTimeline === true,
        url: settings.timelineUrl || 'https://www.facebook.com/me',
        text: draft && draft.text ? String(draft.text) : '',
        imageIds: draft && Array.isArray(draft.imageIds) ? draft.imageIds.slice() : []
      };
      var built;
      try {
        built = Q.buildQueue(state.groups, settings, { now: now(), rng: Math.random, timeline: timeline, dayCount: dayCount });
      } catch (e) {
        setInfo('Lỗi xây dựng hàng đợi: ' + (e && e.message ? e.message : String(e)));
        render();
        if (cb) cb({ ok: false, reason: 'build_queue' });
        return;
      }
      if (!built || !built.items || built.items.length === 0) {
        setInfo('⚠️ Không có mục nào để đăng');
        render();
        if (cb) cb({ ok: false, reason: 'no_items' });
        return;
      }

      state.run = {
        v: 1,
        id: 'r-' + now(),
        status: 'running',
        startedAt: now(),
        finishedAt: 0,
        cancelRequested: false,
        paused: false,
        consecutiveFails: 0,
        items: built.items,
        log: []
      };
      state.busy = true;
      setInfo('Đang chạy: ' + built.items.length + ' mục');
      logRun('Khởi chạy: ' + built.items.length + ' mục');
      saveRun(true);
      render();
        loop();
        if (cb) cb({ ok: true });
      });
    });
  }

  function stop() {
    if (!state.run) return;
    state.run.cancelRequested = true;
    clearTimeout(state.timer);
    state.timer = null;
    var cur = currentItem();
    if (cur) cur.state = 'cancelled';
    saveRun(true);
    render();
    if (state.tabId) {
      send(state.tabId, { v: 1, type: 'fbq:cancel' }, 5000);
    }
    finish('stopped');
  }

  function pause() {
    if (!state.run || state.run.status !== 'running') return;
    state.paused = true;
  }

  function resume() {
    if (!state.run) return;
    state.run.status = 'running';
    state.run.cancelRequested = false;
    state.paused = false;
    state.timer = null;
    loop();
    setInfo('Đang tiếp tục...');
    render();
  }

  function retryItem(key) {
    if (!state.run) return;
    var item = findItem(key);
    if (!item) return;
    item.state = 'queued';
    item.errorCode = null;
    item.errorText = null;
    saveRun();
    render();
    if (state.run.status !== 'running') {
      state.run.status = 'running';
      state.run.cancelRequested = false;
      state.paused = false;
      loop();
    }
  }

  function moveItem(key, delta) {
    if (!state.run) return false;
    var items = state.run.items;
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) { idx = i; break; }
    }
    if (idx < 0) return false;
    var target = idx + delta;
    if (target < 0 || target >= items.length) return false;
    if (items[idx].isTimeline || items[target].isTimeline) return false;
    var tmp = items[idx];
    items[idx] = items[target];
    items[target] = tmp;
    saveRun();
    render();
    return true;
  }

  function removeItem(key) {
    if (!state.run) return false;
    var items = state.run.items;
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) { idx = i; break; }
    }
    if (idx < 0 || items[idx].state !== 'queued') return false;
    items.splice(idx, 1);
    saveRun();
    render();
    return true;
  }

  function updateItemText(key, text) {
    var item = findItem(key);
    if (!item) return false;
    item.text = String(text == null ? '' : text);
    saveRun();
    render();
    return true;
  }

  root.engine = {
    start: start,
    stop: stop,
    pause: pause,
    resume: resume,
    retryItem: retryItem,
    moveItem: moveItem,
    removeItem: removeItem,
    updateItemText: updateItemText,
    getRun: function () { return state.run; },
    getSettings: function () { return state.settings; },
    getInfo: function () { return state.info; },
    subscribe: function (fn) {
      if (typeof fn === 'function') {
        state.subscribers.push(fn);
        fn();
      }
    },
    startWithLocks: startWithLocks,
    _state: state,
    _failItem: failItem,
    _step2: step2,
    _send: send,
    _resetForTest: function () {
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      clearTimeout(saveTimer);
      saveTimer = null;
      state.run = null;
      state.settings = null;
      state.groups = [];
      state.tabId = null;
      state.busy = false;
      state.paused = false;
      state.info = '';
      state.lease = null;
      state.subscribers = [];
      return state;
    }
  };
  root.installed.engine = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.engine;
}
