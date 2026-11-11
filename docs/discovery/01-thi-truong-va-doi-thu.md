# Omni-post-channel — Khảo sát thị trường & đối thủ

**Ngày:** 2026-11-10 · **Trạng thái:** discovery, chưa chốt hướng · **Phạm vi:** chỉ nghiên cứu, không code

Mọi số liệu dưới đây lấy từ nguồn công khai, có link. Chỗ nào là suy luận của tôi thì ghi `[SUY LUẬN]`. Chỗ nào nguồn tự công bố (vendor) thì ghi rõ là tự công bố.

---

## 0. Kết luận ngắn (đọc trước)

1. **Tên "OmniPost" đã bị dùng bởi ít nhất 5 sản phẩm độc lập.** Không thể làm thương hiệu.
2. **Thị trường lớn nhưng đã bão hoà ở tầng "đăng bài nhiều kênh".** Buffer bán $6/kênh/tháng, có bản free 3 kênh; Postiz tự host miễn phí (AGPL, 41.218 sao GitHub). Định giá đã chạm sàn.
3. **Tầng đang tăng trưởng là "phần mềm đăng bài", không phải "người đăng bài".** Trên dữ liệu first-party của PostEverywhere: 79,2% bài đăng đi qua API/MCP, chỉ 20,5% qua web app. Số tổ chức dùng AI agent tăng 2,8 lần trong 2 tháng (7→9/2026).
4. **Nút thắt kỹ thuật thật sự không phải UI, mà là API của nền tảng.** X tính $0,015/bài, **$0,20/bài nếu có link** (gấp 13 lần). Meta bắt app review + tài khoản professional; **Facebook Group không có API tự động đăng**.
5. **Lý do sản phẩm cũ (FB Group Poster) chết là cấu trúc, không phải UI.** Nó bán một thứ nền tảng cấm, không có API, và thị trường đã có bản free.

---

## 1. Quy mô & cấu trúc thị trường

| Chỉ số | Giá trị | Nguồn |
|---|---|---|
| Quy mô 2025 | USD 6,9 tỷ | Growth Market Reports |
| Dự phóng 2034 | USD 40 tỷ, CAGR 21,8% | Growth Market Reports |
| Churn trung bình ngành | 4,8%/tháng ≈ 45,5%/năm | RetentionCheck, 05/2026 |

Các hãng nghiên cứu khác (Mordor, Fortune Business Insights, TBRC) cũng có báo cáo cùng phân khúc nhưng tôi chưa đọc số cụ thể — **dùng con số trên như một ước lượng bậc độ lớn, không phải số liệu kiểm toán**.

### Cấu trúc nhu cầu: hai tầng khác nhau

- **Tầng "brand/agency phương Tây"**: trả tiền cho lịch đăng, phê duyệt, báo cáo, nhiều thương hiệu. Đây là chỗ Buffer/Sprout/Hootsuite sống.
- **Tầng "shop/SME Việt Nam"**: trả tiền cho **ra đơn**, không trả tiền cho "đăng bài". Họ mua tool group + seeding + lead, không mua lịch nội dung.

Hai tầng này có **willingness-to-pay khác nhau một bậc**, và sản phẩm phục vụ cả hai thường hỏng ở giữa.

### Điều người mua thực sự phàn nàn

Từ phỏng vấn người mua đã xác minh của Alium (cập nhật 27/10/2026, hàng trăm cuộc phỏng vấn):

- **Giá/giá trị là lý do bỏ tool được nêu nhiều nhất.**
- ~**25%** ca rời tool **không mua tool thay thế** — quay về công cụ native của nền tảng, bỏ luôn, hoặc giao agency. Ở CRM/CMS/marketing automation gần như không có hiện tượng này.
- **"Nền tảng native giờ đủ dùng"** là áp lực thường trực: người mua nói thẳng rằng rủi ro "bị ngắt khỏi nền tảng native" lớn hơn giá trị tool.
- **Bài đăng lỗi / kết nối đứt** kết thúc quan hệ khách hàng, dù ít phổ biến.
- **1/5 ca đổi tool gắn với đổi người phụ trách** — cao hơn hẳn CRM/CMS.

