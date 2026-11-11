# Kế hoạch: fb-bulk-group-poster — Giao diện 3 bước cho người mới, sửa luồng đăng bài, và lớp an toàn chống khoá tài khoản

## Context

Người dùng phản ánh giao diện hiện tại quá rối (xé lẻ thành 3 trang `popup.html`, `options.html`, `runner.html` cùng thanh chuyển 3 bước nhỏ trong popup), việc nạp link nhóm thủ công bất tiện, và khi bấm chạy thử đăng lên trang cá nhân/trang chủ để kiểm tra chức năng thì không hoạt động. Khảo sát mã nguồn xác định 10 lỗi đứt gãy thực tế: (1) nút `Bắt đầu` trong popup gửi message thiếu `v: 1` và `sw.js` không xử lý nên bấm không có tác dụng; (2) `saveRunSpec()` kiểm tra `!settings.postToTimeline` trước khi gán giá trị từ checkbox nên chế độ đăng tường cá nhân luôn bị chặn khi chưa thêm group; (3) `popup.html` thiếu các thẻ `<script>` của `hash.js`, `spintax.js`, `schema.js`, `store.js`, `assets.js` khiến ảnh đính kèm bị rơi mất và spintax không xoay biến thể; (4) `sendPrepareStream` trong `src/ui/runner.js` nhảy cóc qua bước mở ô đăng bài khi bài viết không đính kèm ảnh (`list.length === 0`); (5) `src/content/runner.js` chưa xử lý message `prepare_timeline` / `post_timeline`; (6) `adapter-group.js` không đọc trường `img.b64` và tự bấm nút Đăng ngay trong `prepareFlow` trước khi đến bước đếm ngược; (7) `isTimelineUrl` chặn URL mặc định `https://www.facebook.com/me`; (8) `runner.html` bắt người dùng phải bấm Start lần 2 sau khi đã bấm ở Popup; (9) cấu hình nằm rải rác ở `options.html`; (10) `src/content/scanner.js` và `handleScan` trong `src/content/runner.js` bị lệch chữ ký hàm (`scanner.scan(maxGroups, maxScrolls, cb)` yêu cầu callback trong khi `handleScan` gọi `fn(payload)` kỳ vọng Promise nên luôn ném lỗi `cb is required`), đồng thời bộ lọc link chưa loại bỏ các đường dẫn hệ thống (`/groups/feed`, `/groups/joins`, `/groups/discover`) và lấy nhầm link avatar rỗng tên thay vì tên nhóm.

Trạng thái đích: Gom toàn bộ thao tác về luồng **1 màn hình – 1 nút bấm (`🚀 Lưu & Chạy ngay`)** theo phong cách **Operate Mode**: tự động lưu nháp ngay khi gõ, chọn chế độ trực quan giữa `🏠 Đăng Tường Cá Nhân (Test nhanh)` và `👥 Đăng Hội Nhóm (Hàng loạt)`, tích hợp nút **`🔍 Tự động quét nhóm từ Facebook`** (tự mở trang `/groups/joins/`, cuộn trang cào tên + link toàn bộ nhóm đã tham gia và hiển thị thành **danh sách tick chọn `[x]` kèm ô tìm kiếm lọc nhanh**), thu gọn cài đặt nhịp độ vào ngăn kéo tại chỗ, xóa bỏ hoàn toàn `options.html/js/css`, đồng thời sửa triệt để 10 lỗi đứt gãy.

Yêu cầu bổ sung cho vòng này: (a) người dùng cuối không cần biết gì về kỹ thuật — 3 khối đánh số, 1 nút lớn duy nhất, không có ô nhập số nào trong luồng chính; (b) thêm lớp an toàn chống khoá tài khoản: hạn mức bài/ngày, giãn cách nhiều ngày cho mỗi nhóm, xáo thứ tự nhóm, nội dung khác nhau cho từng nhóm, nghỉ dài ngẫu nhiên, và dừng ngay khi Facebook có dấu hiệu cảnh báo.

## Approach

### Bước 1: Sửa adapter DOM và cầu nối content script cho cả Tường cá nhân / Trang chủ và Hội nhóm

Độc lập, thực hiện đầu tiên để đảm bảo tầng DOM và giao thức message hoạt động đúng trước khi nối UI.

1. **Mở rộng bộ chọn Timeline/Trang chủ trong `src/content/selectors.js`**:
   - Giữ nguyên `SELECTOR_VERSION = 1` và 6 bảng gốc (`COMPOSER_TRIGGER`, `EDITOR`, `IMAGE_INPUT`, `PHOTO_BUTTON`, `POST_BUTTON`, `ALERT`) để tương thích toàn bộ test hiện có.
   - Cập nhật `TABLES.COMPOSER_TRIGGER_TIMELINE` trong `src/content/selectors.js` để khớp nút mở ô đăng bài trên cả trang cá nhân (`/me`, `/profile.php`, `/<username>`) lẫn trang chủ (`https://www.facebook.com/`):
     ```js
     COMPOSER_TRIGGER_TIMELINE: [
       '[data-testid="status-attachment-mentions-input"]',
       ariaLabelMatch(/What's on your mind|Bạn đang nghĩ gì|Viết gì đó|Write something/i),
       textMatch(/^(What's on your mind|Bạn đang nghĩ gì|Viết gì đó|Write something)/i)
     ],
     EDITOR_TIMELINE: [
       '[role="dialog"] div[contenteditable="true"][role="textbox"]',
       '[role="dialog"] div[contenteditable="true"]'
     ],
     IMAGE_INPUT_TIMELINE: [
       '[role="dialog"] input[type="file"][accept*="image"]'
     ],
     PHOTO_BUTTON_TIMELINE: [
       '[aria-label="Photo/Video"]',
       '[aria-label="Ảnh/Video"]',
       '[aria-label="Photo/video"]',
       '[aria-label="Ảnh/video"]'
     ],
     POST_BUTTON_TIMELINE: [
       '[role="dialog"] [aria-label="Post"][role="button"], [role="dialog"] [aria-label="Đăng"][role="button"]',
       '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"]',
       textMatch(/^(Post|Đăng)$/i),
       '[data-testid="composer-submit"]'
     ]
     ```

2. **Sửa lỗi xử lý ảnh `b64` và lỗi bấm Đăng sớm trong `src/content/adapter-group.js`**:
   - Trong `prepareFlow(timeline, text, images, opts)` (`src/content/adapter-group.js:38-147`):
     - Thêm `var photoKind = timeline ? 'PHOTO_BUTTON_TIMELINE' : 'PHOTO_BUTTON';`.
     - Ở bước 6 (xử lý từng phần tử `img` trong `images`, dòng 101–133): đọc `dataUrl` hỗ trợ cả `img.b64` do `runner.js` gửi sang:
       ```js
       var dataUrl = typeof img === 'string'
         ? img
         : (img && (img.dataUrl || img.uri || img.src || (img.b64 ? ('data:' + (img.mime || 'image/png') + ';base64,' + img.b64) : '')));
       ```
     - Nếu `s.assertDom(imageKind)` trả về `null`, thử tìm nút ảnh `var photoBtn = s.assertDom(photoKind);`, nếu có thì gọi `d.clickEl(photoBtn);` và chờ `await waitStep(function () { return s.assertDom(imageKind); }, 3000, 'image_input_not_found' + sfx);` trước khi ném lỗi `'image_input_not_found' + sfx`.
     - Ở bước 7 (chờ nút Đăng sáng, dòng 136–139): dùng `s.assertDom(postKind)` thay cho `'POST_BUTTON'` cố định, kiểm tra `b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'`, và dùng mã lỗi `'post_disabled' + sfx`.
     - Ở bước 8 (dòng 141–146): **Xóa bỏ lệnh `d.clickEl(postBtn);`** khỏi `prepareFlow` để `prepareFlow` chỉ mở hộp thoại, điền chữ, tải ảnh và xác nhận nút Đăng đã sẵn sàng (đúng hợp đồng `dev/fixture.html` và cho phép bước `postFlow` hiển thị đếm ngược 10 giây trước khi thực sự bấm Đăng).
   - Trong `postFlow(timeline, opts)` (`src/content/adapter-group.js:157-261`):
     - Đọc `var confirmSec = (opts && typeof opts.confirmWindowSec === 'number' && opts.confirmWindowSec >= 0) ? opts.confirmWindowSec : 10;`.
     - Đổi dòng tiêu đề xác nhận (`confirmLine`) thành `'Xác nhận đăng bài lên Tường cá nhân / Trang chủ?'` khi `timeline === true`, và `'Xác nhận đăng bài vào Nhóm?'` khi `timeline === false`.
     - Nếu `confirmSec === 0`, gọi thẳng `await new Promise(function (resolve) { doPost(resolve); });` không mở `#fbq-overlay`; nếu `confirmSec > 0`, khởi tạo `var remaining = confirmSec;` và hiển thị `'Đăng ngay (' + remaining + 's)'`.

