'use strict';
// Test tích hợp engine.js với bản giả chrome + navigator.locks.
// Che các ca U3 mức engine: commit point, no_response, stop ngắt liên tiếp,
// lease giữa hai panel, lỗi sau khi đã posted.
var assert = require('node:assert');
var test = require('node:test');

require('../src/core/schema.js');
require('../src/core/protocol.js');
require('../src/core/queue.js');
require('../src/core/safety.js');
require('../src/core/hash.js');
require('../src/core/spintax.js');
require('../src/core/transitions.js');
require('../src/core/lease.js');
var engine = require('../src/ui/engine.js');
var L = require('../src/core/lease.js');

// --- Bản giả chrome.storage.local + chrome.tabs ----------------------------
// set ghi vào store; opts.neverCallbackSet thì KHÔNG bao giờ gọi callback
// (giả lập storage treo — ca 7). sendMessage chỉ phản hồi khi opts.respond.
function makeChrome(opts) {
  opts = opts || {};
  var calls = { sets: [], sends: [] };
  var store = {};
  var chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get: function (keys, cb) {
          setTimeout(function () {
            var out = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
              if (k in store) out[k] = store[k];
            });
            cb(out);
          }, 0);
        },
        set: function (items, cb) {
          calls.sets.push(items);
          var k;
          for (k in items) store[k] = items[k];
          if (opts.neverCallbackSet) return;
          if (cb) setTimeout(cb, 0);
        }
      }
    },
    tabs: {
      get: function (id, cb) { setTimeout(function () { cb({ id: id }); }, 0); },
      update: function (id, props, cb) { setTimeout(function () { cb({ id: id }); }, 0); },
      create: function (props, cb) { setTimeout(function () { cb({ id: 7 }); }, 0); },
      sendMessage: function (tabId, msg, cb) {
        calls.sends.push(msg);
        var res = opts.respond ? opts.respond(msg) : undefined;
        if (res === undefined) return; // không phản hồi -> send() hết giờ
        setTimeout(function () { cb(res); }, opts.respondDelayMs || 0);
      }
    }
  };
  chrome.__calls = calls;
  chrome.__store = store;
  return chrome;
}

// Bản giả Web Locks (giống fakeLocksReal trong lease.test.js): đúng một lock.
function fakeLocks() {
  var current = null;
  return {
    request: function (name, o, cb) {
      setTimeout(function () {
        if (current) { cb(null); return; }
        var done;
        var p = new Promise(function (res) { done = res; });
        var lock = { name: name };
        current = lock;
        var ret = cb(lock);
        // Web Locks thật: nhả lock khi promise callback trả về resolve.
        Promise.resolve(ret).catch(function () {}).then(function () {
          if (current === lock) { current = null; done(); }
        });
        void p;
      }, 0);
    },
    query: function () {
      return Promise.resolve({ held: current ? [{ name: current.name }] : [] });
    }
  };
}

function makeRunItem(key) {
  return {
    key: key, name: 'Nhóm ' + key, url: 'https://www.facebook.com/groups/' + key,
    text: 'xin chao', imageIds: [], state: 'queued', attempts: 0,
    errorCode: null, errorText: null, postedAt: 0, clickedAt: null, lastStepAt: 0
  };
}

test.afterEach(function () {
  engine._resetForTest();
  delete globalThis.chrome;
  delete globalThis.navigator;
});

// Ca 7: storage.set không bao giờ gọi callback -> engine KHÔNG gửi fbq:submit.
test('Ca 7: set không callback -> khong gui fbq:submit, luot o clicking', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({ neverCallbackSet: true });
    var st = engine._state;
    st.settings = { confirmWindowSec: 1, minDelaySec: 60, maxDelaySec: 60, retryBeforeClick: 0, stopAfterConsecutiveFailures: 3 };
    st.groups = [];
    st.run = { v: 1, id: 'r1', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 0, items: [makeRunItem('g1')], log: [] };
    var item = st.run.items[0];
    item.state = 'countdown';
    engine._step2(item);
    setTimeout(function () {
      assert.strictEqual(item.state, 'clicking');
      assert.ok(item.clickedAt > 0);
      var submits = chrome.__calls.sends.filter(function (m) { return m.type === 'fbq:submit'; });
      assert.strictEqual(submits.length, 0, 'khong duoc gui submit khi set chua xong');
      resolve();
    }, 50);
  });
});

