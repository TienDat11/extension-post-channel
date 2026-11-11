# Kết quả kiểm tra Goldfish (Elephant-Goldfish) — plan Đăng bài đa kênh + Nghiệm thu

**Mục tiêu:** `docs/plans/2026-11-10-1144-feat-dang-bai-da-kenh-nghiem-thu-plan.md` (1283 dòng).
**Chuẩn đối chiếu:** `PRODUCT.md`, `docs/superpowers/specs/2026-11-10-dang-bai-da-kenh-nghiem-thu-design.md`, `docs/discovery/03-rui-ro-va-gioi-han.md`, `04-xac-thuc-va-phien.md`, `06-vi-sao-khong-dung-opensource.md`.
**Phương pháp:** chỉ đọc, không sửa, không chạy test. 6 lăng kính: traceability, contradiction, evidence, scope, language, prerequisite.
**Tổng số finding:** 25 (P0: 1, P1: 8, P2: 13, P3: 3).

---

### F-C01. Phạm vi P4 bị đổi thiết kế gốc mà không ghi nhận
- Severity: P0
- Lens: contradiction
- Anchor: dòng 120 của plan — "Thêm P4 (TikTok, Instagram, X qua DOM, KD9)"
- Vấn đề: Design spec §9 (dòng 168) định nghĩa P4 là "Máy chủ/API chính thức để bán lại (hướng B)". Kế hoạch đột thay đổi P4 thành "thêm TikTok/Instagram/X qua DOM + viết lại giao diện" (KD9) mà không ghi nhận mình đang thay đổi phạm vi đã chốt từ thiết kế. Nếu code theo kế hoạch, team sẽ xây phạm vi chưa được chủ đầu tư duyệt.
- Sửa: cần Justin quyết: "Chấp nhận thay đổi P4 từ 'máy chủ/API chính thức' sang 'thêm TikTok, Instagram, X qua DOM và viết lại UI'?" (có/không). Nếu có, bổ sung ghi nhận ở Scope Boundaries rằng design spec §9 P4 đã bị thay thế.

### F-C02. "Không giới hạn" mâu thuẫn trần cứng R11/R13/KD7
- Severity: P1
- Lens: contradiction
- Anchor: dòng 102 của plan — "đăng được cùng lúc lên TikTok, Instagram, Facebook, Zalo, X "không giới hạn""
- Vấn đề: KD9 ghi nhận Claude dịch "không giới hạn" thành "danh sách mạng mở", nhưng R11, R13, KD7 cứng trần theo hạng và theo mạng; kế hoạch đi code mà chưa xác nhận với Justin ý chí thực sự. Nếu Justin hiểu "không giới hạn" theo nghĩa đen, toàn bộ trần R11/KTD10/KTD22 phải bị loại.
- Sửa: cần Justin quyết: "Chấp nhận giữ trần theo hạng/mạng (R11, R13, KTD10) và hiểu "không giới hạn" là chỉ danh sách mạng mở?" (có/không).

### F-E01. Trần hạng tài khoản cứng số nhưng chưa xác nhận nguồn
- Severity: P1
- Lens: evidence
- Anchor: dòng 65 của plan — "T0 5/ngày 2/giờ, T1 12/4, T2 20/6, T3 30/8."
- Vấn đề: 03 §5.1 và design spec §8.5 đánh số này là "[SUY LUẬN]"/"(Quyết định của Claude)", phải hiệu chỉnh bằng telemetry sau 30 ngày. Kế hoạch cứng vào R11, KD7, U15 mà không nhãn ước lượng, coi con số chưa xác nhận như giới hạn chính thức. Hậu quả: giới hạn tài khoản thật có thể sai số, không bảo vệ được acc của người dùng.
- Sửa: Thêm vào R11 và KTD10/KTD15 ghi chú "(số từ 03 §5.1, đánh là ước lượng của Claude; cần telemetry 30 ngày để xác nhận)" và không để telemetry ở Deferred vĩnh viễn.

