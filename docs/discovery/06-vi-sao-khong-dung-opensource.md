# Vì sao không dùng công cụ omni-channel mã nguồn mở, và ta còn thiếu gì so với chúng

**Ngày:** 2026-11-10 · **Định dạng:** Evidence → Finding → Path
**Phạm vi:** Postiz (đọc source), Mixpost Lite và social-auto-upload (đọc README/cấu trúc), tài liệu API chính thức của Meta, TikTok, X, Zalo.

> **Ghi chú phương pháp.** Yêu cầu ban đầu là tra ngược bằng `rea` MCP và bộ `reverse-skills`. Hai công cụ đó **không có** trong phiên này. Thay vào đó, source Postiz được clone và đọc trực tiếp tại commit `e0991b2`. Mọi dẫn chứng `file:dòng` dưới đây lấy từ bản clone đó. Mixpost và social-auto-upload chỉ được đọc ở mức README và cấu trúc thư mục, không đọc từng dòng.

---

## 1. Câu trả lời ngắn

Không dùng Postiz hay công cụ tương tự làm nền, vì **hai kênh chính của người dùng là group Facebook và nhóm Zalo cá nhân**, và các công cụ đó không đăng được vào cả hai. Lý do nằm ở chính API của nền tảng, không phải do code thiếu:

- **Meta đã gỡ Groups API** ở Graph API v19 (22/04/2024). Công cụ dùng API chính thức chỉ đăng được lên **Page**.
- **Zalo không có API cho nhóm cá nhân.** Postiz không có một dòng nào nhắc đến Zalo.

Còn ba lý do phụ, đều đủ nặng để tự nó loại phương án:

1. Postiz cần **server** (NestJS, Temporal, Redis, Postgres) và giữ token của người dùng ở đó. Sản phẩm này hứa "không có server, không gửi dữ liệu ra ngoài" (`PRODUCT.md`, Positioning).
2. Phần extension của Postiz **đọc cookie và gửi lên backend** (§2.4). Ta đã cấm quyền `cookies` (`04-xac-thuc-va-phien.md`, D4).
3. Postiz dùng giấy phép **AGPL-3.0**. Nhúng hoặc sửa nó để bán lại cho ngành khác thì phải công bố toàn bộ mã nguồn của bản sửa.

Ta **học** từ Postiz chứ không **dùng** nó. Danh sách những gì cần học nằm ở §4.

---

## 2. Evidence: Postiz

Đường dẫn gốc: `libraries/nestjs-libraries/src/integrations/social/`. Thư mục này có 38 provider: bluesky, discord, facebook, instagram, linkedin, reddit, telegram, tiktok, x, youtube, skool, và các provider khác. **Không có zalo.**

### 2.1 Facebook: chỉ đăng lên Page

| Dẫn chứng | Vị trí |
|---|---|
| `identifier = 'facebook'` | `facebook.provider.ts:33` |
| Phiên bản Graph `META_GRAPH_API_VERSION = 'v25.0'` | `facebook.provider.ts:27` |
| Quyền xin: `pages_show_list`, `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement` | `facebook.provider.ts:37–41` |
| Hàm liệt kê nơi đăng tên là `pages()` | `facebook.provider.ts:394` |
| Endpoint đăng: `/{id}/photos` và `/{id}/feed` | `facebook.provider.ts:607`, `:871`, `:903` |
| `maxLength()` trả 63206 | `facebook.provider.ts:46–47` |

Grep "group" trong file này không ra kết quả nào. Toàn bộ đường đăng là Page, khớp với việc Meta đã gỡ Groups API (§3).

### 2.2 Instagram, TikTok, X

| Mạng | Giới hạn ký tự | Ràng buộc khác | Vị trí |
|---|---|---|---|
| Instagram | 2200 | Carousel tối đa 10 ảnh | `instagram.provider.ts:49–50`, `:60–61`, `:424` |
| TikTok | 2000 | Chế độ UPLOAD bỏ qua privacy và mọi setting khác. `privacy_level` là bắt buộc ở chế độ đăng thẳng. PULL_FROM_URL cho video đang bị comment out. FILE_UPLOAD chia chunk 5–64 MB | `tiktok.provider.ts:52–53`, `:32`, `:578`, `:629–651`, `:715–718` |
| X | 280, hoặc 4000 cho premium | — | `x.provider.ts:95–106` |

`maxConcurrentJob`: Facebook 500 (`:44`), Instagram 400 (`:46`), TikTok 10000 (`:49`), X 10 (`:86`). Đây là số job song song phía server của Postiz. Nó **không phải** nhịp an toàn cho một tài khoản người thật, nên ta không lấy con số này.

### 2.3 Hợp đồng chung của provider

