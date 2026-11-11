# Kế hoạch: fb-bulk-group-poster

## 1. Bối cảnh

Người dùng là nhân viên bán bất động sản, mỗi ngày phải đăng cùng một tin dự án lên khoảng 50 group Facebook đã tham gia. Việc đó hiện làm bằng tay: mở từng group, dán nội dung, chọn ảnh, bấm Đăng — tốn 1–2 giờ và dễ sót group.

Sản phẩm là một extension Chrome/Edge (Manifest V3), cài bằng cách giải nén file zip và `Load unpacked`. Extension chạy trong trình duyệt của chính người dùng, trên phiên Facebook họ đã đăng nhập sẵn. Nó giữ một danh sách group, một nội dung bài viết (có spintax), một bộ ảnh; rồi lần lượt đăng lên từng group, giãn cách 60–180 giây, mỗi bài có cửa sổ đếm ngược 10 giây cho phép hủy, và dừng toàn bộ ngay khi Facebook chặn tài khoản.

Kết thúc: người dùng bấm Start một lần, đi làm việc khác, quay lại sau khoảng 2 giờ thấy 50 bài đã đăng và một bảng log ghi rõ group nào thành công, group nào lỗi.

**Ràng buộc nền tảng đã xác minh (không thể chọn khác):**
- Graph API `publish_to_groups` đã bị gỡ khỏi mọi version từ 22/04/2024 → không có API đăng group. Đường duy nhất còn lại là thao tác DOM trên phiên đăng nhập của người dùng.
- Service worker MV3 bị Chrome kill sau ~30 giây idle → không được đặt hàng đợi trong service worker.
- Chrome message serialize bằng JSON → không truyền `Blob`/`ArrayBuffer`, buộc base64.
- Máy phát triển là Windows → Safari không build được (cần macOS + Xcode 12+ + Apple Developer Program). Safari và Fanpage/trang cá nhân chỉ có thể là adapter thêm sau, không nằm trong v1; kiến trúc dưới đây không cản việc đó.

## 2. Quyết định đã chốt — không mở lại khi triển khai

| Mã | Quyết định |
|---|---|
| D1 | Chế độ chạy: tự động có cửa sổ đếm ngược 10 giây cho từng bài, có nút Hủy từng bài và Dừng tất cả. |
| D2 | Nội dung: một bài + cú pháp spintax `{a|b|c}`, sinh một biến thể cho mỗi group. |
| D3 | Bề mặt đăng: chỉ group (`facebook.com/groups/<...>`). |
| D4 | Ảnh: album nhiều ảnh, tối đa 10 ảnh/bài. |
| D5 | Phân phối: zip + `Load unpacked`, không license, không server, không Chrome Web Store. |
| D6 | Một tab Facebook duy nhất, đi tuần tự từng group (full page load mỗi group). Không pipeline nhiều tab: giãn cách chiếm 75–90% thời gian nên pipeline chỉ rút ngắn ~40 phút nhưng xóa mất biên an toàn và làm hủy/abort không xác định. Hiển thị thẳng ETA "khoảng 2 giờ" trong UI. |
| D7 | Không dùng `chrome.debugger`, không dùng MAIN world, không dùng `chrome.scripting`. Khi chèn text thất bại thì đẩy bài đó sang `needs_manual`, không tự chọc vào React fiber. |
| D8 | Không bundler, không dependency npm. Mỗi file là một IIFE gán vào `globalThis.FBQ`, kèm tail export cho Node. |
| D9 | Không có kiểm chứng tự động bằng cách quét feed sau khi đăng. Sau click mà không có xác nhận thì trạng thái là `unknown` và hiện nút "Mở group để kiểm tra". |

## 3. Cây file

```
D:/extension/
  manifest.json
  package.json
  README.md
  src/
    core/
      hash.js            # FNV-1a + mulberry32
      spintax.js         # parse, validate, render(seed)
      schema.js          # hằng số schema, default settings, migrate()
      store.js           # wrapper storage.local/session, không chứa chrome ở mức module
      assets.js          # IndexedDB ảnh: put/get/delete/downscale (chỉ dùng ở extension page)
    content/
      dom.js             # waitFor, until, normText, click, isVisible — không chrome.*
      selectors.js       # SELECTOR_VERSION + bảng ứng viên
      adapter-group.js   # mở composer, chèn text, upload ảnh, bấm Post, phát hiện kết quả
      runner.js          # cầu nối message + overlay đếm ngược trong tab Facebook
      scanner.js         # quét group đã tham gia
    bg/
      sw.js              # router mỏng: mở runner, notification, không giữ state
    ui/
      runner.html
      runner.js          # orchestrator: hàng đợi, lease, deadline, log
      runner.css
      popup.html
      popup.js           # tạo/sửa bài, quản lý group, cài đặt, nút Start
      popup.css
      options.html
      options.js
  dev/
    fixture.html         # bản sao cấu trúc composer để test adapter, không đóng gói
    fixture-driver.js
  test/
    load.js
    spintax.test.js
    hash.test.js
    schema.test.js
    store.test.js
    adapter.test.js
  scripts/
    pack.mjs
```

