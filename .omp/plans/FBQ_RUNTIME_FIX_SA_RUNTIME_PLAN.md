# fbq-runtime-fix — Sửa runtime extension FB Group Poster

## Context

Justin báo extension "không có chức năng nào xài được": bấm **Tìm nhóm của tôi** không load group nào; bấm **ĐĂNG BÀI NGAY** không có bài nào được đăng. UI mới không phải nguyên nhân — toàn bộ đường truyền dữ liệu giữa 3 tầng (popup → service worker → content script → trang runner) đang hỏng.

Bằng chứng thu được **trên Chrome thật của Justin** (ego-lite, extension `hiognlmnbdoiicbdigfonpfpoicoijaj`, profile "Thiên Đạt"):

| Phép thử | Kết quả thật |
|---|---|
| `chrome.tabs.sendMessage(tabId, {v:1,type:'scan',...})` từ trang extension | `null` + `"Could not establish connection. Receiving end does not exist."` |
| `chrome.tabs.sendMessage(tabId, {v:1,type:'fbq:connect'})` | cùng lỗi trên |
| `chrome.storage.local` sau khi dùng extension | `grp:*` = **0 key** (chưa từng quét được group) |
| `qitem:timeline` sau lần đăng thử | `state:"failed"`, `errorCode:"nav_mismatch"`, `errorText:"observed "` (URL quan sát được = chuỗi rỗng) |
| `qmeta` sau lần chạy đó | `status:"running"`, `cursor:0`, `total:1` — kẹt vĩnh viễn, không bao giờ finish |

Nguyên nhân, đã đối chiếu từng dòng code:

1. **`src/ui/runner.js` — `MAX_LOG_LINES` không tồn tại.** `log()` đọc biến chưa khai báo → `ReferenceError` ở **mọi** lần gọi. `scheduleNext()` gọi `log()` **trước** `setTimeout`, nên sau bài đầu tiên vòng lặp chết, `qmeta` kẹt `running`. Đây chính là triệu chứng "kẹt running" quan sát được.
2. **`src/content/runner.js` — không có `chrome.runtime.onMessage`.** `sw.js` gửi `scan` bằng `chrome.tabs.sendMessage` → không ai nhận (bằng chứng "Receiving end does not exist"). Quét group hỏng 100%.
3. **`src/content/runner.js` — `observedUrl` đặt sai chỗ.** `reply()` nhét `observedUrl` vào `payload`, còn `src/ui/runner.js` đọc `env.observedUrl` ở cấp envelope → `observed = ''` → `nav_mismatch` ngay bài đầu, đúng như `errorText:"observed "`.
4. **`src/bg/sw.js` — gửi message tới trang extension bằng `chrome.tabs.sendMessage`.** Lệnh `fbq:start-run` / `fbq:stop-run` chỉ tới content script, **không** tới `runner.html` (trang extension). Nhánh "tab runner đã mở sẵn" → bấm Start ở popup không có gì xảy ra.
5. **`src/ui/runner.js` — ping gửi vào document cũ.** `openTabAt()` resolve ngay khi `TABS.update` được gọi, rồi ping ngay → port còn trỏ document cũ (hoặc đã chết) → sai URL. Không có cơ chế "đợi content script của document mới".
6. **`src/ui/runner.js` — nhận port vô điều kiện.** `onConnect` nhận port của **bất kỳ** tab Facebook nào; Justin mở 2 tab FB → port bị ghi đè, ping bay sang tab khác.
7. **`src/ui/runner.js` — `init()` cướp tab FB của người dùng** (`TABS.query` rồi lấy tab cuối), sau đó `finishRun()` **đóng tab đó**.
8. **`src/ui/runner.js` — `takeLease` gọi callback 2 lần**: nhánh `lease_held` không `return` promise bị reject nên `.then` kế tiếp vẫn chạy `cb(null)`.
9. **`src/content/adapter-group.js` — `result` chưa khai báo** trong `postFlow()` (ghi biến global ngoài ý muốn); và nếu `assertDom(postKind)` trả `null` thì vẫn chờ 45s rồi báo **posted** sai.
10. **`src/content/selectors.js` — `[aria-label="Photo/Video"]` sai chữ hoa.** DOM thật (đã đo): `aria-label="Photo/video"`. Thêm ảnh sẽ chết ở `image_input_not_found`.
11. **`src/bg/sw.js` — group mới quét về mặc định `enabled:false`** → quét xong 0 nhóm được chọn, bấm Start báo "Chưa chọn nhóm nào".
12. **`src/content/adapter-group.js` — gặp draft còn sót là `throw draft_present`** → cả bài hỏng thay vì dọn draft.

