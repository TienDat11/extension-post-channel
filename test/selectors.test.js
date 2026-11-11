'use strict';
var assert = require('node:assert');
var test = require('node:test');
var fakeDom = require('./fake-dom.js');

require('../src/content/dom.js');
require('../src/content/selectors.js');
var selectors = globalThis.FBQ.selectors;

// Facebook ẩn <input type="file"> (không có layout). assertDom phải vẫn tìm thấy nó,
// nếu không engine báo image_input_not_found_timeline dù dialog đã có input.
test('IMAGE_INPUT_TIMELINE khớp input file ẩn trong dialog', function () {
  var doc = fakeDom.createDocument();
  var dialog = fakeDom.createElement('div', { role: 'dialog' });
  var input = fakeDom.createElement('input', { type: 'file', accept: 'image/*,video/*' });
  input._visible = false;
  dialog.appendChild(input);
  doc.body.appendChild(dialog);
  global.document = doc;
  assert.strictEqual(selectors.assertDom('IMAGE_INPUT_TIMELINE'), input);
});

test('IMAGE_INPUT_TIMELINE không khớp input file nằm ngoài dialog', function () {
  var doc = fakeDom.createDocument();
  var input = fakeDom.createElement('input', { type: 'file', accept: 'image/*' });
  doc.body.appendChild(input);
  global.document = doc;
  assert.strictEqual(selectors.assertDom('IMAGE_INPUT_TIMELINE'), null);
});

test('nút khác vẫn yêu cầu phần tử hiển thị', function () {
  var doc = fakeDom.createDocument();
  var dialog = fakeDom.createElement('div', { role: 'dialog' });
  var btn = fakeDom.createElement('div', { 'aria-label': 'Photo/Video', role: 'button' });
  btn._visible = false;
  dialog.appendChild(btn);
  doc.body.appendChild(dialog);
  global.document = doc;
  assert.strictEqual(selectors.assertDom('PHOTO_BUTTON_TIMELINE'), null);
});