`[SUY LUẬN]` Hệ quả: một sản phẩm "đăng bài" thuần tuý đang cạnh tranh với **miễn phí** (native + Buffer free + Postiz self-host). Muốn có giá, phải bán thứ native không làm được.

---

## 2. Bản đồ đối thủ (giá kiểm tra 05–10/11/2026)

### 2.1 Tầng SaaS đại chúng

| Sản phẩm | Giá vào | Đơn vị tính | Ghi chú |
|---|---|---|---|
| Buffer | $0 (3 kênh) → $6/kênh/tháng, giảm còn $1–$4 khi nhiều kênh | theo kênh | Free có API 1.000 request/kênh/tháng. Fair-use 5.000 bài/kênh |
| Hootsuite | từ $99/seat | theo seat | Bị rời nhiều nhất trong dữ liệu Alium |
| Sprout Social | ~$249/tháng | theo seat | Đích đến nhiều nhất trong dữ liệu Alium |
| Later | ~$25/tháng (social set) | theo bộ | **Đã bỏ X từ 08/2025** |
| Publer | có free tier | theo tài khoản | Mạnh về CSV bulk, auto-schedule |
| Metricool | thấp | theo tài khoản | **+$10/tháng cho mỗi tài khoản X** |

### 2.2 Tầng API-first / agent-first (đối thủ trực tiếp của "bot đăng bài")

| Sản phẩm | Giá vào | Mô hình | Xử lý X |
|---|---|---|---|
| Ayrshare | $149/tháng (1 profile, 14 account) | theo **profile** = 1 brand/end-user | Bắt tự mang developer key của X |
| Zernio (cựu Late) | $0 cho 2 account, sau đó $6 → $3 → $1/account | theo account | Pass-through đúng giá X, 0 markup |
| Upload-Post | $24/tháng (5 profile) | theo profile | **Mặc định bỏ link khỏi bài X**; add-on $19/tháng cho 50 bài có link |
| Post Bridge | $39/tháng (15 account) | theo account | Add-on link (báo cáo) |
| Blotato | $29/tháng (20 account) | flat + AI credit | Không nêu phụ phí X |
| Postiz | $29/tháng (5 kênh) hoặc **self-host free (AGPL)** | theo kênh | Không nêu |
| post2all | $9/tháng (10 account) | flat | Allowance 200/600/1.200 unit; bài có link = 13 unit |
| **AutoWork (VN)** | không công bố công khai | gói tháng, tiếng Việt | Kênh VN: FB Page, TikTok, Threads, Zalo OA, Zalo cá nhân, WordPress |

Nguồn bảng API: post2all tổng hợp ngày 05/11/2026, đối chiếu trang giá gốc của từng vendor.

### 2.3 Đối thủ mã nguồn mở — mối đe doạ giá

**Postiz** (`gitroomhq/postiz-app`, AGPL-3.0), kiểm tra qua GitHub API ngày 10/11/2026:

- **41.218 sao, 7.859 fork, 211 issue mở**, TypeScript, cập nhật lần cuối 09/11/2026.
- **36 module provider** trong `libraries/nestjs-libraries/src/integrations/social/` (bluesky, dev.to, discord, dribbble, facebook, farcaster, gmb, hashnode, instagram ×2, kick, lemmy, linkedin ×2, listmonk, mastodon ×2, medium, mewe, moltbook, nostr, pinterest, reddit, skool, slack, telegram, threads, tiktok ×2, tumblr, twitch, vk, whop, wordpress, x, youtube).
- Tự mô tả: *"The ultimate agentic social media scheduling tool"*.
- Founder công bố mốc **$100k MRR** (05/2026) trên X — **số tự công bố, chưa kiểm toán**.

`[SUY LUẬN]` Khi một đối thủ AGPL đã có 36 adapter và tự host miễn phí, **giá trị không nằm ở lớp adapter**. Nó nằm ở thứ mà self-host không cho: vận hành, tuân thủ, hỗ trợ, và dữ liệu vào.