Trạng thái cuối mong muốn: bấm 1 nút ở popup là mở tab runner, tự mở trang Facebook, điền bài, đếm ngược, bấm Đăng, ghi trạng thái; quét group trả về danh sách tick được; mọi lỗi hiện ra bằng tiếng Việt thay vì im lặng.

**Dữ kiện môi trường đã kiểm tra (dùng khi verify):** Facebook của tài khoản này đang ở **locale tiếng Anh** (`What's on your mind, Tiến?`, `Your groups`, `All groups you've joined`) và tài khoản hiện **chưa tham gia group nào** (`/groups/joins/` render danh sách rỗng, 0 link group). Vì vậy E2E đường "đăng vào group" phải dùng link nhóm dán tay, còn E2E mặc định là chế độ timeline.

---

## Approach

Thứ tự dưới đây giữ cây build được và test cũ vẫn xanh sau từng bước. S1–S3 là đường sống (không có thì không gì chạy); S4–S6 là đúng đắn/haoh phí; S7 là test.

### S1 — `src/content/runner.js`: dựng lại hợp đồng thông điệp

S1a. Thêm hàm thuần **trước** guard `if (typeof chrome === 'undefined' ...)`, đặt ngay sau `var buffers = {}`:

```js
function buildReply(runId, epoch, requestId, type, payload, observedUrl) {
  return {
    v: ENV_VERSION,
    runId: runId == null ? null : runId,
    epoch: epoch == null ? null : epoch,
    requestId: requestId == null ? null : requestId,
    type: type,
    payload: payload || {},
    observedUrl: String(observedUrl == null ? '' : observedUrl)
  };
}
```

`observedUrl` **phải** nằm ở cấp envelope, không nằm trong `payload` — `src/ui/runner.js::onPortMessage` đọc `env.observedUrl`.

S1b. Thay `reply()` (dòng ~38) bằng:

```js
function reply(env, type, payload) {
  postPort(buildReply(env.runId, env.epoch, env.requestId, type, payload, observedUrl()));
}
```

S1c. Guard đầu file phải export `buildReply` (để test Node chạy được khi không có `chrome`):

```js
if (typeof chrome === 'undefined' || !chrome.runtime) {
  root.runner = { buildReply: buildReply };
  root.installed.runner = 1;
  return;
}
```

và object export cuối file thêm `buildReply: buildReply`.

S1d. Thêm listener `chrome.runtime.onMessage` — đây là thứ đang thiếu hoàn toàn, nguyên nhân trực tiếp của "scan không load":