## 4. Hợp đồng nạp & module

`package.json`:

```json
{
  "name": "fbq",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "node --test test/",
    "pack": "node scripts/pack.mjs"
  }
}
```

Không có `"type": "module"` — bốn file content script là CommonJS-compatible classic script. `scripts/pack.mjs` dùng đuôi `.mjs` để chạy ESM.

`manifest.json` (giá trị chính xác):

```json
{
  "manifest_version": 3,
  "name": "FB Group Poster",
  "version": "0.1.0",
  "minimum_chrome_version": "120",
  "permissions": ["storage", "unlimitedStorage", "tabs", "notifications"],
  "host_permissions": ["https://*.facebook.com/*"],
  "background": { "service_worker": "src/bg/sw.js" },
  "action": { "default_popup": "src/ui/popup.html" },
  "options_page": "src/ui/options.html",
  "content_scripts": [{
    "matches": ["https://*.facebook.com/*"],
    "run_at": "document_idle",
    "all_frames": false,
    "js": [
      "src/core/hash.js",
      "src/core/spintax.js",
      "src/content/dom.js",
      "src/content/selectors.js",
      "src/content/adapter-group.js",
      "src/content/runner.js",
      "src/content/scanner.js"
    ]
  }]
}
```

Mảng `js` là **nguồn duy nhất** của thứ tự nạp. `test/load.js` đọc chính mảng này và `require()` lần lượt, nên test và trình duyệt không thể lệch thứ tự.

Khuôn mẫu bắt buộc cho mọi file trong `src/core` và `src/content`:

```js
(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.spintax) return;
  if (!root.hash) return;              // guard phụ thuộc: file trước chết thì file này không chạy nửa vời
  // ... thân file, không khai báo gì ở top-level ngoài IIFE ...
  root.spintax = { parse: parse, validate: validate, render: render, size: size };
  root.installed.spintax = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.spintax;
}
```

Ràng buộc kèm theo:
- Không `import`, không `await` top-level.
- Không khai báo `const`/`let` ở top-level ngoài IIFE (inject lần hai sẽ ném `Identifier already declared`).
- Không chạm `chrome.*` hay `document` lúc nạp module; chỉ trong hàm được gọi.
- `adapter-group.js` tuyệt đối không gọi `chrome.*` — nhờ vậy nó chạy được cả trong `dev/fixture.html`.

## 5. Schema lưu trữ

`chrome.storage.local` (bền), khoá phẳng, **một người ghi cho mỗi nhóm khoá**:

| Khoá | Người ghi | Nội dung |
|---|---|---|
| `sv` | bất kỳ (chỉ đọc sau đó) | số `1` = schema version |
| `settings` | popup/options, chỉ khi hàng đợi `idle` | xem bên dưới |
| `post:<id>` | popup | `{id, name, text, imageIds:[], createdAt, updatedAt}` |
| `grp:<key>` | popup | `{key, url, name, enabled:true, addedAt}` |
| `res:<key>` | runner | `{status, at, runId, errorCode}` |
| `qmeta` | runner | xem bên dưới |
| `qitem:<key>` | runner | xem bên dưới |
| `log:<seq>` | runner | `{at, level, key, msg}` — giữ 500 bản ghi cuối, xoá từ nhỏ nhất |

`chrome.storage.session` (không bền, content script không đọc được — đúng ý đồ):

| Khoá | Nội dung |
|---|---|
| `lease` | `{owner, heartbeatAt, until}` |

`settings` mặc định (giá trị chính xác):

```json
{
  "minDelaySec": 60,
  "maxDelaySec": 180,
  "confirmWindowSec": 10,
  "maxPerRun": 50,
  "retryBeforeClick": 1,
  "stopAfterConsecutiveFailures": 3,
  "maxImagesPerPost": 10,
  "imageMaxEdgePx": 1600,
  "imageJpegQuality": 0.82
}
```

