(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.transitions) return;

  // Tập lỗi không bao giờ thử lại của engine hiện tại (engine.js MANUAL_CODES).
  // Mọi mã khác đều thuộc tập thử lại được (engine chỉ chặn ba mã này).
  var MANUAL_CODES = { insert_rejected: 1, upload_rejected: 1, post_disabled: 1 };

  // COMMIT POINT: từ đây lượt có thể đã đăng thật trên nền tảng.
  function beforeSubmit(item, now) {
    item.state = 'clicking';
    item.clickedAt = now;
    return item;
  }

  // Áp kết quả của lệnh submit vào lượt. Trả { state, patch } mô tả việc đã làm;
  // state === null nghĩa là caller phải tự quyết bằng decideFailure.
  // Không bao giờ đưa lượt đã có clickedAt về 'queued'.
  function applySubmitResult(item, res, now) {
    res = res || {};
    if (res.cancelled) return { state: item.state, patch: {} };
    if (res.posted) {
      item.state = 'posted';
      item.postedAt = now;
      item.postUrl = res.postUrl || null;
      item.pendingApproval = !!res.pendingApproval;
      return {
        state: 'posted',
        patch: { state: 'posted', postedAt: now, postUrl: item.postUrl, pendingApproval: item.pendingApproval }
      };
    }
    if (item.clickedAt != null) {
      item.state = 'unknown';
      return { state: 'unknown', patch: { state: 'unknown' } };
    }
    return { state: null, patch: {}, deferred: true };
  }

  // Chạy một lần khi panel giành được lease: lượt đang giữa chảy lúc crash
  // được đưa về trạng thái an toàn. Không đụng các trạng thái đã chốt.
  function recoverOnStart(run) {
    if (!run || !Array.isArray(run.items)) return run;
    for (var i = 0; i < run.items.length; i++) {
      var it = run.items[i];
      if (!it) continue;
      if (it.state === 'clicking' || it.state === 'verifying') {
        it.state = 'unknown';
        it.errorCode = 'interrupted';
      } else if (it.state === 'navigating' || it.state === 'filling') {
        it.state = 'queued';
      }
    }
    return run;
  }

  // Quyết định trạng thái lỗi TRƯỚC commit point. Hàm thuần: không sửa item.
  // `item.attempts` = số lần đã thử TRƯỚC lần vừa lỗi (0 = chưa thử lần nào).
  function decideFailure(item, code, settings) {
    settings = settings || {};
    if (item.clickedAt != null) return { state: 'unknown', retry: false };
    if (MANUAL_CODES[code]) return { state: 'needs_manual', retry: false };
    if ((item.attempts || 0) < (settings.retryBeforeClick || 0)) {
      return { state: 'queued', retry: true };
    }
    return { state: 'failed', retry: false };
  }

  root.transitions = {
    beforeSubmit: beforeSubmit,
    applySubmitResult: applySubmitResult,
    recoverOnStart: recoverOnStart,
    decideFailure: decideFailure
  };
  root.installed.transitions = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.transitions;
}
