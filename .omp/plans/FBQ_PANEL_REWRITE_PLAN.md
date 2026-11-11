# fbq-panel-rewrite — Một panel, một engine, đăng bài chạy thật

## Context

Justin báo: chức năng đăng bài tự động vẫn không chạy, kiến trúc quá rối, UI không linh hoạt.

Nguyên nhân gốc đã xác định bằng code (không phải phỏng đoán): port giữa content script và trang runner bị mồ côi. `src/content/runner.js:242` chỉ gọi `connect()` khi `port` falsy, nhưng port đã được tạo lúc content script nạp (dòng 258) và nằm ở service worker; trang runner mở sau không nhận lại port đó, nên `state.port` vẫn `null` và `waitForContent` (`src/ui/runner.js:565`) hết 30s → `content_timeout`. `fbq:connect` trả `connected:true` trong khi không có port mới.

Trạng thái cuối: một trang `panel.html` duy nhất (soạn bài, chọn nhóm, hàng đợi, chạy, log, cài đặt), một engine dùng `chrome.tabs.sendMessage` request/response không port/lease/heartbeat, một key `run` duy nhất trong `chrome.storage.local`. Xóa popup, runner, và toàn bộ tầng trạng thái trùng lặp.

## Skills phải load

Cả ba skill dưới đây có `disable-model-invocation: true` — **không tự kích hoạt**, phải nạp tường minh bằng `read`. Subagent không có `<skills>` catalog trong prompt, nên main agent phải truyền đường dẫn tuyệt đối.

| Skill | Đường dẫn tuyệt đối | Ai load | Khi nào |
|---|---|---|---|
| `skill://ask-matt` | `C:/Users/ADMIN/.omp/agent/skills/ask-matt/SKILL.md` | main agent | S0. Dùng để xác nhận flow; repo solo (`git shortlog -sne --all   wc -l` < 4) nên chạy chế độ solo, không cần overlay team. Nếu ask-matt chỉ sang flow khác, DỪNG và báo Justin, không tự đổi. |
| `skill://egm-brainstorm` | `C:/Users/ADMIN/.omp/plugins/cache/plugins/egm___egm___0.1.0/skills/egm-brainstorm/SKILL.md` | main agent, spawn `egm-synthesizer` | S4, sau khi `panel.html`/`panel.css` đã dựng, trước khi nối engine. Chạy **Mode: BRAINSTORM** trên giả thuyết đã chốt trong plan này (một trang, một engine, tabs.sendMessage). Chỉ nhận findings; **không** để nó mở lại quyết định nào trong Approach — findings nào đòi đổi thiết kế thì ghi lại, báo Justin, không tự áp dụng. |
| `skill://egm-review-loop` | `C:/Users/ADMIN/.omp/plugins/cache/plugins/egm___egm___0.1.0/skills/egm-review-loop/SKILL.md` | main agent, direct dispatch reviewers | S7. Target file: `.omp/plans/FBQ_PANEL_REWRITE_PLAN.md` (bản copy ở S0). Reviewers: `implementation_readiness` + `codebase_details`, standards `implementation-readiness-standard` và `re-implementation-standard`. Đúng một vòng; findings gom thành một batch sửa duy nhất, không vòng hai. |

Bổ sung, không phải egm: `skill://code-review` (`C:/Users/ADMIN/.omp/agent/skills/code-review/SKILL.md`) chạy một lần trên diff sau S7, hai trục Standards + Spec.

`typescript-pro` do harness-stack gợi ý **không áp dụng**: repo là JS thuần, không có `tsconfig.json`.

Phân vai: main agent giữ S0, S5, S6, S7 và integration. Subagent `coder` nhận S1, S2, S3, S4 — mỗi packet phải kèm đoạn này và đường dẫn skill nếu packet chạm UI.

## Approach

### S0. Baseline + copy plan vào repo

1. Chạy `npm test` tại `D:/extension`, ghi lại số test đang pass (kỳ vọng 45).
2. Copy file plan này sang `D:/extension/.omp/plans/FBQ_PANEL_REWRITE_PLAN.md` (nguyên văn). Đây là target cho `egm-review-loop` ở S7.
3. Load `skill://ask-matt`, chạy bước xác định solo/team, ghi verdict vào log thực thi. Không đổi kế hoạch nếu verdict là solo/team — chỉ ghi nhận.

### S1. Ba module thuần mới (chưa ai import)

Không có module tương đương: hiện `buildReply`/`urlsMatch`/labels nằm rải trong `src/ui/runner.js`, `src/content/runner.js`, `src/content/adapter-group.js`.

**`src/core/protocol.js`** (mới) — nguồn duy nhất cho hợp đồng message:

