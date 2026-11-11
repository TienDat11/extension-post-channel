# Product

<!-- impeccable:product-schema 1 -->

> Nguồn: phát biểu của chủ dự án trong phiên lập kế hoạch 2026-11-10, cùng `docs/discovery/00–05` và plan `docs/plans/2026-11-10-1144-feat-dang-bai-da-kenh-nghiem-thu-plan.md`. Dòng có `[suy luận]` chưa được chủ dự án xác nhận.

## Platform

web

(Chrome extension MV3. Trang chính là `src/ui/panel.html`, mở trong một tab Chrome. Có popup nhỏ `src/ui/popup.html`.)

## Users

- **Người dùng chính:** sale và marketer, hiện tại là sale bất động sản. Họ đăng từ **tài khoản làm việc thật** của mình, không dùng acc clone.
- **Việc cần làm:** đăng lại một content khoảng 50 lần lên các nơi đăng (group Facebook, tường, nhóm Zalo, và sau này TikTok, Instagram, X) để đủ số bài nghiệm thu. Đủ nghiệm thu thì mới nhận lương.
- **Người dùng phụ:** bộ phận kiểm tra/nghiệm thu. Họ nhận một file tổng hợp gồm link bài và ảnh chụp, rồi đối chiếu.
- `[suy luận]` Sale dùng laptop ở văn phòng hoặc ngoài đường, song song với Zalo trên điện thoại. Họ không rành kỹ thuật và muốn bấm ít nhất có thể.

## Product Purpose

Bỏ phần việc tốn công nhất: mở từng nhóm, dán bài, chờ, chụp màn hình, ghi link. Người dùng quét mọi nơi tài khoản có thể đăng, tick các chỗ muốn đăng và bấm một lần. Tool đăng dần theo nhịp an toàn qua nhiều ngày và gom bằng chứng thành một gói nghiệm thu.

Thành công nghĩa là đủ số bài nghiệm thu, có bằng chứng thật, và tài khoản không bị khoá.

## Positioning

- Chạy **trong phiên đã đăng nhập sẵn của chính người dùng** trên Chrome. Không có server, không lưu mật khẩu, không gửi dữ liệu ra ngoài.
- Đăng được vào **group Facebook và nhóm Zalo**, hai kênh mà công cụ dùng API chính thức (ví dụ Postiz) không có.
- Đầu ra là **gói nghiệm thu**: link và ảnh chụp thật của từng lượt, cho một bộ phận khác kiểm tra. Đây không phải lịch đăng bài.

## Operating Context

- Một content gồm chữ, hashtag và hình hoặc video. Có thể dùng spintax để tạo biến thể.
- Một chiến dịch có các thông số: mục tiêu khoảng 50 bài, số lần tối đa mỗi nơi, khoảng cách giữa hai lần lặp, và tier tài khoản.
- Giới hạn theo ngày và giờ được tính bằng min(preset, tier, mạng).
- Chiến dịch kéo dài nhiều ngày. Lượt đăng có thể ở trạng thái `unknown` (đã bấm Đăng nhưng không xác minh được), và trạng thái này không được tự retry.
- Kết quả xuất ra một file ZIP gồm ảnh chụp, CSV/HTML có link, và trạng thái từng lượt.

## Capabilities and Constraints

- **Quyền extension:** không bao giờ thêm `cookies`, `webRequest`, `debugger`, `<all_urls>`. Mỗi mạng có `host_permissions` riêng, ghi rõ ràng.
- **CSP MV3:** không tải font, CDN hay script từ xa. Mọi tài nguyên phải đóng gói local.
- Không tự retry sau thời điểm đã bấm Đăng. Không làm giả bằng chứng. Không có giới hạn nào cao hơn preset an toàn.
- Giao diện bằng tiếng Việt, nên cần font hiển thị đúng dấu tiếng Việt.
- Engine đăng chạy trong tab panel, dùng Web Locks để chỉ một tab chạy engine.
- **Chưa quyết:** tên thương mại khi bán lại cho ngành khác.

## Brand Commitments

Chưa có. Tên hiện tại "FB Group Poster" chỉ là tên tạm và không còn đúng khi đã có nhiều kênh.

## Evidence on Hand

- Chưa có khách hàng, testimonial hay số liệu sử dụng. Không được bịa.
- Bằng chứng nghiệm thu chỉ được lấy từ lượt đăng thật.

## Product Principles

1. **Một lần bấm, nhiều nơi đăng.** Việc lặp lại thuộc về tool. Quyết định (đăng gì, đăng ở đâu) thuộc về người dùng.
2. **Trung thực về trạng thái.** "Đã đăng", "chờ duyệt" và "không rõ" là ba trạng thái khác nhau, không được gộp lại cho đẹp số.
3. **An toàn tài khoản đứng trên tốc độ.** Giới hạn là giới hạn, không có nút vượt.
4. **Bằng chứng kiểm được.** Mọi thứ tính vào nghiệm thu phải có link hoặc ảnh thật.
5. **Không gửi dữ liệu đi đâu.** Mọi thứ nằm trên máy người dùng.

## Accessibility & Inclusion

Tiếng Việt có dấu đầy đủ. Dùng được hoàn toàn bằng bàn phím. Trạng thái không chỉ được thể hiện bằng màu: luôn có chữ hoặc icon đi kèm.