### F-E03. Trần mạng mới (IG/TikTok/X) là ước lượng Claude nhưng lại cứng vào code
- Severity: P1
- Lens: evidence
- Anchor: dòng 277 của plan — "Các con số này là ước lượng của Claude, không có nguồn."
- Vấn đề: KTD22 gán Instagram/TikTok/X 1 bài/ngày, 1 bài/giờ, cooldown 1 ngày, nhưng plan lại coi là giới hạn code (NETWORK_CAPS, U17, U18–U20), chỉ hứa "sau P4 chỉ giữ hoặc giảm".
- Sửa: Thay phần cuối KTD22 bằng: "Các con số này là ước lượng của Claude, không có nguồn. Coi là thử nghiệm, KHÔNG cứng vào code làm giới hạn chính xác cho tới khi Cổng P4 có số liệu thật." Kèm cần Justin quyết: "Áp tạm 1 bài/ngày cho Instagram, TikTok, X sau P4 mà chưa có số liệu thật?" (có/không).

### F-C03. Tổng campanha 25 lượt/ngày vượt preset safe 20/ngày
- Severity: P1
- Lens: contradiction
- Anchor: dòng 200 của plan — "một ngày tối đa FB 12 + Zalo 10 + Instagram 1 + TikTok 1 + X 1 = 25 lượt"
- Vấn đề: Dòng 199 cùng KTD10 khẳng định "Không mạng nào vượt preset safe (20/ngày)", nhưng tổng campaña lại đạt 25 lượt/ngày. Nếu Justin hiểu safe 20/ngày là trần mỗi tài khoản mỗi ngày, batch P4 20–30 vi phạm trần an toàn đã chốt (R13 "không có đường nào nâng trần vượt safe/medium").
- Sửa: cần Justin quyết: "Trần 20/ngày của preset safe áp cho mỗi mạng hay cho toàn bộ chiến dịch?" (mỗi mạng / toàn bộ chiến dịch).

### F-C04. Chụp màn hình giả định host permission đủ, trái thiết kế spec
- Severity: P1
- Lens: contradiction
- Anchor: dòng 195 của plan — "Chromium thực tế có thể chấp nhận host permission cụ thể"
- Vấn đề: Design spec §5 (dòng 50) khẳng định "Chrome chỉ chụp được tab đang hiển thị … tab bài đăng phải được đưa lên trước"; KTD9 lại speculative chấp nhận host-permission chụp trên cửa sổ không focus, và U1 bước 7 thử chụp tab không focus. Nếu Chromium chặn, toàn bộ bằng chứng P1–P4 thành proofMissing, cổng P1/P4 kẹt.
- Sửa: Thay dòng 195 bằng: "Theo tài liệu Chrome, `captureVisibleTab` yêu cầu `<all_urls>` hoặc `activeTab`; host permission riêng KHÔNG đủ. U5 spike xác nhận trên Chromium thật; nếu chụp không được, dừng và hỏi người dùng."

### F-S01. Cổng P4 phụ thuộc nhóm FB và tài khoản test chưa được xác nhận
- Severity: P1
- Lens: scope
- Anchor: dòng 1239 của plan — "Cổng cần khoảng 12 group FB của người cho mượn tài khoản và khoảng 10 nhóm Zalo của tài khoản test"
- Vấn đề: KTD21 đòi hỏi chủ tài khoản mượn đồng ý cụ thể khoảng 12 group FB và tài khoản test riêng cho Zalo/Instagram/TikTok/X; chưa có xác nhận nào. Cổng P4 (batch 20–30) không thể chạy nếu thiếu nơi, và kế hoạch chỉ nói "dừng, báo người dùng" mà không có kế hoạch dự phòng.
- Sửa: cần Justin quyết: "Chủ tài khoản mượn đã đồng ý với khoảng 12 group FB và có tài khoản test riêng cho Zalo, Instagram, TikTok, X?" (có/không).

### F-P01. Lời khẳng "không mục nào chặn P0–P3" là sai
- Severity: P1
- Lens: prerequisite
- Anchor: dòng 1230 của plan — "không mục nào chặn việc bắt đầu P0–P3."
- Vấn đề: Sai. Tại mục "Cần quyết định", #1 trần riêng/chung và #8 hạng bị hạ nâng lại khi nào thay đổi cốt lõi U13/U15 (P3); #11 hướng UI "lịch bloc" thay đổi U12 (P2); #5/#9 ảnh hưởng đường chụp bằng chứng của P0/P1. Khai không có gì chặn sẽ dẫn team code U12/U13/U15 trước khi có đáp án Justin.
- Sửa: Thay dòng 1230 bằng: "Các mục #1, #5, #7, #8, #9, #10, #11 chặn P2–P3 (phải hỏi Justin trước khi code U12/U13/U15); chỉ #2, #3, #4, #6 chặn sau (P4)."