```js
(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.protocol) return;

  var V = 1;
  var TYPES = {
    PING: 'fbq:ping',
    PROBE: 'fbq:probe',
    FILL: 'fbq:fill',
    SUBMIT: 'fbq:submit',
    CANCEL: 'fbq:cancel',
    SCAN: 'fbq:scan',
    SCAN_GROUPS: 'fbq:scan-groups',
    OPEN_PANEL: 'fbq:open-panel'
  };

  function ok(payload) { return { v: V, ok: true, payload: payload || {} }; }
  function fail(code, message) {
    return { v: V, ok: false, payload: { code: code, message: message || String(code) } };
  }

  root.protocol = { V: V, TYPES: TYPES, ok: ok, fail: fail };
  root.installed.protocol = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.protocol;
}
```

**`src/core/status.js`** (mới) — nhãn tiếng Việt cho state/error, dùng chung panel và log:

```js
var STATE_LABELS = {
  queued: 'Chờ', navigating: 'Đang mở trang', filling: 'Đang điền bài',
  countdown: 'Đếm ngược', posted: '✅ Đã đăng', failed: '❌ Lỗi',
  cancelled: '⏭ Đã hủy', unknown: '❔ Không rõ', needs_manual: '⚠️ Cần kiểm tra tay',
  skipped: '— Bỏ qua'
};
var ERROR_LABELS = {
  rate_limited: 'Giới hạn đăng', nav_stuck: 'Không mở được trang',
  content_not_ready: 'Trang FB chưa sẵn sàng', probe_timeout: 'Không thấy trang FB',
  composer_not_found: 'Không thấy ô soạn bài', editor_not_found: 'Không thấy khung soạn bài',
  image_input_not_found: 'Không thấy nút ảnh', insert_rejected: 'Bị chặn chèn nội dung',
  upload_rejected: 'Tải ảnh thất bại', post_disabled: 'Nút Đăng bị khóa',
  post_failed: 'Đăng thất bại', post_timeout: 'Hộp thoại không đóng',
  scanner_not_ready: 'Bộ quét chưa sẵn sàng', scan_timeout: 'Quét nhóm quá lâu',
  stopped: 'Đã dừng', unknown: 'Lỗi không xác định'
};
```
Export `root.status = { STATE_LABELS, ERROR_LABELS, stateLabel(s), errorLabel(c) }`; `stateLabel` trả `STATE_LABELS[s] || s`, `errorLabel` trả `ERROR_LABELS[c] || c || ''`.

**`src/core/queue.js`** (mới) — logic thuần, không DOM, không `chrome`:

```js
buildQueue(groups, settings, opts) -> { items: [...], skipped: [...] }
```
- `opts = { now, rng, timeline: {enabled, url, text, imageIds}, dayCount }`.
- Bỏ group `enabled === false` → `skipped.push({key, reason:'disabled'})`.
- Bỏ group có `lastPostedAt > 0 && now - lastPostedAt < settings.groupCooldownDays * 86400000` → `reason:'cooldown'`.
- `limit = min(settings.maxPerRun || 50, max(0, settings.dailyCap - dayCount))`; danh sách ứng viên `shuffle(eligible, rng).slice(0, limit)`.
- Mỗi item: `{ key, url, name, isTimeline: false, state: 'queued', attempts: 0, errorCode: null, errorText: null, text: '', imageIds: [], postedAt: 0, lastStepAt: 0 }`.
- Nếu `timeline.enabled`: push cuối `{ key: 'timeline', url: timeline.url, name: 'Tường của tôi', isTimeline: true, ... }` với `text`/`imageIds` riêng.
- Không sort lại danh sách đã shuffle; thứ tự trả về là thứ tự chạy.

```js
urlsMatch(a, b) -> boolean
```
Strip `?`/`#`, strip trailing `/`, so bằng nhau hoặc prefix một chiều (giữ đúng hành vi `src/ui/runner.js:541-551` hiện tại). Dùng cho probe.

```js
nextIndex(run) -> number   // index đầu tiên có state 'queued', -1 nếu hết
computeDelayMs(settings, rng) -> number  // gọi root.safety.chooseDelaySec nếu có, else randInt(min,max)*1000
applyResult(run, key, patch) -> run      // gán patch vào item, cập nhật consecutiveFails/lastStepAt
```

**`src/core/schema.js`** — thay `Q_STATES` bằng đúng tập state mới:
`['queued','navigating','filling','countdown','posted','failed','cancelled','unknown','needs_manual','skipped']`. Xóa `defaultQMeta`/`defaultQItem`/`migrate` (không còn ai gọi sau S6).

**Test ngay trong S1**: `test/queue.test.js` (mới) và `test/protocol.test.js` (viết lại hoàn toàn — bản cũ khóa `buildReply`, thứ bị xóa ở S2).

