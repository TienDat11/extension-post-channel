'use strict';
var assert = require('node:assert');
var test = require('node:test');
var fakeDom = require('./fake-dom.js');

require('../src/content/selectors.js');
require('../src/content/dom.js');
var ag = require('../src/content/adapter-group.js');
var status = require('../src/core/status.js');

global.window = { getSelection: function () { return null; } };

// Node không có DOM events/file globals mà adapter-group dùng khi có ảnh.
if (typeof Event === 'undefined') {
  global.Event = function (type, opts) {
    opts = opts || {};
    this.type = type;
    this.bubbles = !!opts.bubbles;
    this.cancelable = !!opts.cancelable;
  };
}
if (typeof InputEvent === 'undefined') global.InputEvent = global.Event;
if (typeof DragEvent === 'undefined') global.DragEvent = global.Event;
if (typeof DataTransfer === 'undefined') {
  global.DataTransfer = function () {
    var dt = this;
    dt.items = [];
    dt.files = [];
    dt.items.add = function (file) { dt.items.push(file); dt.files = dt.items.slice(); };
  };
}
if (typeof File === 'undefined') {
  global.File = function (bits, name, opts) {
    opts = opts || {};
    this.name = name;
    this.type = opts.type || '';
    this.size = 0;
    this.lastModified = Date.now();
  };
}

function removeDialog(dialog) {
  var parent = dialog.parent;
  if (!parent) return;
  var children = parent.children;
  for (var i = children.length - 1; i >= 0; i--) {
    if (children[i] === dialog) { children.splice(i, 1); dialog.parent = null; return; }
  }
}

function closeAllDialogs(doc) {
  var dialogs = doc.querySelectorAll('[role="dialog"]');
  for (var i = dialogs.length - 1; i >= 0; i--) removeDialog(dialogs[i]);
}

function buildDoc(opts) {
  opts = opts || {};
  var doc = fakeDom.createDocument();
  var body = doc.body;
  doc.dialogs = [];

  var trigger = fakeDom.createElement('div', { role: 'button' });
  trigger.textContent = 'Viết gì đó';
  body.appendChild(trigger);

  (opts.dialogs || []).forEach(function (dlg) {
    var dialog = fakeDom.createElement('div', { role: 'dialog' });
    if (dlg.editor) {
      var editor = fakeDom.createElement('div', { contenteditable: 'true', 'data-lexical-editor': 'true' });
      editor.innerText = dlg.editorText || '';
      dialog.appendChild(editor);
    }
    (dlg.buttons || []).forEach(function (b) {
      var btn = fakeDom.createElement('div', { role: 'button', 'data-id': b.id, 'aria-label': b.label || '' });
      btn.textContent = b.text != null ? b.text : (b.label || '');
      if (b.ariaDisabled) btn.attrs['aria-disabled'] = 'true';
      btn._onClick = function () { closeAllDialogs(doc); };
      dialog.appendChild(btn);
      if (b.ref) b.ref(btn);
    });
    if (dlg.imageInput) {
      var input = fakeDom.createElement('input', { type: 'file', accept: 'image/*' });
      dialog.appendChild(input);
      dlg.input = input;
    }
    body.appendChild(dialog);
    doc.dialogs.push(dialog);
  });

  if (opts.outsidePost) {
    var out = fakeDom.createElement('div', { role: 'button', 'data-id': 'outside-post' });
    out.textContent = opts.outsidePost.text || 'Đăng';
    body.appendChild(out);
    doc.outsidePost = out;
  }
  return doc;
}

test('a. bấm nút Đăng trong dialog, không bấm nút nằm ngoài dialog', async function () {
  var inRef;
  var doc = buildDoc({
    dialogs: [{ editor: true, buttons: [{ id: 'in', text: 'Đăng', ref: function (b) { inRef = b; } }] }],
    outsidePost: { text: 'Đăng' }
  });
  global.document = doc;
  var result = await ag.post({});
  assert.strictEqual(result.failed, false);
  assert.strictEqual(result.posted, true);
  assert.strictEqual(inRef._clicks.length, 1);
  assert.strictEqual(doc.outsidePost._clicks.length, 0);
  assert.strictEqual(doc.querySelectorAll('[role="dialog"]').length, 0);
});

test('b. hai dialog cùng mở: chọn nút trong dialog có editor', async function () {
  var aRef;
  var bRef;
  var doc = buildDoc({
    dialogs: [
      { editor: true, buttons: [{ id: 'a', text: 'Đăng', ref: function (b) { aRef = b; } }] },
      { buttons: [{ id: 'b', text: 'Post', ref: function (b) { bRef = b; } }] }
    ]
  });
  global.document = doc;
  var result = await ag.post({});
  assert.strictEqual(result.posted, true);
  assert.strictEqual(aRef._clicks.length, 1);
  assert.strictEqual(bRef._clicks.length, 0);
  assert.strictEqual(doc.querySelectorAll('[role="dialog"]').length, 0);
});

