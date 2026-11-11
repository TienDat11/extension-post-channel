# EGM Findings — Khả thi & An toàn (Goldfish, chỉ đọc)

Repo: `D:\extension` — Chrome MV3, JS thuần, không build, test bằng `node --test test/*.js`.
Plan bị critiques: `docs/plans/2026-11-10-1144-feat-dang-bai-da-kenh-nghiem-thu-plan.md` (1283 dòng).
Phương pháp: chỉ đọc plan + `src/`, `manifest.json`, `package.json`, `test/`. Không sửa code, không cài package, không chạy test.
`[chưa xác minh]` = feit chưa đọc được từ repo hoặc tài liệu kèm, cần spike hoặc xem tài liệu Chrome.

Tổng kết: **17 findings** — 5 P0, 5 P1, 4 P2, 3 P3. Mọi P0/P1 nêu điều kiện kích hoạt và hậu quả người dùng thấy.

---

### F-F01. Lock Web Locks gắn theo tab panel; `navigator.locks` trong SW chưa xác nhận
- Severity: P0
- Cơ chế bị tấn công: KTD17 (plan ~241–247): `navigator.locks.request('fbq-engine', {ifAvailable: true})`, giữ lock bằng promise không bao giờ resolve; "Chrome tự nhả lock khi trang đóng, crash hoặc bị discard"; alarm SW gọi `navigator.locks.query()` (~247, ~354).
- Vì sao hỏng: [chưa xác minh] `navigator.locks` có trong Chrome MV3 service worker không; nếu không có, `sw.js` alarm ném exception → panel không mở lại sau khi Chrome restart → chiến dịch nhiều ngày chết im. Điều kiện kích hoạt: tab panel bị đóng giữa lượt `clicking`/`verifying` (sau khi content runner đã nhận `fbq:submit` nhưng trước khi panel lưu kết quả). Lock nhả; nếu không còn tab panel nào, trạng thái lưu là `running` và lượt giữa chừng bị mất tracking. Khi khởi động lại, attempt cuối có thể vẫn là `queued` (lưu `saveRun` debounce 200 ms, `engine.js:255–261`) → engine đăng lại cùng bài. Hậu quả người dùng thấy: bài đăng hai lần trên cùng group, vi phạm trực tiếp R8 ("Sau commit point không bao giờ tự retry").
- Sửa: spike xác nhận `navigator.locks` trong SW trước U3; nếu thiếu, alarm chỉ mở panel và để lock của panel quyết định. Bổ sung ghi `state='clicking'` + `clickedAt` ngay-lập-tắc trước khi activate tab gửi submit, và `recoverOnStart` theo KTD3.

### F-F02. Commit point không tồn tại trong code thực
- Severity: P0
- Cơ chế bị tấn công: KTD3 (plan 156–164): "Ghi `state='clicking'` và `clickedAt` rồi `await` lệnh ghi xong. Sau đó mới gửi"; `send()` hết giờ sau commit phải trả `no_response` → `unknown`. Code thực `engine.js`: `step2` (286–339) gửi `fbq:submit` (`v: 1` ở 301) trước khi có `clickedAt`; `failItem` (264–284) không đọc `clickedAt`; không có mã `no_response`; không có trạng thái `verifying`.
- Vì sao hỏng: Điều kiện kích hoạt: panel bị đóng/crash sau khi composer đã điền và `fbq:submit` đã đi, trước khi panel lưu kết quả. Khởi động lại: attempt cuối là `countdown`/`filling` (chưa `clickedAt`) → `recoverOnStart` (khi có) đưa về `queued` → engine đăng lại. Hậu quả người dùng thấy: bài trùng lubl на cùng nhóm; cổng P0 ("không retry sau khi đã bấm Đăng") không thể qua.
- Sửa: triển khai `beforeSubmit` ghi `clicking`+`clickedAt`, await callback `chrome.storage.local.set` (không qua `saveRun` debounce) trước `fbq:submit`; `send()` hết giờ sau commit → `no_response` → `unknown`; `decideFailure(item)` có `clickedAt` → luôn `unknown`; `recoverOnStart`: `clicking`/`verifying` → `unknown`, `navigating`/`filling` → `queued` (chưa bấm = an toàn retry); khối `catch` cuối `step2` không đụng lượt đã `posted`. Tách module thuần `src/core/transitions.js` để test `node --test`.

