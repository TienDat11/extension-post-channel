(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed['fake-dom']) return;

  // Bộ chọn CSS tối giản: tag, [attr], [attr="val"], [attr^="val"], [attr*="val"],
  // nhiều attrs trên một đoạn, chia duyên (dấu cách) và danh sách phẩy.
  function parseSegment(seg) {
    var m = seg.match(/^([\w-]*)(.*)$/);
    var tag = m[1] || '';
    var rest = m[2] || '';
    var attrs = [];
    var re = /\[([\w-]+)([*^]?)=["']?([^"']*)["']?\]/g;
    var attrM;
    while ((attrM = re.exec(rest))) {
      attrs.push({ attr: attrM[1], op: attrM[2] || null, val: attrM[3] || '' });
    }
    return { tag: tag, attrs: attrs };
  }

  function parseSelector(selector) {
    return String(selector).split(',').map(function (part) {
      return part.trim()
        .split(/\s+/)
        .filter(function (s) { return s.length > 0; })
        .map(parseSegment);
    }).filter(function (segs) { return segs.length > 0; });
  }

  function matchSeg(el, seg) {
    var i;
    var a;
    var actual;
    if (seg.tag && String(el.tagName || '').toLowerCase() !== seg.tag) return false;
    for (i = 0; i < seg.attrs.length; i++) {
      a = seg.attrs[i];
      actual = el.getAttribute ? el.getAttribute(a.attr) : null;
      if (actual === null || actual === undefined) return false;
      // Regex chỉ bắt '*' hoặc '^' vào op; dạng [attr="val"] có op = null và phải so khớp chính xác.
      if ((a.op === null || a.op === '=') && actual !== a.val) return false;
      if (a.op === '^=' && actual.indexOf(a.val) !== 0) return false;
      if (a.op === '*=' && actual.indexOf(a.val) === -1) return false;
    }
    return true;
  }

  function matches(el, segs) {
    var i = segs.length - 1;
    var cur = el;
    if (!matchSeg(el, segs[i])) return false;
    while (i > 0) {
      cur = cur.parent;
      if (!cur) return false;
      if (matchSeg(cur, segs[i - 1])) i--;
    }
    return i === 0;
  }

  function collectElements(rootEl, out) {
    var i;
    var child;
    var children = rootEl.children || rootEl.childNodes || [];
    for (i = 0; i < children.length; i++) {
      child = children[i];
      if (child.nodeType !== 1) continue;
      out.push(child);
      collectElements(child, out);
    }
    return out;
  }

  function queryAll(rootEl, selector) {
    var alternatives = parseSelector(selector);
    var all = collectElements(rootEl, []);
    var i;
    var j;
    var el;
    var out = [];
    for (i = 0; i < all.length; i++) {
      el = all[i];
      for (j = 0; j < alternatives.length; j++) {
        if (matches(el, alternatives[j])) {
          out.push(el);
          break;
        }
      }
    }
    return out;
  }

  function queryOne(rootEl, selector) {
    var res = queryAll(rootEl, selector);
    return res.length ? res[0] : null;
  }

  function FakeElement(tag, attrs, doc) {
    this.tagName = tag;
    this.nodeType = 1;
    this.nodeName = String(tag).toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.childNodes = this.children;
    this.parent = null;
    this.ownerDocument = doc || null;
    this.offsetParent = null;
    this._text = '';
    this._innerText = '';
    this._visible = true;
    this._clicks = [];
    this._handlers = null;
    this._onClick = null;
  }

  Object.defineProperty(FakeElement.prototype, 'textContent', {
    get: function () { return this._text; },
    set: function (v) { this._text = v == null ? '' : String(v); }
  });

  Object.defineProperty(FakeElement.prototype, 'innerText', {
    get: function () { return this._innerText; },
    set: function (v) { this._innerText = v == null ? '' : String(v); }
  });

  FakeElement.prototype.getAttribute = function (name) {
    var v = this.attrs && this.attrs[name];
    return v === undefined ? null : v;
  };

  FakeElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  };

  FakeElement.prototype.getClientRects = function () {
    return this._visible ? [this.getBoundingClientRect()] : [];
  };

  FakeElement.prototype.focus = function () {};

  // Giống trình duyệt: phần tử còn nối tới document thì isConnected = true.
  Object.defineProperty(FakeElement.prototype, 'isConnected', {
    get: function () {
      var n = this;
      while (n) {
        if (n.nodeType === 9) return true;
        n = n.parent;
      }
      return false;
    }
  });

  FakeElement.prototype.addEventListener = function (type, fn) {
    var h = this._handlers || (this._handlers = {});
    (h[type] || (h[type] = [])).push(fn);
  };

  FakeElement.prototype.dispatchEvent = function (event) {
    var h = this._handlers && this._handlers[event && event.type];
    if (h) {
      h.forEach(function (fn) { fn(event); });
    }
    return true;
  };

  FakeElement.prototype.click = function () {
    var doc = this.ownerDocument;
    var entry = { time: Date.now(), tag: this.tagName, attrs: this.attrs };
    this._clicks.push(entry);
    if (doc && Array.isArray(doc._clicks)) doc._clicks.push(entry);
    if (typeof this._onClick === 'function') this._onClick();
  };

  FakeElement.prototype.appendChild = function (child) {
    this.children.push(child);
    child.parent = this;
    if (this.ownerDocument) child.ownerDocument = this.ownerDocument;
    return child;
  };

  FakeElement.prototype.closest = function (selector) {
    var alternatives = parseSelector(selector);
    var cur = this;
    var i;
    while (cur) {
      for (i = 0; i < alternatives.length; i++) {
        if (matches(cur, alternatives[i])) return cur;
      }
      cur = cur.parent;
    }
    return null;
  };

  FakeElement.prototype.querySelector = function (selector) {
    return queryOne(this, selector);
  };

  FakeElement.prototype.querySelectorAll = function (selector) {
    return queryAll(this, selector);
  };

  function FakeDocument() {
    this.nodeType = 9;
    this.tagName = '';
    this.nodeName = '#document';
    this._clicks = [];
    this.body = new FakeElement('body', {}, this);
    this.body.parent = this;
  }

  FakeDocument.prototype.createElement = function (tag) {
    return new FakeElement(tag, {}, this);
  };

  FakeDocument.prototype.execCommand = function () {
    return true;
  };

  FakeDocument.prototype.querySelector = function (selector) {
    return queryOne(this.body, selector);
  };

  FakeDocument.prototype.querySelectorAll = function (selector) {
    return queryAll(this.body, selector);
  };

  function createDocument() {
    return new FakeDocument();
  }

  root['fake-dom'] = {
    createDocument: createDocument,
    createElement: function (tag, attrs) { return new FakeElement(tag, attrs); },
    FakeElement: FakeElement,
    FakeDocument: FakeDocument,
    queryAll: queryAll,
    matches: matches
  };
  root.installed['fake-dom'] = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ['fake-dom'];
}