3. **Bổ sung nhánh `prepare_timeline` và `post_timeline` trong `src/content/runner.js`**:
   - Trong `handleInbound(env)` (`src/content/runner.js:54-84`), thêm:
     ```js
     case 'prepare':
       handlePrepare(env, payload, false);
       break;
     case 'prepare_timeline':
       handlePrepare(env, payload, true);
       break;
     case 'post':
       handlePost(env, payload, false);
       break;
     case 'post_timeline':
       handlePost(env, payload, true);
       break;
     ```
   - Cập nhật `handlePrepare(env, payload, isTimeline)` và `callPrepare(runId, epoch, env, text, images, opts, isTimeline)` (`src/content/runner.js:86-144`) để chọn `var fn = adapter && (isTimeline ? adapter.prepareTimeline : adapter.prepare);`.
   - Cập nhật `handlePost(env, payload, isTimeline)` (`src/content/runner.js:146-169`) để chọn `var fn = adapter && (isTimeline ? adapter.postTimeline : adapter.post);` và gọi `fn({ cancelKey: cancelKey, confirmWindowSec: payload && payload.confirmWindowSec })`.


4. **Sửa bộ cào nhóm tự động trong `src/content/scanner.js` và `handleScan` trong `src/content/runner.js`**:
   - Trong `src/content/scanner.js`:
     - Thêm danh sách loại trừ các đường dẫn điều hướng của Facebook không phải nhóm thật: `RESERVED_KEYS = { feed: 1, discover: 1, joins: 1, create: 1, notifications: 1, search: 1, categories: 1, settings: 1, your_groups: 1 }`.
     - Cập nhật `groupKeyFromUrl(url)`: trích xuất `m = String(url).match(/\/groups\/([^/?#]+)/)`, trả về `null` nếu `!m` hoặc `RESERVED_KEYS[m[1].toLowerCase()]`. Chuẩn hóa URL nhóm về `'https://www.facebook.com/groups/' + key`.
     - Cập nhật `collectLinks(byKey, order, limit)`: quét `document.querySelectorAll('a[href*="/groups/"]')`. Với mỗi thẻ `<a>` có `key` hợp lệ:
       - Trích xuất tên nhóm sạch qua `extractGroupName(link, key)`: đọc `aria-label` hoặc dòng đầu tiên có nghĩa của `innerText`/`textContent` (bỏ qua các chuỗi phụ như `'Xem nhóm'`, `'View group'`, `'Lần hoạt động gần nhất...'`, `'Last active...'`).
       - Vì mỗi thẻ nhóm trên `/groups/joins/` thường có 1 link ảnh đại diện (text rỗng) đứng trước 1 link tiêu đề (có tên nhóm), nếu `byKey[key]` đã tồn tại nhưng `byKey[key].name === key` hoặc rỗng thì cập nhật `byKey[key].name = name` khi gặp link tiêu đề.
     - Hỗ trợ đa chữ ký cho `scan(arg1, arg2, arg3)`:
       - Nhận cả dạng `scan({ maxGroups, maxScrolls })` trả về `Promise<{ groups: Array<{key, url, name}> }>` (khớp với `handleScan` trong `src/content/runner.js`) lẫn dạng cũ `scan(maxGroups, maxScrolls, cb)` (gọi `cb(err, groups)` và đồng thời trả về Promise).
       - Tự động cuộn trang mỗi nhịp `650ms` (tối đa `maxScrolls`, mặc định `15` lần cuộn, `maxGroups` mặc định `300`), dừng sớm ngay khi đạt `maxGroups` hoặc sau 2 nhịp cuộn liên tiếp không phát hiện thêm nhóm mới và vị trí cuộn đã chạm đáy.
   - Trong `src/content/runner.js` (`handleScan`, dòng 171–185):
     - Đảm bảo `handleScan(env, payload)` truyền `{ maxGroups: (payload && payload.maxGroups) || 300, maxScrolls: (payload && payload.maxScrolls) || 15 }` vào `scanner.scan(...)`, chuẩn hóa kết quả về `{ groups: Array.isArray(res) ? res : (res && res.groups) || [] }` và gửi trả `reply(env, 'scanResult', { groups: groups })`.
### Bước 2: Sửa bộ điều phối hàng đợi (`src/ui/runner.js`) và Service Worker (`src/bg/sw.js`) để chạy 1 chạm

Phụ thuộc Bước 1. Giải quyết dứt điểm lỗi bỏ qua bài không có ảnh, lỗi chặn URL trang cá nhân `/me`, và lỗi bấm "Bắt đầu" trong Popup không kích hoạt phiên chạy.

1. **Cập nhật `src/bg/sw.js` để điều hướng và kích hoạt tự chạy (`autostart`)**:
   - Trong `onMessage(msg, sender, sendResponse)` (`src/bg/sw.js:16-45`):
     - Cho phép cả message có `msg.v === 1` hoặc message nội bộ có `typeof msg.type === 'string'` (không từ chối nếu thiếu `v: 1`).
     - Hợp nhất xử lý cho `case 'openRunner':` và `case 'fbq:start-run':`:
       - Xác định `var autostart = (msg.type === 'fbq:start-run') || !!(msg.payload && msg.payload.autostart);`.
       - Dùng `chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/runner.html*') }, function (tabs) { ... })`:
         - Nếu đã có tab `runner.html` đang mở (`tabs && tabs.length > 0`): gọi `chrome.tabs.update(tabs[0].id, { active: true })`, và nếu `autostart` là `true` thì gửi `chrome.tabs.sendMessage(tabs[0].id, { v: 1, type: 'fbq:start-run' })`, sau đó `reply(sendResponse, true, 'opened', { tabId: tabs[0].id, reused: true })`.
         - Nếu chưa có tab `runner.html`: gọi `chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/runner.html' + (autostart ? '?autostart=1' : '')), active: true }, function (tab) { reply(sendResponse, true, 'opened', { tabId: tab ? tab.id : null, reused: false }); })`.
     - Thêm `case 'fbq:stop-run':`: chuyển tiếp `{ v: 1, type: 'fbq:stop-run' }` tới tab `runner.html` (nếu đang mở) và trả về `reply(sendResponse, true, 'stopped', {})`.
     - Thêm `case 'fbq:scan-groups':` trong `src/bg/sw.js`:
       - Mở một tab nền (`active: false` để **không làm đóng cửa sổ Popup đang mở**) tới `'https://www.facebook.com/groups/joins/'`.
       - Chờ tab tải xong và kết nối port `fbq-runner` (hoặc gửi message tới content script sau khi `ping` trả về `pong`), gửi lệnh `scan` (`{ maxGroups: 300, maxScrolls: 15 }`).
       - Khi nhận `scanResult` chứa mảng `groups`, đọc các bản ghi `grp:*` hiện có trong `chrome.storage.local` để **giữ nguyên trạng thái tick chọn (`enabled: true/false`) và lịch sử đăng (`lastPostedAt`) của các nhóm cũ**, chỉ thêm nhóm mới với mặc định `enabled: false` (để trống checkbox cho người dùng tự tick chọn nhóm cần gửi) và cập nhật tên nhóm (`name`), ghi toàn bộ `grp:<key>` xuống `chrome.storage.local`, đóng tab quét nền và trả kết quả `{ ok: true, count: groups.length, groups: merged }` về cho Popup.

