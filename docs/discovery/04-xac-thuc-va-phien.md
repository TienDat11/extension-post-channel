# Xác thực & phiên: cách hệ thống tự động đăng bài

**Ngày:** 2026-11-10 · **Case:** `work/fbq-auth-audit` (offline-sample, auth granted) · **PRIMARY skill:** `browser-extension-reverse`
**Định dạng:** Evidence → Finding → Path

---

## 1. Câu trả lời ngắn

**Họ không xác thực.** Không OAuth, không password, không token riêng của sản phẩm.

Ba tầng, đúng thứ tự:

1. Thứ duy nhất có giá trị là **phiên Facebook đã đăng nhập sẵn trong Chrome** của khách (cookie `sessionid`/`xs`, httpOnly).
2. Extension **không đọc được** cookie đó — nó chỉ chạy *bên trong* origin `facebook.com`, nên mọi request do trang phát ra tự mang cookie. Không cần, và không thể, "lấy token".
3. Quyền thực thi đến từ `host_permissions` + content script; quyền đăng đến từ **tư cách thành viên group của chính khách**.

Nói cách khác: authorization = quyền của người dùng; authentication = việc của Chrome.

---

## 2. Evidence

**E1 — manifest của chính extension này** (`D:/extension/manifest.json`):

```json
"manifest_version": 3,
"permissions": ["storage", "unlimitedStorage", "tabs", "notifications"],
"host_permissions": ["https://*.facebook.com/*"],
"background": { "service_worker": "src/bg/sw.js" },
"content_scripts": [{ "matches": ["https://*.facebook.com/*"], ... }]
```

Không có `cookies`, không `webRequest`, không `scripting`, không `<all_urls>`. **Extension về mặt cấu trúc không thể đọc credential.**

**E2 — artifact inventory** (`rea` `inspect_artifact`, `detail=summary`):
`sha256=716bb1007c89cd3bacba93518d1b1a36aed21c7642f34eacaff80d4b7ede352e`, format `zip`, **27 file / 27 occurrence / 0 integrity contradiction**, coverage `complete`.

**E3 — service worker không có network** (`src/bg/sw.js:1-133`): chỉ `chrome.tabs` (tạo tab, quét group qua `https://www.facebook.com/groups/joins/`), `chrome.notifications`, `chrome.storage.local`. Không một `fetch` nào tới facebook.

**E4 — toàn bộ đường đăng đi qua UI** (`src/content/adapter-group.js`): chèn text bằng `execCommand`/DOM fallback (`:66`), chờ nút Đăng hết disabled (`:184`, `:220`), đọc khối cảnh báo `ALERT` rồi map sang `rate_limited` (`:249`).

**E5 — đối thủ dẫn đầu, nguyên văn** (Multigroup Poster, v1.2.9.101, store cập nhật 07/11/2026, 1,38 MiB, 4.000 user, 4.9★/125 rating):

- *"Log in to Facebook in Chrome as usual — the extension uses your existing session."*
- *"No password storage — the extension reads the existing session cookie. It never sees, stores, or transmits your password."*
- *"**Fast** sends in the background; **Safe** uses Facebook's normal composer, step by step."*
- *"Image Spintax — before each post the extension applies randomized per-group image changes: light crop, mirror, brightness/contrast shifts, noise, and fresh metadata."*
- *"To connect: Help → Connect an AI assistant → copy the address → enter the code."*

---

## 3. Finding

### 3.1 Có đúng hai đường thực thi, không có đường thứ ba

| | **DOM (Safe)** | **Endpoint (Fast)** |
|---|---|---|
| Cách chạy | Content script mở composer, chèn text, click Đăng | Lấy `fb_dtsg`/`lsd` từ HTML trang, POST `/api/graphql/` với `credentials: include` |
| Xác thực | Cookie tự gửi kèm vì request phát từ trang | Như trên |
| Độ bền | Bền với thay đổi token, gãy khi FB đổi DOM | Nhanh, nhưng gãy mỗi lần FB xoay `doc_id` |
| Dấu vết | Có đủ event người dùng | Không có chuột/phím, không có composer |
| Hiện trạng của mình | **100% đường này** | Chưa có |

`[SUY LUẬN]` "Fast sends in the background" của Multigroup chính là đường endpoint. Họ không nói rõ, nhưng "background" + "Safe uses the normal composer" chỉ có một nghĩa kỹ thuật.

### 3.2 Quyền là all-or-nothing

