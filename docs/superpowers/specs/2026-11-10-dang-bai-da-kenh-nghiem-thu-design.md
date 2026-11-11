# Thiết kế: Đăng bài đa kênh + Nghiệm thu (nâng cấp extension FBQ)

**Ngày:** 2026-11-10 · **Trạng thái:** chờ duyệt · **Cỡ việc:** dự án
**Nguồn:** `docs/discovery/00–04`, `.omp/work/2026-11-10/omni-post-channel-discovery/`, trao đổi brainstorm 2026-11-10.

---

## 1. Ý định và lý do

Sales/marketer (bản đầu: bất động sản; sau bán lại cho ngành khác) phải **đăng một content đủ ~50 lần** lên các group/kênh thì mới được **nghiệm thu** và nhận lương. Hiện họ đăng tay, mở từng trang, rồi tự gom bằng chứng.

Sản phẩm cần làm được: **quét hết các nơi tài khoản có thể đăng → tick chọn → bấm một lần → tool tự đăng dần → xuất một file nghiệm thu (link bài + ảnh chụp)** để bộ phận kiểm tra duyệt.

Người dùng đăng bằng **tài khoản thật họ đang dùng để làm việc**, không phải nick clone.

## 2. Mục tiêu

| # | Mục tiêu | Đo bằng |
|---|---|---|
| G1 | Nút **Đăng** hoạt động thật trên Facebook Group và timeline | 1 bài đăng thật lên group test, có `posted` + link |
| G2 | **Danh sách "Nơi đăng" chung** cho nhiều mạng: FB Group, FB timeline cá nhân, **nhóm Zalo (Zalo Web)**. Có chỗ để thêm mạng khác sau | Một màn hình hiện cả FB lẫn Zalo, lọc theo mạng |
| G3 | **Quét** nơi đăng theo từng mạng (FB đã có `sw.js:30`; Zalo mới) | Bấm "Quét" → danh sách tự đầy |
| G4 | **Chiến dịch** = 1 bài × N nơi đăng × mục tiêu số lượt; tool **tự rải lịch qua nhiều ngày** trong trần an toàn, hiện ngày dự kiến xong | Tick 50 nơi → hiện "xong dự kiến: ngày X" |
| G5 | Mỗi lượt `posted` lưu **bằng chứng**: link bài, ảnh chụp, giờ đăng, tên + link nơi đăng, tài khoản | Bảng nghiệm thu trong UI |
| G6 | **Xuất nghiệm thu** thành 1 file `.zip` mở được offline | Bộ phận check mở file, bấm link ra đúng bài |
| G7 | Nội dung = chữ + hashtag + ảnh/video. **Không gắn cứng BĐS** | Đổi sang ngành khác không cần sửa code |

## 3. Không làm trong vòng này (non-goals)

- Máy chủ, đăng nhập tài khoản sản phẩm, trang quản lý tập trung, thanh toán/bản quyền.
- API chính thức (Graph API cho Page, Zalo OA API), X, TikTok, LinkedIn: để pha sau (hướng B).
- AI viết bài.
- Mở rộng spintax hiện có (`core/spintax.js`): giữ nguyên, không phát triển thêm.

## 4. Không bao giờ làm (anti-goals)

Thiết kế sẽ coi là **thất bại**, dù chạy được, nếu nó có:

- Mạng nick clone/nick ảo, cày comment/like, giả tương tác.
- Bất cứ thứ gì làm ra để **lách bộ lọc spam/trùng của nền tảng**: biến đổi ảnh để qua mặt so khớp ảnh, tách dấu vân tay trình duyệt cho nhiều nick, đường đăng ngầm qua GraphQL/endpoint ("Fast mode"), hoặc cho người dùng kéo trần tốc độ vượt preset an toàn.
- Bằng chứng nghiệm thu **không xuất phát từ một lần đăng thật** (sửa tay link/ảnh trong tool).
- **Đăng trùng** cùng một bài vào cùng một nơi do retry sau khi đã bấm.
- Thêm permission `cookies`, `webRequest`, `debugger`, `<all_urls>` (discovery 04 §D4).

## 5. Ràng buộc

