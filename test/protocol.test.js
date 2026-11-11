'use strict';
var assert = require('assert');
var protocol = require('../src/core/protocol.js');

var passed = 0;
var failed = 0;
var tests = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS: ' + name);
  } catch (e) {
    failed += 1;
    console.log('FAIL: ' + name + ' — ' + e.message);
  }
}

test('TYPES.PING === fbq:ping', function () {
  assert.strictEqual(protocol.TYPES.PING, 'fbq:ping');
});
test('TYPES.PROBE === fbq:probe', function () {
  assert.strictEqual(protocol.TYPES.PROBE, 'fbq:probe');
});
test('TYPES.FILL === fbq:fill', function () {
  assert.strictEqual(protocol.TYPES.FILL, 'fbq:fill');
});
test('TYPES.SUBMIT === fbq:submit', function () {
  assert.strictEqual(protocol.TYPES.SUBMIT, 'fbq:submit');
});
test('TYPES.CANCEL === fbq:cancel', function () {
  assert.strictEqual(protocol.TYPES.CANCEL, 'fbq:cancel');
});
test('TYPES.SCAN === fbq:scan', function () {
  assert.strictEqual(protocol.TYPES.SCAN, 'fbq:scan');
});
test('TYPES.SCAN_GROUPS === fbq:scan-groups', function () {
  assert.strictEqual(protocol.TYPES.SCAN_GROUPS, 'fbq:scan-groups');
});
test('TYPES.OPEN_PANEL === fbq:open-panel', function () {
  assert.strictEqual(protocol.TYPES.OPEN_PANEL, 'fbq:open-panel');
});
test('TYPES has exactly 8 entries', function () {
  assert.strictEqual(Object.keys(protocol.TYPES).length, 8);
});

test('ok({a:1}) deep-equal {v:1, ok:true, payload:{a:1}}', function () {
  assert.deepStrictEqual(protocol.ok({a: 1}), { v: 1, ok: true, payload: { a: 1 } });
});
test('ok() deep-equal {v:1, ok:true, payload:{}}', function () {
  assert.deepStrictEqual(protocol.ok(), { v: 1, ok: true, payload: {} });
});
test('fail("x") -> {v:1, ok:false, payload:{code:"x", message:"x"}}', function () {
  assert.deepStrictEqual(protocol.fail('x'), { v: 1, ok: false, payload: { code: 'x', message: 'x' } });
});
test('fail("code", "custom message")', function () {
  assert.deepStrictEqual(protocol.fail('code', 'custom message'), {
    v: 1, ok: false, payload: { code: 'code', message: 'custom message' }
  });
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