2. **Sửa logic URL Tường cá nhân, luồng gửi bài chỉ có text, render Spintax và Auto-Start trong `src/ui/runner.js`**:
   - **Chuẩn hóa URL Tường cá nhân (`normalizeTimelineUrl` & `isTimelineUrl` tại `src/ui/runner.js:371-385`)**:
     - Thêm hàm `normalizeTimelineUrl(url)`: cắt khoảng trắng hai đầu; nếu chuỗi rỗng thì trả về `'https://www.facebook.com/me'`; nếu không có `^https?:\/\/` thì ghép `'https://www.facebook.com/' + url.replace(/^\/+/, '')`.
     - Sửa `isTimelineUrl(url)`: sau khi qua `normalizeTimelineUrl(url)`, phân tích bằng `new URL(u)`; trả về `true` nếu `hostname` là `'www.facebook.com'` hoặc `'facebook.com'` và `pathname` không bắt đầu bằng `'/groups/'`, `'/checkpoint'`, `'/login'`. Như vậy cả `https://www.facebook.com/me`, `https://www.facebook.com/`, `https://www.facebook.com/profile.php?id=...` và `https://www.facebook.com/<username>` đều hợp lệ 100%.
   - **Sửa đối chiếu URL sau khi điều hướng trong `sendPing(item)` (`src/ui/runner.js:571-587`)**:
     - Khi `item.isTimeline === true`, Facebook tự chuyển hướng `https://www.facebook.com/me` về URL thật của người dùng (`/<username>` hoặc `/profile.php?id=...`). Do đó thay điều kiện `!urlsMatch(observed, item.url)` bằng:
       ```js
       var matchOk = item.isTimeline
         ? (observed.indexOf('facebook.com') !== -1 && !isAbortUrl(observed))
         : urlsMatch(observed, item.url);
       if (!matchOk) {
         onNavFail(item, { code: 'nav_mismatch', message: 'observed ' + observed });
         return;
       }
       ```
   - **Sửa lỗi bỏ qua `prepare` khi bài viết không có ảnh trong `runPrepare(item)` và `sendPrepareStream(item, text, list, index)` (`src/ui/runner.js:675-712`)**:
     - Trong `runPrepare(item)`: lấy `var rawText = (qm && qm.snapshot && qm.snapshot.text) || '';`. Nếu `root.spintax && root.hash`, tính `var seed = root.hash.fnv1a(String(item.key || 'timeline') + '|' + String(state.runId || ''));`, parse và render biến thể cho đích hiện tại (`var text = root.spintax.render(root.spintax.parse(rawText), seed)` trong khối `try/catch`, fallback về `rawText` nếu lỗi), gán `item.textResolved = text;`.
     - Trong `sendPrepareStream(item, text, list, index)`:
       - Trường hợp **không có ảnh (`list.length === 0`)**: ở `index === 0`, bắt buộc gửi 1 lệnh `sendToContent(item.isTimeline ? 'prepare_timeline' : 'prepare', { text: text, images: [], opts: { confirmWindowSec: state.settings.confirmWindowSec } }, function (err) { if (err) { onPrepareFail(item, err); return; } item.state = 'text_ok'; item.lastStepAt = now(); saveItem(item).then(function () { render(); runPost(item); }); }, PREPARE_TIMEOUT_MS);`.
       - Trường hợp **có ảnh (`list.length > 0`)**: gửi từng ảnh `index = 0 .. list.length - 1` kèm `opts: { confirmWindowSec: state.settings.confirmWindowSec }`; khi `index >= list.length` mới đặt `item.state = 'images_ok'` và gọi `runPost(item)`.
     - Trong `runPost(item)` (`src/ui/runner.js:731-751`): truyền thêm `confirmWindowSec: state.settings.confirmWindowSec` trong payload của `sendToContent(item.isTimeline ? 'post_timeline' : 'post', ...)`.
   - **Hỗ trợ chọn chế độ mục tiêu (`targetMode`: `'timeline'` | `'groups'`) trong `beginNewRun()` (`src/ui/runner.js:868-944`)**:
     - Đọc `var targetMode = settings.targetMode || (settings.postToTimeline && !groups.length ? 'timeline' : 'groups');`.
     - Nếu `targetMode === 'timeline'`: chỉ tạo đúng 1 mục tiêu `item = defaultQItem('timeline', normalizeTimelineUrl(settings.timelineUrl)); item.isTimeline = true;` (bỏ qua danh sách group để người dùng test đăng tường cá nhân an toàn tuyệt đối mà không sợ đăng nhầm vào group).
     - Nếu `targetMode === 'groups'`: tạo danh sách `qitem:<key>` từ các group đang bật (`groups`); nếu `settings.postToTimeline === true` (tùy chọn đăng kèm lên tường sau khi hết group), nối thêm item `'timeline'` vào cuối.
   - **Tự động chạy ngay khi mở từ Popup (`autostart`) và bảng dịch trạng thái tiếng Việt**:
     - Thêm bảng hằng số `STATE_LABELS` và `ERROR_LABELS` trong `src/ui/runner.js` để hiển thị tiếng Việt dễ hiểu trong bảng tiến độ (ví dụ: `queued` → `'Chờ tới lượt'`, `navigating` → `'Đang mở trang FB...'`, `preparing` → `'Đang điền bài...'`, `countdown` → `'Đếm ngược 10s...'`, `clicking` → `'Đang bấm Đăng...'`, `posted` → `'✅ Đã đăng thành công'`, `cancelled` → `'⏭ Đã hủy'`, `needs_manual` → `'⚠️ Cần kiểm tra tay'`, `failed` → `'❌ Lỗi'`).
     - Trong `init()` (`src/ui/runner.js:996-1038`):
       - Lắng nghe `chrome.runtime.onMessage`: nếu nhận `msg.type === 'fbq:start-run'`, tải lại `settings` + `loadItems()` rồi gọi `beginNewRun()` (nếu đang `idle`); nếu nhận `msg.type === 'fbq:stop-run'`, gọi `onStop()`.
       - Đọc `localGet(['qmeta', 'settings', 'autostartPending'])`: nếu `location.search.indexOf('autostart=1') !== -1` hoặc `all.autostartPending === true`, xóa cờ `localSet({ autostartPending: false })`, xóa query `?autostart=1` qua `history.replaceState(null, '', location.pathname)`, và ngay sau khi `loadItems()` xong (nếu `state.phase === 'idle'`) thì gọi thẳng `beginNewRun()`.

### Bước 3: Thiết kế lại `popup.html`, `popup.css`, `popup.js` thành giao diện 1 màn hình tối giản & xóa bỏ `options.*`

**Chỉ thực hiện mục 1 của bước này (xóa `options.html/js/css` và dòng `options_page` trong manifest). Mục 2 và mục 3 bị thay thế hoàn toàn bởi Bước 6 — không dựng lại DOM theo mô tả cũ.**

Phụ thuộc Bước 2. Áp dụng nguyên tắc **Operate Mode + Distill** (`impeccable`, `ui-ux-pro-max`, `design-taste-frontend`): xóa sạch Wizard 3 bước, xóa trang `options.html` rời rạc, gom toàn bộ về 1 màn hình tự động lưu nháp.

1. **Xóa trang Options rời rạc**:
   - Xóa 3 file `src/ui/options.html`, `src/ui/options.js`, `src/ui/options.css`.
   - Trong `manifest.json`: xóa dòng `"options_page": "src/ui/options.html",`. Giữ nguyên `"default_popup": "src/ui/popup.html"` và mảng `content_scripts[0].js` (để `test/load.js` xanh 100%).
   - Giữ nguyên `DEFAULT_SETTINGS` 9 khoá trong `src/core/schema.js` để `test/schema.test.js` xanh 100%.

2. **Viết lại `src/ui/popup.html` (1 màn hình duy nhất, nạp đủ 6 script)**:
   - Cuối `src/ui/popup.html` nạp đúng thứ tự:
     ```html
     <script src="../core/hash.js"></script>
     <script src="../core/spintax.js"></script>
     <script src="../core/schema.js"></script>
     <script src="../core/store.js"></script>
     <script src="../core/assets.js"></script>
     <script src="popup.js"></script>
     ```
   - Cấu trúc DOM 1 cột từ trên xuống dưới (420px):
     - **Header (`.toolbar`)**: Tiêu đề `FB Auto Poster`, nhãn trạng thái tự lưu `#save-hint` (`Đã tự lưu`), và nút `#btn-open-runner` (`Bảng tiến độ ↗`).
     - **Bộ chọn nơi đăng (`.mode-switch`, segmented control 2 nút lớn)**:
       - `<button type="button" class="mode-btn active" id="mode-btn-timeline" data-mode="timeline">🏠 Đăng Tường Cá Nhân (Test)</button>`
       - `<button type="button" class="mode-btn" id="mode-btn-groups" data-mode="groups">👥 Đăng Hội Nhóm</button>`
     - **Khối đích đăng tương ứng**:
       - `#target-timeline-box` (hiện khi chọn `timeline`): ô `<input type="text" id="timelineUrl" placeholder="Để trống = tự vào tường của bạn (facebook.com/me)">` kèm chú thích ngắn `"Chế độ an toàn để kiểm tra: chỉ đăng 1 bài lên tường cá nhân của bạn."`
       - `#target-groups-box` (ẩn khi chọn `timeline`, hiện khi chọn `groups`):
         - **Thanh quét tự động (`.scan-bar`)**: Nút nổi bật `<button type="button" class="btn btn-secondary btn-scan" id="btn-scan-groups">🔍 Tự động quét nhóm đã tham gia</button>` kèm nhãn trạng thái `#scan-status`.
         - **Thanh lọc & chọn nhanh (`.group-Substring-toolbar`)**:
           - Ô tìm kiếm `<input type="search" id="group-filter" placeholder="Lọc nhanh tên nhóm (VD: BĐS, Hà Nội, Vinhomes...)">`
           - Nút `<button type="button" class="btn-link" id="btn-select-all">Chọn tất cả</button>` và `<button type="button" class="btn-link" id="btn-deselect-all">Bỏ chọn</button>` (áp dụng trên các nhóm đang lọc), cùng bộ đếm `#group-count` (`Đã chọn 0 / 0 nhóm`).
         - **Danh sách nhóm dạng Checklist (`#group-checklist`, khung cuộn 185px)**:
           - Mỗi nhóm hiển thị thành 1 dòng có checkbox `<input type="checkbox" data-key="..." checked>`, **Tên nhóm** rõ ràng (`group.name || group.key`), mã nhóm phụ (`/groups/<key>`), và nút xóa `×`. Người dùng chỉ cần tick / bỏ tick nhóm muốn gửi bài.
         - **Ngăn phụ `<details class="manual-add-drawer"><summary>+ Dán thêm link nhóm thủ công</summary>`**: chứa `<textarea id="group-urls" rows="2" placeholder="Dán mỗi dòng 1 link nhóm...">` và nút `<button type="button" id="btn-add-manual-groups">Thêm vào danh sách</button>` cho trường hợp muốn nạp bổ sung bằng link.
         - Checkbox tùy chọn `<label class="inline-check"><input type="checkbox" id="postToTimeline"> Đăng kèm lên tường cá nhân sau khi hết nhóm</label>`.
     - **Khối soạn nội dung & ảnh (`.composer-box`)**:
       - `<textarea id="post-text" rows="4" placeholder="Nhập nội dung bài viết... (Hỗ trợ xoay chữ {chào bạn|xin chào})"></textarea>`
       - Dòng `#spintax-hint` (`Số biến thể: 1`) + khối `#variant-preview` tự động hiện 2 biến thể mẫu ngay khi nội dung có cặp `{...|...}` (ẩn khi là văn bản thường, không cần nút bấm xem trước).
       - Nút chọn ảnh `<input type="file" id="post-images" accept="image/*" multiple>` + lưới thumbnail `#image-list` (tối đa 10 ảnh).
     - **Ngăn kéo Nhịp độ & An toàn (`<details id="pacing-drawer" class="pacing-drawer">`, mặc định đóng gọn)**:
       - `<summary id="pacing-summary">⚙️ Nhịp độ: chờ 60–180s/bài • Đếm ngược 10s</summary>`
       - Bên trong có lưới 2×2 gồm 4 ô số: `#set-minDelaySec` (`Chờ tối thiểu (s)`, mặc định `60`), `#set-maxDelaySec` (`Chờ tối đa (s)`, mặc định `180`), `#set-confirmWindowSec` (`Đếm ngược trước khi bấm Đăng (s)`, mặc định `10`), `#set-batchSize` (`Số bài mỗi lô`, mặc định `10`).
     - **Thanh trạng thái chạy trực tiếp (`#run-strip`, hiện khi có phiên đang chạy)** + **Nút hành động chính duy nhất**:
       - `<button type="button" class="btn btn-primary btn-block" id="btn-start-run">🚀 Lưu & Chạy ngay</button>`
       - `<button type="button" class="btn btn-danger btn-block" id="btn-stop-run" hidden>⏹ Dừng phiên chạy</button>`
       - `<div id="status" class="status" role="status" aria-live="polite"></div>`