- Chrome/Edge MV3, `minimum_chrome_version: 120`, không bundler, JS thuần, test bằng `node --test` (hiện có 10 file test).
- Facebook Group và Zalo nhóm **không có API**, nên đường duy nhất là DOM trong phiên đã đăng nhập sẵn của người dùng. Chính sách spam của Meta nhắm vào **tần suất cao + nội dung lặp** (03 §2). 50 lượt cùng một bài là đúng vùng rủi ro, nên **tốc độ phải chậm, rải nhiều ngày**.
- Trần an toàn hiện có (03 §3): 20 bài/ngày, cooldown 3 ngày mỗi group, delay 90–240s, nghỉ giữa lô, dừng khi lỗi liên tiếp, khoá 24h khi bị rate-limit, dừng khi gặp checkpoint.
- Chrome **chỉ chụp được tab đang hiển thị** (`chrome.tabs.captureVisibleTab`), nên lúc chụp bằng chứng tab bài đăng phải được đưa lên trước vài giây.
- Một Chrome profile = một tài khoản (04 §D2).

## 6. Các hướng đã cân nhắc

| | A. Nâng cấp extension, chạy trên máy | B. Máy chủ + extension | C. Fork Postiz + gắn Group/Zalo |
|---|---|---|---|
| Ưu | Dùng lại `src/` + test, không server, không chờ App Review, ra nhanh nhất | Bán lại dạng SaaS, trang quản lý tập trung, API chính thức | 36 kênh có sẵn |
| Nhược | Chrome phải mở trong lúc rải bài; chưa có quản lý tập trung | Lâu hơn nhiều tháng, App Review, hosting; bộ phận check chỉ cần file | AGPL buộc mở mã khi bán lại; stack nặng; không có Group |

**Người dùng chọn A** (2026-11-10). Lý do: giải đúng nỗi đau "đăng đủ 50 lượt + có bằng chứng" mà không cần hạ tầng. Mô hình nơi đăng và trạng thái đăng được thiết kế để pha sau thêm B mà không viết lại.

## 7. Những điều người dùng đã chốt

1. Facebook Group là **cốt lõi**. Zalo là kênh chính thứ hai.
2. Tài khoản thật của người làm việc.
3. Bằng chứng = **link bài + ảnh chụp**, gom vào **một file tổng hợp**, có **bộ phận riêng kiểm tra**. Không cần trang quản lý online.
4. Hướng A.
5. Hiện trạng người dùng báo: extension **chèn được chữ và ảnh nhưng chưa bấm được nút Đăng**.
6. **Được đăng lặp vào cùng một nơi** để đủ số lượt nghiệm thu, nhưng người dùng phải có **nút điều chỉnh** dễ dùng (xem 8.5).
7. Bộ phận check **chấp nhận** lượt không có link bài riêng: ảnh chụp + link nơi đăng + giờ đăng là đủ (thường gặp với Zalo).
8. P0 được tái hiện trên **Chrome đã đăng nhập của người dùng**, qua egolite MCP (skill `ego-browser`) hoặc Claude in Chrome, trong một group test do người dùng chỉ định.

## 8. Thiết kế

### 8.1 Hiện trạng code (đọc 2026-11-10)

- Đường đang chạy: `sw.js` mở `ui/panel.html` → `ui/engine.js`: `fbq:probe` → `fbq:fill` → `step2` → `fbq:submit` → `content/runner.js` → `adapter-group.postFlow` → `dom.clickEl(btn)` (`adapter-group.js:235`).
- `ui/runner.html` + `ui/runner.js` là **đường chết**: gửi lệnh `'post'` qua port và chờ `'posted'`, nhưng không content script nào gọi `runtime.connect`. File này có ý tưởng tốt (commit point `clickedAt` trước khi bấm, `ui/runner.js:871`).
- Selector `POST_BUTTON` (`selectors.js:49`) có thật; `textMatch(/^(Post|Đăng)$/i)` **không giới hạn trong dialog**, có thể trúng nhầm phần tử. `ALERT` gồm cả `[role="dialog"]`.
- Nguyên nhân thật của "chưa bấm được Đăng" **chưa xác định**: cần tái hiện trên Facebook thật (xem §9, P0).

### 8.2 Mô hình dữ liệu

