# 05 — P0: Đo thật quyền chụp + DOM nút Đăng (U1)

- **Ngày đo:** 2026-11-10
- **Công cụ:** ego-lite MCP (`ego_doctor`, `ego_run` — script JavaScript qua CDP trên Chrome thật). Toàn phiên chỉ đọc/quan sát, **không có thao tác submit/đăng nào**.
- **Space:** id 0 (owner gốc: user), **profile "Thiên Đạt"** (`profileId: "Profile 1"`). `ego_doctor`: `daemonAlive: true`, `ok: true`, node v24.22.2, ego-browser 0.6.2.8, chromium 156.0.8078.74.
- **Extension:** "FB Group Poster" — id `hiognlmnbdoiicbdigfonpfpoicoijaj`, version `0.1.0`, state `ENABLED`, location `UNPACKED`, **path `D:\extension`**, `errors: 0`, `manifestErrors: 0`.
- **Manifest hiện tại:** `permissions: ["storage","unlimitedStorage","tabs","notifications"]`; `host_permissions: ["https://*.facebook.com/*"]`; **không `<all_urls>`, không `activeTab`**.

## 1. Đo được

| Bước | Lệnh/thao tác | Kết quả nguyên văn | Kết luận |
|---|---|---|---|
| 1 | `ego_doctor` | `daemonAlive: true`, `ok: true`, spaces `[{id: 0, ownership: "user", profileName: "Thiên Đạt"}]`, tab đang có gồm "FB Group Poster — Panel" | Daemon sống, đúng space 0, có tab panel |
| 2 | Mở `chrome://extensions/`, chạy `developerPrivate.getExtensionsInfo` | `{"id":"hiognlmnbdoiicbdigfonpfpoicoijaj","name":"FB Group Poster","version":"0.1.0","state":"ENABLED","location":"UNPACKED","path":"D:\\extension","errors":0,"manifestErrors":0}` | Extension nạp unpacked đúng từ `D:\extension` |
| 3 | `developerPrivate.reload(id, {failQuietly:false, populateErrorForUnpacked:true})` | `reload done lastError=null`; đọc lại: `state ENABLED, errors 0, manifestErrors 0` | Nạp lại code mới OK, không lỗi |
| 3b | Mở lại `chrome-extension://…/src/ui/panel.html`, bật `Runtime.enable` trước khi vào để bắt console | `PANEL {"title":"FB Group Poster — Panel","firstHeading":"FB Group Poster","bodySnippet":"FB Group Poster 🟢 Hôm nay: 0/20 bài Sẵn sàng ▶ Bắt đầu SOẠN BÀI 📷 Chọn ảnh 1 biến thể Chế độ Nhóm …","buttons":7,"hasDialog":false}`; `CONSOLE_ERRORS []` | Panel render đủ tiêu đề + nội dung, **không có lỗi/warning console** |
| 4 | Từ context panel: `chrome.tabs.query({active:true,lastFocusedWindow:true})` | `{"n":1,"windowId":"[đã xoá]","url":"chrome-extension://…panel.html"}` | `chrome.tabs.query` gọi được từ panel (KTD1 ✅) |
| 5 | Từ context panel: `chrome.tabs.update(tabFacebookId, {active:true})` | `tabs.update ok` | `chrome.tabs.update` gọi được từ panel (KTD1 ✅) |
| 6 | Từ context panel: `chrome.windows.update(windowIdFacebook, {focused:true})` | `focused ok` | `chrome.windows.update` chạy được |
| 7 | **Spike KTD9** — nguyên văn lệnh yêu cầu: `chrome.tabs.query({active:true,lastFocusedWindow:true}).then(ts=>chrome.tabs.captureVisibleTab(ts[0].windowId,{format:'jpeg',quality:80})).then(u=>'OK len='+u.length).catch(e=>'ERR '+e.message)` | `ERR Either the '<all_urls>' or 'activeTab' permission is required.` | Lỗi **quyền** ngay lần đầu (tab active lúc đó là tab panel — cửa sổ panel là lastFocusedWindow) |
| 8 | `chrome.tabs.captureVisibleTab(windowIdFacebook, {format:'jpeg',quality:80})` — **cửa sổ Facebook KHÔNG được focus** (cửa sổ khác giữ focus OS) | `ERR Either the '<all_urls>' or 'activeTab' permission is required.` | Không phụ thuộc focus cửa sổ |
| 9 | Focus cửa sổ Facebook (`chrome.windows.update` → `focused ok`), tab FB chưa active, chụp lại | `ERR Either the '<all_urls>' or 'activeTab' permission is required.` | Không phụ thuộc focus |
| 10 | Đưa tab Facebook thành tab đang hiện (`chrome.tabs.update` → `tabs.update ok`), chụp lại | `ERR Either the '<all_urls>' or 'activeTab' permission is required.` | Không phụ thuộc tab đang hiện |

**Kết luận spike (KTD9):** `captureVisibleTab` **không chạy được** với manifest hiện tại. Cùng một nguyên văn lỗi ở cả ba trạng thái đã thử (tab panel đang hiện / tab FB đang hiện / cửa sổ focus hoặc không focus). Lỗi nằm ở **quyền**, không phụ thuộc trạng thái tab/focus.

## 2. DOM composer (chỉ đọc, đóng bằng Escape)