`social.integrations.interface.ts` định nghĩa các hook mà mỗi mạng phải có hoặc được phép có:

- `checkValidity` (`:190`): kiểm tra bài trước khi gửi.
- `checkPostStatus` (`:195`): đọc lại trạng thái sau khi gửi.
- `finalizePost` (`:204`): bước chốt sau khi upload xong.
- `customFields` (`:214`): mỗi mạng có thêm trường cấu hình riêng.
- Comment ở `:139–142` ghi rõ: khi kết quả không rõ thì **không được** retry kiểu tạo bài trùng. Đây đúng là nguyên tắc commit point của ta (KTD3).

`social.abstract.ts` phân loại lỗi trong `handleErrors` (`:174`) thành bốn loại: `refresh-token | bad-body | retry | disconnect` (`:179`). Khi gặp 429, `rate_limit_exceeded` hoặc loại `retry` (`:517–520`), nó chờ 5 giây (`timer(5000)`, `:523`) rồi thử lại.

### 2.4 Phần extension của Postiz đọc cookie

| Dẫn chứng | Vị trí |
|---|---|
| Chỉ một provider bật cờ `isChromeExtension = true`: Skool | `skool.provider.ts:21`; cờ được khai ở `social.integrations.interface.ts:210` |
| Manifest xin quyền `"cookies"` | `apps/extension/manifest.json:11` |
| Service worker gọi `chrome.cookies.getAll` | `apps/extension/src/background.ts:20` |
| Rồi POST cookie lên `${backendUrl}/integrations/extension-refresh` | `apps/extension/src/background.ts:89` |

Mô hình đó là: lấy phiên đăng nhập của người dùng, đưa lên server, rồi server đăng thay. Mô hình của ta thì ngược lại: phiên ở yên trong Chrome, code đăng chạy ngay trong trang (`04-xac-thuc-va-phien.md`, mô hình A).

### 2.5 Hạ tầng và giấy phép

- Lập lịch bằng **Temporal**, hàng đợi **Redis**, backend NestJS. Người dùng phải tự host server hoặc dùng bản cloud của Postiz.
- File `LICENSE` ở gốc repo là **AGPL-3.0**.

---

## 3. Evidence: API chính thức của từng nền tảng

| Nền tảng | Sự thật | Hệ quả | Nguồn |
|---|---|---|---|
| Facebook Group | Graph v19 gỡ Groups API và quyền `publish_to_groups` từ 22/04/2024 | Mọi công cụ dùng API chính thức đều không đăng được vào group | https://developers.facebook.com/docs/graph-api/changelog/version19.0 |
| Instagram | Cần tài khoản professional, quyền `instagram_content_publish` và app review. Giới hạn khoảng 50–100 bài mỗi 24 giờ tuỳ phiên bản tài liệu | Sale dùng tài khoản cá nhân thì không đăng qua API được. Mỗi khách bán lại phải tự qua app review | https://developers.facebook.com/docs/instagram-platform/content-publishing/ |
| TikTok | Client chưa được audit thì chỉ đăng được bài ở chế độ **riêng tư** (`SELF_ONLY`). Photo post cho tối đa 35 ảnh | Qua API, bài sẽ không ai thấy cho đến khi qua audit | https://developers.tiktok.com/doc/content-posting-api-reference-direct-post · https://developers.tiktok.com/doc/content-posting-api-reference-photo-post |
| X | Tính tiền theo request, khoảng $0,015 cho mỗi lần tạo bài | Phải có tài khoản developer trả phí cho từng khách | https://docs.x.com/x-api/getting-started/pricing · https://docs.x.com/x-api/fundamentals/rate-limits |
| Zalo | Zalo OA có API, nhưng **nhóm cá nhân thì không**. Thư viện không chính thức như zca-js giả lập client và có rủi ro khoá tài khoản | Chỉ còn đường DOM trên Zalo Web, đúng như ta đang làm | (không có tài liệu chính thức cho nhóm cá nhân) |

**Chưa xác minh:** TikTok Studio bản web có cho đăng photo post hay chỉ cho đăng video. Việc này để spike U16 xác nhận.

---

## 4. Ta thiếu gì so với Postiz

Ta không mang code của Postiz vào. Ta mang **khái niệm** vào, viết lại cho mô hình DOM và commit point.