`qmeta`:

```json
{
  "schema": 1,
  "runId": "r-<epoch>",
  "status": "idle|running|paused|stopped|aborted|done",
  "startedAt": 0,
  "finishedAt": 0,
  "cursor": 0,
  "total": 0,
  "cancelKey": 0,
  "abortReason": null,
  "cooldownUntil": 0,
  "snapshot": { "text": "", "imageIds": [], "settings": {}, "postId": "" }
}
```

`qitem:<key>`:

```json
{
  "key": "1234567890",
  "url": "https://www.facebook.com/groups/1234567890/",
  "state": "queued",
  "attemptNo": 0,
  "variantIndex": 0,
  "textResolved": "",
  "textHash": "",
  "clickedAt": 0,
  "postedAt": 0,
  "errorCode": null,
  "errorText": null,
  "lastStepAt": 0
}
```

Hai điểm bắt buộc:
- `textResolved` lưu **chuỗi đã render**, không chỉ `variantIndex`. Người dùng sửa nội dung giữa hai phiên thì seed không tái tạo lại được bài cũ, và mọi so sánh/verify sẽ sai.
- `snapshot` trong `qmeta` chụp nội dung + settings tại lúc Start. Sửa settings giữa lúc chạy không làm đổi các bài còn lại.

Ghi nguyên tử: mọi cập nhật là đọc-một-khoá-rồi-ghi-đúng-khoá-đó. Không bao giờ ghi cả object `queue` lớn. Popup và runner không ghi chung một khoá nào (bảng trên là hợp đồng).

Khoá group: `key` = numeric id nếu URL có (`/groups/1234567890/`), ngược lại là slug (`/groups/ten-nhom/`). Không dùng slug khi có numeric id vì slug đổi được.

## 6. Giao thức message

Mọi message giữa runner page và content script:

```js
{ v: 1, runId, epoch, requestId, type, payload }
```

`epoch` tăng mỗi lần runner điều hướng tab sang group mới. Content script trả kèm `observedUrl` (URL nó thực sự thấy). Runner bỏ qua mọi message có `epoch` cũ hoặc `observedUrl` không khớp group đích — đây là thứ chặn việc bài của group A đăng vào group B khi Facebook là SPA.

Các cặp message:

| Runner → CS | Payload | CS → Runner |
|---|---|---|
| `ping` | `{expectedKey}` | `pong` `{observedUrl, key, ready}` |
| `prepare` | `{text, images:[{idx,total,b64,mime}], confirmWindowSec}` | `progress` `{step}` rồi `prepared` `{composerText, paragraphs}` |
| `post` | `{}` | `countdown` `{leftMs}`, rồi `posted` `{clickedAt}` |
| `result` | `{}` | `result` `{status, errorCode, errorText, observedUrl}` |
| `cancel` | `{itemKey}` | `cancelled` `{}` |
| `abort` | `{reason}` | `aborted` `{}` |
| `scan` | `{maxGroups, maxScrolls}` | `scanResult` `{groups:[{key,url,name}]}` |

Mỗi ảnh là **một message riêng** (`prepare` với `images` chứa đúng một phần tử, `idx`/`total`). Không gửi cả album trong một message: base64 phình 4/3 và một message lớn có thể chết giữa đường.

Kênh phụ: content script mở `chrome.runtime.connect({name:'fbq'})` để runner page biết tab còn sống. Port chỉ để đẩy sự kiện; trạng thái luôn lấy từ storage.

## 7. Máy trạng thái hàng đợi

`state` của một item:

| Từ | Sang | Điều kiện |
|---|---|---|
| `queued` | `navigating` | runner gọi `chrome.tabs.update(tabId,{url})` |
| `navigating` | `preparing` | nhận `pong` có `observedUrl` khớp và `ready:true`, trong 20s |
| `navigating` | `failed` | hết 20s, hoặc URL lệch → `errorCode:"nav_mismatch"` |
| `preparing` | `text_ok` | `prepared` trả về, `composerText` rỗng trước khi chèn |
| `preparing` | `image_uploading` | có ảnh; upload xong mới sang `images_ok` |
| `preparing`/`text_ok`/`images_ok` | `needs_manual` | chèn text hoặc upload thất bại sau khi đã thử lại |
| `text_ok`/`images_ok` | `countdown` | runner gửi `post` |
| `countdown` | `clicking` | hết 10s, không bị hủy |
| `countdown` | `cancelled` | `cancelKey` đổi trong lúc đếm |
| `clicking` | `posted` | dialog detach **và** composer rỗng **và** không có banner lỗi |
| `clicking` | `unknown` | hết 45s sau click mà không có xác nhận |
| `clicking` | `failed` | banner lỗi bắt được trước 45s |
| bất kỳ | `failed` | `errorCode` đã phân loại |