### F-F03. `rate_limited` dừng toàn bộ run và để lượt kẹt `countdown` (lỗi D)
- Severity: P0
- Cơ chế bị tấn công: Problem Frame D ("lượt đang chạy bị kẹt ở trạng thái `countdown` và bị bỏ qua khi chạy tiếp"); KTD3 plan ~160–161; `engine.js` ~312–314 (`if (code === 'rate_limited') { finish('stopped'); return; }`).
- Vì sao hỏng: Điều kiện kích hoạt: content runner trả `rate_limited` (FB giới hạn tần suất / checkpoint). `finish('stopped')` dừng toàn bộ hàng đợi ngay lập tức; lượt bị lỡ ở `countdown`, không bị gán `unknown`, không được xử lý khi chạy tiếp. Hậu quả người dùng thấy: chiến dịch dừng giữa chừng, hàng loạt lượt không đăng được dù trần chưa hết, và không biết lượt kẹt đã lên FB hay chưa.
- Sửa: theo KTD3 — trước commit point: `rate_limited` → `queued`, run dừng/tạm dừng với lý do "bị giới hạn"; sau commit point → `unknown`, ghi log, run dừng, không bao giờ retry.

### F-F04. Protocol version `v` chưa nâng; runner chưa kiểm tra phiên bản/mạng → đăng sai loại sau cập nhật
- Severity: P0
- Cơ chế bị tấn công: KTD12 (plan 210–218): `protocol.js:5` hiện `V = 1`; engine hard-code `v: 1` ở probe (`engine.js:137`), fill (`engine.js:365`), submit (`engine.js:301`); `runner.js:16–18` chỉ trả `{url, key}`, không đọc `msg.v`; `runner.js:59` phân nhánh chỉ theo `isTimeline`. Chrome không nạp lại content script vào tab đã mở khi extension cập nhật.
- Vì sao hỏng: Điều kiện kích hoạt: nâng cấp extension khi còn tab FB đã mở; engine mới nói với runner cũ. Hậu quả người dùng thấy: runner cũ không chịu `version_mismatch` và chỉ nhìn `isTimeline` → có thể đăng bài timeline nhầm thành bài group (hoặc ngược lại) — đăng nhầm kênh, rủi ro spam/riêng tư, vi phạm R1 (bài thật phải lên đúng group test).
- Sửa: nâng `V` lên 2 (`protocol.js`); engine đọc `v` từ `P.V` thay vì số viết cứng (`engine.js:145`/:301/:379 theo plan); runner từ chối `v` lệch bằng `version_mismatch` và `network` không khớp bằng `network_mismatch`; PING trước mỗi `fbq:fill`; lệch → reload tab → PING lại; vẫn lệch → `failed` (trước commit point). U10 phải viết `registry.js` và dispatch theo `msg.network`.

### F-F05. `captureVisibleTab` chưa rõ quyền và chụp "tab đang hiện của cửa sổ", không theo tabId
- Severity: P1
- Cơ chế bị tấn công: KTD9 (plan 192–196): manifest chỉ có host `https://*.facebook.com/*`; `<all_urls>` bị cấm; `activeTab` cần tương tác người dùng (chạy tự động không có); U5 plan ~537, ~546 ("`captureVisibleTab` chụp tab đang hiện của cửa sổ, không chụp theo tabId"); spike U1 bước 7 (plan ~441).
- Vì sao hỏng: Điều kiện kích hoạt: (a) spike gọi `captureVisibleTab` từ panel trên tab facebook.com bị Chrome từ chối (thiếu quyền cho origin) → tool không chụp được ảnh bằng chứng. (b) Tab đăng và panel ở cửa sổ khác, gọi không truyền `windowId` → chụp nhầm tab panel/tab khác. (c) Cửa sổ không focus hoặc màn hình khoá → ảnh đen/trống. Hậu quả người dùng thấy: mỗi lượt `posted` gắn `proofMissing` (KTD14) hoặc lưu ảnh không liên quan → file nghiệm thu thiếu ảnh, bộ phận check không chấp nhận (R5/R6).
- Sửa: spike ngay P0 (U1 bước 7) ghi lỗi Chrome chính xác; nếu thiếu quyền, hỏi người dùng trước khi thêm (KTD9, KTD18), không tự thêm `<all_urls>`; bắt buộc truyền `windowId` của cửa sổ chứa tab đăng và đọc URL tab ngay trước khi chụp; URL lệch `destinationUrl` → `proofMissing` (U5 bước 5–6).