```js
function scanViaMessage(payload, sendResponse) {
  var scanner = root.scanner;
  if (!scanner || typeof scanner.scan !== 'function') {
    sendResponse({ v: 1, ok: false, type: 'error', payload: { code: 'scanner_not_ready' }, observedUrl: observedUrl() });
    return;
  }
  Promise.resolve()
    .then(function () {
      return scanner.scan({
        maxGroups: (payload && payload.maxGroups) || 300,
        maxScrolls: (payload && payload.maxScrolls) || 15
      });
    })
    .then(function (res) {
      var groups = Array.isArray(res) ? res : (res && res.groups) || [];
      sendResponse({ v: 1, ok: true, type: 'scanResult', payload: { groups: groups }, observedUrl: observedUrl() });
    })
    .catch(function (e) {
      sendResponse({ v: 1, ok: false, type: 'error', payload: { code: 'scan_error', message: String((e && e.message) || e) }, observedUrl: observedUrl() });
    });
}

function onRuntimeMessage(msg, sender, sendResponse) {
  var type = msg && msg.type;
  if (type === 'fbq:connect' || type === 'fbq:hello' || type === 'ping') {
    if (!port) connect();
    sendResponse({ v: 1, ok: true, type: 'pong', payload: { connected: !!port }, observedUrl: observedUrl() });
    return false;
  }
  if (type === 'scan') {
    scanViaMessage(msg.payload || {}, sendResponse);
    return true; // async response
  }
  return false;
}
```

Đăng ký ngay trước `connect();` (dòng ~194): `RUNTIME.onMessage.addListener(onRuntimeMessage);`

S1e. Tự nối lại port (để trang runner mở **sau** content script vẫn lấy được port). Thêm biến đếm và sửa `connect()`:

```js
var connectAttempts = 0;

function connect() {
  connectAttempts += 1;
  port = RUNTIME.connect({ name: PORT_NAME });
  port.onMessage.addListener(function (env) {
    connectAttempts = 0;
    handleInbound(env);
  });
  port.onDisconnect.addListener(function () {
    void RUNTIME.lastError;
    port = null;
    if (connectAttempts < 5) {
      setTimeout(connect, Math.min(1000 * connectAttempts, 10000));
    }
  });
}
```

`onRuntimeMessage` nhánh `fbq:connect` phải `connectAttempts = 0;` trước khi `connect()` để lần handshake sau không bị chặn bởi giới hạn 5 lần.

Xử lý biên: nếu trang runner không mở, port disconnect ngay → tối đa 5 lần thử với backoff 1/2/3/4s rồi dừng; mỗi lần nhận `fbq:connect` sẽ reset và thử lại.

### S2 — `src/ui/runner.js`: sửa vòng đời chạy

S2a. Khai báo hằng còn thiếu (khối hằng số đầu file, cạnh `COOLDOWN_MS`):

```js
var MAX_LOG_LINES = 300;
```

S2b. `takeLease` — nhánh giữ lease phải chặn chuỗi promise:

```js
function takeLease(runId, cb) {
  state.runId = runId;
  sessionGet('lease').then(function (items) {
    var lease = items.lease;
    var n = now();
    if (lease && lease.until > n && lease.owner !== runId) {
      return Promise.reject({ code: 'lease_held' });
    }
    return sessionSet({ lease: { owner: runId, heartbeatAt: n, until: n + LEASE_TTL_MS } });
  }).then(function () {
    startHeartbeat();
    cb(null);
  }).catch(function (err) {
    if (err && err.code === 'lease_held') { cb('lease_held'); return; }
    startHeartbeat();
    cb(null);
  });
}
```

S2c. `onConnect` — chỉ nhận port của đúng tab đang điều khiển:

```js
RUNTIME.onConnect.addListener(function (p) {
  var senderTabId = p.sender && p.sender.tab ? p.sender.tab.id : null;
  if (state.tabId && senderTabId !== state.tabId) {
    log('Bỏ qua port từ tab ' + senderTabId);
    return;
  }
  state.port = p;
  state.portTabId = senderTabId;
  p.onMessage.addListener(onPortMessage);
  p.onDisconnect.addListener(function () {
    if (state.port === p) {
      state.port = null;
      state.portTabId = null;
      log('Mất kết nối nội dung');
    }
  });
  var it = state.navigatingItem;
  if (it) {
    state.navigatingItem = null;
    sendPing(it);
  }
});
```

Thêm `portTabId: null` vào object `state`.

S2d. `openTabAt` phải bỏ port cũ trước khi điều hướng (cùng tab id nên guard S2c không phân biệt được document):