Quy tắc cứng:
- **Ghi trước khi click.** `clickedAt` và `attemptNo` được ghi xuống `qitem:<key>` *trước* khi dispatch click. Sau khi có `clickedAt`, không bao giờ tự retry — chỉ có `posted` hoặc `unknown`. Facebook không dedupe, retry mù sẽ đăng trùng.
- **Dừng theo ngưỡng.** 3 item `failed` liên tiếp → `qmeta.status = "paused"` + `abortReason = "consecutive_failures"` + notification.
- **Abort toàn cục** khi: `location.pathname` bắt đầu bằng `/checkpoint`, URL chứa `/login`, `document.querySelector('form[action*="checkpoint"]')` khác null, hoặc một `[role="alert"]`/`[role="dialog"]` có text khớp `/temporarily blocked|tạm thời bị chặn|We suspended|đã bị tạm khóa|Verify your identity|xác minh danh tính/i`. Khi abort: `status="aborted"`, `cooldownUntil = now + 30 phút`, đóng tab Facebook, bật notification, focus runner.
- **Resume.** Mở `runner.html` lúc có `qmeta.status` ∈ `running|paused` thì reconcile: item đang `clicking` mà đã có `clickedAt` → đặt `unknown` (không đăng lại); item `countdown` → về `queued`; item `queued` đầu tiên được chạy tiếp.
- **Lease.** Trước khi set `running`, runner ghi `lease = {owner: runId, heartbeatAt: now, until: now+60s}` vào `storage.session`. Heartbeat mỗi 20s. Runner khác thấy lease còn hạn thì từ chối Start và hiện "Đang có phiên chạy khác".

## 8. Adapter DOM

`selectors.js` xuất `SELECTOR_VERSION = 1` và bảng ứng viên có thứ tự. Mọi selector dựa trên `aria-label`, `role`, `data-testid`, text — không dựa trên class hash (Facebook đổi liên tục). Bảng phủ cả giao diện tiếng Việt và tiếng Anh.

Nút mở composer (thử theo thứ tự, dừng ở cái đầu tiên hiển thị):
1. `[data-testid="group-composer"]`
2. `div[role="button"]` có `aria-label` khớp `/Write something|Viết gì đó|Bạn viết gì|Viết nội dung/i`
3. `div[role="button"]` có `textContent` khớp cùng biểu thức trên

Editor trong dialog:
1. `[role="dialog"] div[contenteditable="true"][role="textbox"]`
2. `[role="dialog"] div[contenteditable="true"]`

Input file ảnh (có thể phải bấm nút ảnh trước để input xuất hiện):
1. `[role="dialog"] input[type="file"][accept*="image"]`
2. Bấm `[aria-label="Photo/Video"]` hoặc `[aria-label="Ảnh/Video"]`, chờ 3s, thử lại (1)

Nút Đăng (thử theo thứ tự):
1. `[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"]` với `role="button"`
2. phần tử `div[role="button"]` trong dialog có `textContent.trim()` ∈ `{"Post","Đăng"}`
3. `[data-testid="composer-submit"]`

Nút được coi là bấm được khi `aria-disabled !== "true"` và không có thuộc tính `disabled`.

Ảnh đã lên khi số `[role="dialog"] img[src^="blob:"]` bằng số ảnh gửi đi.

Hành động, theo thứ tự chính xác trong `prepare(text, images, opts)`:

1. `waitFor(composerTrigger, 15000)`. Nếu không thấy → `errorCode:"composer_not_found"`.
2. Bấm nút mở, `waitFor(editor, 15000)`.
3. **Kiểm tra draft có sẵn:** đọc `normText(editor.innerText)`. Nếu khác rỗng → `errorCode:"draft_present"`, không chèn gì, không bấm gì. Không bao giờ đăng nháp của người dùng.
4. **Chèn từng đoạn.** `text.split('\n')`. Với mỗi đoạn: `editor.focus()`, đặt caret vào cuối editor, `document.execCommand('insertText', false, doan)`. Giữa hai đoạn: `document.execCommand('insertParagraph')`. Không bao giờ gọi `insertText` với payload chứa `\n` — Lexical biến nó thành một TextNode và HTML collapse mất phân đoạn.
5. **Verify:** normalize `editor.innerText` (NBSP → space, bỏ `\u200b-\u200d\ufeff`, gộp `[ \t]+` thành một space, gộp `\n{2,}` thành `\n`, trim) rồi so bằng với text đã normalize. Đồng thời đếm số node đoạn (`editor.querySelectorAll('p, div[data-lexical-paragraph]')` cộng số `<br>` tách đoạn) — phải ≥ số đoạn − 1. Sai → xoá sạch editor (`selectAll` + `delete`) rồi thử lại một lần; vẫn sai → `errorCode:"insert_rejected"` → `needs_manual`.
6. **Ảnh:** với mỗi ảnh, dựng `File` từ base64 (`fetch(dataUrl).then(r=>r.blob())`), đóng gói `DataTransfer`, gán `input.files = dt.files`, dispatch `new Event('change',{bubbles:true})`. Nếu sau 5s chưa có thumbnail tăng lên, dispatch `new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})` lên editor. Chờ tới khi số thumbnail đúng bằng số ảnh, tối đa 30s/ảnh. Vượt → `errorCode:"upload_rejected"` → `needs_manual`.
7. `waitFor(postButton && bấm được, 45000)`. Không bấm được → `errorCode:"post_disabled"`.
8. Trả `prepared` cho runner.

`post()`:
1. Hiện overlay đếm ngược 10s trong tab (Shadow DOM, host id `fbq-overlay`, `all: initial` để CSS Facebook không ăn vào). Hai nút: `Hủy` và `Đăng ngay`.
2. Ngay trước khi click, đọc `qmeta.cancelKey`; khác giá trị lúc bắt đầu đếm → `cancelled`.
3. **Runner ghi `clickedAt` trước** (bước 7 của §7), rồi gửi `post`. Adapter chỉ click sau khi nhận `post`, nên `clickedAt` luôn tồn tại trước cú click.
4. Click. Chờ dialog detach tối đa 45s.
5. Khi detach: kiểm tra banner `[role="alert"]` khớp `/Try again|Something went wrong|temporarily blocked|posting too fast|thử lại|đã xảy ra lỗi/i`. Có → `failed` kèm text banner. Không có → `posted`.

`dom.js` cung cấp: `waitFor(fn, ms)` trả promise, `sleep(ms)`, `normText(s)`, `isVisible(el)`, `clickEl(el)`, `setNativeValue`. Không file nào trong `src/content` được import.

## 9. Spintax

Cú pháp: `{a|b|c}`, lồng nhau tùy ý, `\{` `\}` `\|` để thoát. Không hỗ trợ biến.

API:
- `parse(text)` → AST hoặc ném `SpintaxError{pos, msg}` khi ngoặc lệch. Popup gọi hàm này khi lưu bài và chặn lưu nếu lỗi, hiện vị trí ký tự.
- `size(ast)` → tích số lựa chọn ở mọi nhánh (số biến thể khác nhau tối đa).
- `render(ast, seed)` → chuỗi, chọn nhánh bằng PRNG mulberry32 khởi tạo từ seed.

Seed: `mulberry32(fnv1a(groupKey))`. Cùng group → cùng biến thể ở mọi lần chạy lại, nên retry không tạo ra nội dung thứ ba.

`hash.js`: `fnv1a(str)` dùng `Math.imul`, trả uint32; `mulberry32(seed)` trả hàm `() => float`. Không dùng `crypto` để giữ đồng nhất giữa Node và trình duyệt.

Chính sách biến thể khi lỗi:
- Lỗi transient trước click (timeout, `composer_not_found`) → retry với **cùng** `variantIndex`.
- Lỗi do Facebook (block/moderation, `post_disabled`) → không retry, chuyển sang group kế tiếp.

Popup cảnh báo trước khi Start khi `size(ast) < số group đã bật`: "Chỉ có 3 biến thể cho 47 group — nội dung sẽ lặp. Thêm nhánh spintax hoặc giảm số group." Chỉ cảnh báo, không chặn.

## 10. Ảnh

Người dùng chọn ảnh trong popup. Ngay tại đó, `assets.downscale(file)` vẽ lên canvas: cạnh dài tối đa `imageMaxEdgePx` (1600), encode JPEG chất lượng `imageJpegQuality` (0.82). Canvas re-encode tự động bỏ EXIF. Lưu vào IndexedDB (object store `assets`, key = id ngẫu nhiên, value = `{blob, mime, w, h, bytes}`).