3. **Viết lại `src/ui/popup.js` và `src/ui/popup.css`**:
   - **Quét nhóm tự động & Quản lý Checklist nhóm (`scanGroups`, `renderGroupChecklist`, `toggleGroup`)**:
     - Khi bấm `#btn-scan-groups`: đổi nút sang trạng thái `'⏳ Đang quét nhóm từ Facebook...'`, gọi `chrome.runtime.sendMessage({ v: 1, type: 'fbq:scan-groups', payload: { maxGroups: 300, maxScrolls: 15 } })`. Ngay khi hoàn tất, tải lại danh sách `grp:*` từ `chrome.storage.local`, hiển thị toàn bộ nhóm kèm tên tiếng Việt lên `#group-checklist`, và báo `'✅ Đã quét xong ' + total + ' nhóm!'`.
     - Khi người dùng tick/bỏ tick từng dòng trên `#group-checklist` hoặc bấm `Chọn tất cả` / `Bỏ chọn`, cập nhật ngay trường `enabled` của `grp:<key>` tương ứng trong `chrome.storage.local` và cập nhật bộ đếm `Đã chọn X / Y nhóm`.
     - Khi gõ vào `#group-filter`, lọc tức thì các dòng trong `#group-checklist` theo tên nhóm hoặc slug (không phân biệt hoa thường / dấu).
   - **Tự động lưu nháp (`autoSaveDraft`, debounce 250ms)**:
     - Mọi thay đổi trên `#post-text`, `#timelineUrl`, chế độ `targetMode` (`timeline` | `groups`), checkbox `#postToTimeline`, và 4 ô nhịp độ đều tự động ghi xuống `chrome.storage.local` (`draft`, `settings`, `post:default`).
     - Khi chọn ảnh qua `#post-images`, nén ảnh qua `root.assets.downscale` (hoặc lưu blob trực tiếp nếu môi trường không có canvas) và gọi `root.assets.putAsset` lưu ngay vào IndexedDB, cập nhật `draft.imageIds` để đóng popup mở lại vẫn hiển thị lại danh sách ảnh đã đính kèm.
   - **Luồng bấm `#btn-start-run` (`🚀 Lưu & Chạy ngay`)**:
     - Kiểm tra nội dung `#post-text` (hoặc ảnh đính kèm) không rỗng và cú pháp spintax hợp lệ (`countVariants`).
     - Nếu `targetMode === 'groups'` và số nhóm đang được tick chọn (`enabled !== false`) bằng `0`, báo lỗi ngay dưới nút: `'Vui lòng bấm "🔍 Tự động quét nhóm" và tick chọn ít nhất 1 nhóm, hoặc chuyển sang tab "🏠 Đăng Tường Cá Nhân".'`
     - Nếu `targetMode === 'timeline'`, **không yêu cầu có group nào**; nếu `#timelineUrl` để trống thì tự dùng `'https://www.facebook.com/me'`.
     - Ghi `post:<postId>`, `settings` (với `targetMode`, `postToTimeline: targetMode === 'timeline' ? true : E('postToTimeline').checked`, `timelineUrl: normalizeTimelineUrl(E('timelineUrl').value)`, `activePostId: postId`), và `autostartPending: true` vào `chrome.storage.local`, sau đó gửi `chrome.runtime.sendMessage({ v: 1, type: 'fbq:start-run', payload: { autostart: true, postId: postId } })`.
   - Giữ export `root.popup = { start: startRun, stop: stopRun, state: ... }` để đảm bảo hợp đồng module IIFE.

### Bước 4: Nâng cấp `src/ui/runner.html` thành Bảng điều khiển trực quan đồng nhất

Phụ thuộc Bước 2 và Bước 3.

1. **Bổ sung `<script>` và làm sạch bố cục `src/ui/runner.html`**:
   - Thêm `<script src="../core/hash.js"></script>` và `<script src="../core/spintax.js"></script>` trước `<script src="../core/schema.js"></script>` trong `src/ui/runner.html`.
   - Giữ đầy đủ các ID mà `src/ui/runner.js` đang gắn sự kiện (`#runner-status`, `#runner-progress`, `#runner-batch`, `#runner-eta`, `#runner-break`, `#runner-break-time`, `#runner-hint`, `#btn-start`, `#btn-pause`, `#btn-stop`, `#btn-close-tab`, `#runner-item-rows`, `#runner-log`).
   - Thiết kế lại giao diện `src/ui/runner.html`:
     - Đổi nhãn nút thành tiếng Việt rõ nghĩa: `#btn-start` (`▶ Chạy ngay`), `#btn-pause` (`⏸ Tạm dừng`), `#btn-stop` (`⏹ Dừng tất cả`), `#btn-close-tab` (`Đóng tab Facebook`).
     - Trong `render()` của `src/ui/runner.js`: hiển thị cột `Trạng thái` và cột `Lỗi` bằng nhãn tiếng Việt thân thiện (`STATE_LABELS[item.state]`, `ERROR_LABELS[item.errorCode]`), kèm nút `Mở trang` trực tiếp trên từng dòng để người dùng kiểm tra bài vừa đăng chỉ với 1 cú click.
     - Đưa khối `#runner-log` vào thẻ `<details class="log-details"><summary>Nhật ký chi tiết (dành cho kiểm tra kỹ thuật)</summary><pre id="runner-log"></pre></details>` để màn hình chính gọn gàng, không gây ngợp.

### Bước 5: Lớp an toàn chống khoá tài khoản (`src/core/safety.js`)

Phụ thuộc Bước 2. Bước 6 đọc trực tiếp module này. Không phụ thuộc Bước 3/4.

Nguyên tắc: mỗi lượt đăng phải khác nội dung, khác thứ tự, cách xa nhau về thời gian, và dừng ngay khi Facebook có dấu hiệu cảnh báo. Toàn bộ hằng số nằm trong 3 preset, không rải rác trong UI.

1. **Tạo `src/core/safety.js`** — IIFE đúng khuôn `src/core/schema.js` (guard `root.installed.safety`, `module.exports` cho Node). Module này **thuần tuý, không gọi `chrome.*`**, để test được bằng `node --test`:

```js
var DAY_MS = 86400000;

var PRESETS = {
  safe:   { dailyCap: 20, groupCooldownDays: 3, minDelaySec: 90, maxDelaySec: 240, confirmWindowSec: 10, longPauseChance: 0.15, longPauseMinSec: 300, longPauseMaxSec: 900, batchSize: 8,  batchBreakSec: 1800, stopAfterConsecutiveFailures: 2, maxPerRun: 20, retryBeforeClick: 0 },
  medium: { dailyCap: 40, groupCooldownDays: 2, minDelaySec: 60, maxDelaySec: 150, confirmWindowSec: 8,  longPauseChance: 0.08, longPauseMinSec: 240, longPauseMaxSec: 600, batchSize: 12, batchBreakSec: 900,  stopAfterConsecutiveFailures: 3, maxPerRun: 40, retryBeforeClick: 1 },
  fast:   { dailyCap: 80, groupCooldownDays: 1, minDelaySec: 30, maxDelaySec: 90,  confirmWindowSec: 5,  longPauseChance: 0.03, longPauseMinSec: 180, longPauseMaxSec: 420, batchSize: 20, batchBreakSec: 600,  stopAfterConsecutiveFailures: 4, maxPerRun: 80, retryBeforeClick: 1 }
};
```