```js
function openTabAt(url) {
  state.port = null;
  state.portTabId = null;
  return new Promise(function (resolve) { /* giữ nguyên thân cũ */ });
}
```

S2e. Thêm `waitForContent(item, cb)` — chờ **tab đã tới đúng URL** rồi mới ping; đây là thay cho `sendPing` ngay sau `openTabAt`:

```js
function waitForContent(item, cb) {
  var deadline = now() + 30000;
  if (state.timers.content) { clearTimeout(state.timers.content); state.timers.content = null; }
  function tick() {
    state.timers.content = null;
    if (state.stopping) { cb({ code: 'stopped' }); return; }
    if (!state.tabId) { cb({ code: 'no_tab' }); return; }
    TABS.get(state.tabId, function (tab) {
      void RUNTIME.lastError;
      var tabUrl = (tab && tab.url) || '';
      var arrived = item.isTimeline
        ? (tabUrl.indexOf('facebook.com') !== -1 && !isAbortUrl(tabUrl))
        : urlsMatch(tabUrl, item.url);
      if (arrived && state.port && state.portTabId === state.tabId) { cb(null); return; }
      if (now() > deadline) { cb({ code: 'content_timeout' }); return; }
      if (arrived && !state.port) {
        try { TABS.sendMessage(state.tabId, { v: 1, type: 'fbq:connect' }, function () { void RUNTIME.lastError; }); } catch (e) {}
      }
      state.timers.content = setTimeout(tick, 400);
    });
  }
  tick();
}
```

S2f. `runItem` — dùng `waitForContent` thay cho `sendPing` trực tiếp:

```js
}.then(function () {
  waitForContent(item, function (err) {
    if (err) { onNavFail(item, err); return; }
    sendPing(item);
  });
});
```

`clearAllTimers()` đã duyệt `state.timers` nên `content` tự được dọn.

S2g. `init()` — không cướp tab người dùng. Xoá khối `TABS.query({url:'https://*.facebook.com/*'}, ...)` và thay bằng:

```js
state.tabId = null;
state.port = null;
state.portTabId = null;
render();
startPoll();
setInterval(render, 1000);
if (wantStart && state.phase === 'idle') beginNewRun();
```

S2h. `STATE_LABELS` bổ sung 3 trạng thái đang hiện thô ra UI: `image_uploading: 'Đang tải ảnh...'`, `text_ok: 'Đã điền chữ'`, `images_ok: 'Đã tải ảnh'`. `ERROR_LABELS` bổ sung: `content_timeout: 'Không kết nối được trang Facebook'`, `composer_not_found: 'Không thấy ô soạn bài'`, `editor_not_found: 'Không thấy khung soạn bài'`, `image_input_not_found: 'Không thấy nút ảnh'`, `draft_present: 'Còn bài nháp'`, `scanner_not_ready: 'Bộ quét chưa sẵn sàng'`, `nav_fail: 'Không mở được trang'` (đã có), `no_port: 'Chưa nối được trang'`, `stopped: 'Đã dừng'`.

### S3 — `src/bg/sw.js`: gửi đúng kênh, quét chắc chắn

S3a. `fbq:start-run` / `fbq:stop-run` phải dùng `chrome.runtime.sendMessage` cho trang extension (không phải `chrome.tabs.sendMessage`):

```js
case 'openRunner':
case 'fbq:start-run': {
  var autostart = (msg.type === 'fbq:start-run') || !!(msg.payload && msg.payload.autostart);
  queryRunnerTabs(function (tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true }, function () {
        if (autostart) {
          try { chrome.runtime.sendMessage({ v: 1, type: 'fbq:start-run' }, function () { void chrome.runtime.lastError; }); } catch (e) {}
        }
        reply(sendResponse, true, 'opened', { tabId: tabs[0].id, reused: true });
      });
    } else {
      chrome.tabs.create({ url: runnerUrl(autostart), active: true }, function (tab) {
        reply(sendResponse, true, 'opened', { tabId: tab ? tab.id : null, reused: false });
      });
    }
  });
  return true;
}
case 'fbq:stop-run':
  queryRunnerTabs(function (tabs) {
    if (tabs && tabs.length > 0) {
      try { chrome.runtime.sendMessage({ v: 1, type: 'fbq:stop-run' }, function () { void chrome.runtime.lastError; }); } catch (e) {}
    }
    reply(sendResponse, true, 'stopped', {});
  });
  return true;
```

