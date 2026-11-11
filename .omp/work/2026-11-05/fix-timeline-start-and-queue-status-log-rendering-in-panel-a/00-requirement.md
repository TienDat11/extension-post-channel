# 00 — Requirement (verbatim)

Ngày: 2026-11-05
Title: Fix timeline start and queue/status/log rendering in panel and engine
Kind: code

## Yêu cầu gốc

> Justin báo: panel chọn mode "Tường cá nhân", nhập text "Tới là Đặt", bấm "▶ Bắt đầu" nhưng không có gì xảy ra (status vẫn "Sẵn sàng", hàng đợi trống). Sửa panel.js: renderStatus đọc getInfo() và hiển thị 'Sẵn sàng — n mục trong hàng đợi'; subscribe renderAllSafe (renderAll với guard) thay vì chỉ renderStatus; thêm renderLog vào #log; renderQueue placeholder khi rỗng; startRun đọc radio timeline, đặt postToTimeline=true và targetMode; validation (a)-(d). Sửa engine.js: stop() thêm saveRun/render; failItem tách rõ needs_manual/queued/failed; resume() thêm setInfo+render; logRun tại các điểm mốc kèm render().

## Acceptance

- A1: renderStatus shows engine.getInfo() when present, 'Sẵn sàng — n mục trong hàng đợi' when queued items exist, else 'Sẵn sàng'
- A2: engine.subscribe uses renderAllSafe guard calling renderAll (groups+queue+status+thumbs+log)
- A3: renderLog formats [hh:mm:ss] m from run.log into #log, scrolls bottom, trims >300 lines
- A4: renderQueue shows placeholder 'Chưa có hàng đợi...' when no items
- A5: startRun reads timeline radio, sets postToTimeline=true + targetMode, validations (a)-(d) in place
- B1: engine stop() calls saveRun(true); render() after cancelling item
- B2: engine failItem assigns needs_manual / queued / failed exclusively, no double assignment
- B3: engine resume() calls setInfo('Đang tiếp tục...') and render()
- B4: engine logRun called at loop start, waitReady ok, fill ok, submit ok, failItem, finish; render() after each logRun
- B5: node --check passes for both panel.js and engine.js