### F-F06. IndexedDB + storage.local không có giao dịch chung; crash giữa hai lệnh ghi để ảnh mồ côi / attempt trỏ ảnh không có
- Severity: P1
- Cơ chế bị tấn công: KTD6 (plan 174–182): "Thứ tự ghi cố định: 1) `putProof` và chờ `oncomplete`. 2) Cập nhật attempt với `proofId` và `proofSha256`." `reconcileProofs()` đề xuất ở U5 bước 7 nhưng mục "Đề xuất chưa áp" (plan ~1275–1277) khuyên BỎ nó — mâu thuẫn nội bộ plan.
- Vì sao hỏng: Điều kiện kích hoạt: panel bị đóng / tab bị discard trong khoảnh kỳ giữa `putProof` xong và `storage.set` attempt xong (khoảng mili–giây). Hậu quả người dùng thấy: nếu bỏ `reconcileProofs` — ảnh mồ côi ở IndexedDB vĩnh viễn (không gắn attempt) và attempt `posted` không có ảnh → CSV ghi "thiếu ảnh", mất bằng chứng cho lượt đó. Nếu giữ `reconcileProofs` — ảnh mồ côi `proof:<attemptId>` có thể gán nhầm nếu `attemptId` bị tái dùng (plan không định rõ `attemptId` vs `ticketNo`).
- Sửa: thiết kế nguyên tử hơn: ghi attempt trước với `proofId` + `proofPending=true`; rồi `putProof` chờ `oncomplete`; rồi đánh `proofPending=false`; crash giữa → attempt biết đang chờ ảnh, sau N giờ nếu không có ảnh thì `proofMissing`. Giữ `reconcileProofs` cho đầu dòng. Đo spike: khoảng thời gian giữa hai lệnh ghi và hành vi khi đóng tab giữa chừng. [chưa xác minh] thời gian tối thiểu giữa `oncomplete` và `storage.set`.

### F-F07. `attempts` là mảng đọc–sửa–ghi qua hàng đợi duy nhất, nhưng `src/core/attempts.js` chưa tồn tại và lease có thể hỏng
- Severity: P1
- Cơ chế bị tấn công: KTD7 (plan 183–186): `attempts.js` MỚI (glob xác nhận file không tồn tại trong repo); hàng đợi promise duy nhất, chỉ engine giữ lease được ghi. Nếu KTD17 lock thất bại (xem F-F01), hai tab panel chạy độc lập → hai hàng đợi RMW → lost update. `start()` hiện chỉ kiểm tra `status==='running'` bằng đọc-ghi (`engine.js:430–440`, plan ~246 xác nhận lỗ này).
- Vì sao hỏng: Điều kiện kích hoạt: hai tab panel cùng mở và cùng try khởi động run. Hậu quả người dùng thấy: một lần ghi đè lên lần khác → mất lượt, `ticketNo` trùng hoặc không có, file nghiệm thu thiếu dòng / số phiếu đối chiếu không được (R6, và quy tắc số phiếu `#027/50` ở U12).
- Sửa: viết `src/core/attempts.js` theo KTD7 (`create`, `update`, `listByCampaign`, `listAll` qua `store.js`, hàng đợi duy nhất); mỗi lệnh ghi kiểm tra lease; spike hai tab panel cùng chạy (verification U3) để chứng thực lock.