### F-P02. Quyết định chụp màn hình bị để vãn, ảnh hưởng bằng chứng P0/P1
- Severity: P1
- Lens: prerequisite
- Anchor: dòng 441 của plan — "Thử sớm quyền chụp (KTD9)"
- Vấn đề: Nếu `captureVisibleTab` không chạy được trên tab không focus, mọi lượt posted sẽ proofMissing; Cổng P1 yêu cầu zip có ảnh, Cổng P4 yêu cầu ảnh thật. Kế hoạch chỉ nói "hỏi ngay ở P0" mà không định đáp án, chờ vãn cứ chờ.
- Sửa: cần Justin quyết: "Nếu chụp màn hình không được trên tab không focus, chấp nhận chạy đăng ở cửa sổ Chrome riêng và không chạm máy đó trong lúc chạy?" (có/không).

### F-T01. R3 trạng thái rỗng khi quét 0 nơi không có test tự động
- Severity: P2
- Lens: traceability
- Anchor: dòng 57 của plan — "Quét ra 0 nơi thì hiện trạng thái rỗng có hướng dẫn"
- Vấn đề: R3 bắt buộc màn hình rỗng có hướng dẫn, nhưng test scenarios của U11/U12 không bao gồm việc render trạng thái này; chỉ có dữ liệu mẫu demo (không phải test tự động). Trường hợp thực tế của chính tài khoản người dùng (không có nhóm, theo KD6) chưa được kiểm chứng.
- Sửa: Thêm test scenario vào U12: "Quét trả 0 → màn hình Nơi đăng hiện trạng thái rỗng kèm hướng dẫn tham gia nhóm rồi quét lại."

### F-T02. R16 cấm sửa bằng chứng nhưng không có test khẳng định
- Severity: P2
- Lens: traceability
- Anchor: dòng 70 của plan — "UI không cho sửa tay link bài hay ảnh chụp"
- Vấn đề: R16 cấm sửa bằng chứng trong UI, nhưng không test nào khẳng định không có control sửa link bài/ảnh; chỉ có mô tả mô tả. Rủi ro: sau này dev thêm input sửa thì vi phạm R16 mà không phát hiện.
- Sửa: Thêm test scenario U8/U12: "Màn hình Nghiệm thu không có control cho phép người dùng sửa link bài hoặc ảnh chụp" (có thể kiểm bằng grep `panel.js` không gán `postUrl`/`proofImage` từ input người dùng).

### F-T03. Đường đánh thức alarm theo R12 không có test tự động
- Severity: P2
- Lens: traceability
- Anchor: dòng 968 của plan — "Phần SW chỉ kiểm tra tay."
- Vấn đề: R12 yêu cầu đánh thức bằng `chrome.alarms`, nhưng U14 không có test tự động cho SW (`onAlarm`, `onStartup`, `onInstalled`, `nextWakeAt`). Lịch chạy qua nhiều ngày có thể kẹt mà không phát hiện sớm.
- Sửa: Thêm `test/alarms.test.js`: kiểm `nextWakeAt` trả slot kế tiếp / 07:00 hôm sau, tạo alarm khi `onStartup` / `onInstalled`, xử lý `onAlarm` mở panel.

### F-T04. Lệnh kiểm UI dẫn đường cứng máy ADMIN, không chạy được trong repo/CI
- Severity: P2
- Lens: traceability
- Anchor: dòng 893 của plan — "node C:\Users\ADMIN\.claude\skills\hallmark\scripts\sloplint.mjs"
- Vấn đề: Verification Contract và Kiểm UI dẫn lệnh chạy sloplint/lint/inspect theo đường dẫn cứng của máy ADMIN, không tồn tại trong repo/CI; tiêu chí "0 FAIL" không thể xác thực bởi người khác hay CI.
- Sửa: Thay bằng lệnh chạy từ thư mục repo (đưa scripts kiểm UI vào repo, ví dụ `node scripts/sloplint.mjs --scope app --render`) hoặc đánh dấu rõ là kiểm thủ công trên máy phát triển.