| # | Thứ Postiz có | Ta đang có | Cần làm | Ở unit |
|---|---|---|---|---|
| G1 | `maxLength` riêng cho từng mạng | Không có | Bảng `NETWORK_SPECS` (FB 63206, IG 2200, TikTok 2000, X 280) và cảnh báo ngay trong ô soạn bài | U17 |
| G2 | `checkValidity` chạy trước khi gửi | Chỉ kiểm text rỗng | `validate(post, network)` trả về danh sách lỗi đọc được bằng tiếng Việt, chạy trước khi xếp hàng | U17 |
| G3 | Phân loại lỗi thành 4 loại | Có `rate_limited` cho FB | Gom lỗi về 4 loại: `relogin` (cần đăng nhập lại), `bad-body` (sửa bài), `retry`, `disconnect` | U17 |
| G4 | Thử lại khi bị 429 | Không có | Chỉ backoff **trước** commit point. Sau khi đã bấm Đăng (`clickedAt`) thì giữ trạng thái `unknown`, không bao giờ thử lại (KTD3). Postiz retry được vì nó gọi API có idempotency; ta bấm nút thật thì không có | U17 |
| G5 | `finalizePost` chờ upload xong | Chờ nút Đăng hết disabled (FB) | Chờ thanh upload báo 100% rồi mới bấm, áp cho mọi mạng có video | U17 |
| G6 | `checkPostStatus` đọc lại sau khi đăng | Có cho FB (pending/posted) | Đọc lại cho từng mạng mới: lấy permalink, hoặc ghi `unknown` | U18–U20 |
| G7 | Kiểm tra media (kích thước, định dạng, thời lượng) | Không có | Kiểm trước khi xếp hàng, theo giới hạn từng mạng | U17 |
| G8 | Privacy bắt buộc của TikTok | Không có | Hiện cảnh báo nếu tài khoản TikTok đang để bài ở chế độ riêng tư | U20 |
| G9 | Giới hạn carousel 10 ảnh của IG | Không có | Hiện trong UI và chặn trước khi xếp hàng | U19 |
| G10 | `customFields` riêng cho từng mạng | Không có | Schema setting riêng từng mạng, ví dụ privacy TikTok hay vị trí đăng trên IG | U17 |
| G11 | Nhịp theo từng mạng | Có `NETWORK_CAPS` cho FB và Zalo | Thêm IG, TikTok, X với cap thận trọng (KTD22) | U17 |
| G12 | Hàng đợi idempotent | Có `attemptId` và commit point | Giữ nguyên. Đây là chỗ ta đã chặt hơn Postiz | — |

**Thứ ta không lấy:** server, Temporal/Redis, OAuth token, quyền `cookies`, con số `maxConcurrentJob`.

---

## 5. Hai công cụ khác đã xem

- **Mixpost Lite** (MIT, Laravel): https://github.com/inovector/mixpost. Cùng mô hình với Postiz (server và API chính thức), cũng không đăng được vào group FB hay Zalo. Giấy phép MIT thì dễ chịu hơn, nhưng mô hình không hợp.
- **social-auto-upload** (MIT, Playwright): https://github.com/dreammis/social-auto-upload. Mô hình này **gần ta nhất**: điều khiển trình duyệt thật và lưu phiên đăng nhập cho mỗi tài khoản. Hai ý đáng lấy: chờ upload đạt 100% rồi mới bấm (G5), và mỗi tài khoản một phiên tách biệt (đã có ở `03` §7, một Chrome profile cho một tài khoản). Điểm khác: nó chạy Playwright ngoài trình duyệt và lưu file cookie ra đĩa. Ta chạy trong extension và không đụng tới cookie.

---

## 6. Path

1. **Giữ extension làm nền** (Approach A đã duyệt). Thêm TikTok, Instagram và X bằng đường DOM trong phiên của chính người dùng (KD9 trong plan).
2. **Đưa G1–G11 vào plan** dưới dạng U17 (lớp `networks.js` dùng chung) và U18–U20 (provider từng mạng).
3. **Không mở API chính thức** ở đợt này. Nếu sau này có khách cần đăng lên Page FB hoặc tài khoản IG business ở quy mô lớn, cân nhắc một chế độ API riêng. Nếu làm thì phải viết lại, không fork Postiz, vì AGPL.

---

## 7. Nguồn

- Postiz: https://github.com/gitroomhq/postiz-app, commit `e0991b2`, clone cục bộ để đọc
- Mixpost: https://github.com/inovector/mixpost
- social-auto-upload: https://github.com/dreammis/social-auto-upload
- Meta Graph v19 changelog: https://developers.facebook.com/docs/graph-api/changelog/version19.0
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- TikTok direct post và photo post: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post, https://developers.tiktok.com/doc/content-posting-api-reference-photo-post
- X pricing và rate limits: https://docs.x.com/x-api/getting-started/pricing, https://docs.x.com/x-api/fundamentals/rate-limits
- Tài liệu nội bộ: `PRODUCT.md`, `docs/discovery/03-rui-ro-va-gioi-han.md`, `docs/discovery/04-xac-thuc-va-phien.md`
