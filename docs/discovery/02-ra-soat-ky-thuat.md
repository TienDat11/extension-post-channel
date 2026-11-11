# Rà soát kỹ thuật đối thủ (REA + đọc source)

**Ngày:** 2026-11-10 · **Mục đích:** hiểu kiến trúc của một sản phẩm "đăng đa kênh" đang thắng, để không thiết kế lại từ số 0.
**Tính chất:** chỉ đọc. Không đăng nhập, không tạo tài khoản, không thao tác trên hệ thống của người khác.

---

## 1. Cách làm

1. Khởi động Chrome headless 156 với `--remote-debugging-port=9222` (profile tạm `D:/extension/.rea-profile`).
2. Mở các trang công khai: `https://platform.postiz.com/auth`, `https://postiz.com/pricing`, `https://app.blotato.com/`.
3. Dùng REA MCP (CDP provider):
   - `list_browser_targets` → liệt kê target.
   - `inspect_web_page` → DOM/script/storage thụ động.
   - `analyze_web_bundle` → phân tích bundle JS tĩnh (không thực thi).
4. Khi black-box không hiệu quả → chuyển sang **đọc source công khai** (Postiz là AGPL, có repo).

---

## 2. Kết quả black-box

### Cái chạy được

- `list_browser_targets` trả đúng 3 tab, kèm origin và browser product (`Chrome/156.0.8078.80`, protocol 1.3).
- `inspect_web_page` trên `platform.postiz.com/auth` trả:
  - 812 DOM node, 3 frame, storage key inventory.
  - `completeness.status = "policy_filtered"`, `attach_limited`.
  - Bị lọc theo policy: 31 `script_sources`, 4 `scripts` (`disallowed_origin`), 3 `scripts` (`unattributed_origin`), 91 node accessibility (`not_approved`).

### Cái chặn

- `app.blotato.com`: `inspect_web_page` trả `target_not_allowed` kể cả khi đã truyền `allowed_origins` — không lấy được gì.
- `analyze_web_bundle` với `view.kind = "javascript-routes"` + `collection = "routes"`: job vượt budget 30s của worker và bị kill. Schema yêu cầu đúng cặp `{kind:"javascript-routes", collection:"routes"| "summary"| "occurrences"| "sources"| "unknowns"}` — sai một field là `invalid_request`.

### Kết luận về black-box

`[SUY LUẬN]` Với một app Next.js nhiều chunk và policy origin chặt, black-box cho tỉ lệ tín hiệu/chi phí rất thấp. Khi đối thủ **công khai source**, đọc source chính xác hơn và rẻ hơn nhiều. Đây là quyết định kỹ thuật, không phải bỏ dở.

---

## 3. Kết quả đọc source (Postiz, AGPL-3.0, commit 09/11/2026)

### 3.1 Quy mô

- 41.218 sao, 7.859 fork, 211 issue mở, TypeScript, Next.js + NestJS + Prisma.
- **36 module provider** dưới `libraries/nestjs-libraries/src/integrations/social/`, mỗi nền tảng là một file tự chứa.

### 3.2 Hợp đồng adapter — thứ đáng copy về mặt thiết kế

`social.integrations.interface.ts` chia mỗi kênh thành 3 nhóm trách nhiệm:

**Xác thực (`IAuthenticator`)**
`generateAuthUrl`, `authenticate(code, codeVerifier, refresh)`, `refreshToken`, `reConnect?`, và tuỳ chọn `analytics`, `postAnalytics`, `changeNickname`, `changeProfilePicture`.

**Đăng bài (`ISocialMediaIntegration`)**
`post(id, token, postDetails[], integration)`, `postPending?`, `comment?` — trả về `PostResponse { id, postId, releaseURL, status, pendingData? }`.

**Metadata cho UI (`SocialProvider`)**
`identifier`, `name`, `scopes`, `editor: 'none'|'normal'|'markdown'|'html'`, `maxLength()`, `checkValidity()`, `dto`, `customFields`, `mention`/`mentionFormat`, `isBetweenSteps`.