test('b2. dialog không liên quan (thông báo) vẫn mở sau khi composer đóng -> posted', async function () {
  var inRef;
  var doc = buildDoc({
    dialogs: [
      { editor: true, buttons: [{ id: 'in', text: 'Đăng', ref: function (b) { inRef = b; } }] },
      { buttons: [] }
    ]
  });
  // Trên Facebook, nút Đăng chỉ đóng composer; panel Thông báo (role="dialog") vẫn mở.
  inRef._onClick = function () { removeDialog(doc.dialogs[0]); };
  global.document = doc;
  var result = await ag.post({ postTimeoutMs: 300 });
  assert.strictEqual(result.failed, false);
  assert.strictEqual(result.posted, true);
  assert.strictEqual(result.errorCode, undefined);
  assert.strictEqual(doc.querySelectorAll('[role="dialog"]').length, 1);
});

test('c1. aria-disabled="true" được chờ, không bị bấm trước khi bật', async function () {
  var btnRef;
  var doc = buildDoc({
    dialogs: [{ editor: true, buttons: [{ id: 'p', text: 'Post', ariaDisabled: true, ref: function (b) { btnRef = b; } }] }]
  });
  global.document = doc;
  var enableTime = Date.now();
  setTimeout(function () { delete btnRef.attrs['aria-disabled']; }, 80);
  var result = await ag.post({});
  assert.strictEqual(result.posted, true);
  assert.strictEqual(btnRef._clicks.length, 1);
  assert.ok(btnRef._clicks[0].time >= enableTime, 'click phải xảy ra sau khi nút bật');
});

test('c2. aria-disabled="true" hết thời gian -> post_disabled, không bấm', async function () {
  var btnRef;
  var doc = buildDoc({
    dialogs: [{ editor: true, buttons: [{ id: 'p', text: 'Post', ariaDisabled: true, ref: function (b) { btnRef = b; } }] }]
  });
  global.document = doc;
  var result = await ag.post({ postTimeoutMs: 60 });
  assert.strictEqual(result.failed, true);
  assert.strictEqual(result.errorCode, 'post_disabled');
  assert.strictEqual(btnRef._clicks.length, 0);
});

test('d. nhãn Post/Đăng khớp; khoảng trắng đầu/cuối vẫn khớp', async function () {
  var pRef;
  var dRef;
  var doc1 = buildDoc({ dialogs: [{ editor: true, buttons: [{ id: 'p', text: ' Post ', ref: function (b) { pRef = b; } }] }] });
  global.document = doc1;
  var r1 = await ag.post({});
  assert.strictEqual(r1.posted, true);
  assert.strictEqual(pRef._clicks.length, 1);

  var doc2 = buildDoc({ dialogs: [{ editor: true, buttons: [{ id: 'd', text: '  Đăng  ', ref: function (b) { dRef = b; } }] }] });
  global.document = doc2;
  var r2 = await ag.post({});
  assert.strictEqual(r2.posted, true);
  assert.strictEqual(dRef._clicks.length, 1);
});

test('e. prepareFlow với 0 ảnh không trả upload_rejected', async function () {
  var doc = buildDoc({ dialogs: [{ editor: true, buttons: [{ id: 'p', text: 'Post' }] }] });
  global.document = doc;
  var result = await ag.prepare('', []);
  assert.strictEqual(result.failed, undefined);
  assert.notStrictEqual(result.errorCode, 'upload_rejected');
  assert.strictEqual(result.composerText, '');
  assert.strictEqual(result.paragraphs, 1);
});

test('f. prepareFlow với 2 ảnh vẫn chờ đủ 2 thumbnail', async function () {
  var doc = buildDoc({ dialogs: [{ editor: true, imageInput: true, buttons: [{ id: 'p', text: 'Post' }] }] });
  global.document = doc;
  var dialog = doc.dialogs[0];
  var input = dialog.querySelector('input[type="file"][accept*="image"]');
  input.addEventListener('change', function () {
    var files = input.files || [];
    for (var k = 0; k < files.length; k++) {
      var img = fakeDom.createElement('img', { src: 'blob:thumb-' + k });
      dialog.appendChild(img);
    }
  });
  var result = await ag.prepare('', [
    { dataUrl: 'data:image/png;base64,abc' },
    { dataUrl: 'data:image/png;base64,def' }
  ]);
  assert.strictEqual(result.failed, undefined);
  assert.notStrictEqual(result.errorCode, 'upload_rejected');
  assert.strictEqual(doc.querySelectorAll('[role="dialog"] img[src^="blob:"]').length, 2);
});

test('g. không có ứng viên nút Đăng trong dialog -> post_button_not_found', async function () {
  var doc = buildDoc({ dialogs: [{ editor: true }] });
  global.document = doc;
  var result = await ag.post({});
  assert.strictEqual(result.failed, true);
  assert.strictEqual(result.errorCode, 'post_button_not_found');
  assert.strictEqual(doc._clicks.length, 0);
  assert.strictEqual(status.errorLabel('post_button_not_found'), 'Không thấy nút Đăng');
});