### F-F08. ZIP tự viết (STORE+CRC32, cờ UTF-8 bit 11, Blob URL) chưa có code và chưa kiểm tra round-trip tên tiếng Việt
- Severity: P2
- Cơ chế bị tấn công: KTD8 (plan 187–191): `src/core/zip.js` MỚI; tải về qua Blob URL + `<a download>` (không cần `downloads`); ảnh JPEG q80; tên `anh/<STT>-<tên>.jpg`.
- Vì sao hỏng: Điều kiện kích hoạt: batch 20–30 lượt × ảnh → zip hàng chục MB; tên file tiếng Việt. Hậu quả người dùng thấy: nếu cờ bit 11 chỉ set ở local file header nhưng không ở central directory (lỗi thường gặp) hoặc CRC32 sai → Windows Explorer/7-Zip báo hỏng zip hoặc tên tiếng Việt lỗi font trên máy bộ phận check (máy khác, không mạng) → bằng chứng không mở được, cổng P1/P4 thất bại.
- Sửa: spike round-trip zip trên máy khác (Explorer, 7-Zip, Excel) với tên tiếng Việt ngay U8; ghi cờ bit 11 đồng bộ cả hai header; xem xét DEFLATE cho CSV/HTML; giữ test CRC32 `"123456789"` = `0xCBF43926` đã nêu ở U8.

### F-F09. `test/load.js` chỉ nạp `content_scripts[0].js`; entry content_scripts mới (Zalo, X, IG, TikTok) bị bỏ qua harness
- Severity: P2
- Cơ chế bị tấn công: KTD18 (plan 248–254): `test/load.js:6` `MANIFEST.content_scripts[0].js`. Khi thêm entry Zalo (U11) và 3 entry P4, `load.js` không nạp provider mới; `registry.js` chưa có.
- Vì sao hỏng: Điều kiện kích hoạt: sau U11 thêm entry content_scripts thứ hai cho `chat.zalo.me`. Hậu quả người dùng thấy: provider Zalo không đăng ký vào `FBQ.providers` → engine gửi `network: 'zalo_group'` → `provider_not_found` → tất cả lượt Zalo `failed` mà không rõ lý do; test suites không phát hiện sớm.
- Sửa: sửa `test/load.js` duyệt mọi entry `content_scripts[*].js` (KTD18); viết `registry.js` và đăng ký provider trong U10; PING trả `{v, providers}` (`runner.js` hiện chưa làm — plan ~693).

### F-F10. Trần hiện chỉ theo ngày chung `safe:day:<ngày>` — lượt FB ăn trần Zalo, ETA sai
- Severity: P2 (P1 nếu trần được coi là ràng buộc an toàn cốt lõi)
- Cơ chế bị tấn công: KTD10 (plan 197–203), KTD11 (plan 204–209), U13 (plan 909–944); code hiện: `remainingToday(dayRecord, dailyCap)` (`safety.js:82`), `incrementDay()` (`engine.js:167`) ghi `safe:day:<ngày>` cho TẤT CẢ mạng, `start()` (`engine.js:429`) đọc số đó để chặn; `buildQueue` (`queue.js`) `limit = min(maxPerRun, dailyCap - dayCount)` dùng `dailyCap` chung 20. `campaign.js`/`plan(...)`/`effectiveCaps`/`countByNetwork` chưa tồn tại.
- Vì sao hỏng: Điều kiện kích hoạt: chọn 15 nhóm FB + 12 nhóm Zalo, hạng T1, preset `safe`. Theo KTD10 trần riêng rẽ là FB 12 + Zalo 10 (+ IG/TikTok/X 1 = 25); code dùng cap chung 20/ngày. Hậu quả người dùng thấy: ETA hẹn sai (plan hẹn 50 lượt FB T1 = ngày thứ 5, code tính 3 ngày) hoặc vi phạm trần an toàn nếu ép; "Xong dự kiến: ngày X" không đúng và trần từng mạng không được đảm bảo.
- Sửa: viết `countByNetwork(attempts, network, now)` và `effectiveCaps(preset, tier, network)` (U13/U15); xóa mọi quyết định chạy/dừng dựa trên `safe:day:` (plan ~944); theo dõi trần/ngày và trần/giờ riêng theo mạng, cửa sổ 07:00–22:00.