### F-E02. Trần Zalo 10/3/1 ngày cứng số mặc dù thiết kế tự đánh là thận trọng
- Severity: P2
- Lens: evidence
- Anchor: dòng 65 của plan — "Zalo: 10/ngày, 3/giờ, cooldown 1 ngày mỗi nhóm"
- Vấn đề: Design spec §8.5 tự nói "Zalo chưa có số liệu an toàn … bản đầu dùng trần thận trọng … Hiệu chỉnh sau"; kế hoạch cứng vào R11 mà không nhãn thử nghiệm.
- Sửa: Bổ sung sau Zalo trong R11: "(số Zalo chưa có nguồn, coi là thử nghiệm, hiệu chỉnh sau log chạy theo 03 §5.4)".

### F-E04. Chất lượng JPEG 80 không có tính toán dung lượng
- Severity: P2
- Lens: evidence
- Anchor: dòng 182 của plan — "Chụp ở định dạng JPEG chất lượng 80 để 50 ảnh không làm zip quá nặng."
- Vấn đề: Không có tính toán dung lượng hay nguồn cho con số 80; ước lượng được trình bày như quyết định. Nếu ảnh lớn, zip có thể quá nặng để gửi bộ phận check.
- Sửa: Thêm "(ước lượng chưa có số liệu, xác nhận lại sau spike U5)" vào KTD6; hoặc cần Justin quyết: "Chấp nhận JPEG 80% làm mặc định chụp bằng chứng trước khi có dữ liệu kích thước thực?" (có/không).

### F-E05. Chờ 2–3 giây trước khi chụp và ngưỡng ảnh trống chưa có số
- Severity: P2
- Lens: evidence
- Anchor: dòng 537 của plan — "sau `posted` thì focus cửa sổ và tab, chờ 2–3 giây cho bài hiện ra"
- Vấn đề: 2–3 giây là conjecture; ngưỡng `isBlankCapture` "chốt khi làm, dựa trên ảnh thật của spike" chưa có. Nếu feed chưa render, ảnh trống → proofMissing, mất bằng chứng.
- Sửa: Thêm bước đo thời gian render bài thật vào U5/U6 và chốt ngưỡng `isBlankCapture` trước U8.

### F-C05. Một profile = một tài khoản (design spec) bị KTD21 vi phạm
- Severity: P2
- Lens: contradiction
- Anchor: dòng 1239 của plan — "Cổng cần khoảng 12 group FB của người cho mượn tài khoản và khoảng 10 nhóm Zalo của tài khoản test"
- Vấn đề: Design spec §5 (dòng 51) và 04 §D2 khẳng định "Một Chrome profile = một tài khoản"; KTD21 đăng 5 mạng với các tài khoản test khác nhau trong cùng profile test → cookie/storage chung, rủi ro khoá dây chuyền mà kế hoạch không giải quyết.
- Sửa: cần Justin quyết: "Mỗi mạng test (Instagram, TikTok, X, Zalo) dùng riêng một Chrome profile, hay chấp nhận chung profile và rủi ro khoá dây chuyền?" (riêng profile / chung profile).

### F-C06. Công thức shortfall của U13 không rõ "còn lại mỗi nơi"
- Severity: P2
- Lens: contradiction
- Anchor: dòng 920 của plan — "shortfall = max(0, targetCount − Σ min(maxPerDestination, còn lại mỗi nơi))"
- Vấn đề: "còn lại mỗi nơi" không định nghĩa rõ (là maxPerDestination hay maxPerDestination − số lượt đã đăng?). Nếu dùng maxPerDestination, nơi chưa đăng vẫn được đếm đầy đủ sức chứa, báo thiếu nơi không chính xác.
- Sửa: Định nghĩa lại: `shortfall = max(0, targetCount − Σ (maxPerDestination − số lượt posted của nơi))`, tính bằng hàm đếm từ `attempts` (không dùng `safe:day:`).