---

## 3. Ràng buộc nền tảng — phần quyết định sản phẩm

Đây là phần hay bị bỏ qua nhất khi brainstorm.

### 3.1 X (Twitter) — đã bỏ mô hình gói, chuyển sang trả theo request

Từ 02/2026, X API không còn Free/Basic/Pro cho người đăng ký mới; dùng **credit trả theo dùng**:

| Hành động | Giá |
|---|---|
| Post: Create | **$0,015 / request** |
| Post: Create **có URL** | **$0,20 / request** (13,3×) |
| Post: Read | $0,005 / resource |
| User: Read | $0,010 / resource |
| Giới hạn đọc | 3 triệu post read / chu kỳ tháng |

Hệ quả trực tiếp lên giá bán: một khách đăng **50 bài có link/tháng lên X** tốn **$10 tiền API** — nhiều hơn giá $6/kênh của Buffer. Đó là lý do Upload-Post **cắt link mặc định**, Metricool thu **$10/tháng/tài khoản X**, Ayrshare bắt khách tự mang key.

### 3.2 Meta

- Instagram publishing API chỉ phục vụ **tài khoản professional (Business/Creator)**; app phải qua **App Review**, và cần **Advanced Access** nếu phục vụ tài khoản không thuộc quyền quản lý của app.
- Page có thể bị chặn publish nếu chưa hoàn tất **Page Publishing Authorization**.
- **Facebook Group: không có API tự động đăng.** Bảng kênh của Buffer ghi Group là *"Notification Publishing"* (chỉ nhắc người dùng đăng tay), không phải automatic publishing. Facebook cá nhân cũng vậy.

`[SUY LUẬN]` Đây chính là lý do tồn tại của cả một chợ extension "đăng group hàng loạt" ở Việt Nam — và cũng là lý do nó luôn là sản phẩm có rủi ro khoá tài khoản, không thể bán cho doanh nghiệp nghiêm túc, và không có moat.

### 3.3 Các nền tảng khác

- **TikTok**: có Content Posting API nhưng phải qua audit; tài khoản cá nhân bị hạn chế hơn business.
- **LinkedIn**: API đăng bài cho page/profile cần app + scope được duyệt; nhiều tool thương mại dùng partner program.
- **Zalo OA**: có API chính thức cho OA; **Zalo cá nhân không có API** — mọi tool "đăng Zalo cá nhân" đều là automation trình duyệt.

---

## 4. Kinh tế đơn vị — bài toán sống còn

Ví dụ tối thiểu, giả định 200 khách × 10 kênh = 2.000 kênh-tháng:

| Dòng | Số |
|---|---|
| Doanh thu @ $6/kênh (giá Buffer) | $12.000/tháng |
| Chi phí X API nếu mỗi kênh X đăng 50 link/tháng | 200 × $10 = **$2.000/tháng** (chưa tính bài không link) |
| Còn lại trước hạ tầng, hỗ trợ, lương | $10.000 |

Con số này **chỉ đẹp nếu** khách không đăng link nhiều trên X. Nếu 30% khách đăng link dày, margin âm ở đúng nhóm khách trả tiền nhiều nhất.

Bài học từ đối thủ: **ai cũng đang tìm cách đẩy chi phí X về phía khách** (cắt link, add-on, bắt tự mang key). Không ai absorb.

---

## 5. Khoảng trống khả dĩ (chưa chốt — cần stress-test)

### H1. "Data → post" theo chiều dọc

Nội dung sinh ra từ **dữ liệu có cấu trúc** mà khách đã có: bảng giá, tồn kho, danh sách sản phẩm, tin tuyển dụng, bất động sản, lịch sự kiện.

- Đã có ở dạng thô: Publer CSV bulk, FeedHive CSV, dlvr.it RSS, n8n/Make template, Google Sheets → post.
- **Chưa có ai làm tốt**: mapping schema → template theo từng nền tảng, kiểm tra tính hợp lệ trước khi đăng, chống đăng trùng, xử lý ảnh/biến thể.
- Rủi ro: CSV/RSS là "tính năng", không phải sản phẩm; khách có thể tự nối Zapier.