```
Destination  { id, network: 'fb_group'|'fb_timeline'|'zalo_group', key, name, url,
               accountLabel, enabled, lastPostedAt, cooldownUntil }
Content      { id, text, hashtags[], mediaIds[] }          // media trong IndexedDB (core/assets.js)
Campaign     { id, contentId, destinationIds[], targetCount,
               maxPerDestination, repeatCooldownDays, createdAt, status }
Attempt      { id, campaignId, destinationId, state, clickedAt, postedAt,
               postUrl, proofImageId, errorCode, errorText }
```

`network` là chuỗi mở, để thêm mạng sau mà không đổi schema.

### 8.3 Provider theo mạng

Mỗi mạng là một module content script tự chứa (theo hình hợp đồng adapter của Postiz, discovery 02 §3.2):

```
scan()          → Destination[]        // quét nơi đăng
prepare(content)→ ok | error            // mở composer, chèn chữ + media
submit()        → posted | failed | unknown
findPostUrl()   → url | null            // link bài vừa đăng
```

- `fb_group`, `fb_timeline`: tách từ `adapter-group.js` hiện có.
- `zalo_group`: mới, chạy trên `https://chat.zalo.me/*` (thêm vào `host_permissions` và `content_scripts`). "Đăng" vào nhóm Zalo = gửi tin nhắn có chữ + ảnh vào nhóm chat.

### 8.4 Máy trạng thái đăng

```
queued → navigating → filling → clicking → verifying → posted
                                    │            └→ unknown (không xác nhận được)
                                    └→ failed | needs_manual
```

- **Commit point:** ghi `clickedAt` trước khi gửi lệnh bấm. Sau commit point **không bao giờ tự retry**. Không chắc → `unknown`, để người dùng tự kiểm.
- Retry tự động chỉ được trước commit point.
- `posted` chỉ được ghi khi có xác nhận từ trang (dialog đóng, không có alert lỗi). Có `postUrl` là tốt nhất. **Không có `postUrl` vẫn tính là `posted`** nếu có ảnh chụp (quyết định 7).

### 8.5 Lịch và an toàn

- Một chiến dịch xếp lượt vào hàng đợi chung. Bộ lập lịch phát lượt theo trần **giờ/ngày/cooldown mỗi nơi đăng** hiện có, rồi hiện **ngày xong dự kiến**.
- Bổ sung các cơ chế bảo vệ từ discovery 03: trần theo giờ (G2), khoá leo thang theo số lần vi phạm (24h → 72h → 7 ngày → tắt tự động; 03 §5.2), dấu hiệu mềm (03 §5.3).
- Gặp checkpoint/cảnh báo cấp tài khoản thì **dừng toàn bộ**, hiện hướng dẫn, không tự chạy lại.
- Trần **không** cho người dùng nâng vượt preset `safe`/`medium` hiện có.
- **Đăng lặp để đủ số lượt** (quyết định 6). Người dùng có 3 nút điều chỉnh trên màn hình chiến dịch:
  - **Mục tiêu số lượt** (ví dụ 50).
  - **Tối đa mỗi nơi**: 1–5 lần, mặc định 1. Nếu số nơi đã chọn × tối đa mỗi nơi < mục tiêu, tool báo "cần chọn thêm X nơi hoặc tăng số lần mỗi nơi".
  - **Cách nhau giữa hai lần ở cùng một nơi**: mặc định 3 ngày, *(quyết định của Claude)* sàn 1 ngày. Không bao giờ đăng cùng một nơi hai lần trong một ngày.
  - Bộ lập lịch **ưu tiên nơi chưa đăng** trước, lượt lặp đi sau. Ngày xong dự kiến cập nhật ngay khi đổi nút.