S3b. `scanGroups()` — bắt đầu quét **ngay** nếu tab đã `complete` khi callback `create` trả về, và probe lại tới 20s thay vì 1 lần 3s:

```js
function scanGroups(msg, sendResponse) {
  chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false }, function (tab) {
    if (!tab || typeof tab.id !== 'number') {
      reply(sendResponse, false, 'error', { code: 'scan_no_tab' });
      return;
    }
    var tabId = tab.id;
    var finished = false;
    var pollTimer = null;
    var deadlineTimer = setTimeout(function () { finishFail('scan_timeout'); }, 120000);

    function cleanup() {
      finished = true;
      clearTimeout(deadlineTimer);
      if (pollTimer) clearTimeout(pollTimer);
      try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) {}
      try { chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; }); } catch (e) {}
    }
    function finishFail(code) {
      if (finished) return;
      cleanup();
      reply(sendResponse, false, 'error', { ok: false, code: code });
    }
    function probe() {
      if (finished) return;
      chrome.tabs.sendMessage(tabId, { v: 1, type: 'scan', payload: { maxGroups: 300, maxScrolls: 20 } }, function (res) {
        if (finished) return;
        if (chrome.runtime.lastError || res === undefined) {
          pollTimer = setTimeout(probe, 1000);
          return;
        }
        storeScanResult(res);
      });
    }
    function listener(changedId, info) {
      if (changedId !== tabId || info.status !== 'complete') return;
      probe();
    }
    function storeScanResult(res) {
      if (finished) return;
      var groups = [];
      if (res) {
        if (Array.isArray(res.groups)) groups = res.groups;
        else if (res.payload && Array.isArray(res.payload.groups)) groups = res.payload.groups;
      }
      chrome.storage.local.get(null, function (all) {
        all = all || {};
        var merged = [];
        var sets = {};
        var i, g, key, old;
        for (i = 0; i < groups.length; i++) {
          g = groups[i];
          if (!g || !g.key) continue;
          key = g.key;
          old = all['grp:' + key];
          if (old) {
            old.name = g.name || old.name || key;
            old.url = g.url || old.url;
            merged.push(old);
            sets['grp:' + key] = old;
          } else {
            var rec = { key: key, url: g.url || ('https://www.facebook.com/groups/' + key), name: g.name || key, enabled: true, lastPostedAt: 0 };
            merged.push(rec);
            sets['grp:' + key] = rec;
          }
        }
        chrome.storage.local.set(sets, function () {
          if (finished) return;
          var count = merged.length;
          cleanup();
          reply(sendResponse, true, 'scanResult', { ok: true, count: count, groups: merged });
        });
      });
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, function (t) {
      if (!finished && t && t.status === 'complete') probe();
    });
  });
}
```

Khác biệt cố ý: group mới `enabled: true` (quét xong là tick sẵn, bấm Start chạy được ngay); timeout 120s; `probe()` lặp 1s/lần thay vì 1 lần 3s.

S3c. `handleScanResult` cũ bị thay hoàn toàn bởi `storeScanResult` ở trên (không để lại hàm chết).

### S4 — `src/content/adapter-group.js`: không báo thành công giả

S4a. Đầu `postFlow()`, cạnh `var settled = false;` thêm `var result = {};`.

S4b. `doPost()`:

