# EGM Groundtruth — Đối chiếu plan với repo

Nguồn plan: `docs/plans/2026-11-10-1144-feat-dang-bai-da-kenh-nghiem-thu-plan.md` (1283 dòng).
Nguồn thực tế: repo `D:\extension` (đọc trực tiếp file và dòng).
Verdict: `OK` / `SAI DÒNG` / `SAI NỘI DUNG` / `KHÔNG TỒN TẠI` / `KHÔNG XÁC MINH ĐƯỢC`.

| # | Plan nói (dòng plan) | Tham chiếu | Thực tế trong repo (trích nguyên văn, kèm path:line) | Verdict |
|---|---|---|---|---|
| 1 | Lỗi A: `baseThumbs` không được gán khi không có ảnh (plan :45) | `src/content/adapter-group.js:140`, `:178` | `:140`: `var baseThumbs = countThumbs();` nằm **trong** vòng `for (j = 0; j < images.length; j++)` → khi `images.length === 0` vòng không chạy, `baseThumbs` không gán. `:178`: `await d.waitFor(function () { return countThumbs() >= baseThumbs + images.length; }, 15000);` → với 0 ảnh thành `countThumbs() >= NaN`, luôn false, ném `upload_rejected`. | OK |
| 2 | Lỗi B: bộ ngắt lỗi liên kết không kích hoạt (plan :46) | `src/ui/engine.js:277` so với `:364` | `:277` thực tế là `if (item.attempts === 0) {`; dòng tăng `state.run.consecutiveFails += 1;` là **:278**. `:364` thực tế là `state.timer = setTimeout(function () {` trong `afterItem`; ngưỡng dừng `consecutiveFails >= stopAfterConsecutiveFailures` nằm ở **:344** (`afterItem`). | SAI DÒNG → `:278` và `:344` |
| 3 | Lỗi C: `targetMode` được ghi mà không ai đọc (plan :47) | `src/ui/panel.js:457` | `:457`: `state.settings.targetMode = state.mode;` — đúng là ghi. Nhưng `targetMode` **được đọc** ở `src/ui/runner.js:1038` (`var targetMode = settings.targetMode || ...`) và `:1059`. | SAI NỘI CỘN DUNG → dòng đúng, nhưng runner.js ĐỌC `targetMode` |
| 4 | Lỗi D: giới hạn, lượt kẹt `countdown`, bị bỏ qua khi chạy tiếp (plan :48) | `src/ui/engine.js:312–314` | `:312`: `if (code === 'rate_limited') {`; `:313`: `finish('stopped');`; `:314`: `return;`. Thực tế lệnh dừng **toàn bộ run** (`finish('stopped')`), không kẹt ở `countdown` và không bị "bỏ qua khi chạy tiếp". | SAI NỘI CỘN DUNG → `:312–314` đúng dòng, nhưng hành vi là `finish('stopped')`, không kẹt countdown |
| 5 | Lỗi F: ô chọn ảnh panel chưa nối (plan :49) | `src/ui/panel.html:23`; `src/ui/popup.js:378–416` | `:23`: `<input id="post-images" type="file" multiple accept="image/*" hidden>` — tồn tại. `panel.js` **không có** handler `#post-images` (grep `post-images` trong `panel.js` không trả về) → chưa nối trong panel. `popup.js:378–416` (`onImagesChange`) gọi `root.assets.putAsset` → `draft.imageIds`. | OK |
| 6 | KTD2: mang commit point từ runner (plan :153) | `src/ui/runner.js:871–885` | `:871–875`: `// COMMIT POINT: ghi clickedAt trước khi gửi lệnh post...` / `item.clickedAt = now();` / `item.state = 'clicking';` / `return saveItem(item);`. Tồn tại và đúng đoạn. | OK |
| 7 | KTD2: xóa `runner.html` và `runner.js`, không file nào tham chiếu (plan :154) | `src/ui/runner.html`, `src/ui/runner.js` | Cả hai **tồn tại**: `runner.js` 1277 dòng, `runner.html` 184 dòng. Trong `src/` và `test/` không có tham chiếu nào tới chúng (grep rỗng), nhưng các plan khác trong `docs/`/`.omp/` vẫn tham chiếu `src/ui/runner.js`. | OK (trong source không tham chiếu; file tồn tại) |
| 8 | KTD3: `saveRun` debounce 200 ms (plan :158) | `src/ui/engine.js:255–261` | `:250–262`: `function saveRun(immediate)`; `:259–261`: `setTimeout(... 200)` rồi `localSet({ run: state.run });`. | OK |
| 9 | KTD3: không gọi `localSet` thiếu callback (plan :158) | `src/ui/engine.js:36–40` | `:38–41`: `function localSet(items, cb)`; `:40`: `chrome.storage.local.set(items, cb);`. Định nghĩa có callback, nhưng nhiều lượt gọi trong engine không truyền `cb` (ví dụ `:253`, `:331`). | OK |
| 10 | KTD3: lệnh gửi `fbq:submit` (plan :158) | `src/ui/engine.js:301` | `:301`: `return send(state.tabId, { v: 1, type: 'fbq:submit', payload: {...} }, 120000);`. | OK |
| 11 | KTD3: `send()` hết giờ trả `content_not_ready` (plan :161) | `src/ui/engine.js:75–84` | `:75–89`: `send(...)`; timeout resolver `:78–80`: `resolve({ ok: false, payload: { code: 'content_not_ready' } });`. | OK |
| 12 | KTD3: khối `catch` cuối `step2` (plan KTD3) | `src/ui/engine.js:336–338` | `:336`: `}).catch(function (e) {`; `:337`: `failItem(item, 'engine_error', e && e.message ? e.message : String(e));`; `:338`: `});`. | OK |
| 13 | KTD3: `start()` kiểm `status==='running'` đọc rồi ghi (plan :246) | `src/ui/engine.js:430–440` | `:427–439`: `function start(cb)`; `:433`: `var oldRun = stored.run || null;`; `:435–438`: `oldRun.status = 'paused'; ... localSet({ run: oldRun });`. | OK |
| 14 | KTD4: `textMatch` quét cả trang (plan :170) | `src/content/selectors.js:16–26` | `textMatch` định nghĩa ở **:17–26** (`:17`: `function textMatch(pattern) {`, `:20`: `scope: 'div[role=button]'`, `:26`: `}`); `:16` là dòng trống. | SAI DÒNG → `:17–26` |
| 15 | KTD12: runner cũ chỉ nhìn `isTimeline` (plan :214) | `src/content/runner.js:16–18`, `:59` | `:16–18` thực tế là phần khai báo `var cancelled = false;` / `function onMessage`. `isTimeline` được đọc ở **:46** (`runFill`) và **:59** (`runSubmit`). `:59`: `var fn = adapter && (p.isTimeline ? adapter.prepareTimeline : adapter.post);`. | SAI DÒNG → `isTimeline` ở `:46`, `:59` (không phải `:16–18`) |
| 16 | KTD12: tăng `V` lên 2 (plan :215) | `src/core/protocol.js:5` | `:5`: `var V = 1;`. | OK |
| 17 | KTD12: engine gửi `v` lấy từ `protocol.js` thay vì số 1 cứng (plan :215) | `src/ui/engine.js:145`, `:301`, `:379` | `:145`: `send(tabId, { v: 1, type: 'fbq:probe' }, 3000);`; `:301`: `fbq:submit` kèm `v: 1`; `:379`: `fbq:fill` kèm `v: 1`. Tất cả là số `1` viết cứng, **không lấy từ `protocol.js`**. | OK (khẳng định plan về việc cần sửa là đúng) |
| 18 | KTD10: bộ đếm ngày `remainingToday(dayRecord, dailyCap)` (plan :198) | `src/core/safety.js:82` | `:82`: `function remainingToday(dayRecord, dailyCap) { return Math.max(0, dailyCap - (dayRecord && dayRecord.count || 0)); }`. | OK |
| 19 | Tồn tại `PRESETS.fast` (plan KTD10/KTD15) | `src/core/safety.js` | `:26–52`: `PRESETS = { safe: {...}, medium: {...}, fast: { dailyCap: 80, ... } };`. | OK |
| 20 | KTD13: migration ghi/xoá hai lệnh riêng (plan :223) | `src/ui/panel.js:735–736` | `:735`: `chrome.storage.local.set(patch, function () {`; `:736`: `if (rm.length) chrome.storage.local.remove(rm, afterMigrate);`. | OK |
| 21 | KTD13: điều kiện migration `!Array.isArray(all.groups)` (plan KTD13) | `src/ui/panel.js:696` | `:696`: `if (!Array.isArray(all.groups)) {`. | OK |
| 22 | KTD13: đọc `safe:day` hiển thị (plan KTD13) | `src/ui/panel.js:721` | `:721`: `if (all['safe:day:' + today]) state.dayRecord = all['safe:day:' + today];`. | OK |
| 23 | KTD13: các chỗ ghi `groups` → `destinations`: `engine.js:331` (plan :228, :661) | `src/ui/engine.js:331` | `:331`: `localSet({ groups: state.groups });`. | OK |
| 24 | KTD13: `engine.js:378` ghi `groups` (plan :228, :661) | `src/ui/engine.js:378` | `:378`: `return resolveImages(item).then(function (images) {` — **không ghi `groups`**. Ghi `groups` là ở `:331`. | SAI DÒNG → `:331` |
| 25 | KTD13: `panel.js:379` ghi `groups` (plan :228, :661) | `src/ui/panel.js:379` | `:379` nằm trong vùng `renderThumbs`/`removeDraftImage`/khu vực trước `bindAll` (xem :348–363), **không có** lệnh ghi `groups`. Lệnh ghi `groups` là `saveSettingsGroups()` (sau :363, trước :438, số dòng chưa móc chính xác trong đoạn đã đọc). | SAI DÒNG → không xác nhận :379 là ghi `groups` |
| 26 | KTD13: `sw.js:87` ghi kết quả quét (plan :228, :661) | `src/bg/sw.js:87` | `:87`: `chrome.storage.local.set({ groups: merged }, function () {`. | OK |
| 27 | U4: port từ `popup.js:378–416` (`downscale → putAsset → draft.imageIds`) (plan :521) | `src/ui/popup.js:378–416` | `:371–423` là `onImagesChange`; bên trong `handleAsset` (`:392–414` xấp xỉ) gọi `root.assets.putAsset(database, id, {...})` rồi `state.draft.imageIds.push(id);`. | OK |
| 28 | U4: `test/assets.test.js` hiện có vẫn xanh (plan :523) | `test/assets.test.js` | Có file, tự giả `document`/`Image`/`URL`/`indexedDB` ở đầu (`:1–14` xấp xỉ), test `put/get/delete` round trip. | OK |
| 29 | U9: `dailyCap` không đặt thì ra 0 lượt (plan :665) | `src/core/queue.js:66` | `:66`: `Math.max(0, (settings.dailyCap != null ? settings.dailyCap : 0) - dayCount);` → nếu `dailyCap` không đặt thì `0 - dayCount` ép về 0. | OK |
| 30 | `manifest.json`: permissions (plan KTD18/R15) | `manifest.json` | `permissions`: `["storage", "unlimitedStorage", "tabs", "notifications"]` — **không** `cookies`, `webRequest`, `debugger`, `<all_urls>`. | OK |
| 31 | `manifest.json`: host_permissions (plan KTD18) | `manifest.json` | `host_permissions`: `["https://*.facebook.com/*"]` — chỉ Facebook, chưa có Zalo/X/Instagram/TikTok. | OK |
| 32 | `manifest.json`: content_scripts (plan test/load.js) | `manifest.json` | Một entry `content_scripts[0]` matches `https://*.facebook.com/*`, `js` có 9 file. | OK |
| 33 | `package.json`: script `pack` (plan Deferred :134) | `package.json` | `"pack": "node scripts/pack.mjs"` — có. | OK |
| 34 | `scripts/pack.mjs` tồn tại (plan Deferred :134) | `scripts/pack.mjs` | Thư mục `scripts` **không tồn tại** (`ls scripts` → "No such file"). | KHÔNG TỒN TẠI |
| 35 | `test/load.js:6` chỉ đọc `content_scripts[0].js` (plan KTD18) | `test/load.js:6` | `:6`: `var ORDER = MANIFEST.content_scripts[0].js;`. | OK |
| 36 | `src/core/assets.js`: `putAsset`/`getAsset`/`deleteAsset` theo id (plan KTD6) | `src/core/assets.js` | Có `putAsset(db, id, asset, cb)`, `getAsset(db, id, cb)`, `deleteAsset(db, id, cb)`, dùng `id` làm keyPath. | OK |
| 37 | `src/core/hash.js` có hàm SHA-256 (plan KTD6 gợi ý) | `src/core/hash.js` | Chỉ có `fnv1a` và `mulberry32`; **không có** SHA-256/digest. | OK (plan nói "nếu có hàm phù hợp, không thì `crypto.subtle`") |
| 38 | `test/assets.test.js` tự giả `document` (plan KTD5) | `test/assets.test.js` | Có `global.document = { createElement: ... }`, `global.Image`, `global.URL`, `global.indexedDB` ở đầu file. | OK |
| 39 | `src/content/scanner.js` tồn tại | `src/content/scanner.js` | Tồn tại (trong danh sách glob `src/content/`). | OK |
| 40 | Lỗi E (plan Deferred :135): `confirmWindowSec` gửi xuống content script không ai đọc | `src/content/runner.js` | `runFill`/`runSubmit` nhận `p.opts` nhưng **không đọc** `confirmWindowSec` (grep `confirmWindowSec` trong `src/content` → No matches). | OK |