### F-F11. `chrome.alarms` không đánh thức máy ngủ; alarm mất khi Chrome tắt hẳn
- Severity: P3
- Cơ chế bị tấn công: U14 (plan 946–974): SW `onStartup`/`onInstalled` tạo alarm `when = max(nextWakeAt, now+30s)`; onAlarm mở panel.
- Vì sao hỏng: Điều kiện kích hoạt: máy nhập ngủ hoặc Chrome tắt trong khung giờ đăng (07:00–22:00). Hậu quả người dùng thấy: alarm bị chậm/bỏ → các lượt buổi tối không chạy đến sáng hôm sau; không có đăng bù (R12) → batch 20–30 có thể không đủ trong ngày được hẹn; ngày xong dự kiến dịch. Khi Chrome mở lại, `onStartup` tạo alarm mới và lịch tính lại từ `attempts` → không mất slot, chỉ dịch thời gian.
- Sửa: spike hành vi alarm khi máy ngủ/restart; ghi vào màn hình U12/U14 báo rủi ro khi máy ngủ; công nhận rủi ro này trong tài liệu vận hành.

### F-F12. Timer Worker hy vọng không bị bóp timer tab ẩn — `[chưa xác minh]`
- Severity: P3
- Cơ chế bị tấn công: U14 (plan 956–958): `src/ui/timer-worker.js` MỚI thay `sleep()` (`engine.js:43`) và timeout `send()` (`engine.js:75`); lý do nêu: Chrome bóp `setTimeout` của tab ẩn xuống ~1 phút/5 phút sau vài phút ẩn.
- Vì sao hỏng: Điều kiện kích hoạt: sale chuyển sang tab khác/làm việc khác trong khi engine chờ giữa các lượt (khoảng 90–240s/lượt). Hậu quả người dùng thấy: nếu Worker cũng bị Chrome throttling như tab ẩn, lý do loại bỏ `setTimeout` mất căn cứ; các chờ vài giây trở thành vài phút → `send()` timeout 30s/120s → lượt `failed`/`unknown` lạ, tốc độ đăng chậm hơn hẹn.
- Sửa: spike đo độ trễ `setTimeout` trong Worker và tab panel ẩn 6 phút trước U14; nếu Worker cũng bị bóp, dựa vào `chrome.alarms` (SW) cho sự kiện ngày-giờ và chấp nhận chờ rough trong engine.

### F-F13. Ảnh chụp chứa PII người khác; zip gửi ra ngoài mang rủi ro dữ liệu cá nhân
- Severity: P2
- Cơ chế bị tấn công: KTD19 (plan 255–259), R16 (plan dòng 69), U5 bước 9 (Zalo trả `proofRect` cắt khung chat; FB không trả khung → toàn màn hình tab hoặc `proofMissing`).
- Vì sao hỏng: Điều kiện kích hoạt: chụp tab FB group hiển thị tên thành viên, bình luận, avatar → ảnh trong zip là PII của người khác; file zip được sale gửi cho bộ phận check (R6/KD3). Hậu quả người dùng thấy: lỗi chuyên mục dữ liệu cá nhân khi file zip được chia sẻ; nếu FB không có `proofRect` và tool chọn `proofMissing`, mất bằng chứng (R5); nếu chọn toàn màn hình, PII dồn ra ngoài.
- Sửa: U5 bước 9 cho FB: nếu không có `proofRect` → cắt theo heuristic vùng bài đăng gần nhất hoặc chấp nhận `proofMissing`; thêm lưới xem trước ảnh trước khi xuất zip (đề xuất chưa áp, plan ~1269) để sale loại ảnh nhạy cảm; không lưu tên/link người cho mượn vào fixture/tài liệu (KTD19 — đã có).