`test/queue.test.js` phải khóa đúng các hành vi sau:
1. Group `enabled:false` không vào `items`, có trong `skipped` với `reason:'disabled'`.
2. Group có `lastPostedAt` trong hạn cooldown bị loại với `reason:'cooldown'`; ngoài hạn thì vào.
3. `maxPerRun = 2` với 5 group → `items.length === 2`.
4. `dailyCap = 3`, `dayCount = 2` → chỉ 1 item (không có timeline).
5. `timeline.enabled` → item cuối cùng có `key === 'timeline'`, `isTimeline === true`.
6. `urlsMatch('https://www.facebook.com/groups/123/?ref=x', 'https://www.facebook.com/groups/123')` → `true`; `.../groups/123` vs `.../groups/456` → `false`.
7. `computeDelayMs` với `rng = () => 0` nằm trong `[minDelaySec*1000, maxDelaySec*1000]`.

`test/protocol.test.js` khóa: `TYPES.PROBE === 'fbq:probe'` (và 7 hằng còn lại), `ok({a:1})` deep-equal `{v:1, ok:true, payload:{a:1}}`, `fail('x')` → `{v:1, ok:false, payload:{code:'x', message:'x'}}`.

Chạy `npm test` — phải xanh trước khi sang S2.

### S2. Content script: bỏ port, thành responder vô trạng thái

**`src/content/runner.js`** — viết lại toàn bộ. Xóa: `PORT_NAME`, `connect`, `connectAttempts`, `port`, `pending`, `nextRequestId`, `buffers`, `buildReply`, `envelope`, `postPort`, `reply`, `fail`, `handleInbound`, `handlePrepare`, `callPrepare`, `handlePost`, `handleScan`, `scanViaMessage`, hai khai báo `var ENV_VERSION` trùng.

Cấu trúc mới (giữ Node guard để `test/load.js` require được):

```js
function href() { return (typeof location === 'object' && location && location.href) || ''; }
function groupKey() { var s = root.scanner; return s && s.groupKeyFromUrl ? s.groupKeyFromUrl(href()) : null; }

var cancelled = false;

function onMessage(msg, sender, sendResponse) {
  var P = root.protocol;
  if (!msg || !P || !msg.type) return false;
  var p = msg.payload || {};
  switch (msg.type) {
    case P.TYPES.PING:
    case P.TYPES.PROBE:
      sendResponse(P.ok({ url: href(), key: groupKey() }));
      return false;
    case P.TYPES.CANCEL:
      cancelled = true;
      sendResponse(P.ok({ cancelled: true }));
      return false;
    case P.TYPES.FILL: cancelled = false; runFill(p, sendResponse); return true;
    case P.TYPES.SUBMIT: runSubmit(p, sendResponse); return true;
    case P.TYPES.SCAN: runScan(p, sendResponse); return true;
    default: return false;
  }
}
chrome.runtime.onMessage.addListener(onMessage);
```

`runFill(p, sendResponse)`: `fn = adapter[p.isTimeline ? 'prepareTimeline' : 'prepare']`; thiếu fn → `sendResponse(P.fail('adapter_not_found'))`. Gọi `fn(p.text || '', p.images || [], p.opts || {})` trong `Promise.resolve().then(...)`; thành công → `P.ok({ paragraphs: r.paragraphs, images: (p.images||[]).length })`; lỗi → `P.fail(e.code || 'prepare_error', e.message)`.

`runSubmit(p, sendResponse)`: `fn = adapter[p.isTimeline ? 'postTimeline' : 'post']`; gọi `fn({ confirmWindowSec: p.confirmWindowSec, isCancelled: function () { return cancelled; } })`; `r.cancelled` → `P.ok({ cancelled: true })`; `r.failed` → `P.fail(r.errorCode || 'post_failed', r.errorText)`; còn lại → `P.ok({ posted: true })`.

`runScan(p, sendResponse)`: `scanner.scan({ maxGroups: p.maxGroups || 300, maxScrolls: p.maxScrolls || 20 })` → `P.ok({ groups })`; lỗi → `P.fail('scan_error', msg)`.

Không còn `root.runner` export. Guard khi thiếu `chrome.runtime`: set `root.installed.runner = 1; return;` trước mọi thứ khác.

**`manifest.json`**: chèn `"src/core/protocol.js"` ngay sau `"src/core/safety.js"` trong `content_scripts[0].js`, trước `"src/content/dom.js"`.

**`src/content/adapter-group.js`** — ba sửa đổi, không đổi tên export:

1. Thay `countThumbs` (dòng 27-33):
```js
var THUMB_SEL = '[role="dialog"] img[src^="blob:"], [role="dialog"] img[src^="data:"]';
function countThumbs(scopeEl) {
  if (typeof document === 'undefined') return 0;
  var sel = (currentOpts && currentOpts.thumbnailSelector) || THUMB_SEL;
  return (scopeEl || document).querySelectorAll(sel).length;
}
```
Lý do: bản cũ fallback `dialog.querySelectorAll('img').length` đếm cả avatar/icon nên luôn > 0.

