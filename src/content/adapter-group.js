(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed['adapter-group']) return;

  function stepError(code, msg) {
    var e = new Error(msg || code);
    e.code = code;
    return e;
  }

  function waitStep(fn, ms, code) {
    return root.dom.waitFor(fn, ms).catch(function (e) {
      throw stepError(code, e && e.message ? e.message : String(e));
    });
  }

  function moveCaretToEnd(el) {
    var range = document.createRange();
    var s = window.getSelection();
    if (!el || !range || !s) return;
    range.selectNodeContents(el);
    range.collapse(false);
    s.removeAllRanges();
    s.addRange(range);
  }

  var THUMB_SEL = '[role="dialog"] img[src^="blob:"], [role="dialog"] img[src^="data:"]';
  function countThumbs(scopeEl) {
    if (typeof document === 'undefined') return 0;
    var sel = (currentOpts && currentOpts.thumbnailSelector) || THUMB_SEL;
    return (scopeEl || document).querySelectorAll(sel).length;
  }

  var currentOpts = null;

  async function prepareFlow(timeline, text, images, opts) {
    var d = root.dom;
    var s = root.selectors;
    currentOpts = opts = opts || {};
    images = images || [];
    var triggerTimeout = opts.triggerTimeoutMs != null ? opts.triggerTimeoutMs : 15000;
    var editorTimeout = opts.editorTimeoutMs != null ? opts.editorTimeoutMs : 15000;
    var postTimeout = opts.postTimeoutMs != null ? opts.postTimeoutMs : 45000;
    var uploadTimeout = opts.uploadTimeoutMs != null ? opts.uploadTimeoutMs : 30000;
    var sfx = timeline ? '_timeline' : '';
    var photoKind = timeline ? 'PHOTO_BUTTON_TIMELINE' : 'PHOTO_BUTTON';
    var triggerKind = timeline ? 'COMPOSER_TRIGGER_TIMELINE' : 'COMPOSER_TRIGGER';
    var editorKind = timeline ? 'EDITOR_TIMELINE' : 'EDITOR';
    var imageKind = timeline ? 'IMAGE_INPUT_TIMELINE' : 'IMAGE_INPUT';
    var postKind = timeline ? 'POST_BUTTON_TIMELINE' : 'POST_BUTTON';

    // 1. wait for composer trigger
    var trigger = await waitStep(function () { return s.assertDom(triggerKind); }, triggerTimeout, 'composer_not_found' + sfx);

    // 2. click trigger, wait for editor
    d.clickEl(trigger);
    var editor = await waitStep(function () { return s.assertDom(editorKind); }, editorTimeout, 'editor_not_found' + sfx);

    // 3. draft check — clear leftover draft then fill
    if (d.normText(editor.innerText || '') !== '') {
      editor.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    }

    // 4. insert per paragraph: execCommand first, DOM fallback, verify after each paragraph
    var paragraphs = String(text == null ? '' : text).split('\n');

    function caretAtEnd() {
      editor.focus();
      var sel = window.getSelection();
      if (!sel) return;
      var ps = editor.querySelectorAll('p');
      var target = ps.length ? ps[ps.length - 1] : editor;
      var range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function execInsertText(s) {
      return document.execCommand('insertText', false, String(s));
    }

    function domInsertText(s) {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      var range = sel.getRangeAt(0);
      var isEditing = range && range.startContainer;
      if (!isEditing) return false;
      var beforeInput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(s) });
      if (editor.dispatchEvent(beforeInput) === false) return false;
      range.deleteContents();
      range.insertNode(document.createTextNode(String(s)));
      range.setStartAfter(range.endContainer);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(s) }));
      return true;
    }

    function contains(s) {
      return d.normText(editor.innerText || '').indexOf(d.normText(String(s))) !== -1;
    }

    async function insertParagraph(s) {
      caretAtEnd();
      execInsertText(s);
      if (contains(s)) return true;
      await waitForInserted(s);
      if (contains(s)) return true;
      if (domInsertText(s)) {
        if (contains(s)) return true;
        await waitForInserted(s);
        if (contains(s)) return true;
      }
      throw stepError('insert_rejected' + sfx, 'editor did not accept the inserted text');
    }

    function waitForInserted(s) {
      return root.dom.waitFor(function () { return contains(s); }, 2000).catch(function () { /* hết hạn chờ, thử phương thức khác */ });
    }

    var i;
    for (i = 0; i < paragraphs.length; i++) {
      await insertParagraph(paragraphs[i]);
      if (i < paragraphs.length - 1) {
        if (!document.execCommand('insertParagraph', false)) {
          domInsertText('\n');
        }
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertParagraph' }));
      }
    }

    // 6. images: DataTransfer + input.files + change; DragEvent drop fallback
    // base thumbnail count trước vòng lặp (không bị reset mỗi ảnh)
    var baseThumbs = countThumbs();
    var j;
    for (j = 0; j < images.length; j++) {
      var img = images[j];
      var dataUrl = typeof img === 'string'
        ? img
        : (img && (img.dataUrl || img.uri || img.src || (img.b64 ? ('data:' + (img.mime || 'image/png') + ';base64,' + img.b64) : '')));
      if (!dataUrl) continue;
      var input = s.assertDom(imageKind);
      if (!input) {
        var photoBtn = s.assertDom(photoKind);
        if (photoBtn) {
          d.clickEl(photoBtn);
          input = await waitStep(function () { return s.assertDom(imageKind); }, 3000, 'image_input_not_found' + sfx);
        }
      }
      if (!input) throw stepError('image_input_not_found' + sfx, 'file input not found in dialog');
      var response = await fetch(dataUrl);
      var blob = await response.blob();
      var name = (img && img.name) || 'image.png';
      var type = blob.type || 'image/png';
      var file = new File([blob], name, { type: type });

      var dt = new DataTransfer();
      dt.items.add(file);

      var before = countThumbs();
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      var grew = false;
      try { await d.waitFor(function () { return countThumbs() > before; }, 10000); grew = true; } catch (e) { grew = false; }
      if (!grew) {
        var dt2 = new DataTransfer();
        dt2.items.add(file);
        (editor || document.body).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
        try { await d.waitFor(function () { return countThumbs() > before; }, 10000); grew = true; } catch (e2) { grew = false; }
      }
      if (!grew) throw stepError('upload_rejected', 'anh ' + (j + 1) + ' khong hien thumbnail');
    }

    // Không có ảnh thì không cần chờ thumbnail
    if (images.length > 0) {
      try { await d.waitFor(function () { return countThumbs() >= baseThumbs + images.length; }, 15000); }
      catch (e3) { throw stepError('upload_rejected', 'thieu thumbnail sau khi tai album'); }
    }

    // 7. wait for post button enabled
    var postBtn = await waitStep(function () {
      var b = s.assertDom(postKind);
      return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null;
    }, postTimeout, 'post_disabled' + sfx);

    // 8. prepare done — postFlow owns countdown & click
    return {
      composerText: d.normText(editor.innerText || ''),
      paragraphs: paragraphs.length
    };
  }

  async function prepare(text, images, opts) {
    return prepareFlow(false, text, images, opts);
  }

  async function prepareTimeline(text, images, opts) {
    return prepareFlow(true, text, images, opts);
  }

  async function postFlow(timeline, opts) {
    var d = root.dom;
    var s = root.selectors;
    opts = opts || {};
    var postKind = timeline ? 'POST_BUTTON_TIMELINE' : 'POST_BUTTON';
    var postTimeout = opts.postTimeoutMs != null ? opts.postTimeoutMs : 45000;
    var result = {};

    // Hủy trước khi bấm đăng (giữ nguyên opts.isCancelled).
    if (typeof opts.isCancelled === 'function' && opts.isCancelled()) {
      result.cancelled = true;
      return result;
    }

    // Validate nút Đăng trước khi click (giống bước 7 của prepareFlow).
    // Tìm dialog chứa editor trước, rồi mới tìm nút Đăng trong dialog đó
    // (tab group và tab timeline cùng cách). Từ phần tử khớp, đi lên
    // closest('[role="button"]'); bỏ ứng viên không hiển thị.
    var editorEl = s.assertDom(timeline ? 'EDITOR_TIMELINE' : 'EDITOR');
    var dialog = null;
    if (editorEl && typeof editorEl.closest === 'function') {
      var dialogCands = s.findCandidates('COMPOSER_DIALOG');
      dialog = editorEl.closest(dialogCands.length ? dialogCands[0] : '[role="dialog"]');
    }

    function findPostButton() {
      var b = s.assertDom(postKind, dialog || document);
      if (!b) return null;
      if (typeof b.closest === 'function') {
        b = b.closest('[role="button"]') || b;
      }
      return b;
    }

    var btn = findPostButton();
    if (!btn) {
      result.failed = true;
      result.errorCode = 'post_button_not_found';
      result.errorText = 'không thấy nút Đăng trong composer';
      return result;
    }
    try {
      btn = await d.waitFor(function () {
        var b = findPostButton();
        return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null;
      }, postTimeout);
    } catch (e) {
      result.failed = true;
      result.errorCode = 'post_disabled';
      result.errorText = e && e.message ? e.message : 'không thấy nút Đăng trong composer';
      return result;
    }
    if (!btn) {
      result.failed = true;
      result.errorCode = 'post_disabled';
      result.errorText = 'không thấy nút Đăng trong composer';
      return result;
    }

    // Bấm nút Đăng bằng click() trên phần tử [role="button"] (đường tối thiểu cho U2).
    // Cách bấm trên trang thật (click hay chuỗi pointer events) do U1 xác nhận.
    d.clickEl(btn);

    // Chờ dialog đóng sau khi bấm Đăng.
    try {
      await d.waitFor(function () { return !document.querySelector('[role="dialog"]'); }, 45000);
    } catch (e) {
      result.failed = true;
      result.errorCode = 'post_timeout';
      result.errorText = 'hộp thoại soạn bài không đóng sau khi bấm Đăng';
      return result;
    }

    var alertEl = s.assertDom('ALERT');
    var alertText = alertEl ? (alertEl.textContent || '') : '';
    if (root.safety && typeof root.safety.isRateLimitAlert === 'function' && root.safety.isRateLimitAlert(alertText)) {
      result.failed = true;
      result.errorCode = 'rate_limited';
      result.errorText = alertText.slice(0, 200);
      return result;
    }
    result.failed = /không thể đăng|cannot post|failed to post|something went wrong|bài viết[\s\S]{0,40}không/i.test(alertText);
    result.posted = !result.failed;
    if (result.failed) { result.errorCode = 'post_failed'; result.errorText = alertText.slice(0, 200); }
    return result;
  }

  async function post(opts) {
    return postFlow(false, opts);
  }

  async function postTimeline(opts) {
    return postFlow(true, opts);
  }

  root['adapter-group'] = {
    prepare: prepare,
    post: post,
    prepareTimeline: prepareTimeline,
    postTimeline: postTimeline
  };
  root.installed['adapter-group'] = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ['adapter-group'];
}