### H2. Agent-first (MCP) làm bề mặt chính

- Dữ liệu PostEverywhere: 79,2% bài qua API/MCP; 66% tổ chức đăng qua API có dùng agent; **Claude chiếm 82,6% kết nối agent**; agent sửa bài 8 lần cho mỗi 10 lần tạo.
- Nhưng: mọi vendor đều đã có MCP (Buffer, Metricool, Ayrshare, Blotato, Postiz, post2all…). **MCP không còn là lợi thế**, chỉ là điều kiện tối thiểu.
- `[SUY LUẬN]` Cơ hội thật nằm ở **dữ liệu agent đọc được và quy tắc nền tảng agent phải tuân** — không phải ở việc có MCP server.

### H3. Lớp Việt Nam: Zalo OA + FB Page + TikTok, UX tiếng Việt

- AutoWork và FBAIMKT đã chiếm mảng này, và họ bán **lead**, không bán lịch đăng.
- Rào cản API: Zalo OA cần đăng ký OA + duyệt; TikTok cần audit; nên đây là thị trường của **dịch vụ + hỗ trợ**, không phải self-serve.
- `[SUY LUẬN]` Đây là chỗ duy nhất mà "UX dễ xài" thực sự là lợi thế cạnh tranh, vì đối thủ hiện tại bán bằng Zalo support và video hướng dẫn, không bằng sản phẩm.

### H4. Lớp duyệt & tuân thủ cho agency

- Alium: người đổi tool vì giá, vì tool hỏng, vì native đủ dùng. Không ai nói "vì thiếu duyệt".
- `[SUY LUẬN]` Yếu — đây là tính năng của tầng enterprise, không phải điểm vào thị trường.

---

## 6. Vì sao sản phẩm cũ chết (phân tích, không phải phán xét)

| Nguyên nhân | Bằng chứng |
|---|---|
| Bán năng lực nền tảng cấm | Meta không có API đăng Group; Buffer chỉ làm "notification publishing" cho Group |
| Không có moat | Spin syntax + delay ngẫu nhiên là commodity; AutoWork/FBAIMKT bán cùng cơ chế, kèm lead engine |
| Rủi ro nằm ở khách | Mỗi lần FB đổi DOM/checkpoint, sản phẩm hỏng; khách chịu khoá nick |
| Không bán được cho doanh nghiệp | Doanh nghiệp không ký hợp đồng với tool vi phạm ToS |
| Giá sàn | Có bản free, có tool $9–$29 làm nhiều hơn |

`[SUY LUẬN]` Đây là lý do tôi không đề xuất "làm lại extension nhưng đẹp hơn". Cái chết nằm ở mô hình, không ở giao diện.

---

## 7. Câu hỏi cần trả lời trước khi lên plan

1. Khách trả tiền là **ai cụ thể** — shop VN, agency VN, hay đội marketing nước ngoài? Hai tầng này cần hai sản phẩm khác nhau.
2. "Dữ liệu người dùng mong muốn" là dữ liệu gì, đến từ đâu, và ai chịu trách nhiệm khi nó sai?
3. Có chấp nhận **chỉ dùng API chính thức** (bỏ Group/Zalo cá nhân) không? Nếu không, quay lại đúng cái bẫy cũ.
4. Giá dự kiến, và ai trả tiền API của X?
5. Thắng bằng gì sau 12 tháng, khi Postiz free và Buffer $6/kênh vẫn còn đó?

---

## 2026: ngách group-poster — 15 công cụ và luật chơi thật

Toàn bộ ngách này chuyển sang **extension chạy trong trình duyệt đã đăng nhập** sau 22/04/2024, khi Meta bỏ `publish_to_groups` khỏi mọi version của Graph API. Buffer xác nhận: đăng Group giờ chỉ còn là thông báo trên điện thoại. Hootsuite cũng không còn đường nào khác.