Content script trên `https://*.facebook.com/*` có **toàn bộ** quyền của người dùng trong tab đó. Không tồn tại "chỉ được đăng bài" ở tầng quyền extension. Đó là lý do Chrome Web Store hiển thị "Read and change all your data on facebook.com" cho mọi tool trong ngách này.

Hệ quả cho sản phẩm: **không thể hứa "tool không đọc được gì ngoài bài của bạn"** — hứa vậy là sai về mặt kỹ thuật. Chỉ có thể hứa "code không gửi dữ liệu đi đâu", và điều đó phải chứng minh được (CSP, không network, kiểm tra gói).

### 3.3 Không xác thực ≠ không vi phạm

Meta đo *hành vi phát ra từ phiên*, không đo *công cụ*. Vì vậy mọi lập luận "tool không giữ mật khẩu nên an toàn hơn" đều sai bản chất. Đây là lý do phần rủi ro ở `03-rui-ro-va-gioi-han.md` không phụ thuộc vào mô hình xác thực.

### 3.4 Đối thủ đã đi xa hơn ở tầng chống trùng

Multigroup Poster biến đổi ảnh theo từng group (crop/mirror/brightness/noise/**metadata mới**). Đó là đối phó trực tiếp với perceptual hash / so khớp ảnh phía Meta. Ghi nhận, không copy ở v1 — nhưng phải biết nó tồn tại, vì nó là chuẩn cạnh tranh.

---

## 4. Path — ba mô hình, chọn một

| | A. DOM-only | B. Hybrid (DOM + endpoint) | C. Cloud (password) |
|---|---|---|---|
| Xác thực | Phiên Chrome của khách | Như A | Mật khẩu + 2FA của khách |
| Rủi ro khoá acc | Trung bình (hành vi) | Trung bình–cao (thiếu dấu vết người) | Cao (login lạ + ToS) |
| Độ bền kỹ thuật | Cao | Thấp (doc_id xoay) | Trung bình |
| Chi phí bảo trì | Thấp | Cao | Cao + pháp lý |
| Vi phạm ToS rõ ràng | Không (ToS nền tảng vẫn áp) | Không | **Có** — chia sẻ mật khẩu |
| Kết luận | **Chọn cho v1** | Chỉ mở khi có số liệu chứng minh cần | Loại |

### Ràng buộc đưa vào plan

- **D1.** Không có tầng auth. Có **session probe**: kiểm tra trang đã đăng nhập (`/me` qua DOM) trước mỗi run; sai → dừng, hiện "mở Facebook và đăng nhập".
- **D2.** Một Chrome profile = một tài khoản. Không dùng chung storage/cookie giữa các tài khoản (đã ghi ở `03` §7).
- **D3.** Nếu sau này thêm cầu AI (MCP như Multigroup): bridge **local**, ghép cặp bằng mã, không đưa cookie hay nội dung ra khỏi máy; AI chỉ được **soạn draft**, người dùng xác nhận, extension mới đăng.
- **D4.** Không bao giờ thêm permission `cookies`, `webRequest`, `debugger`, `<all_urls>`. Bốn quyền đó là dấu hiệu "tool muốn lấy nhiều hơn cần" và sẽ bị soi cả ở Web Store lẫn ở tầng review.
- **D5.** Endpoint mode (Fast) chỉ được mở khi telemetry chứng minh DOM path không đủ, và phải có kill-switch theo ngày.

---

## 5. Ghi chú phương pháp

- Sample là **mã nguồn của chính mình**, đóng gói `work/sample-fbq.zip` (27 file). Không phân tích binary bên thứ ba; đối thủ được đọc qua **trang store công khai** và mô tả sản phẩm của họ, không tải CRX.
- `[SUY LUẬN]` duy nhất trong tài liệu này: cơ chế "Fast/background" của Multigroup. Mọi dòng khác là trích dẫn nguyên văn hoặc đọc từ file.

---

## 6. Nguồn

- `D:/extension/manifest.json`
- `D:/extension/src/bg/sw.js`, `src/content/adapter-group.js`
- rea `inspect_artifact` — evidence `ev_da16003ea0b2894ed0a33204d1fadcf217caea815d85b9b0b0d4431e77458a64`
- Chrome Web Store, Multigroup Poster — https://chromewebstore.google.com/detail/bffigfjkllaipccbpnmckgfhmdmlgdda (đọc 10/11/2026)
- Chrome Web Store, PilotPoster / SimplePoster / Group Posting PRO (cùng ngách, dùng để đối chiếu mô tả "own login session")