```js
async function doPost(cb) {
  var btn = s.assertDom(postKind);
  if (!btn) {
    result.failed = true;
    result.errorCode = 'post_disabled';
    result.errorText = 'không thấy nút Đăng trong hộp thoại';
    cb();
    return;
  }
  d.clickEl(btn);
  try {
    await d.waitFor(function () { return !document.querySelector('[role="dialog"]'); }, 45000);
  } catch (e) {
    result.failed = true;
    result.errorCode = 'post_timeout';
    result.errorText = 'hộp thoại soạn bài không đóng sau khi bấm Đăng';
    cb();
    return;
  }
  var alertEl = s.assertDom('ALERT');
  var alertText = alertEl ? (alertEl.textContent || '') : '';
  if (root.safety && typeof root.safety.isRateLimitAlert === 'function' && root.safety.isRateLimitAlert(alertText)) {
    result.failed = true;
    result.errorCode = 'rate_limited';
    result.errorText = alertText.slice(0, 200);
    cb();
    return;
  }
  result.failed = /không thể đăng|cannot post|failed to post|something went wrong|bài viết[\s\S]{0,40}không/i.test(alertText);
  result.posted = !result.failed;
  cb();
}
```

Bỏ mọi tham chiếu `result.cancelled` trong `result.posted` (cancel đã xử lý trước đó bằng nhánh riêng).

S4c. Bước 3 của `prepareFlow` (draft check): thay `throw stepError('draft_present'...)` bằng dọn sạch rồi điền:

```js
if (d.normText(editor.innerText || '') !== '') {
  editor.focus();
  document.execCommand('selectAll', false);
  document.execCommand('delete', false);
}
```

Xoá `draft_present` khỏi `ERROR_LABELS` đã thêm ở S2h nếu không dùng nữa (giữ cũng vô hại — nhưng theo quy ước "không để nhánh chết", bỏ).

### S5 — `src/content/selectors.js`: khớp DOM thật

S5a. `PHOTO_BUTTON` và `PHOTO_BUTTON_TIMELINE` thêm biến thể chữ thường (đo được trên DOM thật: `aria-label="Photo/video"`):

```js
'[aria-label="Photo/video"]',
'[aria-label="Ảnh/video"]',
```

S5b. `COMPOSER_TRIGGER` — câu thật trên tường là `What's on your mind, Tiến?`, và trên group là `Bạn viết gì đi...`; bỏ neo `$` cuối:

```js
textMatch(/^(Write something|Viết gì đó|Bạn viết gì|Bạn đang nghĩ gì|Viết nội dung|What's on your mind)/i)
```

`COMPOSER_TRIGGER_TIMELINE` giữ nguyên `textMatch` không neo cuối (đã đúng).

S5c. `POST_BUTTON` / `POST_BUTTON_TIMELINE` giữ nguyên — xác nhận lại lúc verify; nếu nút thật là `[role="dialog"] div[aria-label="Đăng"]` (không `role="button"`) thì candidate 2 (`[role="dialog"] [aria-label="Đăng"]`) bắt được.

### S6 — `src/ui/popup.js`: phản hồi có nghĩa

S6a. `scanGroups()` callback:

```js
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
```

S6b. `startRun()` — xoá phiên cũ kẹt trước khi tạo phiên mới, để runner không hiện "Sẵn sàng tiếp tục" của lần hỏng trước:

```js
items.settings = state.settings;
items.autostartPending = true;
if (chromeOk()) {
  chrome.storage.local.remove('qmeta', function () { void chrome.runtime.lastError; });
}
localSet(items);
```

(thứ tự: `remove('qmeta')` đặt **trước** `localSet(items)` để không đua; giữ nguyên phần còn lại.)

### S7 — Test hồi quy cho envelope

Tạo `test/protocol.test.js` (test runner tự nhặt qua `node --test test/*.js`):