Vì sao IndexedDB chứ không `storage.local`: `storage.local` mặc định 10MB và lưu base64 (phình 4/3). IDB lưu thẳng Blob, và `unlimitedStorage` đã khai báo.

Chỉ **runner page** đọc IDB (nó cùng origin với extension). Content script không đọc được IDB của extension và không cần: runner đọc blob → base64 → gửi từng ảnh một. Bỏ hoàn toàn đường service-worker-làm-proxy.

Giới hạn cứng: 10 ảnh/bài; tổng sau khi nén ≤ 15MB/bài; popup chặn và báo lỗi nếu vượt.

## 11. Vòng đời tab & thời gian

- Start: tạo một tab (`chrome.tabs.create({url: group[0].url, active:true})`), gọi `chrome.tabs.update(tabId, {autoDiscardable:false})`. Tab này **chiếm focus** — điều kiện để click/focus đáng tin và để timer của tab không bị throttle. UI phải nói rõ điều này trước khi Start.
- Mỗi group: `chrome.tabs.update(tabId, {url})` = full page load. Không dùng điều hướng SPA: content script nạp lại sạch, `epoch` không thể lẫn.
- Toàn bộ countdown 10s và click chạy trong content script của tab đang active, không chạy trong runner page. Runner page là tab nền nên bị Chrome bóp timer còn ~1 lần/phút; nó không được là nguồn thời gian cho bước nhạy cảm nào.
- Runner page giữ deadline tuyệt đối (`Date.now() + delay`), `setTimeout` chỉ để đánh thức, mỗi lần thức đều so lại `Date.now() >= deadline`. Vì vậy delay 60–180s có thể trễ tới ~60s mà không sai logic.
- Timeout từng bước: nav/READY 20s, mở composer 15s, chèn+verify 5s, mỗi ảnh 30s, chờ nút Đăng 45s, click→xác nhận 45s. Không bước nào chờ vô hạn.
- Người dùng đóng tab Facebook giữa lúc chạy: `chrome.tabs.onRemoved` → `status="paused"`, `abortReason="tab_closed"`; mở lại runner thì Start lại sẽ tạo tab mới và chạy tiếp từ item `queued` kế tiếp.
- Kết thúc: đóng tab Facebook, notification tổng kết `posted/failed/unknown/cancelled`.

## 12. Hủy, abort, retry

- `Hủy` trên overlay: ghi `qmeta.cancelKey++`. Adapter đọc lại ngay trước click nên hủy luôn thắng nếu tới trước cú click; tới sau cú click thì không có tác dụng và item đi tiếp tới `posted`/`unknown`.
- `Dừng tất cả` trong popup/runner: như Hủy nhưng đặt `status="stopped"`; item đang chạy được xử lý như Hủy.
- `Pause`: dừng sau khi item hiện tại kết thúc (không cắt ngang bước đang chạy).
- Retry tự động chỉ áp dụng **trước click**: tối đa `retryBeforeClick = 1` lần cho `nav_mismatch` (sau khi load lại) và `composer_not_found`.
- Không retry: `draft_present`, `insert_rejected`, `upload_rejected`, `post_disabled`, mọi lỗi sau click.

## 13. UI

`popup.html` (khoảng 380px, ba khu vực):
1. Bài viết: textarea nội dung, nút "Xem trước biến thể" (hiện 3 biến thể với seed ngẫu nhiên) + dòng "Số biến thể khác nhau: N". Chọn ảnh (hiện thumbnail + tổng dung lượng). Nút Lưu.
2. Group: ô dán danh sách URL (mỗi dòng một URL), nút "Thêm", nút "Quét group đã tham gia" (mở tab `facebook.com/groups/joins/`, chạy `scanner.js`), danh sách group có checkbox bật/tắt.
3. Chạy: hiện "47 group đang bật · ~2 giờ 5 phút", nút Start, nút Mở bảng điều khiển.

Chọn bài để chạy: `settings.activePostId` trỏ tới đúng một `post:<id>`. Mỗi lần Start chỉ đăng một bài. Nhiều bài lưu sẵn là hàng chờ cho các ngày khác nhau, không phải nhiều bài trong một lần chạy.

Start bị chặn (nút disabled + lý do hiển thị) khi: `activePostId` rỗng hoặc bài đó rỗng nội dung; 0 group đang bật; hoặc `storage.session.lease` còn hạn.

ETA hiển thị theo công thức: `total * ((minDelaySec + maxDelaySec) / 2 + 30)` giây, làm tròn tới 5 phút. Con số 30 giây là chi phí trung bình của một vòng prepare + countdown + click + xác nhận.