// Ca 8 + 3: submit hết giờ sau khi có clickedAt -> unknown mã no_response.
// Giả lập "hết giờ" bằng phản hồi no_response đến trễ (40ms), tránh giữ
// timer 120s thật của step2 sống quá test.
test('Ca 8: submit het gio co clickedAt -> unknown + no_response', function () {
  return new Promise(function (resolve) {
    var submits = 0;
    globalThis.chrome = makeChrome({
      respondDelayMs: 40,
      respond: function (msg) {
        if (msg.type === 'fbq:submit') {
          submits++;
          return { v: 1, ok: false, payload: { code: 'no_response' } };
        }
        return { v: 1, ok: true, payload: {} };
      }
    });
    var st = engine._state;
    st.settings = { confirmWindowSec: 1, retryBeforeClick: 0, stopAfterConsecutiveFailures: 3, minDelaySec: 3600, maxDelaySec: 3600 };
    st.groups = [];
    st.run = { v: 1, id: 'r2', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 0, items: [makeRunItem('g1')], log: [] };
    var item = st.run.items[0];
    item.state = 'countdown';
    engine._step2(item);
    setTimeout(function () {
      assert.strictEqual(submits, 1, 'submit da duoc gui sau khi set xong');
      assert.ok(item.clickedAt > 0, 'da commit clickedAt');
      assert.strictEqual(item.state, 'unknown', 'het gio sau commit phai unknown');
      assert.strictEqual(item.errorCode, 'no_response');
      // Bản đồ mã hết giờ: fbq:submit -> no_response, message khác -> content_not_ready.
      engine._send(7, { v: 1, type: 'fbq:submit', payload: {} }, 30).then(function (res) {
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.payload.code, 'no_response');
        return engine._send(7, { v: 1, type: 'fbq:fill', payload: {} }, 30);
      }).then(function (res2) {
        assert.strictEqual(res2.payload.code, 'content_not_ready');
        resolve();
      });
    }, 150);
  });
});

// Ca 9: có clickedAt thì decideFailure (qua failItem) -> unknown cho mọi mã,
// kể cả mã retry được như content_not_ready.
test('Ca 9: co clickedAt -> failItem tra unknown voi moi ma', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({});
    var st = engine._state;
    st.settings = { retryBeforeClick: 5, stopAfterConsecutiveFailures: 99, minDelaySec: 3600, maxDelaySec: 3600 };
    st.groups = [];
    st.run = { v: 1, id: 'r3', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 0, items: [makeRunItem('g1')], log: [] };
    var codes = ['content_not_ready', 'composer_not_found', 'post_timeout', 'rate_limited'];
    var i = 0;
    function next() {
      if (i >= codes.length) { resolve(); return; }
      var item = makeRunItem('g1');
      item.clickedAt = 555;
      item.attempts = 1;
      engine._failItem(item, codes[i], null);
      assert.strictEqual(item.state, 'unknown', 'ma ' + codes[i] + ' phai unknown khi co clickedAt');
      i++;
      next();
    }
    // failItem -> afterItem -> đặt timer delay 3600s; clear bằng reset sau mỗi lần.
    next();
  });
});

