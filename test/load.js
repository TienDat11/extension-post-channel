const fs = require('node:fs');
const path = require('node:path');

var ROOT = path.join(__dirname, '..');
var MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
var ORDER = MANIFEST.content_scripts[0].js;

function loadOrder() {
  var loaded = [];
  var i;
  for (i = 0; i < ORDER.length; i++) {
    var abs = path.resolve(ROOT, ORDER[i]);
    delete require.cache[abs];
    require(abs);
    loaded.push(ORDER[i]);
  }
  return loaded;
}

function buildMap() {
  var map = {};
  var items = loadOrder();
  var j;
  var abs;
  for (j = 0; j < items.length; j++) {
    abs = path.resolve(ROOT, items[j]);
    map[items[j]] = require(abs);
  }
  return map;
}

var BYFILE = buildMap();

function byFile() {
  return BYFILE;
}

Object.keys(BYFILE).forEach(function (key) {
  byFile[key] = BYFILE[key];
});

exports.loadOrder = loadOrder;
exports.byFile = byFile;
exports.BYFILE = BYFILE;
exports.ORDER = ORDER;