### F-C07. Bản ghi Attempt của kế hoạch khác thiết kế spec §8.2
- Severity: P2
- Lens: contradiction
- Anchor: dòng 600 của plan — "`accountLabel`, `network`, `destinationName`, `destinationUrl`, `proofMissing`, `proofId`, `proofSha256`, ..."
- Vấn đề: Design spec §8.2 định nghĩa Attempt có `postedAt`, `errorCode`, `errorText`; kế hoạch bỏ hai trường này mà không ghi nhận lý do, thêm `proofSha256`, `ticketNo`. Thiết kế và code không khớp.
- Sửa: Bổ sung U7: "Giữ thêm `postedAt` và `errorCode` theo thiết kế §8.2; `proofSha256` và `ticketNo` là bổ sung của kế hoạch này."

### F-S02. Không có văn bản ToS/cảnh báo rủi ro cho tài khoản mượn
- Severity: P2
- Lens: scope
- Anchor: dòng 83 của plan — "mượn tài khoản Facebook của người khác để test (người dùng nói ngày 2026-11-10)"
- Vấn đề: 03 §5.6 yêu cầu ToS + cảnh báo một lần khi bật preset nhanh; kế hoạch không xây gì và không ghi ai chịu rủi khoá tài khoản mượn. Nếu acc mượn bị khoá, không có thỏa thuận rủi ro (03 §1: khách về hợp đồng, nhà phát triển về kinh tế).
- Sửa: Thêm vào Scope Boundaries: "Văn bản ToS và cảnh báo rủi ro khoá tài khoản cho người cho mượn tài khoản (theo 03 §5.6)" hoặc cần Justin quyết: "Yêu cầu bản ToS và cảnh báo rủi ro trước khi dùng tài khoản mượn?" (có/không).

### F-S03. Telemetry tổng hợp bị Deferred vĩnh viễn, không bao giờ xác nhận số trần
- Severity: P2
- Lens: scope
- Anchor: dòng 137 của plan — "Telemetry tổng hợp nhiều tài khoản (03 §5.4). Vòng này chỉ ghi log cục bộ từng run."
- Vấn đề: F-E01/E02/E03 đều là số chưa xác nhận, nhưng telemetry tổng hợp (để có dữ liệu hiệu chỉnh trần) bị Deferred → không bao giờ có số thật để xác nhận an toàn.
- Sửa: Không để telemetry toàn bộ Deferred; tối thiểu giữ log cục bộ từng run theo 03 §5.4 và công việc đọc lại sau 30 ngày.

### F-S04. Màn hình khoá dẫn ảnh trống và kế hoạch chỉ khuyên "không khoá màn hình"
- Severity: P2
- Lens: scope
- Anchor: dòng 1158 của plan — "Màn hình khoá thì ảnh chụp ra trống và lượt bị tính thiếu ảnh."
- Vấn đề: Cổng P4 phụ thuộc ảnh thật nhưng kế hoạch chỉ khuyên "máy không khoá màn hình, Chrome không bị thu nhỏ", không có khắc phục (chụp lại sau mở khóa). Lượt đăng thật có thể bị đánh thiếu ảnh vì môi trường, không phải do bài.
- Sửa: Thêm U5: "Nếu bị khóa màn hình giữa lần chụp, chụp lại sau khi cửa sổ về focus và mở khóa; không coi lượt đã đăng là thiếu ảnh trước khi đã thử lại."

### F-L01. "(lỗi E)" còn tồn tại trong Deferred trong khi đề xuất sửa đã đánh confidence 100
- Severity: P3
- Lens: language
- Anchor: dòng 135 của plan — "`confirmWindowSec` được gửi xuống content script mà không ai đọc (lỗi E)."
- Vấn đề: Cùng nội dung được nhắc lại ở "Đề xuất sửa chưa áp" (dòng 1281–1283) với mức confidence 100, nhưng bản Deferred (dòng 135) vẫn giữ "(lỗi E)"; người đọc Product Contract không biết lỗi E là gì.
- Sửa: Thay dòng 135 bằng: "`confirmWindowSec` được gửi xuống content script mà không ai đọc (mã nội bộ, chưa ghi rõ)."