2. Vòng ảnh (dòng 118-145) — đo mốc **trước** khi dispatch, và đòi tăng tuyệt đối:
```js
var baseThumbs = countThumbs();
for (j = 0; j < images.length; j++) {
  ...
  var before = countThumbs();
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  var grew = false;
  try { await d.waitFor(function () { return countThumbs() > before; }, 10000); grew = true; } catch (e) { grew = false; }
  if (!grew) {
    var dt2 = new DataTransfer();
    dt2.items.add(file);
    (editor || document.body).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
    try { await d.waitFor(function () { return countThumbs() > before; }, 10000); grew = true; } catch (e2) { grew = false; }
  }
  if (!grew) throw stepError('upload_rejected', 'ảnh ' + (j + 1) + ' không hiện thumbnail');
}
try { await d.waitFor(function () { return countThumbs() >= baseThumbs + images.length; }, 15000); }
catch (e3) { throw stepError('upload_rejected', 'thiếu thumbnail sau khi tải album'); }
```
Xóa nhánh `countThumbs() >= j + 1` (false positive đã xác định).

3. `postFlow` — hủy đúng cách. Xóa `var cancelKey = opts.cancelKey || 'Escape'` và mọi tham chiếu `cancelKey`; `keyHandler` luôn so `e.key === 'Escape'`. Trong `setInterval` của overlay thêm dòng đầu:
```js
if (typeof opts.isCancelled === 'function' && opts.isCancelled()) { fire('cancel'); return; }
```
`doPost` giữ nguyên logic hiện tại nhưng đặt `result.errorCode = 'post_failed'` khi `result.failed === true` do alert khớp regex, để panel hiện nhãn thay vì chuỗi trống.

**`src/content/selectors.js`**: thêm một candidate vào `EDITOR` và `EDITOR_TIMELINE` — `'[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]'` đứng đầu bảng. Không đổi `SELECTOR_VERSION`.

Chạy `node --check src/content/runner.js src/content/adapter-group.js src/content/selectors.js` và `npm test`.

### S3. Engine

**`src/ui/engine.js`** (mới). Nạp sau `protocol.js`, `queue.js`, `status.js`, `safety.js`, `assets.js`.

Trạng thái trong RAM: `var state = { run: null, settings: null, groups: [], tabId: null, timer: null, busy: false };`

Storage: `run`, `settings`, `groups`, `draft`, `safe:day:<YYYY-MM-DD>`. Không dùng `chrome.storage.session`, không lease, không `qitem:*`, không `qmeta`.

Lõi truyền thông:

```js
function send(tabId, msg, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, payload: { code: 'content_not_ready' } }); } }, timeoutMs || 30000);
    try {
      chrome.tabs.sendMessage(tabId, msg, function (res) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        void chrome.runtime.lastError;
        resolve(res && typeof res === 'object' ? res : { ok: false, payload: { code: 'content_not_ready' } });
      });
    } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, payload: { code: 'content_not_ready' } }); } }
  });
}
```

`waitReady(tabId, item)`: deadline `now + 30000`; lặp `await send(tabId, {type:'fbq:probe'}, 3000)`, nếu `res.ok && urlsMatch(res.payload.url, item.url)` → `true`, else `await sleep(500)`. Quá hạn → `false`.

`ensureTab(item)`:
```js
chrome.tabs.get(state.tabId, cb)   // lỗi -> tạo mới
// có tab: chrome.tabs.update(tabId, { url: item.url, active: false })
// chưa có: chrome.tabs.create({ url: item.url, active: false })
```
Không kéo focus của người dùng. Ghi `state.tabId`.

`start()`:
1. `localGet(['settings','groups','run','draft','safe:day:'+dayKey])`.
2. Nếu `run && run.status === 'running'` → coi là phiên cũ chết, đặt `run.status = 'paused'`, không tự chạy lại.
3. `const built = queue.buildQueue(groups, settings, { now, rng: Math.random, timeline: {enabled, url, text, imageIds}, dayCount })`; nếu `built.items.length === 0` → `setStatus('⚠️ Không có mục nào để đăng')`, dừng.
4. `state.run = { v:1, id:'r-'+now, status:'running', startedAt:now, finishedAt:0, cancelRequested:false, consecutiveFails:0, items: built.items, log: [] }`; `saveRun()`.
5. `loop()`.

`loop()` (tuần tự, không `await` chồng):
```js
if (!state.run || state.run.status !== 'running') return;
if (state.run.cancelRequested) { finish('stopped'); return; }
var i = queue.nextIndex(state.run);
if (i < 0) { finish('done'); return; }
var item = state.run.items[i];
item.state = 'navigating'; item.attempts += 1; item.lastStepAt = now(); saveRun(); render();
ensureTab(item).then(function () { return waitReady(state.tabId, item); }).then(function (ready) {
  if (!ready) return failItem(item, 'content_not_ready');
  item.state = 'filling'; saveRun(); render();
  return send(state.tabId, { v: 1, type: 'fbq:fill', payload: {
    text: resolveText(item), images: resolveImages(item), opts: { confirmWindowSec: state.settings.confirmWindowSec },
    isTimeline: item.isTimeline
  } }, 300000).then(function (res) { if (!res.ok) return failItem(item, res.payload.code); step2(item); });
});
```
`step2(item)`: `item.state='countdown'`; `saveRun()`; gửi `fbq:submit` (timeout 120000). Kết quả:
- `res.payload.cancelled` → `item.state='cancelled'`.
- `!res.ok` && `code === 'rate_limited'` → `finish('stopped', 'rate_limited')`.
- `!res.ok` → `failItem(item, res.payload.code, res.payload.message)`.
- `res.ok` → `item.state='posted'`, `item.postedAt=now`, `consecutiveFails=0`, tăng `safe:day:<today>.count` và cập nhật `groups[k].lastPostedAt`, `saveRun()`, `render()`.
Rồi `afterItem(item)`.