Export `root.safety` gồm đúng các hàm sau (chữ ký cố định, có test ở phần Verification):

- `SAFETY_DEFAULTS` — object `{ preset: 'safe' }` hợp nhất toàn bộ khoá của `PRESETS.safe`.
- `dayKey(ts)` → `'YYYY-MM-DD'` theo **giờ máy** (`getFullYear`/`getMonth()+1`/`getDate`, pad 2 chữ số). Không dùng `toISOString()` vì UTC lệch ngày với người dùng Việt Nam.
- `randInt(min, max, rng)` → số nguyên trong `[min,max]`, `rng` mặc định `Math.random`; tự đảo nếu `min > max`.
- `remainingToday(dayRecord, dailyCap)` → `Math.max(0, cap - (dayRecord && dayRecord.count || 0))`.
- `chooseDelaySec(settings, rng)` → nếu `rng() < settings.longPauseChance` trả `randInt(longPauseMinSec, longPauseMaxSec, rng)`, ngược lại `randInt(minDelaySec, maxDelaySec, rng)`.
- `shuffle(list, rng)` → bản sao Fisher–Yates, không sửa mảng đầu vào.
- `filterEligible(groups, nowTs, settings)` → `{ eligible: [...], skipped: [{ key, reason, nextAt? }] }`; `reason` chỉ nhận `'disabled'` (khi `g.enabled === false`) hoặc `'cooldown'` (khi `nowTs - g.lastPostedAt < settings.groupCooldownDays * DAY_MS`).
- `textSeedForTarget(runId, key)` → `root.hash.fnv1a(String(runId) + '|' + String(key))`.
- `resolveText(rawText, seed)` → `root.spintax.render(root.spintax.parse(rawText), seed >>> 0)` trong `try/catch`; lỗi parse thì trả `rawText` nguyên bản.
- `variantCount(rawText)` → `root.spintax.size(root.spintax.parse(rawText))`, lỗi thì `0`.
- `isRateLimitAlert(text)` → test regex `/temporarily blocked|limit how often you can post|we limit how often|you're posting too fast|Bạn đang đăng quá nhanh|tạm thời bị chặn|giới hạn tần suất|đăng quá nhiều/i`.
- `pruneCutoffDayKey(nowTs)` → `dayKey(nowTs - 6 * DAY_MS)`; `isDayKeyOlderThan(key, cutoffKey)` → so sánh chuỗi `YYYY-MM-DD` (so sánh từ điển là đúng vì đã pad).

2. **`manifest.json`**: chèn `"src/core/safety.js"` vào `content_scripts[0].js` ngay sau `"src/core/spintax.js"` (adapter cần `isRateLimitAlert`). `test/load.js` đọc danh sách này nên tự động nạp; không sửa `test/load.js`.

3. **`src/ui/runner.js`** — nối safety vào hàng đợi:

   a) Thêm helper `localRemove(keys)` cạnh `localGet`/`localSet`, bọc `chrome.storage.local.remove` thành Promise.

   b) `mergeSettings(raw)` — đổi thứ tự ưu tiên thành `DEFAULT_SETTINGS` < `root.safety.SAFETY_DEFAULTS` < `raw`, để cài đặt cũ chưa có khoá an toàn vẫn nhận preset `safe`.

   c) `loadItems()` — khi dựng `state.groups`, thêm `lastPostedAt: v.lastPostedAt || 0` vào object `{ key, url, name }` (hiện đang bỏ mất trường này nên không lọc được cooldown).

   d) `beginNewRun()` — thay phần đầu hàm (trước `takeLease`) bằng luồng sau, giữ nguyên toàn bộ phần còn lại:
   ```js
   var groups = state.groups.slice();
   var settings = mergeSettings(state.settings);
   var nowT = now();
   var todayKey = root.safety.dayKey(nowT);
   // dọn rác hạn mức cũ (không chặn luồng chạy nếu lỗi)
   localGet(null).then(function (all) {
     var cutoff = root.safety.pruneCutoffDayKey(nowT);
     var stale = Object.keys(all).filter(function (k) {
       return k.indexOf('safe:day:') === 0 && root.safety.isDayKeyOlderThan(k.slice(9), cutoff);
     });
     if (stale.length) return localRemove(stale);
     return null;
   }).catch(function () { return null; });
   localGet(['safe:day:' + todayKey]).then(function (all) {
     var remaining = root.safety.remainingToday(all['safe:day:' + todayKey], settings.dailyCap);
     if (remaining <= 0) {
       setStatus('Hôm nay đã đăng đủ ' + settings.dailyCap + ' bài. Nghỉ để tài khoản an toàn, mai đăng tiếp nhé.');
       log('Dừng: đã chạm hạn mức ' + settings.dailyCap + ' bài/ngày');
       return;
     }
     var mode = settings.targetMode || (settings.postToTimeline === true && !groups.length ? 'timeline' : 'groups');
     var wantsTimeline = mode === 'timeline' || settings.postToTimeline === true;
     var picked = [];
     if (mode === 'groups') {
       var res = root.safety.filterEligible(groups, nowT, settings);
       picked = root.safety.shuffle(res.eligible, Math.random).slice(0, Math.min(remaining, settings.maxPerRun));
       var skippedCooldown = res.skipped.filter(function (s) { return s.reason === 'cooldown'; }).length;
       if (!picked.length && !wantsTimeline) {
         setStatus(skippedCooldown > 0
           ? 'Tất cả ' + skippedCooldown + ' nhóm đều đang trong thời gian nghỉ. Thử lại sau vài ngày nhé.'
           : 'Không có nhóm nào để đăng. Mở popup và bấm “🔍 Tìm nhóm của tôi”.');
         return;
       }
     }
     // ... phần takeLease + tạo qitem giữ nguyên, nhưng dùng `picked` thay `groups`
   });
   ```
   Trong nhánh tạo item: `qm.total = picked.length + (wantsTimeline ? 1 : 0)`; vòng lặp dựng `qitem` chạy trên `picked` (thứ tự đã xáo); `state.itemKeys = picked.map(g => g.key)`; item timeline chỉ được thêm khi `wantsTimeline === true` và dùng URL `normalizeTimelineUrl(settings.timelineUrl)`.

   e) `runPrepare(item)` — bỏ dòng `var text = qm.snapshot.text`, thay bằng:
   ```js
   var rawText = (qm && qm.snapshot && qm.snapshot.text) || '';
   var seed = root.safety.textSeedForTarget(qm.runId, item.key);
   var text = root.safety.resolveText(rawText, seed);
   var totalVariants = root.safety.variantCount(rawText);
   item.variantIndex = totalVariants > 0 ? (seed % totalVariants) : 0;
   item.textResolved = text;
   var imageIds = root.safety.shuffle((qm && qm.snapshot && qm.snapshot.imageIds) || [], Math.random);
   ```
   `sendPrepareStream(item, text, list, 0)` giữ nguyên — nhưng khi `list.length === 0` phải gửi 1 lệnh `prepare`/`prepare_timeline` với `text` (đúng nội dung đã resolve) thay vì nhảy thẳng sang `runPost`; đây chính là lỗi (4) trong Context.

   f) `scheduleNext()` — thay 2 dòng tính `min`/`max` bằng `var sec = root.safety.chooseDelaySec(settings, Math.random);`.

   g) `onPostResult(item, err, res)` — ngay đầu hàm:
   ```js
   if ((err && err.code === 'rate_limited') || (res && res.payload && res.payload.errorCode === 'rate_limited')) {
     abortRun('rate_limited');
     return;
   }
   ```
   Trong nhánh `type === 'posted'`, sau khi set `item.postedAt`:
   ```js
   var dayK = root.safety.dayKey(now());
   localGet(['safe:day:' + dayK]).then(function (all) {
     var rec = all['safe:day:' + dayK] || { count: 0 };
     rec.count = (rec.count || 0) + 1;
     rec.updatedAt = now();
     var sets = {};
     sets['safe:day:' + dayK] = rec;
     if (item.isTimeline !== true) {
       return localGet(['grp:' + item.key]).then(function (g) {
         var g2 = g['grp:' + item.key] || { key: item.key, url: item.url };
         g2.lastPostedAt = now();
         sets['grp:' + item.key] = g2;
         return localSet(sets);
       });
     }
     return localSet(sets);
   }).then(function () {
     return localGet(['safe:day:' + dayK]);
   }).then(function (all) {
     var left = root.safety.remainingToday(all['safe:day:' + dayK], state.settings.dailyCap);
     saveItem(item);
     if (left <= 0) { finishRun('daily_cap'); return; }
     recordResult(item);
   });
   ```
   (thay cho `saveItem(item).then(function () { recordResult(item); });` ở nhánh `posted`).

   h) `finishRun(reason)` — thêm nhánh thông báo: `reason === 'daily_cap'` → `setStatus('Xong hạn mức hôm nay (' + state.settings.dailyCap + ' bài). Nghỉ cho tài khoản an toàn nhé.')`.

   i) `abortRun(reason)` — đổi dòng gán cooldown: `qm.cooldownUntil = now() + (reason === 'rate_limited' ? 24 * 60 * 60 * 1000 : COOLDOWN_MS);`, và khi `reason === 'rate_limited'` thì `setStatus('Facebook đang cảnh báo giới hạn đăng bài. Đã dừng và khoá 24 giờ để bảo vệ tài khoản.')`.

