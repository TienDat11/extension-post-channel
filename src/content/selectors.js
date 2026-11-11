(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.selectors) return;

  var SELECTOR_VERSION = 1;

  function ariaLabelMatch(pattern) {
    return {
      scope: 'div[role=button]',
      match: function (el) {
        var label = el.getAttribute ? el.getAttribute('aria-label') || '' : '';
        return pattern.test(label);
      }
    };
  }

  function textMatch(pattern, scope) {
    return {
      scope: scope || 'div[role=button]',
      match: function (el) {
        var text = (el.textContent || '')
          .replace(/\s+/g, ' ')
          .replace(/^\s+|\s+$/g, '');
        return pattern.test(text);
      }
    };
  }

  var TABLES = {
    COMPOSER_TRIGGER: [
      '[data-testid="group-composer"]',
      ariaLabelMatch(/Write something|Viết gì đó|Bạn viết gì|Viết nội dung/i),
      textMatch(/^(Write something|Viết gì đó|Bạn viết gì|Bạn đang nghĩ gì|Viết nội dung|What's on your mind)/i)
    ],
    EDITOR: [
      '[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
      '[role="dialog"] div[contenteditable="true"][role="textbox"]',
      '[role="dialog"] div[contenteditable="true"]'
    ],
    IMAGE_INPUT: [
      '[role="dialog"] input[type="file"][accept*="image"]'
    ],
    PHOTO_BUTTON: [
      '[aria-label="Photo/video"]',
      '[aria-label="Photo/Video"]',
      '[aria-label="Ảnh/video"]',
      '[aria-label="Ảnh/Video"]'
    ],
    COMPOSER_DIALOG: ['[role="dialog"]'],
    POST_BUTTON: [
      '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"][role="button"]',
      textMatch(/^(Post|Đăng)$/i, '[role="dialog"] div[role=button]'),
      '[data-testid="composer-submit"]'
    ],
    COMPOSER_TRIGGER_TIMELINE: [
      '[data-testid="status-attachment-mentions-input"]',
      ariaLabelMatch(/What's on your mind|Bạn đang nghĩ gì|Viết gì đó|Write something/i),
      textMatch(/^(What's on your mind|Bạn đang nghĩ gì|Viết gì đó|Write something)/i)
    ],
    EDITOR_TIMELINE: [
      '[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
      '[role="dialog"] div[contenteditable="true"][role="textbox"]',
      '[role="dialog"] div[contenteditable="true"]'
    ],
    IMAGE_INPUT_TIMELINE: [
      '[role="dialog"] input[type="file"][accept*="image"]'
    ],
    PHOTO_BUTTON_TIMELINE: [
      '[aria-label="Photo/Video"]',
      '[aria-label="Ảnh/Video"]',
      '[aria-label="Photo/video"]',
      '[aria-label="Ảnh/video"]'
    ],
    POST_BUTTON_TIMELINE: [
      '[role="dialog"] [aria-label="Post"][role="button"], [role="dialog"] [aria-label="Đăng"][role="button"]',
      '[role="dialog"] [aria-label="Post"], [role="dialog"] [aria-label="Đăng"]',
      textMatch(/^(Post|Đăng)$/i, '[role="dialog"] div[role=button]'),
      '[data-testid="composer-submit"]'
    ],
    ALERT: [
      '[role="alert"]',
      '[role="dialog"]'
    ]
  };

  function findCandidates(kind) {
    var table = TABLES[kind];
    if (!table) return [];
    return table.slice();
  }

  function visible(el) {
    var dom = root.dom;
    if (dom && dom.isVisible) return dom.isVisible(el);
    return !!(el && (el.offsetParent !== null || el.getClientRects().length > 0));
  }

  function matchCandidate(scopeEl, cand) {
    var scope = cand.scope || 'div[role=button]';
    var els = scopeEl.querySelectorAll ? scopeEl.querySelectorAll(scope) : [];
    var i;
    for (i = 0; i < els.length; i++) {
      if (cand.match(els[i])) return els[i];
    }
    return null;
  }

  // <input type="file"> của Facebook bị ẩn có chủ đích; vẫn dùng được qua .files + change.
  var HIDDEN_OK = { IMAGE_INPUT: true, IMAGE_INPUT_TIMELINE: true };

  function assertDom(kind, scopeEl) {
    if (typeof document === 'undefined') return null;
    var cands = findCandidates(kind);
    var allowHidden = HIDDEN_OK[kind] === true;
    var i;
    var c;
    var el;
    var rootEl = scopeEl || document;
    for (i = 0; i < cands.length; i++) {
      c = cands[i];
      if (typeof c === 'string') {
        try {
          el = rootEl.querySelector(c);
        } catch (e) {
          el = null;
        }
        if (el && (allowHidden || visible(el))) return el;
      } else if (c && typeof c.match === 'function') {
        el = matchCandidate(rootEl, c);
        if (el && (allowHidden || visible(el))) return el;
      }
    }
    return null;
  }

  root.selectors = {
    SELECTOR_VERSION: SELECTOR_VERSION,
    findCandidates: findCandidates,
    assertDom: assertDom
  };
  root.installed.selectors = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.selectors;
}