`failItem(item, code, message)`: các mã `insert_rejected|upload_rejected|post_disabled` → `state='needs_manual'`; còn lại `state='failed'`; ghi `errorCode/errorText`; nếu `attempts <= (settings.retryBeforeClick||0)` và mã không thuộc nhóm manual → đặt lại `state='queued'`; `consecutiveFails += 1`; `saveRun(); render()`; gọi `afterItem(item)`.

`afterItem(item)`: nếu `consecutiveFails >= (settings.stopAfterConsecutiveFailures || 3)` → `finish('paused')`; nếu `cancelRequested` → `finish('stopped')`; else `state.timer = setTimeout(loop, queue.computeDelayMs(state.settings, Math.random))` và hiển thị đếm ngược nghỉ.

`stop()`: `run.cancelRequested = true`; gửi `fbq:cancel` tới `state.tabId` nếu có; `clearTimeout(state.timer)`; nếu item hiện tại đang `countdown` → `state='cancelled'`; `finish('stopped')`.

`pause()`: đặt `state.paused = true`; sau item hiện tại → `finish('paused')`.
`resume()`: `run.status='running'`, `paused=false`, `loop()`.

`finish(status)`: `run.status = status; run.finishedAt = now; saveRun(); render();` notify qua `chrome.notifications.create('fbq-finish-'+now, {...})` với body `Hoàn tất: <posted> đăng, <failed> lỗi, <cancelled> hủy`.

`resolveText(item)`: `item.text` nếu có, else `run.snapshotText`; áp spintax bằng `safety.resolveText(raw, safety.textSeedForTarget(run.id, item.key))`; fallback `spintax.render(spintax.parse(raw), hash.fnv1a(item.key + '|' + run.id))`.
`resolveImages(item)`: `assets.openDB` → `getAsset` từng id → `blobToBase64` (giữ hàm hiện có ở `src/ui/runner.js:763`) → `[{ b64, mime, name }]`.

Export `root.engine = { start, stop, pause, resume, retryItem, moveItem, removeItem, getRun, getSettings, subscribe }`; `subscribe(fn)` gọi `fn()` mỗi lần `render()`.

`retryItem(key)`: đặt item `state='queued'`, `errorCode=null`, `saveRun()`, nếu `run.status !== 'running'` → `run.status='running'; loop();`.
`moveItem(key, delta)`: đổi chỗ trong `run.items` với item liền kề cùng `isTimeline === false` (item `timeline` luôn cuối), `saveRun()`.
`removeItem(key)`: bỏ khỏi `run.items` nếu `state === 'queued'`, `saveRun()`.

`saveRun()`: `chrome.storage.local.set({ run: state.run })`; debounce 200ms cho cập nhật `state` trung gian, ghi ngay (không debounce) ở các mốc `start/finish/posted/failed`.

Chạy `node --check src/ui/engine.js`.

### S4. Panel — một trang, bố cục co giãn

**`src/ui/panel.html`** (mới). Bố cục: header cố định, board 3 cột co giãn có splitter, footer là log. Các khối dùng `<details open>` để thu gọn.

Thành phần bắt buộc (id giữ nguyên chính xác):

```html
<header>
  <h1>FB Group Poster</h1>
  <span id="badge-daily">🟢 Hôm nay: 0/20</span>
  <span id="status">Sẵn sàng</span>
  <button id="btn-start">▶ Bắt đầu</button>
  <button id="btn-pause">⏸ Tạm dừng</button>
  <button id="btn-stop">⏹ Dừng</button>
  <progress id="progress" max="1" value="0"></progress>
  <span id="eta"></span>
</header>
<div id="board">
  <section id="col-compose">…</section>
  <div class="splitter" data-target="compose"></div>
  <section id="col-groups">…</section>
  <div class="splitter" data-target="groups"></div>
  <section id="col-queue">…</section>
</div>
<pre id="log"></pre>
```

`#col-compose`: `#post-text` (textarea), `#post-images` (file, multiple, hidden) + label "📷 Chọn ảnh", `#thumbs` (mỗi ảnh có nút `✕` xóa), `#spintax-hint`, `#variant-preview`, radio `name="mode"` value `groups|timeline`, `#timeline-url` (chỉ hiện khi mode timeline, placeholder `Để trống = tường của bạn`).