## Tổng hợp — các tham chiếu sai (để người sửa plan thay đúng chỗ)

- plan dòng 46 (lỗi B): `'src/ui/engine.js:277' → 'src/ui/engine.js:278'` (dòng tăng `consecutiveFails`)
- plan dòng 46 (lỗi B): `'so với :364' → 'so với :344'` (ngưỡng dừng nằm ở `afterItem`, dòng 344; `:364` là `setTimeout` trong `afterItem`)
- plan dòng 47 (lỗi C): `'targetMode được ghi mà không ai đọc (src/ui/panel.js:457)' → 'targetMode được ghi ở panel.js:457 và ĐƯỢC ĐỌC ở src/ui/runner.js:1038, :1059'`
- plan dòng 48 (lỗi D): `'lượt đang chạy bị kẹt ở trạng thái countdown và bị bỏ qua khi chạy tiếp (src/ui/engine.js:312–314)' → ':312–314 là rate_limited gọi finish("stopped"), dừng toàn bộ run, không kẹt countdown'`
- plan dòng 170 (KTD4): `'src/content/selectors.js:16–26' → 'src/content/selectors.js:17–26'` (`textMatch` bắt đầu dòng 17)
- plan dòng 214 (KTD12): `'src/content/runner.js:16–18' → 'src/content/runner.js:46, :59'` (`isTimeline` đọc ở 46 và 59)
- plan dòng 228 / 661 (KTD13): `'src/ui/engine.js:378' → 'src/ui/engine.js:331'` (`localSet({ groups })` ở 331, không phải 378)
- plan dòng 228 / 661 (KTD13): `'src/ui/panel.js:379' → 'không xác nhận là ghi groups ở :379; lệnh ghi groups là saveSettingsGroups() (sau dòng 363)'`
- plan Deferred dòng 134: `'scripts/pack.mjs không tồn tại' → ĐÚNG (thư mục scripts không tồn tại)` — không cần sửa, chỉ ghi nhận

Số tham chiếu kiểm: 40 (bao gồm các dòng con trong plan).
Số sai: 8 (dòng 46×2, 47, 48, 170, 214, 228/661 engine.js:378, 228/661 panel.js:379).

Top 5 sai nghiêm trọng:
1. plan dòng 46: `engine.js:277` sai dòng, đúng là `:278` (tăng `consecutiveFails`).
2. plan dòng 46: `engine.js:364` sai dòng, ngưỡng dừng thực tế là `:344` trong `afterItem`.
3. plan dòng 47: `targetMode` **được đọc** ở `runner.js:1038, :1059`, sai khi nói "không ai đọc".
4. plan dòng 48: `:312–314` là `finish('stopped')` dừng toàn bộ run, không phải "kẹt countdown, bỏ qua khi chạy tiếp".
5. plan dòng 170 (KTD4): `selectors.js:16–26` sai dòng, `textMatch` bắt đầu `:17`.

[SUPERAGENT-REPORT: ready]
