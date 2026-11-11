# 00 — Requirement (verbatim)

Ngày: 2026-11-04
Title: buoc3-buoc4-buoc6-popup-giao-dien-3-khoi
Kind: code

## Yêu cầu gốc

> Bước 3 mục 1 + Bước 4 runner.html + Bước 6 popup.html/css/js (giao diện 3 khối). Repo: D:/extension. Tiếng Việt. manifest.json: xóa options_page, xóa options files. runner.html: thêm script hash/spintax/safety, đổi nhãn nút, wrap log trong details. popup.html: viết lại 3 khối IDs cố định. popup.css: viết lại từ đầu. popup.js: viết lại giữ IIFE, export root.popup={start,stop,state}. Test pass.

## Acceptance

- A1: manifest.json không còn options_page; options.html/js/css đã xóa; default_popup và content_scripts giữ nguyên
- A2: runner.html có script hash.js, spintax.js, safety.js; nhãn nút mới; runner-log nằm trong details; ID gốc và runner.js vẫn ở cuối
- A3: popup.html có cấu trúc 3 khối với IDs khớp spec; script nạp đúng thứ tự hash, spintax, schema, store, safety, assets, popup
- A4: popup.css có :root vars và các class bắt buộc; body width 420px; btn-primary/min-height 64px; mode 88px; btn 48px; checklist max-height 190px
- A5: popup.js node --check pass; IIFE + root.popup={start,stop,state}; guards chrome.*
- A6: node --test toàn bộ test pass fail 0