`runner.html` (tab riêng, mở tự động khi Start): thanh trạng thái (running/paused/aborted), ETA còn lại, tiến độ `n/total`, nút Pause/Dừng, bảng item (group, trạng thái, thời điểm, lỗi), bảng log 100 dòng cuối.

Nhóm `needs_manual` và `unknown` hiện nút: "Copy nội dung", "Mở group", "Đánh dấu đã đăng", "Bỏ qua".

## 14. Các bước thực hiện

Mỗi bước phải build được và `npm test` xanh trước khi sang bước sau. Người dùng cuối không thấy gì cho tới P5.

**P0 — Khung + hợp đồng nạp.** Tạo `package.json`, `manifest.json` (đúng §4), `src/core/hash.js`, `src/core/spintax.js`, `test/load.js`, `test/hash.test.js`, `test/spintax.test.js`.
Acceptance: `npm test` xanh; `test/load.js` đọc thứ tự từ `manifest.json` (sửa mảng `js` thì test lệch ngay); spintax parse/render/validate có test cho lồng nhau, thoát ký tự, ngoặc lệch báo đúng vị trí, seed cố định cho cùng kết quả.

**P1 — Lưu trữ + schema.** `src/core/schema.js`, `src/core/store.js`; `src/core/store.js` nhận một `area` được truyền vào (không đọc `chrome` ở top-level) để test bằng object giả trong bộ nhớ. `test/schema.test.js`, `test/store.test.js`.
Acceptance: `npm test` xanh; ghi `qitem:<key>` không làm thay đổi `settings`; `migrate()` trên dữ liệu rỗng trả default; đọc khoá thiếu trả `null` chứ không ném.

**P2 — Popup: bài viết, group, cài đặt.** `src/ui/popup.*`, `src/ui/options.*`, `src/core/assets.js`.
Acceptance: load unpacked → tạo bài có spintax + 3 ảnh → đóng popup, mở lại thấy đúng dữ liệu; ảnh thứ 4 vượt giới hạn bị chặn với thông báo; ngoặc spintax lệch bị chặn khi lưu và chỉ đúng vị trí.

**P3 — Quét group.** `src/content/scanner.js` + nút trong popup.
Acceptance: trên tài khoản thật, bấm Quét, tab `groups/joins` tự cuộn 10 lần, danh sách group trong popup tăng, không trùng khoá.

**P4 — Adapter trên fixture.** `src/content/dom.js`, `src/content/selectors.js`, `src/content/adapter-group.js`, `dev/fixture.html`, `dev/fixture-driver.js`, `test/adapter.test.js` (test hàm thuần: `normText`, thứ tự ứng viên selector, `captionMatches`).
Acceptance: mở `chrome-extension://<id>/dev/fixture.html`, bấm "Chạy", fixture hiện đúng số đoạn và đúng nội dung, bảng kết quả báo `verify: pass`; sửa fixture để editor có draft sẵn → báo `draft_present`.

**P5 — Đăng thật một group, chỉ text.** `src/bg/sw.js`, `src/ui/runner.*` (bản tối giản: chạy 1 item), `src/content/runner.js`.
Acceptance: trên một group test do chính người dùng tạo, bấm Start với 1 group → bài xuất hiện trong group với đúng nội dung, nhiều đoạn, không mất dấu xuống dòng. Đây là cổng chặn: P6 chỉ bắt đầu khi P5 đạt.

**P6 — Hàng đợi đầy đủ.** Đếm ngược overlay, hủy, pause/stop, abort checkpoint, lease, resume, log, ETA.
Acceptance: chạy 3 group với `minDelaySec=20,maxDelaySec=20,confirmWindowSec=5`: hủy bài 2 → bài 2 `cancelled`, bài 3 vẫn `posted`; đóng tab runner giữa lúc chạy rồi mở lại → không đăng trùng group đã `posted`; giả lập checkpoint (mở tab tới URL `/checkpoint` trong lúc chạy) → `status=aborted` và không có item nào bị click sau đó.

**P7 — Album ảnh.** Upload nhiều ảnh qua `DataTransfer` + fallback `drop`.
Acceptance: đăng 1 group với 3 ảnh → bài trong group có đủ 3 ảnh, đúng thứ tự; ảnh thứ 11 bị chặn ở popup.

**P8 — Đóng gói.** `scripts/pack.mjs` tạo `dist/fbq-<version>.zip`, loại `dev/`, `test/`, `scripts/`, `.omp/`, `.ua/`, `node_modules/`.
Acceptance: giải nén vào thư mục mới → `Load unpacked` chạy được, popup mở, đăng được 1 bài.