```js
'use strict';
var assert = require('assert');
var runner = require('../src/content/runner.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + ': ' + (e && e.message)); }
}

test('buildReply dat observedUrl o cap envelope', function () {
  var r = runner.buildReply('run-1', 123, '7', 'pong', { ready: true }, 'https://www.facebook.com/groups/1');
  assert.strictEqual(r.v, 1);
  assert.strictEqual(r.runId, 'run-1');
  assert.strictEqual(r.epoch, 123);
  assert.strictEqual(r.requestId, '7');
  assert.strictEqual(r.type, 'pong');
  assert.strictEqual(r.observedUrl, 'https://www.facebook.com/groups/1');
  assert.deepStrictEqual(r.payload, { ready: true });
  assert.strictEqual(r.payload.observedUrl, undefined);
});

test('buildReply payload mac dinh la object rong', function () {
  var r = runner.buildReply(null, null, null, 'cancelled');
  assert.deepStrictEqual(r.payload, {});
  assert.strictEqual(r.observedUrl, '');
  assert.strictEqual(r.runId, null);
});

if (failed) { console.error(failed + ' failed, ' + passed + ' passed'); process.exit(1); }
console.log(passed + ' passed');
```

Test này khoá đúng lỗi #3 (observedUrl) và chạy được trong Node vì S1c export `buildReply` ở nhánh không có `chrome`.

---

## Critical files & anchors

- `src/content/runner.js` — `reply()` (~38), `connect()` (~46), `connect();` (~194), object export (~196). Không có `chrome.runtime.onMessage` nào trong file; đây là chỗ thêm S1d.
- `src/ui/runner.js` — `log()` (128-138, `MAX_LOG_LINES` chưa khai báo), `takeLease()` (337-355), `RUNTIME.onConnect` (591-613), `sendPing()` (614-632), `runItem()` (~670), `init()` (1158-1215), hằng số đầu file (10-20).
- `src/bg/sw.js` — `onMessage` switch (32-84), `scanGroups()` (86-152).
- `src/content/adapter-group.js` — `postFlow()` (165-291), bước draft check (~73-78).
- `src/content/selectors.js` — `TABLES` (29-93).

## Verification

Chạy tại `D:/extension`.

1. **Cú pháp + toàn bộ test cũ:**
   ```
   node --check src/content/runner.js && node --check src/ui/runner.js && node --check src/bg/sw.js && node --check src/content/adapter-group.js && node --check src/content/selectors.js && node --check src/ui/popup.js
   npm test
   ```
   Kỳ vọng: 0 lỗi cú pháp; `npm test` xanh toàn bộ (hiện có 44 test), cộng 2 test mới của `test/protocol.test.js`.

2. **Nạp lại extension:** `chrome://extensions` → card "FB Group Poster" → **Reload**.