// Ca 10: ném lỗi sau khi lượt đã posted -> lượt vẫn posted.
test('Ca 10: loi sau khi posted -> luot van posted', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({
      respond: function (msg) {
        if (msg.type === 'fbq:submit') return { v: 1, ok: true, payload: { posted: true } };
        return { v: 1, ok: true, payload: {} };
      },
      // incrementDay() đọc 'safe:day:...' -> ném để mô phỏng lỗi sau posted.
      getThrows: true
    });
    // Bọc get ném lỗi riêng cho key safe:day.
    var baseGet = globalThis.chrome.storage.local.get;
    globalThis.chrome.storage.local.get = function (keys, cb) {
      var arr = Array.isArray(keys) ? keys : [keys];
      if (arr.some(function (k) { return String(k).indexOf('safe:day:') === 0; })) {
        throw new Error('boom sau posted');
      }
      return baseGet(keys, cb);
    };
    var st = engine._state;
    st.settings = { confirmWindowSec: 1, retryBeforeClick: 0, stopAfterConsecutiveFailures: 3, minDelaySec: 3600, maxDelaySec: 3600 };
    st.groups = [{ key: 'g1', lastPostedAt: 0 }];
    st.run = { v: 1, id: 'r4', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 2, items: [makeRunItem('g1')], log: [] };
    var item = st.run.items[0];
    item.state = 'countdown';
    engine._step2(item);
    setTimeout(function () {
      assert.strictEqual(item.state, 'posted', 'loi xay ra sau posted khong duoc doi trang thai');
      assert.ok(item.postedAt > 0);
      assert.strictEqual(st.run.consecutiveFails, 0, 'posted reset bo dem');
      resolve();
    }, 50);
  });
});

// Ca 11 (mức engine): tab A giữ lease -> startWithLocks tab B từ chối và
// không đụng run; A nhả thì B giành được.
test('Ca 11: A giu lease -> B khong chay; A nha -> B chay duoc', function () {
  var locks = fakeLocks();
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({});
    chrome.__store.run = { v: 1, id: 'r0', status: 'done', items: [], log: [] };
    chrome.__store.groups = [];
    L.acquire(locks, 'tab-A').then(function (a) {
      assert.strictEqual(a.held, true);
      engine.startWithLocks(locks, function (resB) {
        assert.strictEqual(resB.ok, false);
        assert.strictEqual(resB.reason, 'lease');
        assert.strictEqual(engine._state.run, null, 'B khong duoc ghi run');
        // A nhả -> B giành được (run status 'done' -> không recovery, chạy mới;
        // groups rỗng -> no_items là đủ để chứng minh B vào được thân start).
        L.release(a).then(function () {
          engine._resetForTest();
          engine.startWithLocks(locks, function (resB2) {
            assert.strictEqual(resB2.ok, false);
            assert.strictEqual(resB2.reason, 'no_items', 'B da vao duoc than start (khong bi chan lease)');
            resolve();
          });
        });
      });
    });
  });
});

// Ca 5: hai lỗi liên tiếp với stopAfterConsecutiveFailures: 2 -> dừng run;
// một posted ở giữa reset bộ đếm.
test('Ca 5: 2 loi lien tiep -> run dung; posted o giua reset bo dem', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({
      respond: function (msg) {
        if (msg.type === 'fbq:submit') return { v: 1, ok: true, payload: { posted: true } };
        return { v: 1, ok: true, payload: {} };
      }
    });
    var st = engine._state;
    st.settings = { retryBeforeClick: 0, stopAfterConsecutiveFailures: 2, minDelaySec: 3600, maxDelaySec: 3600 };
    st.groups = [{ key: 'g2', lastPostedAt: 0 }];
    st.run = { v: 1, id: 'r5', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 0, items: [makeRunItem('g1'), makeRunItem('g2'), makeRunItem('g3')], log: [] };
    var i1 = st.run.items[0];
    var i2 = st.run.items[1];
    var i3 = st.run.items[2];
    i1.attempts = 1; i2.attempts = 1; i3.attempts = 1;

    // Lỗi 1: cf = 1, chưa chạm ngưỡng 2.
    engine._failItem(i1, 'composer_not_found', null);
    assert.strictEqual(st.run.consecutiveFails, 1);
    assert.strictEqual(st.run.status, 'running');

    // Posted ở giữa: cf về 0.
    i2.state = 'countdown';
    engine._step2(i2);
    setTimeout(function () {
      assert.strictEqual(i2.state, 'posted');
      assert.strictEqual(st.run.consecutiveFails, 0, 'posted reset bo dem');
      assert.strictEqual(st.run.status, 'running');

      // Lỗi 2: cf = 1 (đã reset, không cộng dồn từ lỗi 1).
      engine._failItem(i3, 'composer_not_found', null);
      assert.strictEqual(st.run.consecutiveFails, 1);
      assert.strictEqual(st.run.status, 'running', '1 < 2, chua dung');

      // Lỗi 3: cf = 2 -> dừng run.
      var i4 = makeRunItem('g4');
      st.run.items.push(i4);
      i4.attempts = 1;
      engine._failItem(i4, 'composer_not_found', null);
      assert.strictEqual(st.run.consecutiveFails, 2);
      assert.strictEqual(st.run.status, 'paused', '2 loi lien tiep -> dung run');
      resolve();
    }, 60);
  });
});