Danh sách dưới đây lấy từ khảo sát ngày 05–21/10/2026, **mỗi dòng là tự công bố của công cụ đó**, không phải tôi dùng thử:

| Công cụ | Giá vào | Điểm bán chính |
|---|---|---|
| AutoGP | 7 ngày trial, giá theo trang riêng | Trần ngày theo tuổi tài khoản, tự tăng theo tuần |
| FB Group Bulk Poster | $8,99/th · $69,99/năm | 3 bài/ngày free |
| Group Posting (groupposting.com) | €69/năm | 5 bài/ngày free, AI viết |
| GroupAutoPoster | $37/th | AI viết lại theo từng group, RSS |
| Groups Auto Poster & Automation Assistant | $2,99/th · $59,99 mua đứt | Rẻ nhất, lịch lặp, import CSV |
| Grovo | $14,99/th | 3 phiên free × 6 group |
| MaherPost | $29/th | Điểm sức khoẻ tài khoản, warm-up |
| MultiGroupPoster | $9,99/th · $69,99/năm | Lịch lặp, giá Mỹ thấp |
| NinjaPoster | $37/th | AI viết lại, RSS, đăng cả profile + Page |
| PilotPoster | $47/th | Biến thể AI, RSS |
| PostingStation | $50,90/năm | **Đăng với tư cách Page vào group**, cooldown giữa các Page |
| Postly | chưa niêm yết | AI/spintax, comment đầu tiên |
| SafePoster | $47/th | AI viết, RSS |
| SimplePoster | $4,99/th · $49,99/năm | Preset New Account/Balanced/Fast |

**Đọc bảng này ra bốn kết luận:**

1. **Khách trả tiền thật, nhưng rất ít.** Giá sàn $3–5/tháng, trần $47/tháng. Đây là thị trường số lượng lớn × giá thấp, không phải enterprise.
2. **Tên sản phẩm đã bão hoà.** Có ít nhất hai sản phẩm tên gần "FB Group Bulk Poster" — trùng đúng tên extension của Justin. Không thể định vị bằng tên.
3. **Tính năng an toàn đã là chuẩn mực, không phải điểm khác biệt.** Các tool đứng đầu đều có: trần theo tuổi tài khoản, delay tăng dần theo số bài trong ngày, cửa sổ 8h–23h, chống trùng nội dung, dừng khi có cảnh báo cấp tài khoản.
4. **Phân khúc khách đông nhất là F-commerce** — seller đăng vào 100+ group mua bán (Bangladesh, Việt Nam, Indonesia, Philippines). Đây là tệp nói thẳng: họ cần số lượng, chấp nhận rủi ro, và trả tiền theo tháng.



- X API pricing — https://docs.x.com/x-api/getting-started/pricing (đọc 10/11/2026)
- Buffer pricing — https://buffer.com/pricing (đọc 10/11/2026)
- So sánh giá API đăng bài 2026 — https://www.post2all.com/blog/social-media-api-pricing-compared (05/11/2026)
- State of AI Agents in Social Media 2026 (35.000+ bài, 330+ tổ chức) — https://posteverywhere.ai/blog/state-of-ai-agents-in-social-media (30/09/2026)
- Alium, *Why companies switch social media management tools* — https://www.alium.io/research/why-companies-switch-social-media-management (27/10/2026)
- RetentionCheck churn benchmark — https://retentioncheck.com/churn-benchmarks/social-media-management (05/2026)
- Growth Market Reports — https://growthmarketreports.com/report/social-media-management-software-market
- Postiz repo — https://api.github.com/repos/gitroomhq/postiz-app (10/11/2026)
- Meta Instagram content publishing — https://developers.facebook.com/docs/instagram-api/guides/content-publishing
- Meta App Review — https://developers.facebook.com/documentation/instagram-platform/app-review
- AutoWork (VN) — https://autowork.com.vn/
- Publer CSV bulk — https://publer.com/features/bulk-scheduling
- dlvr.it RSS→social — https://dlvrit.com/