4. **`src/content/adapter-group.js`** — `postFlow(timeline, opts)`:
   - Thay `var remaining = 10;` bằng `var remaining = (typeof opts.confirmWindowSec === 'number' && opts.confirmWindowSec >= 0) ? opts.confirmWindowSec : 10;`. Nhãn nút phải render theo `remaining` ngay từ đầu: `'Đăng ngay (' + remaining + ')'`.
   - Nếu `remaining === 0` thì bỏ qua overlay, gọi thẳng `doPost(resolve)`.
   - Trong `doPost`, sau khi lấy `alertText`, chèn **trước** regex lỗi hiện có:
     ```js
     if (root.safety && root.safety.isRateLimitAlert(alertText)) {
       result.failed = true;
       result.errorCode = 'rate_limited';
       result.errorText = alertText.slice(0, 200);
       cb();
       return;
     }
     ```

5. **`src/content/runner.js`** — `handlePost(env, payload)`:
   - Truyền `confirmWindowSec`: `return fn({ cancelKey: cancelKey, confirmWindowSec: payload && payload.confirmWindowSec });`.
   - Nhánh `res.failed` hiện đã trả `errorCode: res.errorCode || 'post_failed'` — giữ nguyên, `rate_limited` tự động đi qua.

### Bước 6: Hạ chuẩn sử dụng xuống mức không cần biết kỹ thuật (`popup.html` / `popup.css` / `popup.js`)

Phụ thuộc Bước 5. **Thay thế hoàn toàn mục 2 và mục 3 của Bước 3.** Đây là giao diện duy nhất người dùng thấy khi bấm icon extension.

Tiêu chí thiết kế bắt buộc: 3 khối đánh số 1️⃣2️⃣3️⃣ xếp dọc, tất cả cùng hiện (không tab, không wizard); chữ ≥ 15px; mọi vùng bấm ≥ 48px; nút chính cao 64px; không có ô nhập số nào ngoài ngăn "Tùy chọn nâng cao"; mọi thông báo lỗi là một câu tiếng Việt bình dân, không mã lỗi.

1. **`src/ui/popup.html`** — cấu trúc cố định (giữ đúng `id` vì `popup.js` bám vào):
```html
<body>
<div class="panel">
  <header class="top">
    <h1>Đăng bài hàng loạt</h1>
    <span id="safety-badge" class="badge">🟢 Hôm nay: 0/20 bài</span>
  </header>

  <section class="card">
    <h2>1️⃣ Chọn nơi đăng</h2>
    <div class="modes" role="group">
      <button type="button" class="mode" id="mode-groups" data-mode="groups" aria-pressed="false">
        <span class="mode-icon">👥</span><span class="mode-text">Đăng vào nhóm</span>
      </button>
      <button type="button" class="mode" id="mode-timeline" data-mode="timeline" aria-pressed="false">
        <span class="mode-icon">🏠</span><span class="mode-text">Chỉ tường của tôi</span>
      </button>
    </div>
    <div id="target-groups" hidden>
      <button type="button" class="btn btn-scan" id="btn-scan-groups">🔍 Tìm nhóm của tôi</button>
      <div id="scan-status" class="hint"></div>
      <input type="search" id="group-filter" placeholder="Lọc theo tên nhóm...">
      <div class="bulk-row">
        <button type="button" class="link" id="btn-select-all">Chọn tất cả</button>
        <button type="button" class="link" id="btn-deselect-all">Bỏ chọn</button>
        <span id="group-count" class="hint">Đã chọn 0/0</span>
      </div>
      <div id="group-checklist" class="checklist"></div>
      <details class="more">
        <summary>Dán link nhóm thủ công</summary>
        <textarea id="group-urls" rows="2" placeholder="Mỗi dòng một link nhóm"></textarea>
        <button type="button" class="link" id="btn-add-manual-groups">Thêm vào danh sách</button>
      </details>
    </div>
    <div id="target-timeline" hidden>
      <input type="text" id="timelineUrl" placeholder="Để trống = tường của bạn">
      <p class="hint">Chế độ an toàn để thử: chỉ đăng 1 bài.</p>
    </div>
  </section>

  <section class="card">
    <h2>2️⃣ Viết bài</h2>
    <textarea id="post-text" rows="5" placeholder="VD: Nhà 2 phòng ngủ Vinhomes, 2,1 tỷ, sổ hồng riêng. Liên hệ 09xx.xxx.xxx"></textarea>
    <div id="spintax-hint" class="hint">1 biến thể</div>
    <div id="variant-preview" class="preview" hidden></div>
    <label class="btn btn-ghost" for="post-images">📷 Chọn ảnh</label>
    <input type="file" id="post-images" accept="image/*" multiple hidden>
    <div id="image-list" class="thumbs"></div>
  </section>

  <section class="card">
    <h2>3️⃣ Bấm nút</h2>
    <button type="button" class="btn btn-primary" id="btn-start-run">🚀 ĐĂNG BÀI NGAY</button>
    <button type="button" class="btn btn-danger" id="btn-stop-run" hidden>⏹ DỪNG</button>
    <div id="run-caption" class="hint"></div>
    <div id="run-strip" class="strip" hidden></div>
    <div id="status" class="status" role="status" aria-live="polite"></div>
  </section>

  <details class="adv" id="advanced">
    <summary>Tùy chọn nâng cao</summary>
    <div class="presets" role="radiogroup">
      <label><input type="radio" name="preset" id="preset-safe" value="safe"> 🐢 An toàn nhất (khuyên dùng)</label>
      <label><input type="radio" name="preset" id="preset-medium" value="medium"> ⚖️ Vừa phải</label>
      <label><input type="radio" name="preset" id="preset-fast" value="fast"> 🐇 Nhanh (rủi ro cao hơn)</label>
    </div>
    <div class="grid">
      <label>Bài tối đa mỗi ngày <input type="number" id="set-dailyCap" min="1" max="200"></label>
      <label>Nghỉ mỗi nhóm (ngày) <input type="number" id="set-groupCooldownDays" min="0" max="30"></label>
      <label>Chờ tối thiểu (giây) <input type="number" id="set-minDelaySec" min="10"></label>
      <label>Chờ tối đa (giây) <input type="number" id="set-maxDelaySec" min="10"></label>
      <label>Đếm ngược trước khi đăng (giây) <input type="number" id="set-confirmWindowSec" min="0"></label>
      <label>Số bài mỗi lô <input type="number" id="set-batchSize" min="1"></label>
    </div>
    <label class="inline"><input type="checkbox" id="postToTimeline"> Đăng thêm lên tường sau khi hết nhóm</label>
    <button type="button" class="link" id="btn-open-runner">Bảng tiến độ chi tiết ↗</button>
  </details>
</div>
<script src="../core/hash.js"></script>
<script src="../core/spintax.js"></script>
<script src="../core/schema.js"></script>
<script src="../core/store.js"></script>
<script src="../core/safety.js"></script>
<script src="../core/assets.js"></script>
<script src="popup.js"></script>
</body>
```

2. **`src/ui/popup.css`** — viết lại từ đầu, chỉ dùng biến CSS ở `:root` (`--bg`, `--fg`, `--muted`, `--line`, `--primary`, `--danger`). Bắt buộc: `.btn-primary { min-height:64px; font-size:20px; font-weight:700; border-radius:14px; }`, `.mode { min-height:88px; }`, `.btn { min-height:48px; font-size:16px; }`, `.checklist { max-height:190px; overflow:auto; }`, `.card { border:1px solid var(--line); border-radius:14px; padding:12px; margin-bottom:10px; }`, `body { width:420px; font-size:15px; }`.