## 15. File quan trọng & anchor

- `manifest.json` — mảng `content_scripts[0].js` là nguồn duy nhất của thứ tự nạp; `test/load.js` đọc chính mảng này.
- `src/content/adapter-group.js` — nơi duy nhất biết markup Facebook; toàn bộ rủi ro vỡ DOM nằm ở đây. Không được gọi `chrome.*`.
- `src/content/runner.js` — overlay đếm ngược + đọc `cancelKey` ngay trước click; sai chỗ này là hủy không có tác dụng.
- `src/ui/runner.js` — ghi `clickedAt` trước khi gửi `post`; lease và reconcile khi mở lại.
- `src/core/store.js` — hàm nhận `area` truyền vào, không đọc `chrome` ở top-level (nếu không, `require()` trong Node ném ngay).

## 16. Kiểm chứng

Điều kiện trước: Node ≥ 20 (máy có v24.18.1); Chrome ≥ 120; một tài khoản Facebook có ít nhất **một group test do chính mình tạo** (bắt buộc — không test trên group của người khác); Chrome đã `Load unpacked` thư mục `D:/extension`.

Đơn vị, chạy tại `D:/extension`:

```
npm test
```
Kỳ vọng: toàn bộ xanh, gồm spintax (lồng nhau, thoát ký tự, ngoặc lệch, seed cố định), hash ổn định giữa hai lần chạy, store không làm hỏng khoá khác, thứ tự nạp khớp manifest.

DOM adapter, không cần Facebook:

```
1. Load unpacked D:/extension
2. Mở chrome-extension://<extension-id>/dev/fixture.html
3. Bấm "Chạy"
```
Kỳ vọng: `paragraphs: 5 (expected 5)`, `verify: pass`; sau khi sửa fixture thêm chữ vào editor, kỳ vọng `draft_present`.

Đầu-cuối, trên group test:

```
1. Popup: dán URL group test, Lưu bài "Dòng 1 {a|b} \n Dòng 2", chọn 3 ảnh
2. Options: minDelaySec=20, maxDelaySec=20, confirmWindowSec=5
3. Start
4. Quan sát tab Facebook: overlay đếm ngược, nút Hủy
```
Kỳ vọng: bài trong group có 2 đoạn đúng nội dung, 3 ảnh; `runner.html` hiện `posted 1/1`; `res:<key>` có `status:"posted"`.

Kiểm tra hủy: thêm group test thứ hai, bấm Hủy ở bài 1 → bài 1 `cancelled`, không có bài nào xuất hiện trong group đó.

Kiểm tra abort: trong lúc run, mở một tab tới `https://www.facebook.com/checkpoint/` → run chuyển `aborted`, tab Facebook bị đóng, không còn item nào bị click.

Kiểm tra không đăng trùng: trong lúc run, đóng tab `runner.html`; mở lại → item đã `posted` không bị đăng lại, item đang `clicking` chuyển `unknown` chứ không retry.

## 17. Giả định & dự phòng

- **Có group test riêng.** Nếu không có, P5–P7 không thể kiểm chứng; dừng ở P4 và báo lại, không test trên group của người khác.
- **Facebook không A/B test khác đi trên tài khoản này.** Nếu P5 ra `composer_not_found` hoặc `insert_rejected`: bật chế độ "Chẩn đoán" trong options (thêm nút, chỉ ghi `outerHTML` của `[role="dialog"]` vào `log:`), rồi cập nhật bảng ứng viên trong `selectors.js` và tăng `SELECTOR_VERSION`. Không đổi kiến trúc.
- **Người dùng muốn thêm Fanpage/trang cá nhân.** Thêm `adapter-page.js` cùng hợp đồng `prepare/post`, chọn theo `qitem.url`; `runner.js` và state machine không đổi. Ngoài phạm vi v1 nhưng kiến trúc đã chừa chỗ.
- **Người dùng cần Safari.** Không làm trên máy Windows này; cần macOS + Xcode + Apple Developer Program. Không đưa vào kế hoạch.
- **Facebook chặn tài khoản giữa lúc chạy.** Đây là rủi ro vận hành đã biết, không phải lỗi cần sửa: giãn cách 60–180s, biến thể spintax, dừng sau 3 lỗi liên tiếp và abort khi checkpoint là các biện pháp đã có. Người dùng cần được nói rõ trước khi mua.
