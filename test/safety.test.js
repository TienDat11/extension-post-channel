const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

var ROOT = path.join(__dirname, '..');
var MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
var ORDER = MANIFEST.content_scripts[0].js;

function requireFile(rel) {
  var abs = path.resolve(ROOT, rel);
  delete require.cache[abs];
  return require(abs);
}

var names = ['src/core/hash.js', 'src/core/spintax.js', 'src/core/safety.js'];
var loaded = {};
var i;
for (i = 0; i < names.length; i++) {
  if (ORDER.indexOf(names[i]) === -1) continue;
  loaded[names[i]] = requireFile(names[i]);
}

var safety = loaded['src/core/safety.js'];

test('safety.dayKey theo giờ máy, không dùng toISOString', function () {
  assert.strictEqual(safety.dayKey(new Date(2026, 10, 4, 23, 30).getTime()), '2026-11-04');
  assert.strictEqual(safety.dayKey(new Date(2026, 10, 5, 0, 30).getTime()), '2026-11-05');
});

test('safety.remainingToday', function () {
  assert.strictEqual(safety.remainingToday({ count: 5 }, 20), 15);
  assert.strictEqual(safety.remainingToday(null, 20), 20);
  assert.strictEqual(safety.remainingToday({ count: 99 }, 20), 0);
});

test('safety.chooseDelaySec delay thường và long pause', function () {
  assert.strictEqual(safety.chooseDelaySec({ minDelaySec: 90, maxDelaySec: 90, longPauseChance: 0 }, function () { return 0.5; }), 90);
  assert.strictEqual(safety.chooseDelaySec({ longPauseChance: 1, longPauseMinSec: 300, longPauseMaxSec: 300 }, function () { return 0.5; }), 300);
});

test('safety.shuffle không sửa mảng gốc và giữ cùng phần tử', function () {
  var src = [1, 2, 3, 4, 5];
  var before = src.slice();
  var out = safety.shuffle(src, function () { return 0.5; });
  assert.notStrictEqual(out, src);
  assert.deepStrictEqual(src, before);
  assert.deepStrictEqual(out.sort(function (a, b) { return a - b; }), [1, 2, 3, 4, 5]);
});

test('safety.filterEligible cooldown và disabled', function () {
  var now = Date.now();
  var groups = [
    { key: 'a', lastPostedAt: now - 86400000 },
    { key: 'b', lastPostedAt: now - 4 * 86400000 },
    { key: 'c', enabled: false }
  ];
  var result = safety.filterEligible(groups, now, { groupCooldownDays: 3 });
  assert.deepStrictEqual(result.eligible.map(function (g) { return g.key; }), ['b']);
  assert.strictEqual(result.skipped.length, 2);
  assert.strictEqual(result.skipped[0].key, 'a');
  assert.strictEqual(result.skipped[0].reason, 'cooldown');
  assert.strictEqual(result.skipped[0].nextAt, now - 86400000 + 3 * 86400000);
  assert.strictEqual(result.skipped[1].key, 'c');
  assert.strictEqual(result.skipped[1].reason, 'disabled');
});

test('safety.textSeedForTarget ổn định và khác nhau theo key', function () {
  var s1 = safety.textSeedForTarget('run-1', 'group-a');
  var s2 = safety.textSeedForTarget('run-1', 'group-a');
  var s3 = safety.textSeedForTarget('run-1', 'group-b');
  assert.strictEqual(s1, s2);
  assert.notStrictEqual(s1, s3);
});

test('safety.resolveText và variantCount qua spintax', function () {
  assert.ok(['A', 'B', 'C'].indexOf(safety.resolveText('{A|B|C}', 12345)) !== -1);
  var g1 = safety.textSeedForTarget('run-1', 'a');
  var g2 = safety.textSeedForTarget('run-1', 'b');
  var r1 = safety.resolveText('{A|B|C|D|E}', g1);
  var r2 = safety.resolveText('{A|B|C|D|E}', g2);
  assert.ok(['A', 'B', 'C', 'D', 'E'].indexOf(r1) !== -1);
  assert.ok(['A', 'B', 'C', 'D', 'E'].indexOf(r2) !== -1);
  assert.notStrictEqual(r1, r2);
  assert.strictEqual(safety.variantCount('{A|B|C|D|E}'), 5);
  assert.strictEqual(safety.resolveText('plain text', 1), 'plain text');
});

test('safety.isRateLimitAlert', function () {
  assert.strictEqual(safety.isRateLimitAlert('Bạn đang đăng quá nhanh'), true);
  assert.strictEqual(safety.isRateLimitAlert('you\'re posting too fast'), true);
  assert.strictEqual(safety.isRateLimitAlert('tạm thời bị chặn'), true);
  assert.strictEqual(safety.isRateLimitAlert('giới hạn tần suất'), true);
  assert.strictEqual(safety.isRateLimitAlert('Đăng bài thành công'), false);
});

test('safety.pruneCutoffDayKey và isDayKeyOlderThan', function () {
  assert.strictEqual(safety.pruneCutoffDayKey(new Date(2026, 10, 10).getTime()), '2026-11-04');
  assert.strictEqual(safety.isDayKeyOlderThan('2026-11-03', '2026-11-04'), true);
  assert.strictEqual(safety.isDayKeyOlderThan('2026-11-04', '2026-11-04'), false);
});