| Mục | Giá trị đo được |
|---|---|
| Trước khi mở | `DIALOGS_BEFORE 1` (chỉ khay "Notifications", không editor) |
| Trigger đã dùng để mở | `div[role=button]` text `"What's on your mind, [đã xoá]?"` — click thành công (`CLICK_TRIGGER semantic-ok`, không cần fallback) |
| Số `[role="dialog"]` khi composer mở | **3**: (0) "Notifications" không editor; (1) dialog có editor — editor `DIV[contenteditable]` aria `"What's on your mind, [đã xoá]?"`, 13 `div[role=button]`; (2) "Create post" không editor |
| Số nút khớp `textContent.trim() === 'Post'` hoặc `'Đăng'` trên **toàn trang** | **1** |
| Nút khớp đó | `text "Post"`; `aria-disabled="true"` (chưa gõ chữ); không có attribute `disabled` |
| Nút nằm trong dialog chứa editor? | **Có** — `inDialog: true`, `dialogHasEditor: true` (dialog số 1) |
| `closest('[role="button"]')` từ nút | Trả về **chính nó**: `closestIsSelf: true`, tag `DIV`, role `button` |
| outerHTML (≤300 ký tự, nguyên văn) | `<div aria-label="Post" class="x1i10hfl xjbqb8w x1ejq31n x18oe1m7 x1sy0etr xstzfhl x972fbf x10w94by x1qhh985 x14e42zd x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x16tdsg8 x1hl2dhg xggy1nq x1h6gzvc x1fmog5m xu25z0z x140muxe xo1y3bh x87ps6o x1lku1pv x1a2a7pz x9f619 x3nfvp2` |
| Nút "Đăng/Post" **ngoài dialog** bị khớp nhầm | **0** (toàn trang chỉ có 1 ứng viên; sau khi đóng composer đếm lại toàn trang = 0) |
| Sau Escape (`p2.keyboard.press('Escape')`) | `{"total":1,"withEditor":0,"dialogs":[{"label":"Notifications","visible":false,"hasEditor":false}],"postBtnsRemaining":0}` → **composer đã đóng**, không có nội dung nào được soạn, **không có bài nào được đăng** |

Ghi chú: UI tài khoản ở phiên đo là **tiếng Anh** (`Post`, `What's on your mind…`, `Create post`). Chuỗi tiếng Việt `Đăng` không xuất hiện trên trang lúc đo.

## 3. Chưa đo được (nói thẳng)

- **Nguyên nhân gốc nút Đăng: CHƯA xác định được.** Luật của phiên này cấm mọi thao tác submit, nên **chưa bấm nút Post thật**, chưa biết bài có lên hay không, chưa so sánh được `click()` với chuỗi pointer events. Các giả thuyết (bấm khi `aria-disabled="true"`, sai phần tử tổ tiên, thiếu chuỗi event) đều **[chưa kiểm chứng trên trang thật]** — cần một lần bấm thử bằng bài test mới kết luận được.
- Trạng thái nút **sau khi gõ chữ** (khi `aria-disabled` chuyển `"false"`) chưa đo — phiên này không gõ nội dung để tránh rủi ro đăng nhầm.
- Nhãn tiếng Việt `Đăng` chưa gặp trên trang thật (UI tiếng Anh) — regex `^(Post|Đăng)$` mới được kiểm chứng nửa "Post".
- Đăng thật vào group test (cần tài khoản mượn + group được phép đăng) — chưa có điều kiện.
- Fixture cây DOM thành file `test/fixtures/…` chưa tạo (phiên này chỉ ghi số liệu đo; cây DOM cần lấy ở lần đo cho phép soạn bài thật).

## 4. Hệ quả quyền chụp (P1/P4)

Với `host_permissions` hiện tại (`https://*.facebook.com/*`, không `<all_urls>`, không `activeTab`), **bằng chứng ảnh bằng `captureVisibleTab` KHÔNG chạy được** → U5/P1 (ảnh bằng chứng) và P4 (zip nghiệm thu có ảnh) **không qua được nếu không đổi quyền**. Các lựa chọn, **không tự quyết**:

1. `<all_urls>` — bị **R15 cấm**, loại.
2. `activeTab` — cần người dùng thao tác trên tab trước mỗi lần chụp; không hợp với chạy tự động nhiều lượt.
3. Host cụ thể từng mạng (`https://*.facebook.com/*`…) — **đã đo là không đủ** (lỗi quyền ở mọi trạng thái tab/focus).

Theo KTD9: "Spike thất bại thì dừng và hỏi người dùng. Không tự thêm quyền." → Cần quyết định của người dùng trước U5.

## 5. Trả lời ba câu hỏi của U1

1. **`captureVisibleTab` với quyền hiện tại:** KHÔNG dùng được. Nguyên văn lỗi: `Either the '<all_urls>' or 'activeTab' permission is required.`
2. **Selector trúng nút Đăng thật:** Có — `textMatch(/^(Post|Đăng)$/i)` giới hạn trong `[role="dialog"]` **chứa editor** trúng đúng **duy nhất một nút** (`aria-label="Post"`, `closest('[role="button"]')` = chính nó), và **không có** nút nào ngoài dialog bị khớp nhầm. Candidate đầu của `POST_BUTTON` hiện tại (`[role="dialog"] [aria-label="Post"]`) cũng trúng cùng node này. Việc tìm **trong dialog có editor trước** (KTD4) là đúng hướng và đã có bằng chứng thật.
3. **Nguyên nhân gốc nút Đăng:** **CHƯA xác định được** — chưa được phép bấm thật, xem mục 3. File này không suy đoán thay bước đo còn thiếu.

## Làm sạch dữ liệu

- Tên người trong text trigger và aria của editor đã che thành `[đã xoá]`.
- `windowId`/`tabId` (số dài) đã che thành `[đã xoá]`.
- Không ghi link profile, handle, email, id người dùng hay id group của ai vào file này.
- Không lưu nội dung trang, không lưu ảnh chụp (ảnh chụp không thành công do quyền).
