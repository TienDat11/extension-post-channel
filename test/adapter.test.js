'use strict';
var assert = require('assert');
var dom = require('../src/content/dom.js');
var adapter = require('../src/content/adapter-group.js');
var selectors = require('../src/content/selectors.js');

var passed = 0;
var failed = 0;
var tests = [];

function test(name, fn) {
  tests.push([name, fn]);
}

function fail(msg) {
  throw new Error(msg || 'failed');
}

// --- normText ---
test('normText converts NBSP to space', function () {
  assert.strictEqual(dom.normText('a\u00A0b'), 'a b');
});
test('normText strips zero-width characters', function () {
  assert.strictEqual(dom.normText('e\u200bi\u200bj\u200dk\ufeff'), 'eijk');
});
test('normText collapses spaces and tabs', function () {
  assert.strictEqual(dom.normText('a   \t\tb'), 'a b');
});
test('normText collapses blank lines and trims', function () {
  assert.strictEqual(dom.normText('\n\nhello\n\nworld\n\n'), 'hello\nworld');
});
test('normText trims leading/trailing whitespace', function () {
  assert.strictEqual(dom.normText('   x   '), 'x');
});
test('normText handles null/undefined', function () {
  assert.strictEqual(dom.normText(null), '');
  assert.strictEqual(dom.normText(undefined), '');
});

// --- countParagraphs ---
test('countParagraphs counts P and DIV element children', function () {
  var el = {
    nodeType: 1,
    childNodes: [
      { nodeType: 1, tagName: 'P' },
      { nodeType: 1, tagName: 'DIV' },
      { nodeType: 1, tagName: 'SPAN' },
      { nodeType: 3, nodeName: '#text' }
    ]
  };
  assert.strictEqual(dom.countParagraphs(el), 2);
});
test('countParagraphs returns 0 for null', function () {
  assert.strictEqual(dom.countParagraphs(null), 0);
});

// --- waitFor / sleep ---
test('waitFor resolves with first truthy result', async function () {
  var t = 0;
  var res = await dom.waitFor(function () {
    t += 1;
    return t > 3 ? 'ok' : null;
  }, 500);
  assert.strictEqual(res, 'ok');
});
test('waitFor rejects with TimeoutError', async function () {
  try {
    await dom.waitFor(function () { return null; }, 30);
    fail('should have rejected');
  } catch (e) {
    assert.strictEqual(e.name, 'TimeoutError');
  }
});
test('sleep resolves after ms', async function () {
  var start = Date.now();
  await dom.sleep(30);
  assert(Date.now() - start >= 25);
});

// --- selectors ---
test('selectors exports SELECTOR_VERSION = 1', function () {
  assert.strictEqual(selectors.SELECTOR_VERSION, 1);
});
test('findCandidates returns candidate tables', function () {
  var c = selectors.findCandidates('COMPOSER_TRIGGER');
  assert(Array.isArray(c));
  assert.strictEqual(c[0], '[data-testid="group-composer"]');
  assert.strictEqual(typeof c[1].match, 'function');
  assert.strictEqual(typeof c[2].match, 'function');
});
test('findCandidates returns [] for unknown kind', function () {
  assert.deepStrictEqual(selectors.findCandidates('DOES_NOT_EXIST'), []);
});
test('assertDom returns null without document', function () {
  assert.strictEqual(selectors.assertDom('EDITOR'), null);
});

// --- adapter-group exports ---
test('adapter-group exports prepare and post', function () {
  assert.strictEqual(typeof adapter.prepare, 'function');
  assert.strictEqual(typeof adapter.post, 'function');
});
test('dom exports all required helpers', function () {
  assert.strictEqual(typeof dom.waitFor, 'function');
  assert.strictEqual(typeof dom.sleep, 'function');
  assert.strictEqual(typeof dom.normText, 'function');
  assert.strictEqual(typeof dom.isVisible, 'function');
  assert.strictEqual(typeof dom.clickEl, 'function');
  assert.strictEqual(typeof dom.setNativeValue, 'function');
  assert.strictEqual(typeof dom.countParagraphs, 'function');
});

(async function () {
  var i;
  for (i = 0; i < tests.length; i++) {
    var name = tests[i][0];
    var fn = tests[i][1];
    try {
      await fn();
      console.log('PASS: ' + name);
      passed += 1;
    } catch (e) {
      console.log('FAIL: ' + name + ' — ' + (e && e.message ? e.message : String(e)));
      failed += 1;
    }
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