`#col-groups`: `#btn-scan` "🔍 Tìm nhóm của tôi", `#scan-status`, `#group-filter`, `#btn-select-all` "Chọn tất cả", `#btn-select-none` "Bỏ chọn", `#group-count`, `#group-list`, `#group-urls` (textarea) + `#btn-add-groups` "Thêm link".

`#col-queue`: bảng `#queue-rows` với cột `#`, `Nhóm`, `Trạng thái`, `Lỗi`, `Thao tác` (nút `↑`, `↓`, `✕`), và một `textarea.queue-text` hiện khi item `state === 'queued'` để sửa nội dung riêng cho mục đó.

`#advanced` (`<details>`): preset radio `safe|medium|fast`, các input `#set-dailyCap`, `#set-groupCooldownDays`, `#set-minDelaySec`, `#set-maxDelaySec`, `#set-confirmWindowSec`, `#set-maxPerRun`, checkbox `#postToTimeline` "Đăng thêm lên tường sau khi hết nhóm".

**`src/ui/panel.css`** (mới). Không khóa width. Bắt buộc:
```css
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; min-width: 820px; font: 14px system-ui, sans-serif; }
#board { flex: 1; display: grid; grid-template-columns: var(--w-compose, 1fr) 8px var(--w-groups, 1fr) 8px var(--w-queue, 1.2fr); min-height: 0; }
#board > section { overflow: auto; padding: 8px 12px; border-right: 1px solid var(--line); }
.splitter { cursor: col-resize; background: var(--line); }
#log { height: 180px; overflow: auto; resize: vertical; margin: 0; font: 12px ui-monospace, monospace; }
@media (max-width: 900px) { #board { grid-template-columns: 1fr; } .splitter { display: none; } }
```
Theme sáng/tối: dùng `prefers-color-scheme` cho `--bg/--fg/--line`; không cần toggle (Justin không chọn).

**`src/ui/panel.js`** (mới). Nạp: `hash.js, spintax.js, safety.js, schema.js, assets.js, protocol.js, queue.js, status.js, engine.js, panel.js`.

Hành vi bắt buộc:
- Boot: migrate dữ liệu cũ (xem S6 bước 3), `renderAll()`.
- `renderAll()` chỉ dựng lại phần thay đổi: `renderGroups()`, `renderQueue()`, `renderStatus()`, `renderThumbs()`.
- Listener `#post-text` `input` → `saveDraft()` debounce 250ms + cập nhật `#spintax-hint`/`#variant-preview`. **Không** gọi `renderGroups()`.
- `#btn-scan` → `chrome.runtime.sendMessage({v:1, type:'fbq:scan-groups', payload:{maxGroups:300, maxScrolls:20}}, cb)`; cb đặt `#scan-status` = `✅ Tìm thấy N nhóm` khi `count > 0`, `⚠️ Không thấy nhóm nào — dán link nhóm thủ công ở dưới` khi `count === 0`, `❌ Không quét được nhóm (<code>)` khi lỗi; rồi `renderGroups()`.
- `#btn-start` → validate: text rỗng và không ảnh → `#status` = `Chưa có nội dung`; mode groups và 0 nhóm chọn → `Chưa chọn nhóm nào`; vượt `dailyCap` → `Hôm nay đã đủ <cap> bài`; else lưu `draft`/`settings`, `engine.start()`.
- `#btn-stop` → `engine.stop()`; `#btn-pause` → `engine.pause()`.
- Splitter: `pointerdown` ghi toạ độ, `pointermove` đổi CSS var tương ứng (`--w-compose` hoặc `--w-groups`), `pointerup` lưu vào `settings.ui.cols`.
- `engine.subscribe(renderStatus)`.

Chạy `node --check src/ui/panel.js`.

Sau khi panel dựng xong: load `skill://egm-brainstorm`, chạy Mode BRAINSTORM như mô tả ở bảng Skills, ghi findings vào `.omp/plans/fbq-panel-brainstorm.md`. Không đổi Approach.

### S5. Service worker + manifest

