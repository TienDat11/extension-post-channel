const assert = require('node:assert');
const test = require('node:test');
const { byFile } = require('./load.js');

var hash = byFile['src/core/hash.js'];

test('hash.fnv1a is stable across calls', function () {
  assert.strictEqual(hash.fnv1a('1234567890'), hash.fnv1a('1234567890'));
});

test('hash.fnv1a differs for different strings', function () {
  assert.notStrictEqual(hash.fnv1a('a'), hash.fnv1a('b'));
});

test('hash.mulberry32 produces same sequence for same seed', function () {
  var a = hash.mulberry32(12345);
  var b = hash.mulberry32(12345);
  assert.deepStrictEqual([a(), a(), a()], [b(), b(), b()]);
});

test('hash.mulberry32 differs for different seeds', function () {
  assert.notStrictEqual(hash.mulberry32(1)(), hash.mulberry32(2)());
});

test('hash.mulberry32 output is in [0, 1)', function () {
  var rng = hash.mulberry32(1);
  var i;
  for (i = 0; i < 1000; i++) {
    var v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('hash seed stability: same group key gives same seed chain', function () {
  var h = hash.fnv1a('group-key');
  var r1 = hash.mulberry32(h)();
  var r2 = hash.mulberry32(h)();
  assert.strictEqual(r1, r2);
});
