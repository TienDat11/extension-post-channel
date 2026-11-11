(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.status) return;

  var STATE_LABELS = {
    queued: 'Chờ', navigating: 'Đang mở trang', filling: 'Đang điền bài',
    countdown: 'Đếm ngược', clicking: 'Đang bấm Đăng', verifying: 'Đang xác nhận bài đăng',
    posted: '✅ Đã đăng', failed: '❌ Lỗi',
    cancelled: '⏭ Đã hủy', unknown: '❔ Không rõ', needs_manual: '⚠️ Cần kiểm tra tay',
    skipped: '— Bỏ qua'
  };
  var ERROR_LABELS = {
    rate_limited: 'Giới hạn đăng', nav_stuck: 'Không mở được trang',
    content_not_ready: 'Trang FB chưa sẵn sàng', probe_timeout: 'Không thấy trang FB',
    composer_not_found: 'Không thấy ô soạn bài', editor_not_found: 'Không thấy khung soạn bài',
    image_input_not_found: 'Không thấy nút ảnh', insert_rejected: 'Bị chặn chèn nội dung',
    upload_rejected: 'Tải ảnh thất bại', post_disabled: 'Nút Đăng bị khóa', post_button_not_found: 'Không thấy nút Đăng', no_response: 'FB không phản hồi sau khi bấm Đăng',
    post_failed: 'Đăng thất bại', post_timeout: 'Hộp thoại không đóng',
    scanner_not_ready: 'Bộ quét chưa sẵn sàng', scan_timeout: 'Quét nhóm quá lâu',
    stopped: 'Đã dừng', unknown: 'Lỗi không xác định'
  };

  function stateLabel(s) {
    return STATE_LABELS[s] || s;
  }
  function errorLabel(c) {
    return ERROR_LABELS[c] || c || '';
  }

  root.status = {
    STATE_LABELS: STATE_LABELS,
    ERROR_LABELS: ERROR_LABELS,
    stateLabel: stateLabel,
    errorLabel: errorLabel
  };
  root.installed.status = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.status;
}
