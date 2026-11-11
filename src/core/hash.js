(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.hash) return;

  function fnv1a(str) {
    var hash = 2166136261 >>> 0;
    var i;
    var c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      hash ^= c;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      var t = (seed += 0x6D2B79F5) | 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
    };
  }

  root.hash = { fnv1a: fnv1a, mulberry32: mulberry32 };
  root.installed.hash = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.hash;
}
