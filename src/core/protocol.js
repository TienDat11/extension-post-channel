(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.protocol) return;

  var V = 1;
  var CODES = { NO_RESPONSE: 'no_response' };
  var TYPES = {
    PING: 'fbq:ping',
    PROBE: 'fbq:probe',
    FILL: 'fbq:fill',
    SUBMIT: 'fbq:submit',
    CANCEL: 'fbq:cancel',
    SCAN: 'fbq:scan',
    SCAN_GROUPS: 'fbq:scan-groups',
    OPEN_PANEL: 'fbq:open-panel'
  };

  function ok(payload) { return { v: V, ok: true, payload: payload || {} }; }
  function fail(code, message) {
    return { v: V, ok: false, payload: { code: code, message: message || String(code) } };
  }

  root.protocol = { V: V, TYPES: TYPES, CODES: CODES, ok: ok, fail: fail };
  root.installed.protocol = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.protocol;
}