3. **Cầu nối content script (khoá lỗi #2).** Mở `chrome-extension://<id>/src/ui/popup.html` trong một tab, mở DevTools console, chạy:
   ```js
   chrome.tabs.query({url:'https://*.facebook.com/*'}, (tabs) => {
     chrome.tabs.sendMessage(tabs[0].id, {v:1, type:'fbq:connect'}, (r) => console.log(r, chrome.runtime.lastError && chrome.runtime.lastError.message));
   });
   ```
   Trước khi sửa: `undefined` + `"Could not establish connection. Receiving end does not exist."`
   Sau khi sửa: object `{v:1, ok:true, type:'pong', payload:{connected:...}, observedUrl:'https://www.facebook.com/...'}` và **không** có `lastError`.

4. **Quét group (khoá lỗi #3, #11).** Bấm **🔍 Tìm nhóm của tôi**.
   - Nếu tài khoản đã tham gia nhóm: `#scan-status` = `✅ Tìm thấy N nhóm`, checklist có N dòng **đã tick sẵn**, và `chrome.storage.local` xuất hiện các key `grp:<id>`. Kiểm tra bằng console trang extension: `chrome.storage.local.get(null, a => console.log(Object.keys(a).filter(k=>k.startsWith('grp:')).length))` → phải > 0.
   - Nếu tài khoản chưa có nhóm (trạng thái hiện tại của profile đã kiểm tra): `#scan-status` = `⚠️ Không thấy nhóm nào...` — **không** phải lỗi `❌ Không quét được nhóm`. Đây là dấu hiệu cầu nối đã thông.

5. **Đăng thử chế độ timeline (khoá lỗi #1, #3, #4, #5).** Popup → `🏠 Chỉ tường của tôi` → nhập `test 1 2 3` → **🚀 ĐĂNG BÀI NGAY**.
   - Tab "Bảng điều khiển" phải tự mở và chạy; `#runner-log` hiện các dòng có timestamp, lần lượt: `Đợi ...`/`Đang mở trang FB`, `Đang điền bài`, `Đếm ngược`, `Đăng thành công: timeline`.
   - Nếu log **trống hoàn toàn** → `MAX_LOG_LINES` chưa được khai báo (S2a sót).
   - Trong lúc chạy, content script hiện overlay đếm ngược 10s trên facebook.com; hết 10s phải bấm Đăng thật và hộp thoại soạn bài đóng lại.
   - Kết quả cuối: bảng dòng `timeline` = `✅ Đã đăng thành công`; `qmeta.status` = `done` (kiểm tra: `chrome.storage.local.get('qmeta', a=>console.log(a.qmeta.status))`).

6. **Đăng thử chế độ group (khoá lỗi #6, #7, #9, #10).** Popup → `👥 Đăng vào nhóm` → mở `Dán link nhóm thủ công` → dán 1 link nhóm mà tài khoản đã tham gia → **Thêm vào danh sách** → tick nhóm → **🚀 ĐĂNG BÀI NGAY**.
   - Tab Facebook của riêng tiến trình phải được **tạo mới** (không phải tab đang mở của người dùng), URL đổi sang link nhóm, bài được điền, đếm ngược, đăng.
   - Sau khi xong, tab đó tự đóng; **các tab Facebook khác của người dùng không bị đóng/điều hướng**.

7. **Không còn báo thành công giả (khoá lỗi #9).** Chạy lại bước 6 với một link nhóm mà tài khoản **không** phải thành viên: kỳ vọng dòng đó `❌ Lỗi` + `Không thấy ô soạn bài`/`Không thấy khung soạn bài`, **không** phải `✅ Đã đăng thành công`.

8. **Nút Dừng (khoá lỗi #4).** Trong lúc runner đang đếm ngược, bấm `⏹ DỪNG` ở popup → overlay biến mất, dòng hiện tại thành `⏭ Đã hủy`, `qmeta.status` = `paused`/`stopped`, không có bài nào được đăng.

## Assumptions & contingencies

- **Tài khoản dùng để test hiện có 0 group** (`/groups/joins/` rỗng, đã kiểm tra). Vì vậy bước 5 (timeline) là acceptance chính; bước 6 cần một link nhóm hợp lệ. Nếu không có link nhóm nào → bước 6 chuyển sang kiểm tra `❌ Không thấy ô soạn bài` (đúng là lỗi, không phải treo) và ghi rõ trong báo cáo là chưa E2E được group mode.
- **Facebook đang ở locale tiếng Anh** trên profile này; selector giữ cả Anh và Việt. Nếu về sau đổi locale, danh sách trong `TABLES` đã phủ cả hai.
- **Nếu sau khi sửa, `fbq:connect` trả `pong` nhưng `state.port` ở runner vẫn `null`**: nghĩa là port của content script bị `onConnect` bỏ qua do `senderTabId !== state.tabId` (tab bị Chrome tách/đổi id). Xử lý: trong `onConnect`, nếu `state.tabId` là `null` thì nhận port và gán `state.tabId = senderTabId` — chỉ áp dụng khi chưa có tab, không nới lỏng guard khi đã có tab.
- **Nếu Facebook chặn `document.execCommand('insertText')`** (soạn bài không nhận chữ): `prepareFlow` đã có retry + `insert_rejected`; khi đó dòng hiện `⚠️ Cần kiểm tra tay` — không tự ý đổi sang `keyboard` giả lập trong plan này.