**`src/bg/sw.js`** — viết lại phần điều phối:
- Thêm `chrome.action.onClicked.addListener(function () { openPanel(); });`
- `openPanel()`: `chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/panel.html*') })` → nếu có tab thì `chrome.tabs.update(tabs[0].id, { active: true })`, không thì `chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/panel.html'), active: true })`.
- `onMessage` chỉ còn: `ping` → `pong`; `fbq:open-panel` → `openPanel()` + `reply(sendResponse,true,'opened',{})`; `fbq:scan-groups` → `scanGroups(sendResponse)`; `notify` → giữ nguyên. Xóa `openRunner`, `fbq:start-run`, `fbq:stop-run`, `queryRunnerTabs`, `runnerUrl`.
- `scanGroups(sendResponse)`:
  1. `chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false })`.
  2. Đợi `chrome.tabs.onUpdated` tới `status === 'complete'` cho tab đó, tối đa 45s.
  3. Vòng `for attempt < 40`: `chrome.tabs.sendMessage(tabId, { v:1, type:'fbq:scan', payload:{ maxGroups:300, maxScrolls:20 } }, cb)`. `lastError` hoặc không có `res` → `setTimeout(attempt, 1000)`. Có `res.ok` → merge.
  4. Merge vào key `groups` (mảng): với mỗi `g` trong `res.payload.groups`, nếu `groups` đã có `key` đó thì cập nhật `name/url`, giữ `enabled/lastPostedAt/cooldownDays`; nếu chưa có thì push `{ key, url, name, enabled: true, lastPostedAt: 0 }`. Ghi `{ groups }`.
  5. `chrome.tabs.remove(tabId)`; `reply(sendResponse, true, 'scanResult', { ok: true, count: merged.length, groups: merged })`.
  6. Quá 40 lần hoặc tab bị đóng → `chrome.tabs.remove` (nếu còn) + `reply(sendResponse, false, 'error', { ok:false, code:'scan_timeout' })`.

**`manifest.json`**: `"action": {}` (xóa `default_popup`), giữ nguyên permissions.

### S6. Xóa file cũ + migrate dữ liệu

1. Xóa: `src/ui/popup.html`, `src/ui/popup.js`, `src/ui/popup.css`, `src/ui/runner.html`, `src/ui/runner.js`, `src/core/store.js`, `test/store.test.js`.
2. `grep -rn "popup\.\|runner\.html\|qmeta\|qitem:\|autostartPending\|buildReply" src test dev` phải trả về rỗng (trừ chính plan file trong `.omp/`).
3. Migration trong `panel.js` lúc boot, chạy một lần trước `renderAll()`:
```js
chrome.storage.local.get(null, function (all) {
  var patch = {};
  var rm = [];
  var list = [];
  if (!Array.isArray(all.groups)) {
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('grp:') === 0 && all[k]) {
        list.push({ key: all[k].key || k.slice(4), url: all[k].url || '', name: all[k].name || '', enabled: all[k].enabled !== false, lastPostedAt: all[k].lastPostedAt || 0 });
        rm.push(k);
      }
    });
    patch.groups = list;
  }
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('qitem:') === 0) rm.push(k);
  });
  ['qmeta', 'autostartPending', 'ui:mode'].forEach(function (k) { if (k in all) rm.push(k); });
  chrome.storage.local.set(patch, function () { if (rm.length) chrome.storage.local.remove(rm); });
});
```
4. Xóa `.omp/plans/FBQ_RUNTIME_FIX_SA_RUNTIME_PLAN.md`? **Không** — đó là tài liệu lịch sử của Justin, không phải code chết.

### S7. Test + review + smoke

1. `npm test` xanh toàn bộ (43 test cũ còn lại + `queue.test.js` + `protocol.test.js` mới). Nếu `test/adapter.test.js` gãy vì `countThumbs` đổi chữ ký nội bộ, sửa test cho khớp API export (`adapter-group` export không đổi tên).
2. `skill://egm-review-loop` một vòng trên `.omp/plans/FBQ_PANEL_REWRITE_PLAN.md` với `implementation_readiness` + `codebase_details`; gom findings thành **một** batch sửa.
3. `skill://code-review` trên diff.
4. Chạy E2E ở mục Verification.

## Critical files & anchors

- `src/ui/runner.js:605-632` — `sendToContent`/`onPortMessage`/`onConnect`: logic cần port sang `engine.js` dưới dạng `chrome.tabs.sendMessage`.
- `src/ui/runner.js:1015` — `state.itemKeys = groups.map(...)`: lý do phải bỏ, queue phải lấy từ `run.items` đã lưu.
- `src/content/runner.js:239-262` — `onRuntimeMessage` + `connect()`: thay toàn bộ bằng responder.
- `src/content/adapter-group.js:27-33, 118-145` — `countThumbs` và vòng ảnh: nguồn của "thành công giả".
- `src/content/adapter-group.js:165-300` — `postFlow`: overlay, `cancelKey`, `doPost`.
- `src/bg/sw.js:33-60, 82-161` — switch message và `scanGroups` cũ.

## Verification

Chạy tại `D:/extension`.

**1. Syntax + unit**
```bash
for f in src/core/protocol.js src/core/status.js src/core/queue.js src/core/schema.js src/ui/engine.js src/ui/panel.js src/content/runner.js src/content/adapter-group.js src/content/selectors.js src/bg/sw.js; do node --check "$f" || exit 1; done
npm test
```
Kỳ vọng: không lỗi syntax; `# fail 0`.

**2. Fixture (không cần tài khoản FB)**: `chrome://extensions` → Reload → mở `chrome-extension://<id>/dev/fixture.html` → bấm nút `Viết gì đó?` → bấm `Chạy`.
Kỳ vọng trong `#result`: có `paragraphs` > 0, `composerText` chứa `Chào nhóm,`, **không** chứa `composer_not_found` / `insert_rejected`.