Ba chi tiết đáng chú ý:

1. **`isChromeExtension?: boolean` + `extensionCookies?: { name, domain }[]`** — chính Postiz cũng có đường extension để phục vụ kênh không có API. Tức là mô hình "extension cho kênh không API" là hợp lệ về mặt kiến trúc, nhưng nó là **một provider loại riêng**, không phải toàn bộ sản phẩm.
2. **`stripLinks?: () => boolean`** — thuế link của X ($0,20/bài) được đẩy thẳng vào hợp đồng adapter. Đây là bằng chứng rằng chi phí nền tảng đã định hình kiến trúc sản phẩm.
3. **Máy trạng thái publish**: `checkPostStatus` → `'pending' | 'ready' | 'completed'`, và `finalizePost`. Comment trong source ghi rõ hợp đồng: *"once finalizePost's mutations have actually gone through, checkPostStatus must return 'completed' — never 'ready' again — otherwise a finalizePost retry after an unknown-outcome failure would re-run the mutations and duplicate the post."*

Đây là bài học đắt: **đăng bài là một giao dịch phân tán với hệ thống bên ngoài**, phải có state machine + idempotency, nếu không sẽ đăng trùng. Extension cũ của chúng ta không có tầng này.

### 3.3 Điều KHÔNG có trong kiến trúc của họ

- Không có "data → post" như một khái niệm hạng nhất: `PostDetails` chỉ có `message`, `settings`, `media`, `poll`. Dữ liệu vào là do người dùng/agent đưa.
- Không có lớp "duyệt nội dung" trong interface; đó là tính năng tầng app.
- Không có khái niệm "nhóm/cộng đồng" như một kênh API (chỉ có page/profile).

---

## 4. Hệ quả thiết kế cho sản phẩm mới

| Quan sát | Hệ quả |
|---|---|
| 36 adapter, AGPL, free self-host | Lớp adapter **không phải** nơi tạo giá trị. Dùng lại được (AGPL: phải mở source nếu phân phối) hoặc tự viết mỏng cho 5–6 kênh cần thiết |
| `stripLinks` trong contract | Mọi thiết kế phải có "chính sách chi phí theo nền tảng" ngay từ schema bài đăng |
| State machine publish | Bắt buộc: `pending → ready → completed`, idempotent theo `postId`, có `releaseURL` lưu lại |
| `isChromeExtension` là provider riêng | Nếu làm kênh không API, nó phải là **một** provider, cô lập rủi ro, không kéo cả hệ thống vào vùng cấm |
| Không có "data → post" | Đây là chỗ trống thật, và cũng là chỗ Postiz/Blotato đang tiến vào bằng AI credits |

---

## 5. Việc nên làm tiếp khi có plan

1. Chọn **3–5 kênh API chính thức** cho bản đầu (gợi ý theo dữ liệu thị trường: Facebook Page, Instagram Business, Zalo OA, TikTok Business, LinkedIn Page) — bỏ X khỏi bản đầu vì thuế link.
2. Viết `publisher` state machine trước khi viết UI: `draft → scheduled → pending → published | failed(reason)`.
3. Định nghĩa schema "nguồn dữ liệu" (CSV/Sheet/feed/API) và template theo kênh — đây là phần tạo khác biệt, không phải adapter.
4. Chỉ khi 1–3 xong mới bàn tới extension cho kênh không API.

---

## 6. Ghi chú về giới hạn của tài liệu này

- Không có số liệu doanh thu kiểm chứng; mọi con số MRR của đối thủ là tự công bố.
- Black-box chỉ chạm được bề mặt công khai; không đăng nhập, không gọi API nội bộ của họ.
- Repo Postiz đổi liên tục (push gần nhất 09/11/2026). Số provider có thể lệch sau này.