### F-L02. Lẫn thuật ngữ Anh không cần thiết (spike, fixture, lease)
- Severity: P3
- Lens: language
- Anchor: dòng 1018 của plan — "### U16. Spike DOM chỉ đọc: TikTok, Instagram, X (P4)"
- Vấn đề: Kế hoạch tiếng Việt vẫn lẫn "spike", "fixture", "lease" (xem U5 hàng đợi chụp, KTD17) khi đã có tương đương ("thử nghiệm nhanh", "mẫu dữ liệu", "khóa dùng"), vi phạm nguyên tiếng Việt có dấu nhất quán trên toàn plan.
- Sửa: Thay "spike" → "thử nghiệm nhanh", "fixture" → "mẫu dữ liệu", "lease" → "khóa dùng"; giữ các mã code và thuật đã chốt (`clickedAt`, commit point) không đổi.

### F-L03. Cấm quyền trùng nguyên văn ở Goal Capsule và R15
- Severity: P3
- Lens: language
- Anchor: dòng 23 của plan — "Không thêm quyền `cookies`, `webRequest`, `debugger`, `<all_urls>`."
- Vấn đề: Câu này tồn tại trùng nguyên văn ở Goal Capsule (dòng 23) và R15 (dòng 69); không sai nhưng lặp lại, dễ dẫn đến hai bản cập nhật khác nhau sau này.
- Sửa: Giữ tại R15 (dòng 69); xóa dòng 23 trong Goal Capsule hoặc thay bằng "Xem ràng buộc quyền tại R15."

---

## Bảng đếm theo severity

| Severity | Số lượng | Ý nghĩa |
|---|---|---|
| P0 | 1 | Sai, phải sửa trước khi code |
| P1 | 8 | Phải sửa |
| P2 | 13 | Nên sửa |
| P3 | 3 | Dọn dẹp |
| Tổng | 25 | — |

## Danh sách câu hỏi chặn (cần Justin quyết, nhị phân có/không)

1. Chấp nhận thay đổi P4 từ "máy chủ/API chính thức" (design spec §9) sang "thêm TikTok, Instagram, X qua DOM và viết lại UI"? → chặn P0.
2. Chấp nhận giữ trần theo hạng/mạng (R11, R13, KTD10) và hiểu "không giới hạn" là chỉ danh sách mạng mở? → chặn P1.
3. Trần 20/ngày của preset safe áp cho mỗi mạng hay cho toàn bộ chiến dịch? → chặn P1.
4. Chủ tài khoản mượn đã đồng ý với khoảng 12 group FB và có tài khoản test riêng cho Zalo, Instagram, TikTok, X? → chặn P1 (cổng P4).
5. Nếu chụp màn hình không được trên tab không focus, chấp nhận chạy đăng ở cửa sổ Chrome riêng và không chạm máy đó trong lúc chạy? → chặn P1 (bằng chứng P0/P1).
6. Áp tạm 1 bài/ngày cho Instagram, TikTok, X sau P4 mà chưa có số liệu thật? → chặn P4 (không chặn P0–P3).
7. Mỗi mạng test dùng riêng một Chrome profile, hay chấp nhận chung profile và rủi ro khoá dây chuyền? → chặn P2.
8. Yêu cầu bản ToS và cảnh báo rủi ro trước khi dùng tài khoản mượn? → chặn P2.
9. Chấp nhận JPEG 80% làm mặc định chụp bằng chứng trước khi có dữ liệu kích thước thực? → chặn P2.
10. Giữ mặc định hạng tài khoản T1 (không đổi thành T0, tương phản với quyết định đã chốt KD7)? → chặn P3.
11. Xem demo U12 hướng "lịch bloc" trước khi viết code U12? → chặn P2.

Các mục #1, #5, #7, #8, #9, #10, #11 thực sự chặn tiến độ P2–P3 và phải được trả lời trước khi code các unit liên quan. Mục #6, #4 chỉ chặn cổng P4.

---
*Kết quả kiểm tra chỉ đọc, không sửa bất kỳ file nào. Mọi con số kỹ thuật/chính sách trong plan không có nguồn hoặc không nhãn ước lượng đã được liệt kê ở lăng kính evidence (F-E01, F-E02, F-E03, F-E04, F-E05).*
