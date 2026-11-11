# Giả thuyết đang neo — Omni-post-channel

**Ngày:** 2026-11-10 · **Trạng thái:** chờ Justin xác nhận trước khi chạy Goldfish review

---

## 1. Giả thuyết (2–3 câu)

Không bán "đăng bài đa kênh" — thứ đó đã bị định giá về 0 ($6/kênh của Buffer, self-host free của Postiz 36 adapter).
Bán **"biến dữ liệu có cấu trúc khách đã có thành bài đăng hợp lệ trên 3–5 kênh có API chính thức, với trạng thái publish đáng tin và một màn hình duy nhất cho người không rành kỹ thuật"**.
Khách đầu tiên: SME/agency Việt Nam đang giữ dữ liệu dạng bảng (sản phẩm, tồn kho, lịch, tin tuyển dụng) và đang đăng tay từng kênh.

---

## 2. Vì sao giả thuyết này, không phải "làm lại extension đẹp hơn"

| Bằng chứng | Nguồn |
|---|---|
| Meta không có API tự động đăng Facebook Group; Buffer chỉ làm "notification publishing" cho Group | Meta docs + bảng kênh Buffer |
| Giá là lý do bỏ tool được nêu nhiều nhất; ~25% ca rời tool không mua tool thay thế | Alium, 27/10/2026 |
| 79,2% bài đăng đi qua API/MCP, không qua UI | PostEverywhere, 30/09/2026 |
| X tính $0,20/bài có link, gấp 13,3 lần bài thường | docs.x.com, 10/11/2026 |
| Postiz: 36 adapter, AGPL, self-host free, tự nhận "agentic" | GitHub API, 10/11/2026 |

`[SUY LUẬN]` Extension cũ chết vì bán một năng lực nền tảng cấm, có moat bằng 0 và đẩy rủi ro khoá tài khoản về phía khách. Làm đẹp UI không sửa được cấu trúc đó.

---

## 3. Điểm yếu nhất của giả thuyết (tự phản biện trước)

1. **Chưa có bằng chứng khách trả tiền cho UX.** Ngược lại: giá là complaint #1, và "native đủ dùng" là lý do rời tool. Giả thuyết "họ bỏ rất nhiều tiền cho UI/UX dễ xài" chưa được kiểm chứng ở đâu trong dữ liệu tôi đọc.
2. **"Dữ liệu → bài" đã tồn tại ở dạng rẻ**: Publer CSV bulk, FeedHive CSV, dlvr.it RSS, n8n/Make template, Google Sheets. Cần chứng minh phiên bản của mình khác ở đâu (kiểm tra hợp lệ? mapping theo kênh? chống trùng? xử lý ảnh?).
3. **Thuế X**: nếu tệp khách đăng link nhiều, margin âm ở đúng nhóm trả nhiều nhất. Mọi đối thủ đều đang đẩy chi phí này về khách.
4. **Mất đúng tệp khách VN trả tiền**: Group và Zalo cá nhân không có API. Nếu loại chúng ra, sản phẩm không còn là thứ shop VN đang mua; nếu giữ, quay lại đúng cái bẫy cũ.
5. **Postiz free + 41k sao**: bất kỳ tính năng nào chỉ là "adapter thứ 37" đều bị commoditize trong vài tháng.
6. **Churn ngành 45%/năm**: CAC phải thấp, hoặc LTV phải cao bằng cách bán thứ dính vào vận hành (dữ liệu, quy trình), không chỉ bán lịch đăng.

---

## 4. Non-goals cho vòng này

- Không code, không chọn stack, không thiết kế UI.
- Không chốt giá.
- Không chốt kênh nào làm trước (đó là việc của plan).

---

## 5. Câu hỏi mở (cần Justin trả lời để chạy Goldfish review)

1. Khách trả tiền đầu tiên là ai: shop/SME Việt Nam, agency Việt Nam, hay đội marketing nước ngoài?
2. "Dữ liệu người dùng mong muốn" cụ thể là gì trong phiên bản đầu — một loại dữ liệu hay nhiều loại?
3. Có chấp nhận chỉ dùng API chính thức (bỏ Group/Zalo cá nhân) không?
4. Thắng bằng gì sau 12 tháng khi Postiz free và Buffer $6/kênh vẫn còn?
5. Ai trả tiền API của X, và sản phẩm có cấm link trên X không?

---

## 6. Điều kiện để coi giả thuyết này "sống"

- Trả lời được câu 1 và 4 bằng một câu cụ thể, không phải "SME nói chung".
- Chỉ ra được **một** việc native + Buffer + Postiz free không làm được cho khách đó.
- Có một con số kinh tế đơn vị dương ở mức giá dự kiến.
