'use strict';
var assert = require('node:assert');
var test = require('node:test');
var T = require('../src/core/transitions.js');

test('beforeSubmit đặt state=clicking và clickedAt = now', function () {
  var item = { state: 'countdown', key: 'g1' };
  var out = T.beforeSubmit(item, 1234567);
  assert.strictEqual(out, item);
  assert.strictEqual(item.state, 'clicking');
  assert.strictEqual(item.clickedAt, 1234567);
});

test('recoverOnStart: clicking/verifying -> unknown + interrupted; navigating/filling -> queued; posted giữ nguyên', function () {
  var run = {
    items: [
      { key: 'a', state: 'clicking', clickedAt: 111 },
      { key: 'b', state: 'verifying', clickedAt: 222 },
      { key: 'c', state: 'navigating' },
      { key: 'd', state: 'filling' },
      { key: 'e', state: 'posted', postedAt: 333 },
      { key: 'f', state: 'failed' }
    ]
  };
  var out = T.recoverOnStart(run);
  assert.strictEqual(out, run);
  assert.strictEqual(run.items[0].state, 'unknown');
  assert.strictEqual(run.items[0].clickedAt, 111);
  assert.strictEqual(run.items[0].errorCode, 'interrupted');
  assert.strictEqual(run.items[1].state, 'unknown');
  assert.strictEqual(run.items[1].clickedAt, 222);
  assert.strictEqual(run.items[1].errorCode, 'interrupted');
  assert.strictEqual(run.items[2].state, 'queued');
  assert.strictEqual(run.items[3].state, 'queued');
  assert.strictEqual(run.items[4].state, 'posted');
  assert.strictEqual(run.items[4].postedAt, 333);
  assert.strictEqual(run.items[5].state, 'failed');
});

test('recoverOnStart trên run không có items không ném lỗi', function () {
  assert.strictEqual(T.recoverOnStart(null), null);
  assert.deepStrictEqual(T.recoverOnStart({}).items, undefined);
});

test('decideFailure có clickedAt -> unknown với mọi mã, không retry', function () {
  var codes = ['content_not_ready', 'post_timeout', 'rate_limited', 'composer_not_found', 'engine_error'];
  for (var i = 0; i < codes.length; i++) {
    var item = { state: 'clicking', clickedAt: 999, attempts: 1 };
    var d = T.decideFailure(item, codes[i], { retryBeforeClick: 5 });
    assert.deepStrictEqual(d, { state: 'unknown', retry: false }, 'mã ' + codes[i]);
    assert.strictEqual(item.state, 'clicking');
  }
});

test('decideFailure không clickedAt, retryBeforeClick:1, item mới -> queued; lần hai (đã thử 1) -> failed', function () {
  var item = { state: 'filling', attempts: 0 };
  var d1 = T.decideFailure(item, 'composer_not_found', { retryBeforeClick: 1 });
  assert.deepStrictEqual(d1, { state: 'queued', retry: true });
  item.attempts = 1;
  var d2 = T.decideFailure(item, 'composer_not_found', { retryBeforeClick: 1 });
  assert.deepStrictEqual(d2, { state: 'failed', retry: false });
});

test('decideFailure không clickedAt, mã cần người -> needs_manual (giữ hành vi engine hiện tại)', function () {
  var d = T.decideFailure({ attempts: 0 }, 'insert_rejected', { retryBeforeClick: 3 });
  assert.strictEqual(d.state, 'needs_manual');
  assert.strictEqual(d.retry, false);
});

test('applySubmitResult res.posted -> posted + postedAt + postUrl + pendingApproval', function () {
  var item = { state: 'clicking', clickedAt: 10 };
  var r = T.applySubmitResult(item, { posted: true, postUrl: 'https://fb.com/x', pendingApproval: true }, 777);
  assert.strictEqual(item.state, 'posted');
  assert.strictEqual(item.postedAt, 777);
  assert.strictEqual(item.postUrl, 'https://fb.com/x');
  assert.strictEqual(item.pendingApproval, true);
  assert.strictEqual(r.state, 'posted');
  assert.strictEqual(r.patch.state, 'posted');
  assert.strictEqual(r.patch.postedAt, 777);
});

test('applySubmitResult res.posted không có postUrl -> postUrl null', function () {
  var item = { state: 'clicking', clickedAt: 10 };
  T.applySubmitResult(item, { posted: true }, 555);
  assert.strictEqual(item.postUrl, null);
  assert.strictEqual(item.pendingApproval, false);
});

test('applySubmitResult res.cancelled -> không đổi trạng thái', function () {
  var item = { state: 'countdown', clickedAt: 10 };
  var r = T.applySubmitResult(item, { cancelled: true }, 20);
  assert.strictEqual(item.state, 'countdown');
  assert.strictEqual(item.postedAt, undefined);
  assert.strictEqual(r.state, 'countdown');
  assert.deepStrictEqual(r.patch, {});
});

test('applySubmitResult lỗi sau clickedAt -> unknown, không bao giờ queued', function () {
  var item = { state: 'clicking', clickedAt: 10 };
  var r = T.applySubmitResult(item, { ok: false, code: 'post_timeout' }, 30);
  assert.strictEqual(item.state, 'unknown');
  assert.strictEqual(r.state, 'unknown');
});

test('applySubmitResult lỗi chưa có clickedAt -> deferred, để decideFailure quyết', function () {
  var item = { state: 'countdown' };
  var r = T.applySubmitResult(item, { ok: false, code: 'rate_limited' }, 30);
  assert.strictEqual(item.state, 'countdown');
  assert.strictEqual(r.state, null);
  assert.strictEqual(r.deferred, true);
});
