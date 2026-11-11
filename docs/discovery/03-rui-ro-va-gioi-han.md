# Rủi ro vi phạm chính sách & giới hạn kỹ thuật

**Ngày:** 2026-11-10 · **Trạng thái:** đề xuất, chưa vào plan · **Phạm vi:** đăng bài lên Facebook Group qua trình duyệt (không API)

---

## 1. Chốt quan điểm trách nhiệm

Hai thứ khác nhau, đừng gộp:

| | Ai chịu | Cách xử lý |
|---|---|---|
| **Tuân thủ / nội dung** | Khách | Ghi rõ trong ToS + cảnh báo một lần khi bật preset nhanh |
| **Tài khoản bị khoá** | Khách về hợp đồng, **chúng ta về kinh tế** | Giảm xác suất bằng kỹ thuật + đo được tỉ lệ |

Vì sao "việc của họ" không đủ: ban là **nguồn churn lớn nhất** của mọi tool dạng này, và ở thị trường VN một tool bị gắn nhãn "bị khoá nick" sẽ lan trong các group FBA/MMO trong vài tuần. Khách mất acc không "dùng đồ của mình luôn" — họ bỏ, viết review, và đòi hoàn tiền. Chi phí đó nằm ở ta.

Nguyên tắc vận hành: **khách quyết định rủi ro, tool quyết định tốc độ tối đa.** Không cho khách tự kéo trần vô hạn, nhưng cũng không từ chối bán.

---

## 2. Sự thật nền tảng (có nguồn)

