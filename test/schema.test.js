const assert = require('node:assert');
const test = require('node:test');
const schema = require('../src/core/schema.js');

test('schema.SCHEMA_VERSION is 1', function () {
  assert.strictEqual(schema.SCHEMA_VERSION, 1);
});

test('schema.DEFAULT_SETTINGS has expected keys', function () {
  var keys = Object.keys(schema.DEFAULT_SETTINGS).sort();
  assert.deepStrictEqual(keys, [
    'imageJpegQuality', 'imageMaxEdgePx', 'maxImagesPerPost',
    'maxPerRun', 'minDelaySec', 'maxDelaySec',
    'retryBeforeClick', 'stopAfterConsecutiveFailures', 'confirmWindowSec'
  ].sort());
  assert.strictEqual(schema.DEFAULT_SETTINGS.minDelaySec, 60);
  assert.strictEqual(schema.DEFAULT_SETTINGS.maxDelaySec, 180);
  assert.strictEqual(schema.DEFAULT_SETTINGS.maxPerRun, 50);
});

test('schema.Q_STATES la tap trang thai moi (12 gia tri)', function () {
  assert.deepStrictEqual(schema.Q_STATES, [
    'queued', 'navigating', 'filling', 'countdown',
    'clicking', 'verifying',
    'posted', 'failed', 'cancelled', 'unknown',
    'needs_manual', 'skipped'
  ]);
  assert.strictEqual(schema.Q_STATES.length, 12);
});

test('schema khong xuat defaultQMeta/defaultQItem/migrate', function () {
  assert.strictEqual(schema.defaultQMeta, undefined);
  assert.strictEqual(schema.defaultQItem, undefined);
  assert.strictEqual(schema.migrate, undefined);
});