3. **`src/ui/popup.js`** — viết lại, giữ khuôn IIFE và export `root.popup = { start: startRun, stop: stopRun, state: state }`. Hành vi chính xác:

   - `state = { settings: {}, groups: {}, mode: 'groups', dayRecord: null, draft: {}, running: false, postId: '' }`.
   - `init()`: `chrome.storage.local.get(null)` → dựng `settings` bằng `mergeDefault(DEFAULT_SETTINGS, root.safety.SAFETY_DEFAULTS, stored.settings)`; đọc mọi khoá `grp:*` thành `state.groups[key] = { key, url, name, enabled, lastPostedAt }`; đọc `draft` (mặc định `{ text:'', imageIds:[], mode:'groups' }`); đọc `safe:day:<today>`; nếu `stored['ui:mode']` tồn tại thì dùng làm `state.mode`. Sau đó `renderAll()`.
   - `renderAll()`: vẽ badge, 2 nút mode (`aria-pressed`), khối target tương ứng, checklist, caption, trạng thái nút.
     - Badge: `used = dayRecord.count || 0`, `cap = settings.dailyCap`; `used >= cap` → `'🔴 Hôm nay đủ ' + used + '/' + cap + ' bài'` + class `badge-danger`; ngược lại `'🟢 Hôm nay: ' + used + '/' + cap + ' bài'`.
     - Caption dưới nút: mode `groups` → `'Sẽ đăng vào ' + n + ' nhóm • khoảng ' + Math.max(1, Math.round(n * (settings.minDelaySec + settings.maxDelaySec) / 120)) + ' phút'`; mode `timeline` → `'Sẽ đăng 1 bài lên tường của bạn'`.
     - Checklist: mỗi nhóm một `<label class="row">` với `<input type="checkbox" data-key="...">`, tên là `g.name || ('Nhóm ' + g.key)`, phụ là `g.lastPostedAt ? 'đã đăng ' + ngày : ''`. Tick/bỏ tick ghi ngay `grp:<key>.enabled`.
     - Lọc `#group-filter`: so khớp không dấu bằng `s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()` trên `name + ' ' + key`.
   - `applyPreset(name)`: `state.settings = mergeDefault(state.settings, root.safety.PRESETS[name])`, thêm `preset: name`; ghi `settings`; đổ lại 6 ô số; `renderAll()`.
   - `autoSave()` — debounce 250ms, ghi `{ settings, draft: { text, imageIds, mode }, 'ui:mode': state.mode }`.
   - `onImagesChange()`: với mỗi file, `root.assets.downscale(file, settings.imageMaxEdgePx, settings.imageJpegQuality, cb)` rồi `root.assets.putAsset(db, asset, cb)`; đẩy `id` vào `state.draft.imageIds` (tối đa `settings.maxImagesPerPost`), vẽ thumbnail, `autoSave()`.
   - `startRun()`:
     1. `var text = E('post-text').value.trim();`
     2. Nếu `!text && !state.draft.imageIds.length` → `setStatus('Chưa có nội dung. Viết vài chữ hoặc chọn ảnh đã nhé.', 'error')`, dừng.
     3. Nếu `text` có `{` mà `root.spintax.validate(text).ok === false` → `setStatus('Dấu ngoặc nhọn bị sai. Ví dụ đúng: {giá tốt|giá rẻ}', 'error')`, dừng.
     4. `mode === 'groups'`: đếm nhóm `enabled !== false`; nếu `0` → `setStatus('Chưa chọn nhóm nào. Bấm “🔍 Tìm nhóm của tôi” rồi tick nhóm muốn đăng.', 'error')`, dừng.
     5. Nếu `remainingToday < 1` → `setStatus('Hôm nay đã đăng đủ ' + cap + ' bài. Nghỉ để tài khoản an toàn, mai đăng tiếp nhé.', 'error')`, dừng.
     6. `var postId = 'p' + Date.now();` ghi `{'post:' + postId: { id: postId, text: text, imageIds: state.draft.imageIds.slice(), updatedAt: Date.now() }, settings: merge(state.settings, { activePostId: postId, targetMode: state.mode, postToTimeline: E('postToTimeline').checked === true, timelineUrl: normalizeTimelineUrl(E('timelineUrl').value) }), autostartPending: true}`, rồi `chrome.runtime.sendMessage({ v: 1, type: 'fbq:start-run', payload: { autostart: true, postId: postId } })`, cuối cùng `setStatus('Đã bắt đầu. Theo dõi ở bảng tiến độ vừa mở.')`.
   - `scanGroups()`: đổi nhãn nút thành `'⏳ Đang tìm nhóm...'`, `chrome.runtime.sendMessage({ v: 1, type: 'fbq:scan-groups', payload: { maxGroups: 300, maxScrolls: 20 } })`; khi trả về `payload.count` → `'✅ Tìm thấy ' + count + ' nhóm'`, nạp lại `grp:*`, `renderAll()`. Lỗi → `'❌ Không tìm được nhóm. Mở facebook.com rồi thử lại.'`, khôi phục nhãn nút.
   - `normalizeTimelineUrl(v)`: rỗng → `'https://www.facebook.com/me'`; không có `^https?://` → ghép `'https://www.facebook.com/' + v.replace(/^\/+/, '')`.
   - `bindAll()`: gắn `input`/`change` cho toàn bộ id ở trên; `#btn-start-run` → `startRun`; `#btn-stop-run` → `chrome.runtime.sendMessage({ v: 1, type: 'fbq:stop-run' })`.

4. **`src/ui/runner.html`**: thêm `<script src="../core/safety.js"></script>` ngay sau `spintax.js`; runner.js dùng `root.safety` cho `chooseDelaySec`, `textSeedForTarget`, `filterEligible`.

5. **`src/bg/sw.js`** — xử lý 3 message mới (giữ `badEnvelope` cho `msg.v !== 1` là chấp nhận được vì `popup.js`/`runner.js` đều gửi `v: 1`):
   - `'fbq:start-run'`: `chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/runner.html*') }, ...)`; nếu có tab thì `chrome.tabs.update(id, { active: true })` + `chrome.tabs.sendMessage(id, { v: 1, type: 'fbq:start-run' })`; nếu chưa có thì `chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/runner.html?autostart=1'), active: true })`. Trả `reply(sendResponse, true, 'opened', { tabId })`.
   - `'fbq:stop-run'`: chuyển tiếp `{ v: 1, type: 'fbq:stop-run' }` tới tab runner nếu có; trả `'stopped'`.
   - `'fbq:scan-groups'`: mở tab nền `chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false })` (tab nền để popup không bị đóng), chờ `chrome.tabs.onUpdated` tới `status === 'complete'`, rồi `chrome.tabs.sendMessage(tabId, { v: 1, type: 'scan', payload: { maxGroups: 300, maxScrolls: 20 } }, ...)`. Khi có `scanResult`: đọc `chrome.storage.local.get(null)`, với từng nhóm cào được thì **giữ nguyên** record `grp:<key>` cũ (bảo toàn `enabled` và `lastPostedAt`), chỉ tạo mới `{ key, url, name, enabled: false, lastPostedAt: 0 }` cho nhóm chưa có, cập nhật `name` mới; ghi lại toàn bộ; `chrome.tabs.remove(tabId)`; trả `{ ok: true, count, groups: merged }`. Timeout 90 giây không có `scanResult` → đóng tab và trả lỗi `{ ok: false, code: 'scan_timeout' }`.



## Critical files & anchors

- `src/core/safety.js` (mới) — Toàn bộ hằng số an toàn + hàm thuần (`chooseDelaySec`, `shuffle`, `filterEligible`, `resolveText`, `isRateLimitAlert`, `dayKey`). Test được bằng `node --test` vì không chạm `chrome.*`.
- `src/content/scanner.js` (`scan`, `collectLinks`, `groupKeyFromUrl`) & `src/content/runner.js` (`handleScan`, `handleInbound`, `handlePrepare`, `handlePost`) — Sửa lỗi bất đồng bộ callback/Promise khi cào nhóm, lọc bỏ link hệ thống (`/groups/feed`, `/groups/joins`, `/groups/discover`), lấy đúng tên nhóm tiếng Việt, và bổ sung `prepare_timeline` / `post_timeline`.
- `src/bg/sw.js` (`onMessage`) — Xử lý `fbq:scan-groups` (mở tab nền `/groups/joins/` với `active: false` để không đóng Popup, cào danh sách nhóm, hợp nhất vào `grp:*` trong `chrome.storage.local`) và `fbq:start-run` / `openRunner` (mở hoặc focus `runner.html?autostart=1`).
- `src/ui/popup.html` & `src/ui/popup.js` (`loadAll`, `renderAll`, `applyPreset`, `scanGroups`, `startRun`, `autoSave`) — 3 khối đánh số 1️⃣2️⃣3️⃣, một nút chính duy nhất, toàn bộ cấu hình nhịp độ nằm trong `<details>` "Tùy chọn nâng cao"; nạp 7 script core (thêm `safety.js`); badge hạn mức ngày đọc từ `safe:day:<YYYY-MM-DD>`.
- `src/ui/runner.js` (`isTimelineUrl`, `sendPing`, `sendPrepareStream`, `beginNewRun`, `scheduleNext`, `onPostResult`, `abortRun`) — Sửa lỗi bỏ qua `prepare` khi bài không có ảnh (`list.length === 0`), render spintax **theo từng nhóm**, xáo thứ tự nhóm, lọc cooldown + hạn mức ngày, và dừng 24 giờ khi Facebook cảnh báo.
- `src/content/adapter-group.js` (`prepareFlow`, `postFlow`) — Đọc `img.b64`, bỏ lệnh click `postBtn` sớm trong `prepareFlow`, dùng đúng `postKind` cho timeline.