- Graph API **v19.0 đã deprecate Groups API** (`publish_to_groups` và các quyền liên quan), hiệu lực cho **mọi version từ 22/04/2024** — [changelog v19.0](https://developers.facebook.com/docs/graph-api/changelog/version19.0). Zoho đã ngừng tính năng Facebook Groups vì lý do này. → **Không còn đường chính thức để tự động đăng Group.** Mọi sản phẩm làm được việc này đều đi qua trình duyệt hoặc phiên đăng nhập, tức là vùng không có SLA.
- **Chính sách Spam của Meta là thứ thực sự đứng sau checkpoint.** Nguyên văn (đọc 10/11/2026): *"Posting, sharing, engaging with content or creating accounts, Groups, Pages, Events or other assets, **either manually or automatically, at very high frequencies**"* — và ngay sau đó: *"We may place restrictions on accounts that are acting at lower frequencies when other indicators of Spam (e.g., posting repetitive content) or signals of inauthenticity are present."*
  Hai câu này quyết định toàn bộ thiết kế: **Meta không quan tâm ai bấm nút, chỉ quan tâm tần suất + độ lặp nội dung.** Nghĩa là "đăng tay" không an toàn hơn "tool", và "delay ngẫu nhiên vài phút" không xoá được tín hiệu lặp nội dung.
- Meta **không công bố ngưỡng**. Bất kỳ tool nào quảng cáo "X group/giờ là an toàn" đều đang bịa số. Mọi con số dưới đây là **thực nghiệm phải đo trên chính tệp khách của mình**, không phải spec của Meta. `[SUY LUẬN]` cho phần cơ chế phát hiện.

---

## 3. Những gì extension hiện tại đã có (đọc từ code, không phải nhớ)

| Cơ chế | Vị trí | Preset `safe` |
|---|---|---|
| Trần ngày | `core/queue.js:65` | 20 bài/ngày |
| Cooldown mỗi group | `core/safety.js:120` | 3 ngày |
| Delay giữa bài | `core/safety.js` `chooseDelaySec` | 90–240s |
| Nghỉ dài ngẫu nhiên | `longPauseChance` | 15% → 300–900s |
| Nghỉ giữa lô | `batchSize` / `batchBreakSec` | 8 bài → nghỉ 30 phút |
| Dừng khi lỗi liên tiếp | `stopAfterConsecutiveFailures` | 2 |
| Nhận cảnh báo rate-limit | `safety.js:149` regex VI+EN | dừng + khoá 24h |
| Nhận checkpoint/login | `ui/runner.js:402,413` | dừng toàn bộ run |
| Biến thể nội dung | `spintax` + `textSeedForTarget` | theo từng group |

Đây là nền tốt hơn hầu hết tool bán trên thị trường VN. Vấn đề không phải "chưa có", mà là **chưa đo được và chưa leo thang**.

---

## 4. Chín lỗ hổng cụ thể

| # | Lỗ hổng | Bằng chứng trong code | Hậu quả |
|---|---|---|---|
| G1 | Tài khoản mới dùng chung preset với acc 5 năm | `PRESETS` chỉ có safe/medium/fast, không có tham số tuổi acc | Acc vừa lập đăng 20 group/ngày → checkpoint trong 1–2 ngày |
| G2 | Không có trần theo giờ | chỉ `dailyCap` và `maxPerRun` | 20 bài trong 40 phút là pattern rõ nhất mà hệ thống chống spam nhìn thấy |
| G3 | Circuit breaker không leo thang | `runner.js:450` đặt cứng `+24h` | Vi phạm lần 2, 3 vẫn chỉ khoá 24h → khách bật lại ngay, lần sau bị khoá vĩnh viễn |
| G4 | Không có telemetry đóng vòng | không thấy bảng ghi run/preset/kết quả vi phạm | Không thể trả lời "preset nào an toàn" bằng số, chỉ bằng cảm giác |
| G5 | Ảnh giống nhau cho mọi group | `assets` xử lý ảnh, không có biến thể theo group | 20 group nhận cùng một ảnh = tín hiệu trùng nội dung |
| G6 | `variantCount` thấp không cảnh báo | `safety.js` có hàm nhưng không chặn run | Text có 2 biến thể mà đăng 20 group = gần như trùng |
| G7 | Dấu hiệu mềm không tính | `post_disabled`, `insert_rejected` chỉ đánh dấu item | Nút Đăng xám 3 lần liên tiếp là dấu hiệu sớm, đang bị bỏ qua |
| G8 | Không giới hạn giờ trong ngày | không có | Đăng 3h sáng, ngày lễ — lệch hành vi người thật |
| G9 | Nhiều tài khoản trên một máy không cô lập | kiến trúc 1 profile Chrome = 1 phiên | Dấu vân tay trình duyệt chung → khoá dây chuyền |

---

## 5. Thiết kế giảm thiểu (spec cho plan, không code)

### 5.1 Phân hạng rủi ro theo tài khoản

| Hạng | Điều kiện | Trần/ngày | Trần/giờ | Group mới/ngày |
|---|---|---|---|---|
| T0 | acc < 7 ngày | 5 | 2 | 2 |
| T1 | 7–30 ngày | 12 | 4 | 5 |
| T2 | >30 ngày, >200 bài, chưa từng checkpoint | 20 | 6 | 10 |
| T3 | >6 tháng, 60 ngày sạch | 30 | 8 | 15 |

`[SUY LUẬN]` Các số này phải hiệu chỉnh bằng telemetry của chính mình sau 30 ngày chạy; mục tiêu là giữ **tỉ lệ checkpoint < 1/1000 bài**.

### 5.2 Bộ ngắt mạch leo thang

| Số lần vi phạm trong 90 ngày | Khoá |
|---|---|
| 1 | 24 giờ |
| 2 | 72 giờ |
| 3 | 7 ngày + hạ xuống T0 |
| 4 | tắt đăng tự động, bắt xác nhận thủ công |

Lưu **số lần**, không lưu cờ bool. Hiện `cooldownUntil` chỉ là một mốc thời gian.

### 5.3 Điểm bất thường (soft signals)

Cộng dồn trong một run: nút Đăng xám >45s (+1), composer >30s (+1), `insert_rejected` (+2), `post_disabled` (+2). Đạt 3 điểm → giảm trần run hiện tại 50%; đạt 6 → dừng run như `rate_limited` nhưng khoá ngắn (2 giờ).

### 5.4 Telemetry — tài sản không copy được

Mỗi run ghi một dòng: `{accTier, preset, posts, groupsNew, hours, checkpoints, rateLimited, softSignals}`. Mục tiêu sau 90 ngày: biết chính xác **số bài/ngày tối đa theo từng hạng acc** bằng dữ liệu. Postiz/Buffer không có dữ liệu này vì họ không đăng Group.

### 5.5 Nội dung

- `variantCount < 3` mà số group mục tiêu > 10 → chặn run, yêu cầu thêm biến thể.
- Ảnh: một ảnh chỉ dùng cho tối đa 10 group/ngày, hoặc bắt buộc album khác nhau.
- Chỉ chạy 07:00–22:00 giờ máy; chủ nhật mặc định trần bằng 50%.

### 5.6 Hợp đồng với khách

- Cảnh báo một lần, không lặp lại mỗi phiên, khi bật preset nhanh: nêu rõ rủi ro khoá tài khoản.
- ToS: khách chịu trách nhiệm nội dung và tuân thủ điều khoản nền tảng.
- Khi xảy ra checkpoint: tool **tự khoá**, hiện hướng dẫn xử lý, không tiếp tục đăng.

---

## 5b. Chuẩn thị trường 2026 — đối thủ đã ship gì

Khảo sát 05–21/10/2026 cho thấy các tool đứng đầu của ngách này **đã có sẵn** những thứ ở §5:

| Tính năng an toàn | Ai đã có |
|---|---|
| Trần ngày tính từ **tuổi tài khoản**, tự tăng theo tuần | AutoGP, Group Posting, PostingStation, SimplePoster (preset New/Balanced/Fast) |
| Delay **tăng dần** theo số bài trong ngày | AutoGP |
| Cửa sổ đăng 8h–23h | AutoGP |
| Chống trùng nội dung trước khi đăng | AutoGP |
| Dừng toàn bộ khi có cảnh báo cấp tài khoản | AutoGP, Group Posting (nghỉ 12h), PostingStation, Postly |
| Warm-up cho tài khoản mới | MaherPost, Group Posting, PostingStation |
| Điểm sức khoẻ tài khoản | MaherPost |

**Kết luận khó nghe:** extension hiện tại (trần ngày + cooldown group + delay cố định 90–240s) đang **dưới sàn của thị trường $9/tháng**. Đây không phải vấn đề UI — đây là thiếu hẳn tầng an toàn mà đối thủ rẻ nhất đã có.



## 6. Điều kiện chấp nhận cho plan sau

- A1: Mỗi run ghi đủ trường telemetry ở §5.4, đọc lại được từ store.
- A2: Trần theo hạng acc áp dụng đúng ở `queue.js` (test: T0 không vượt 5/ngày kể cả khi `dailyCap` = 80).
- A3: Vi phạm lần 2 khoá 72h (test: gọi breaker 2 lần liên tiếp).
- A4: `variantCount < 3` + >10 group → run bị chặn với lý do đọc được.
- A5: Không có đường nào trong UI đặt trần trên mức của hạng acc hiện tại.

---

## 7. Điều không làm, và điều buộc phải làm

Không làm:
- Không xoay proxy/VPN cho tài khoản Facebook. Chi phí bảo trì vô hạn, và một IP Việt Nam ổn định đúng là hành vi bình thường.
- Không giả lập User-Agent, canvas, font để "né phát hiện". Đó là cuộc đua vũ trang mà bên kia có toàn bộ telemetry.
- Không hứa "không bị khoá" trong bất kỳ copy marketing nào.

Buộc phải làm (khác với hai điều trên):
- **Mỗi tài khoản Facebook một Chrome profile riêng** — cookie, storage, extension state tách biệt. Đây không phải giả mạo dấu vân tay, mà là cô lập đúng cách. Nếu dùng chung một profile cho nhiều acc, checkpoint ở acc này sẽ lan sang acc kia.
- Ghi rõ trong UI: đổi tài khoản = đổi profile, không dùng lại tab cũ.

Ghi chú đối thủ: ít nhất một tool (NoobClaw) quảng cáo "fingerprint riêng cho từng tài khoản". Đó là điểm tôi cố tình không theo — nhưng tách profile thì phải làm, vì nó rẻ và không có mặt trái.

---

## 8. Nguồn (đọc 10/11/2026)

- Meta Spam policy — https://transparency.meta.com/policies/community-standards/spam/
- Graph API v19.0 changelog (bỏ Groups API) — https://developers.facebook.com/docs/graph-api/changelog/version19.0
- Meta Account Integrity — https://transparency.meta.com/policies/community-standards/account-integrity
- Meta platform enforcement — https://developers.facebook.com/documentation/development/terms-and-policies/enforcement
- Meta One (15/09/2026, gói Advanced $49,99/th có hẹn giờ Story 30 ngày) — https://about.fb.com/news/2026/09/introducing-meta-one-subscription-service-more-features-ai/
- NoobClaw, *Facebook Auto Poster Extensions: Browser Actions and Access* (17/09/2026, sửa 12/10/2026) — https://noobclaw.com/blog/facebook-auto-poster-extension-risks-2026/
- AutoGP, *Best Facebook Group Posting Tools (2026)* (13/09/2026, cập nhật 26/10/2026) — https://autogp.ai/blog/best-facebook-group-posting-tools
- MaherPost, *Meta Killed Group APIs in 2024* — https://www.maherpost.com/blog/meta-killed-group-apis-2026
- Group Posting — https://groupposting.com/group-posting/best-facebook-group-posting-tools