### F-F14. Mâu thuẫn an toàn vs batch 20–30 bài/ngày trên tài khoản mượn
- Severity: P2
- Cơ chế bị tấn công: KTD20 (plan 260–263): FB12 + Zalo10 + IG1 + TikTok1 + X1 = 25/ngày, giả định 12 group FB + 10 nhóm Zalo; KTD21 (plan 264–271): P4 20–30 bài, phải đếm trước ≥20 nơi, chưa đủ thì dừng; R11 trần T1 12 bài/ngày FB.
- Vì sao hỏng: Điều kiện kích hoạt: tài khoản mượn không đủ 12 group cho phép đăng (KTD16: tài khoản người dùng không có group, mượn của người khác) hoặc chủ tài khoản không đồng ý con số cụ thể. Hậu quả người dùng thấy: nếu ép chạy → vượt trần T1 hoặc đăng lặp nội dung giống nhau vào cùng nhóm → kích hoạt checkpoint Meta, khoá tài khoản mượn (thiệt hại người khác, KTD16). Mâu thuẫn thiết kế: "chậm, rải nhiều ngày" (Goal Capsule) vs "một lần bấm cho ra batch 20–30" (KD9 hiểu là "không giới hạn").
- Sửa: cứng ràng KTD21 — engine không được đặt slot vượt `effectiveCaps`; UI phải báo "thiếu N nơi hoặc tăng số lần mỗi nơi" (R10) và không cho bấm Bắt đầu khi tổng <20; làm rõ "không giới hạn" = danh sách mạng mở, không phải bỏ trần.

### F-F15. Hash lại ảnh khi xuất zip và cờ `pendingApproval` chưa có dấu hiệu DOM ổn định
- Severity: P1
- Cơ chế bị tấn công: U8 (plan): "Khi xuất, tính lại SHA-256 của từng ảnh. Lệch `proofSha256` thì ghi 'ảnh lỗi'..."; đề xuất chưa áp (plan ~1272) khuyên BỎ bước này; U6 (plan): dấu hiệu DOM chờ duyệt `[chưa xác minh]`; nếu không có dấu hiệu ổn định, cờ không bao giờ bật.
- Vì sao hỏng: Điều kiện kích hoạt: bit rot/ổ đĩa hiếm (hash lại) hoặc bài FB chờ duyệt trong thực tế (`pendingApproval`). Hậu quả người dùng thấy: hash lại gây "ảnh lỗi" giả dương → lượt hợp lệ bị đánh dấu hỏng trong file nghiệm thu; `pendingApproval` không bao giờ bật → lượt chờ duyệt được tính là `posted` đầy đủ, CSV sai trạng thái, bộ phận check đánh giá nhầm.
- Sửa: theo đề xuất chưa áp — bỏ bước tính lại hash ở U8, giữ `proofSha256` ghi lúc chụp; U6 spike thật trên FB để xác định dấu hiệu chờ duyệt, nếu không có thì ẩn cột "Chờ duyệt", không đoán (quy tắc U12).

### F-F16. Ô chọn ảnh `panel.html:23` chưa nối; `draft.imageIds` luôn rỗng khi chọn ảnh từ panel (lỗi F)
- Severity: P0
- Cơ chế bị tấn công: KTD4 (plan 165–170): "Ô chọn ảnh trên panel (`panel.html:23`) chưa nối vào đâu. Chỉ có `popup.js` gọi `putAsset`, nhưng popup không được mở." `panel.html:23` là `<input id="post-images">`; toàn bộ `bindAll` của `panel.js` (đã đọc 1–753) không có handler `#post-images`; chỉ có `renderThumbs`/`removeDraftImage`.
- Vì sao hỏng: Điều kiện kích hoạt: sale chọn ảnh từ panel rồi bấm Bắt đầu. Hậu quả người dùng thấy: engine `resolveImages` (`engine.js`) nhận `imageIds` rỗng → `prepareFlow` (`adapter-group.js`) với `images=[]`: `baseThumbs` không được gán (biến `var` trong vòng lặp rỗng → `undefined`) → kiểm cuối `countThumbs() >= baseThumbs + images.length` là `NaN` → timeout 15s → `upload_rejected`. Bài chỉ chữ cũng bị chặn → cổng P0 ("một bài chỉ có chữ cũng lên được") thất bại qua panel. Đây là lỗi A của Problem Frame ("`baseThumbs` không được gán khi không có ảnh").
- Sửa: nối `#post-images` vào `putAsset` + `draft.imageIds` (port từ `popup.js:378–416`); sửa `prepareFlow`: khởi tạo `baseThumbs = countThumbs()` trước vòng ảnh và bỏ chờ thumbnail khi `images.length === 0` (theo U2).