**3. Panel mở đúng**: bấm icon extension trên thanh công cụ → một tab `chrome-extension://<id>/src/ui/panel.html` mở, `#status` = `Sẵn sàng`, `#badge-daily` hiện `0/20`. Bấm icon lần nữa → không mở tab thứ hai.

**4. Quét nhóm**: bấm `#btn-scan`.
- Tài khoản 0 group (trạng thái hiện tại của Justin): `#scan-status` = `⚠️ Không thấy nhóm nào — dán link nhóm thủ công ở dưới`. **Không** được hiện `❌`.
- Tài khoản có group: `#scan-status` = `✅ Tìm thấy <N> nhóm`, danh sách có `<N>` dòng, `chrome.storage.local.get('groups', r => console.log(r.groups.length))` = `N`.

**5. Đăng lên tường (đường quan trọng nhất)**: chọn mode `Chỉ tường của tôi`, nhập `test 1 2 3`, confirm 5s, bấm `▶ Bắt đầu`.
Kỳ vọng: `#status` chuyển `Đang mở trang` → `Đang điền bài` → `Đếm ngược`; tab Facebook mở **không cướp focus**; overlay đếm ngược hiện trên FB; sau khi đăng, item thành `✅ Đã đăng`, `#log` có dòng `[hh:mm:ss] Đã đăng: timeline`; `chrome.storage.local.get('run', r => console.log(r.run.status))` = `'done'`; bài xuất hiện trên tường FB.

Đây là kiểm chứng trực tiếp lỗi gốc: nếu `content_not_ready`/`content_timeout` xuất hiện, sửa còn sai — không được coi là đạt.

**6. Đăng vào nhóm**: dán link một group Justin đã tham gia vào `#group-urls`, bấm `Thêm link`, tick nhóm, `▶ Bắt đầu`.
Kỳ vọng: tab mới mở đúng `https://www.facebook.com/groups/<key>`, composer được điền, đăng xong item `✅ Đã đăng`; tab Facebook khác của Justin **không** bị đóng.

**7. Dừng giữa đếm ngược**: bấm `▶ Bắt đầu` với confirm 30s, khi overlay hiện bấm `⏹ Dừng`.
Kỳ vọng: overlay biến mất trong ≤ 1.5s, item `⏭ Đã hủy`, `run.status` = `'stopped'`.

**8. Nhóm chưa tham gia**: dùng link group Justin không là thành viên → kỳ vọng item `❌ Lỗi` với `Không thấy ô soạn bài`, **không** được báo `✅ Đã đăng`.

**9. Ảnh**: chọn 2 ảnh, đăng timeline → kỳ vọng 2 thumbnail hiện trong composer và bài có 2 ảnh. Nếu composer không hiện thumbnail, item phải là `⚠️ Cần kiểm tra tay` với `Tải ảnh thất bại` — đây là hành vi đúng của S2, không phải lỗi.

**10. Bố cục**: kéo splitter giữa cột Nhóm và Hàng đợi → độ rộng đổi; tải lại tab → độ rộng được giữ; thu gọn `<details>` không mất dữ liệu đã nhập.

## Assumptions & contingencies

- **Tài khoản hiện có 0 group.** Bước 6 và 8 cần một link group Justin thực sự tham gia. Nếu không có, chạy bước 5, 7, 9 (timeline) + bước 2 (fixture) và ghi rõ bước 6/8 chưa kiểm chứng. Không được báo "đã xong" khi thiếu.
- **Tab chạy ở background có thể bị Facebook trì hoãn render.** Nếu `waitReady` fail 3 lần liên tiếp cho cùng một item, contingency: gọi `chrome.tabs.update(tabId, { active: true })` một lần rồi thử lại; nếu vẫn fail → item `failed` với `content_not_ready`. Không đổi sang polling dài hơn.
- **`document.execCommand('insertText')` bị chặn hoặc editor Lexical bỏ qua.** Giữ retry 2 lần như hiện tại; vẫn fail → `insert_rejected` → item `needs_manual`, panel hiện `⚠️ Cần kiểm tra tay`. Không giả lập bàn phím (`keyboard` events) trong phạm vi này.
- **`chrome.tabs.sendMessage` tới tab chưa nạp content script** trả `content_not_ready`, không phải lỗi cứng: `waitReady` đã retry tới 30s.
- **Dữ liệu cũ**: `qitem:*`/`qmeta` bị xóa ở S6. Nếu Justin muốn giữ lịch sử phiên cũ, đổi S6 bước 3 để chỉ `remove(['qmeta','autostartPending','ui:mode'])` và giữ `qitem:*` (không ai đọc nữa nên chỉ tốn chỗ). Mặc định: xóa.
- **Không nằm trong phạm vi này** (một dòng, không mở rộng): cấu hình riêng theo từng nhóm, thư viện nhiều bài mẫu, theme sáng/tối có công tắc. Justin không chọn các mục đó; thêm sau sẽ là một plan riêng.
