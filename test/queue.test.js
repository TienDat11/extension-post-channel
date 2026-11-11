'use strict';
var assert = require('assert');
var queue = require('../src/core/queue.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + ': ' + (e && e.message)); }
}

function group(key, url, enabled, lastPostedAt) {
  return { key: key, url: url, name: 'Nhom ' + key, enabled: enabled, lastPostedAt: lastPostedAt == null ? 0 : lastPostedAt };
}

var now = Date.now();
var settings = { maxPerRun: 50, dailyCap: 100, groupCooldownDays: 3 };

test('1 group enabled:false khong vao items, co trong skipped reason disabled', function () {
  var built = queue.buildQueue([group('g1', 'https://www.facebook.com/groups/g1/', false, 0)], settings, { now: now });
  assert.strictEqual(built.items.length, 0);
  assert.strictEqual(built.skipped.length, 1);
  assert.strictEqual(built.skipped[0].key, 'g1');
  assert.strictEqual(built.skipped[0].reason, 'disabled');
});

test('2 group trong han cooldown bi loai reason cooldown; ngoai han vao items', function () {
  var inCd = queue.buildQueue([group('g1', 'https://www.facebook.com/groups/g1/', true, now - 1000)], settings, { now: now });
  assert.strictEqual(inCd.items.length, 0);
  assert.strictEqual(inCd.skipped.length, 1);
  assert.strictEqual(inCd.skipped[0].reason, 'cooldown');
  var outCd = queue.buildQueue([group('g1', 'https://www.facebook.com/groups/g1/', true, now - 4 * 86400000 - 1)], settings, { now: now });
  assert.strictEqual(outCd.items.length, 1);
  assert.strictEqual(outCd.skipped.length, 0);
});

test('3 maxPerRun = 2 voi 5 group -> items.length === 2', function () {
  var groups = [];
  var i;
  for (i = 0; i < 5; i++) groups.push(group('g' + i, 'https://www.facebook.com/groups/g' + i + '/', true, 0));
  var built = queue.buildQueue(groups, { maxPerRun: 2, dailyCap: 100, groupCooldownDays: 3 }, { now: now, rng: function () { return 0.5; } });
  assert.strictEqual(built.items.length, 2);
});

test('4 dailyCap = 3, dayCount = 2 -> chi 1 item (khong co timeline)', function () {
  var groups = [];
  var i;
  for (i = 0; i < 5; i++) groups.push(group('g' + i, 'https://www.facebook.com/groups/g' + i + '/', true, 0));
  var built = queue.buildQueue(groups, { maxPerRun: 50, dailyCap: 3, groupCooldownDays: 3 }, { now: now, dayCount: 2 });
  assert.strictEqual(built.items.length, 1);
});

test('5 timeline.enabled -> item cuoi key === timeline, isTimeline === true', function () {
  var groups = [group('g1', 'https://www.facebook.com/groups/g1/', true, 0)];
  var built = queue.buildQueue(groups, settings, {
    now: now,
    timeline: { enabled: true, url: 'https://www.facebook.com/', text: 'x', imageIds: [] }
  });
  var last = built.items[built.items.length - 1];
  assert.strictEqual(last.key, 'timeline');
  assert.strictEqual(last.isTimeline, true);
  assert.strictEqual(last.text, 'x');
  assert.deepStrictEqual(last.imageIds, []);
});

test('6 urlsMatch loai ?/# va trailing slash; prefix mot chieu', function () {
  assert.strictEqual(queue.urlsMatch('https://www.facebook.com/groups/123/?ref=x', 'https://www.facebook.com/groups/123'), true);
  assert.strictEqual(queue.urlsMatch('https://www.facebook.com/groups/123/', 'https://www.facebook.com/groups/123'), true);
  assert.strictEqual(queue.urlsMatch('https://www.facebook.com/groups/123#section', 'https://www.facebook.com/groups/123'), true);
  assert.strictEqual(queue.urlsMatch('https://www.facebook.com/groups/123', 'https://www.facebook.com/groups/456'), false);
  assert.strictEqual(queue.urlsMatch('https://www.facebook.com/groups/123', 'https://www.facebook.com/groups/123/more'), true);
});

test('7 computeDelayMs voi rng = () => 0 nam trong [minDelaySec*1000, maxDelaySec*1000]', function () {
  var ms = queue.computeDelayMs({ minDelaySec: 60, maxDelaySec: 180 }, function () { return 0; });
  assert.ok(ms >= 60 * 1000 && ms <= 180 * 1000, 'ms=' + ms);
});

if (failed) { console.error(failed + ' failed, ' + passed + ' passed'); process.exit(1); }
console.log(passed + ' passed');