### F-F17. Batch 25 lượt/ngày × 2–5 phút/lượt vừa vặn trong khung 07:00–22:00; X từ chối bài trùng `[chưa xác minh trên web]`
- Severity: P3
- Cơ chế bị tấn công: R18/KD9 (engine chạy tuần tự, một lượt một thời, kết kẽ các mạng); KTD11 (07:00–22:00); KTD22 (X 1 bài/ngày, từ chối bài trùng `[chưa xác minh trên web]`, bỏ lượt `duplicate_text`).
- Vì sao hỏng: Điều kiện kích hoạt: batch 25 lượt trong một ngày. Hậu quả người dùng thấy: 25 lượt × trung bình ~165s (preset `safe` 90–240s) + thao tác DOM/chụp ≈ 60–120 phút — vừa vặn trong khung 15 tiếng, không còn nhiều dịp cho sale dùng máy; `step2` activate tab đăng trộm focus mỗi lượt. Nếu spintax không sinh được văn bản khác cho X → lượt X bị bỏ → không đạt 20 lượt `posted` có ảnh → cổng P4 thất bại.
- Sửa: spike U16 xác nhận DOM X/IG/TikTok và khả năng đăng ảnh TikTok; tính thời gian tối thiểu batch (25 × 120s = 50 phút) và cảnh báo trước khi bấm; yêu cầu spintax khác trước mỗi bài X (U17/KTD22 đã nêu).

---

## Tóm tắt theo severity

| Severity | Số | Mã |
|---|---|---|
| P0 (thiết kế không chạy / mất an toàn) | 5 | F-F01, F-F02, F-F03, F-F04, F-F16 |
| P1 | 5 | F-F05, F-F06, F-F07, F-F10, F-F15 |
| P2 | 4 | F-F08, F-F09, F-F13, F-F14 |
| P3 | 3 | F-F11, F-F12, F-F17 |

## 3 rủi ro chết người nhất

1. **F-F02 + F-F03 (commit point / `rate_limited`)**: code chưa ghi `clickedAt` trước `fbq:submit`, và `rate_limited` dừng toàn bộ run để lượt kẹt `countdown`. Điều kiện kích hoạt là crash/đóng panel giữa lượt đăng hoặc FB báo giới hạn. Hậu quả: đăng trùng (vi phạm R8, cổng P0 chặn) hoặc lượt bị mất vết.
2. **F-F01 (Web Locks trong SW chưa xác nhận)**: nếu `navigator.locks` không có trong MV3 service worker, alarm không bao giờ mở panel lại → chiến dịch nhiều ngày chết im sau restart Chrome. Điều kiện kích hoạt: máy tắt/restart giữa chiến dịch.
3. **F-F05 (captureVisibleTab quyền/tab)**: nếu spike thất bại, mọi lượt `posted` gắn `proofMissing`, file nghiệm thu thiếu ảnh, cổng P1/P4 thất bại. Điều kiện kích hoạt: gọi `captureVisibleTab` đầu tiên từ panel.

## Spike cần làm trước khi code

1. `navigator.locks` trong Chrome MV3 service worker (tài liệu + thử thật) — trước U3/KTD17.
2. `captureVisibleTab` từ panel trên tab facebook.com, có và không focus; ghi lỗi Chrome chính xác — trước U5 (U1 bước 7 đã định).
3. Thử đóng panel ngay sau khi composer đã điền (trước submit), mở lại, kiểm tra lượt không được đăng lại — trước P0 (chứng minh F-F02/F-F03).
4. Độ trễ `setTimeout` trong Worker và tab panel ẩn 6 phút — trước U14/KTD14.
5. Round-trip ZIP tên tiếng Việt trên máy khác (Explorer, 7-Zip, Excel) — trước U8/KTD8.
6. Xác nhận dấu hiệu DOM "chờ duyệt" FB và hành vi X từ chối bài trùng — trước U6/U18 (`[chưa xác minh]`).
