(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.store) return;

  function makeStore(area) {
    return {
      get: function (keys, cb) { area.get(keys, cb); },
      set: function (items, cb) { area.set(items, cb); },
      remove: function (keys, cb) { area.remove(keys, cb); }
    };
  }

  root.store = { makeStore: makeStore };
  root.installed.store = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.store;
}