// Ca 4 (mức engine): rate_limited sau commit (có clickedAt) -> unknown,
// run dừng với lý do bị giới hạn; trước commit -> về queued.
test('Ca 4: rate_limited sau commit -> unknown + run stopped; truoc commit -> queued', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({
      respondDelayMs: 10,
      respond: function (msg) {
        if (msg.type === 'fbq:submit') return { v: 1, ok: false, payload: { code: 'rate_limited', message: 'Bi gioi han' } };
        return { v: 1, ok: true, payload: {} };
      }
    });
    var st = engine._state;
    st.settings = { retryBeforeClick: 1, confirmWindowSec: 1, stopAfterConsecutiveFailures: 99, minDelaySec: 3600, maxDelaySec: 3600 };
    st.groups = [];
    st.run = { v: 1, id: 'r6', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 0, items: [makeRunItem('g1')], log: [] };
    var item = st.run.items[0];
    item.state = 'countdown';
    engine._step2(item);
    setTimeout(function () {
      // Sau commit: clickedAt đã đặt -> unknown, run dừng vì bị giới hạn.
      assert.ok(item.clickedAt > 0);
      assert.strictEqual(item.state, 'unknown', 'rate_limited sau commit phai unknown');
      assert.strictEqual(item.errorCode, 'rate_limited');
      assert.strictEqual(st.run.status, 'stopped', 'run dung vi bi gioi han');
      assert.strictEqual(engine.getInfo().indexOf('gioi han') !== -1 || engine.getInfo().indexOf('giới hạn') !== -1, true);

      // Trước commit: clickedAt null, chưa vượt retryBeforeClick -> queued.
      var other = makeRunItem('g9');
      other.attempts = 0;
      st.run.status = 'running'; // cho phép failItem chạy lại
      st.run.consecutiveFails = 0;
      engine._failItem(other, 'rate_limited', null);
      assert.strictEqual(other.state, 'queued', 'rate_limited truoc commit ve queued');
      resolve();
    }, 80);
  });
});
// res.ok nhưng payload.failed (adapter trả post_failed) sau khi có clickedAt
// -> unknown, consecutiveFails tăng, log KHÔNG ghi "Đã đăng".
// Chờ xác định: nhóm được đánh dấu lastPostedAt (dòng cuối của nhánh res.ok)
// qua lệnh localSet({ groups }) — callback fake set là ranh giới an toàn.
test('Ca 13: res.ok payload.failed sau commit -> unknown, cf +1, log khong ghi Da dang', function () {
  var chrome = makeChrome({
    respond: function (msg) {
      if (msg.type === 'fbq:submit') return { v: 1, ok: true, payload: { failed: true, errorCode: 'post_failed' } };
      return { v: 1, ok: true, payload: {} };
    }
  });
  globalThis.chrome = chrome;
  var st = engine._state;
  st.settings = { confirmWindowSec: 1, retryBeforeClick: 0, stopAfterConsecutiveFailures: 99, minDelaySec: 3600, maxDelaySec: 3600 };
  st.groups = [{ key: 'g1', lastPostedAt: 0 }];
  st.run = { v: 1, id: 'r7', status: 'running', startedAt: 1, finishedAt: 0, cancelRequested: false, paused: false, consecutiveFails: 3, items: [makeRunItem('g1')], log: [] };
  var item = st.run.items[0];
  item.state = 'countdown';
  engine._step2(item);
  // Đợi tới khi item đạt trạng thái cuối (unknown) và log đã ghi. Không đợi
  // finishedAt: sau item, afterItem đặt timer chờ minDelaySec (3600s ở fixture)
  // rồi mới finish, nên đợi finishedAt sẽ treo. Dọn timer bằng _resetForTest.
  return new Promise(function (resolve, reject) {
    var deadline = Date.now() + 3000;
    (function poll() {
      if (Date.now() > deadline) {
        var run = st.run || {};
        var msg = 'item không kết thúc: item.state=' + item.state + ', run.status=' + run.status + ', log=' + JSON.stringify((run.log || []).map(function (e) { return e.m; }));
        engine._resetForTest();
        delete globalThis.chrome;
        reject(new Error(msg));
        return;
      }
      if (item.state === 'unknown' && st.run.log.some(function (e) { return e.m.indexOf('Không xác định') !== -1; })) {
        // Chụp trạng thái trước khi _resetForTest xóa st.run; dọn timer kể cả khi assert lỗi.
        var snap = {
          clickedAt: item.clickedAt, state: item.state, postedAt: item.postedAt,
          consecutiveFails: st.run.consecutiveFails,
          lastPostedAt: st.groups[0].lastPostedAt,
          logged: st.run.log.map(function (e) { return e.m; }).join('\n')
        };
        engine._resetForTest(); // dọn saveTimer + state.timer của engine
        delete globalThis.chrome;
        assert.ok(snap.clickedAt > 0, 'da commit clickedAt');
        assert.strictEqual(snap.state, 'unknown');
        assert.strictEqual(snap.consecutiveFails, 4, 'loi khong duoc reset bo dem');
        assert.strictEqual(snap.postedAt, 0, 'khong gan postedAt');
        assert.ok(snap.lastPostedAt > 0, 'unknown có clickedAt vẫn đánh dấu nơi đã đăng (KTD11)');
        assert.ok(snap.logged.indexOf('Đã đăng') === -1, 'log khong duoc ghi Đã đăng');
        assert.ok(snap.logged.indexOf('Không xác định') !== -1, 'log ghi đúng trạng thái unknown');
        resolve();
        return;
      }
      setImmediate(poll);
    })();
  });
});

// Ca 4b (mức engine): recoverOnStart được gọi khi startWithLocks thấy run running.
test('Ca 4b: startWithLocks phuc hoi run running qua recoverOnStart', function () {
  return new Promise(function (resolve) {
    globalThis.chrome = makeChrome({});
    chrome.__store.run = {
      v: 1, id: 'r9', status: 'running', startedAt: 1, finishedAt: 0,
      cancelRequested: false, paused: false, consecutiveFails: 0,
      items: [
        { key: 'a', state: 'clicking', clickedAt: 111, attempts: 1 },
        { key: 'b', state: 'navigating', attempts: 1 }
      ],
      log: []
    };
    chrome.__store.groups = [];
    var locks = fakeLocks();
    engine.startWithLocks(locks, function (res) {
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.resumed, true);
      var run = engine.getRun();
      assert.strictEqual(run.items[0].state, 'unknown');
      assert.strictEqual(run.items[0].errorCode, 'interrupted');
      assert.strictEqual(run.items[1].state, 'queued');
      // Đổi các lượt queued thành skipped để loop kết thúc 'done' ngay, không mở tab.
      run.items[1].state = 'skipped';
      resolve();
    });
  });
});