- *(Quyết định của Claude)* **Trần theo hạng tài khoản** lấy từ 03 §5.1: T0 5/ngày, 2/giờ; T1 12/ngày, 4/giờ; T2 20/ngày, 6/giờ; T3 30/ngày, 8/giờ. Người dùng tự chọn tuổi tài khoản một lần khi thêm tài khoản (tool không tự đoán). Mặc định là T1. Ngày xong dự kiến tính theo hạng này.
- *(Quyết định của Claude)* **Zalo chưa có số liệu an toàn**, nên bản đầu dùng trần thận trọng: 10/ngày, 3/giờ, cooldown 1 ngày mỗi nhóm, delay như FB. Hiệu chỉnh sau bằng log lượt chạy (03 §5.4).
- *(Quyết định của Claude)* **Chỉ đăng trong khung 07:00–22:00 giờ máy.** **Không** áp quy tắc "≥3 biến thể / ảnh tối đa 10 group" của 03 §5.5, vì đó là cơ chế làm bài trông khác đi để qua bộ lọc trùng, thuộc anti-goal ở §4. Mỗi chiến dịch chỉ có 1 content.
- *(Quyết định của Claude)* **Lỡ lịch** (Chrome tắt hoặc máy ngủ): không đăng bù dồn. Khi Chrome mở lại, hàng đợi chạy tiếp trong trần, ngày xong dự kiến được tính lại. Dùng `chrome.alarms` để đánh thức.

### 8.6 Bằng chứng và xuất nghiệm thu

- Sau `posted`: đưa tab lên trước, chờ bài hiện ra, chụp `captureVisibleTab`, lưu ảnh vào IndexedDB (`proofImageId`), ghi `postUrl` nếu tìm được.
- **Xuất nghiệm thu** → `nghiem-thu-<tài khoản>-<ngày>.zip`:
  - `nghiem-thu.csv` (UTF-8 có BOM để Excel đọc đúng tiếng Việt). Các cột: STT, tài khoản, mạng, tên nơi đăng, link nơi đăng, link bài, giờ đăng, file ảnh, trạng thái.
  - `nghiem-thu.html`: cùng bảng, có ảnh thu nhỏ và link bấm được, mở offline.
  - `anh/<STT>-<tên nơi đăng>.png`
- Lượt `unknown`/`failed` vẫn có trong file nhưng ghi rõ trạng thái, không trộn lẫn với `posted`.

### 8.7 Giao diện (`ui/panel.html`)

```
┌ Nơi đăng ┬ Bài đăng ┬ Chạy ┬ Nghiệm thu ┐
│ [Quét Facebook] [Quét Zalo]   Lọc: [Tất cả ▾]  Tìm: [____]   │
│ ☑ Nhà đất Thủ Đức (FB)     đăng lần cuối: 3 ngày trước       │
│ ☑ Mua bán BĐS Q7 (Zalo)                                      │
│ ...                         Đã chọn: 50   Xong dự kiến: 13/11 │
└───────────────────────────────────────────────────────────────┘
```

- **Bài đăng:** chữ, hashtag, ảnh/video (kéo thả).
- **Chạy:** tiến độ, lượt hiện tại, lý do dừng.
- **Nghiệm thu:** bảng các lượt + nút "Xuất file".

## 9. Thứ tự thực hiện (để plan chi tiết hoá)

- **P0. Sửa nút Đăng** (G1): tái hiện trên FB thật (Chrome đã đăng nhập qua `ego-browser` hoặc Claude in Chrome, group test do người dùng chỉ định, đăng thật tối đa vài bài), tìm nguyên nhân gốc, sửa, có test. Gộp về một đường (`engine.js`), mang commit point từ `ui/runner.js` sang, rồi bỏ `ui/runner.*` khi đã xác nhận không dùng.
- **P1. Bằng chứng + xuất nghiệm thu cho Facebook** (G5, G6): giá trị dùng ngay.
- **P2. Mô hình Destination + provider + Zalo** (G2, G3).
- **P3. Chiến dịch + lịch rải nhiều ngày + bảo vệ leo thang** (G4, 8.5).
- **P4 (sau).** Máy chủ/API chính thức để bán lại (hướng B).

## 10. Để người xây quyết

- Cách lấy `postUrl` sau khi đăng trên FB Group (feed group, "bài viết của bạn", hay thông báo) và trên Zalo (tin nhắn có thể không có permalink; khi đó dùng link nhóm + giờ + ảnh chụp).
- Selector và luồng DOM của Zalo Web.
- Cách đóng gói zip khi không có dependency (tự viết định dạng STORE hoặc vendor một thư viện nhỏ).
- Quyền tối thiểu để `captureVisibleTab` chạy trên các origin đã khai báo. **Không** được thêm `<all_urls>`. Nếu bắt buộc phải thêm thì dừng và hỏi.
- Video: kiểm tra input file hiện có nhận video không, giới hạn dung lượng.
