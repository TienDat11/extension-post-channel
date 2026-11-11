const assert = require('node:assert');
const test = require('node:test');
const { byFile } = require('./load.js');

var spintax = byFile['src/core/spintax.js'];
var hash = byFile['src/core/hash.js'];

test('spintax.parse plain text', function () {
  var ast = spintax.parse('xin chao');
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].t, 'text');
  assert.strictEqual(ast[0].v, 'xin chao');
});

test('spintax.parse simple branch', function () {
  var ast = spintax.parse('xin {chao|hoi} ban');
  assert.strictEqual(ast.length, 3);
  assert.strictEqual(ast[0].t, 'text');
  assert.strictEqual(ast[0].v, 'xin ');
  assert.strictEqual(ast[1].t, 'branch');
  assert.strictEqual(ast[1].children.length, 2);
  assert.strictEqual(ast[1].children[0][0].v, 'chao');
  assert.strictEqual(ast[1].children[1][0].v, 'hoi');
  assert.strictEqual(ast[2].t, 'text');
  assert.strictEqual(ast[2].v, ' ban');
});

test('spintax.parse nested branch', function () {
  var ast = spintax.parse('{a|{b|c}}');
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].t, 'branch');
  assert.strictEqual(ast[0].children.length, 2);
  assert.strictEqual(ast[0].children[0][0].v, 'a');
  assert.strictEqual(ast[0].children[1][0].t, 'branch');
  assert.strictEqual(ast[0].children[1][0].children.length, 2);
});

test('spintax.parse escaped braces and pipe', function () {
  var ast = spintax.parse('\\{a\\}\\|b');
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].v, '{a}|b');
});

test('spintax.validate rejects unclosed brace', function () {
  var r = spintax.validate('xin {chao');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.msg, "unclosed '{'");
  assert.ok(typeof r.pos === 'number');
});

test('spintax.validate rejects unmatched close brace', function () {
  var r = spintax.validate('xin } chao');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.msg, "unmatched '}'");
});

test('spintax.validate accepts balanced', function () {
  var r = spintax.validate('{a|{b|c}}');
  assert.strictEqual(r.ok, true);
});

test('spintax.render is deterministic for same seed', function () {
  var ast = spintax.parse('{x|y|z}-{1|2}');
  var s = hash.fnv1a('group-1');
  assert.strictEqual(spintax.render(ast, s), spintax.render(ast, s));
});

test('spintax.render chooses from branch', function () {
  var ast = spintax.parse('{a|b}');
  var s = hash.fnv1a('group-1');
  var out = spintax.render(ast, s);
  assert.ok(out === 'a' || out === 'b');
});

test('spintax.size counts combinations', function () {
  assert.strictEqual(spintax.size(spintax.parse('{a|b|c}')), 3);
  assert.strictEqual(spintax.size(spintax.parse('{a|b}{c|d}')), 4);
  assert.strictEqual(spintax.size(spintax.parse('plain')), 1);
  assert.strictEqual(spintax.size(spintax.parse('{a|{b|c}}')), 3);
});

test('spintax.nested render never produces unexpected token', function () {
  var ast = spintax.parse('{a|{b|c}}');
  var s = hash.fnv1a('group-x');
  var out = spintax.render(ast, s);
  assert.ok(out === 'a' || out === 'b' || out === 'c');
});
