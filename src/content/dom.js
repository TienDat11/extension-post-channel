(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.dom) return;

  function TimeoutError(message) {
    this.name = 'TimeoutError';
    this.message = message || 'TimeoutError';
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function waitFor(fn, ms) {
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + ms;
      var timer;
      function poll() {
        var result;
        try {
          result = fn();
        } catch (e) {
          reject(e);
          return;
        }
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new TimeoutError('waitFor timed out after ' + ms + 'ms'));
          return;
        }
        timer = setTimeout(poll, 50);
      }
      poll();
    });
  }

  function normText(s) {
    if (s == null) return '';
    return String(s)
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .replace(/^\s+|\s+$/g, '');
  }

  function isVisible(el) {
    return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
  }

  function clickEl(el) {
    el.click();
  }

  function setNativeValue(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function countParagraphs(el) {
    var count = 0;
    var i;
    var child;
    var children;
    var tag;
    if (!el) return 0;
    children = el.childNodes || el.children || [];
    for (i = 0; i < children.length; i++) {
      child = children[i];
      if (child.nodeType !== undefined && child.nodeType !== 1) continue;
      tag = child.tagName || (child.nodeName ? String(child.nodeName).toUpperCase() : '');
      if (tag === 'P' || tag === 'DIV') count++;
    }
    return count;
  }

  root.dom = {
    waitFor: waitFor,
    sleep: sleep,
    normText: normText,
    isVisible: isVisible,
    clickEl: clickEl,
    setNativeValue: setNativeValue,
    countParagraphs: countParagraphs
  };
  root.installed.dom = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.dom;
}