## Verification

1. **Kiểm tra cú pháp và bộ test tự động (chạy tại `D:/extension`)**:
   ```bash
   node --check src/content/selectors.js && node --check src/content/scanner.js && node --check src/content/adapter-group.js && node --check src/content/runner.js && node --check src/bg/sw.js && node --check src/ui/popup.js && node --check src/ui/runner.js
   node --test test/adapter.test.js test/hash.test.js test/spintax.test.js test/schema.test.js test/store.test.js test/load.js test/assets.test.js
   ```
   - Kỳ vọng: Toàn bộ file JS không có lỗi cú pháp; toàn bộ test suite hiện có + test mới kiểm tra `scanner.scan` (lọc link hệ thống, lấy tên nhóm, trả Promise), `prepareTimeline`, `postTimeline`, `normalizeTimelineUrl`, và luồng `sendPrepareStream` không ảnh đều PASS 100% (`fail 0`).

2. **Kiểm tra luồng mới End-to-End (Tự động cào nhóm & Đăng thử 1 chạm)**:
   - Mở `chrome://extensions` → bấm nút **Reload (⟳)** ở thẻ extension `FB Group Poster`.
   - **Test 1 — Đăng thử lên Tường cá nhân (1 click)**:
     - Mở popup → mặc định ở tab **`🏠 Đăng Tường Cá Nhân (Test)`**, để trống ô URL trang cá nhân (`facebook.com/me`).
     - Gõ nội dung `Test đăng tường cá nhân {mẫu 1|mẫu 2}` → bấm **`🚀 Lưu & Chạy ngay`** → Extension tự mở `runner.html`, tự chạy ngay, mở trang cá nhân, điền bài và hiện đếm ngược 10 giây trước khi bấm Đăng.
   - **Test 2 — Tự động quét nhóm & Tick chọn nhóm cần gửi**:
     - Mở popup → chuyển sang tab **`👥 Đăng Hội Nhóm`** → bấm nút **`🔍 Tự động quét nhóm đã tham gia`**.
     - Extension tự mở tab nền `facebook.com/groups/joins/` (Popup vẫn mở), cuộn lấy danh sách tên nhóm + link nhóm rồi đổ vào khung Checklist.
     - Gõ từ khóa vào ô tìm kiếm (ví dụ `BĐS`), tick/bỏ tick các nhóm muốn đăng → bộ đếm cập nhật `Đã chọn X / Y nhóm` → bấm **`🚀 Lưu & Chạy ngay`** để chỉ đăng vào đúng các nhóm đã tick.
3. **Test đơn vị mới `test/safety.test.js`** (chạy `node --test test/safety.test.js` tại `D:/extension`), phải khẳng định đúng các điểm sau:

   - `safety.dayKey(new Date(2026, 10, 4, 23, 30).getTime())` → `'2026-11-04'` (giờ máy; nếu cài đặt dùng `toISOString()` thì test này đỏ vì ra `2026-11-04` lúc 23:30 nhưng ra `2026-11-05` khi 00:30 — thêm case `new Date(2026,10,5,0,30)` → `'2026-11-05'`).
   - `remainingToday({count:5},20) === 15`, `remainingToday(null,20) === 20`, `remainingToday({count:99},20) === 0`.
   - `chooseDelaySec({minDelaySec:90,maxDelaySec:90,longPauseChance:0}, () => 0.5) === 90`; `chooseDelaySec({longPauseChance:1,longPauseMinSec:300,longPauseMaxSec:300}, () => 0.5) === 300`.
   - `shuffle([1,2,3,4,5], seededRng)` trả mảng cùng độ dài, cùng tập phần tử, và mảng gốc không đổi.
   - `filterEligible`: `[{key:'a',lastPostedAt: now - 86400000}, {key:'b',lastPostedAt: now - 4*86400000}, {key:'c',enabled:false}]` với `{groupCooldownDays:3}` → `eligible` chỉ chứa `b`; `skipped` có `a:cooldown` và `c:disabled`.
   - `textSeedForTarget('r1','g1') !== textSeedForTarget('r1','g2')` và `textSeedForTarget('r1','g1') === textSeedForTarget('r1','g1')`.
   - `resolveText('{A|B|C}', seed)` thuộc `['A','B','C']`; với `raw = '{A|B|C|D|E}'`, hai seed của `g1` và `g2` cho ra hai chuỗi khác nhau (assert `notStrictEqual`).
   - `isRateLimitAlert('Bạn đang đăng quá nhanh') === true`; `isRateLimitAlert('Đăng bài thành công') === false`.
   - `pruneCutoffDayKey(new Date(2026,10,10).getTime()) === '2026-11-04'`; `isDayKeyOlderThan('2026-11-03','2026-11-04') === true`.

4. **Kiểm tra end-to-end trên Chrome thật** (sau `chrome://extensions` → Reload extension):
   - **Giao diện**: mở popup → thấy badge `🟢 Hôm nay: 0/20 bài`, đúng 3 khối `1️⃣ Chọn nơi đăng` / `2️⃣ Viết bài` / `3️⃣ Bấm nút`, một nút xanh cao, không có ô số nào ngoài `Tùy chọn nâng cao`. Mở ngăn nâng cao → radio `🐢 An toàn nhất` đang chọn.
   - **Đăng thử tường**: chọn `🏠 Chỉ tường của tôi`, nội dung `Test {mẫu một|mẫu hai}`, bấm `🚀 ĐĂNG BÀI NGAY` → tab `runner.html` tự mở và tự chạy (không cần bấm Start lần 2), đếm ngược 10 giây, đăng xong. Mở lại popup → badge `🟢 Hôm nay: 1/20 bài`.
   - **Khác nội dung từng nhóm**: quét nhóm, tick 2 nhóm, bấm chạy. Trong `runner.html` mỗi dòng có `textResolved`; hai dòng phải khác nhau (kiểm tra ở console runner: `FBQ` không expose state, nên đọc qua `chrome.storage.local.get(null)` lọc `qitem:*` và so `textResolved`).
   - **Hạn mức ngày**: ở console popup chạy `chrome.storage.local.set({['safe:day:' + new Date().toLocaleDateString('sv')]: {count: 20}})`, mở lại popup → badge `🔴 Hôm nay đủ 20/20 bài`; bấm nút → chỉ hiện dòng `Hôm nay đã đăng đủ 20 bài...`, **không** mở tab runner.
   - **Cooldown nhóm**: chạy `chrome.storage.local.get(null)` để lấy một `grp:<key>` đang bật, set `lastPostedAt = Date.now()`, chạy lại → nhóm đó không có trong danh sách chạy; nếu đó là nhóm duy nhất thì hiện `Tất cả 1 nhóm đều đang trong thời gian nghỉ...`.
   - **Dừng khi bị cảnh báo**: trong console content script (tab facebook.com) chạy `FBQ.safety.isRateLimitAlert('Bạn đang đăng quá nhanh')` phải trả `true`; sau đó ở runner, `qm.abortReason === 'rate_limited'` và `qm.cooldownUntil - Date.now() > 23*3600*1000`.

## Assumptions & contingencies

- **Người dùng để trống ô URL trang cá nhân khi test**: Mặc định tự điều hướng tới `https://www.facebook.com/me` (Facebook tự chuyển hướng về đúng trang cá nhân của tài khoản đang đăng nhập). Nếu giao diện trang cá nhân của tài khoản dùng bố cục khóa tường không có ô đăng bài, fallback tự động thử tìm nút mở composer trên `https://www.facebook.com/` (Trang chủ).
- **Người dùng đóng popup giữa lúc đang gõ bài hoặc sau khi chọn ảnh**: Mọi trường văn bản được debounce lưu tự động sau 250ms vào `chrome.storage.local` (`draft`), và ảnh được ghi ngay vào IndexedDB qua `assets.js`, nên mở lại popup không bao giờ mất dữ liệu.
- **Preset mặc định là `safe` (20 bài/ngày, nghỉ 3 ngày mỗi nhóm, chờ 90–240 giây)**: Người đã có `settings` lưu từ trước sẽ giữ giá trị cũ của họ (giá trị lưu thắng preset), trừ khi họ bấm chọn preset trong ngăn nâng cao. Muốn áp preset cho cả người dùng cũ thì xoá khoá `settings` khi nâng cấp `SCHEMA_VERSION` — không làm ở bước này.
- **Facebook đổi DOM làm `ALERT` không bắt được hộp thoại chặn**: fallback là kiểm tra URL `/checkpoint` trong heartbeat của `src/ui/runner.js` (đã có sẵn) → phiên vẫn dừng, chỉ chậm hơn một nhịp. Không thêm cơ chế khác.
- **Bản Safari không thuộc phạm vi này**: Safari Web Extension phải build bằng `safari-web-extension-converter` trên macOS kèm Xcode và Apple Developer Program, và `manifest` phải khai báo lại quyền. Làm Chrome/Edge chạy đúng trước.