const assert = require('node:assert');
const test = require('node:test');
const store = require('../src/core/store.js');

function fakeArea() {
  var data = {};
  return {
    get: function (keys, cb) {
      var out = {};
      if (Array.isArray(keys)) {
        keys.forEach(function (k) { if (k in data) out[k] = data[k]; });
      } else if (typeof keys === 'string') {
        if (keys in data) out[keys] = data[keys];
      } else {
        Object.keys(data).forEach(function (k) { out[k] = data[k]; });
      }
      cb(out);
    },
    set: function (items, cb) {
      Object.keys(items).forEach(function (k) { data[k] = items[k]; });
      cb();
    },
    remove: function (keys, cb) {
      var list = Array.isArray(keys) ? keys : [keys];
      list.forEach(function (k) { delete data[k]; });
      cb();
    }
  };
}

test('store.makeStore returns get/set/remove', function () {
  var s = store.makeStore(fakeArea());
  assert.strictEqual(typeof s.get, 'function');
  assert.strictEqual(typeof s.set, 'function');
  assert.strictEqual(typeof s.remove, 'function');
});

test('store set then get returns same value', function (t) {
  var s = store.makeStore(fakeArea());
  s.set({ 'qitem:1': { state: 'queued' } }, function () {
    s.get(['qitem:1'], function (out) {
      assert.deepStrictEqual(out['qitem:1'], { state: 'queued' });
    });
  });
});

test('store get missing key returns empty object', function (t) {
  var s = store.makeStore(fakeArea());
  s.get(['nope'], function (out) {
    assert.deepStrictEqual(out, {});
  });
});

test('store remove deletes key', function (t) {
  var s = store.makeStore(fakeArea());
  s.set({ 'qitem:1': { state: 'queued' } }, function () {
    s.remove('qitem:1', function () {
      s.get(['qitem:1'], function (out) {
        assert.deepStrictEqual(out, {});
      });
    });
  });
});

test('store set does not affect unrelated keys', function (t) {
  var s = store.makeStore(fakeArea());
  s.set({ 'settings': { a: 1 } }, function () {
    s.set({ 'qitem:1': { state: 'queued' } }, function () {
      s.get(['settings', 'qitem:1'], function (out) {
        assert.deepStrictEqual(out.settings, { a: 1 });
        assert.deepStrictEqual(out['qitem:1'], { state: 'queued' });
      });
    });
  });
});
