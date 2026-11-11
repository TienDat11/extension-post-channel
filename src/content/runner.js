(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.runner) return;
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    root.installed.runner = 1;
    return;
  }

  var P = root.protocol;

  function href() { return (typeof location === 'object' && location && location.href) || ''; }
  function groupKey() { var s = root.scanner; return s && s.groupKeyFromUrl ? s.groupKeyFromUrl(href()) : null; }

  var cancelled = false;

  function onMessage(msg, sender, sendResponse) {
    var P = root.protocol;
    if (!msg || !P || !msg.type) return false;
    var p = msg.payload || {};
    switch (msg.type) {
      case P.TYPES.PING:
      case P.TYPES.PROBE:
        sendResponse(P.ok({ url: href(), key: groupKey() }));
        return false;
      case P.TYPES.CANCEL:
        cancelled = true;
        sendResponse(P.ok({ cancelled: true }));
        return false;
      case P.TYPES.FILL:
        cancelled = false;
        runFill(p, sendResponse);
        return true;
      case P.TYPES.SUBMIT:
        runSubmit(p, sendResponse);
        return true;
      case P.TYPES.SCAN:
        runScan(p, sendResponse);
        return true;
      default:
        return false;
    }
  }

  function runFill(p, sendResponse) {
    var adapter = root['adapter-group'];
    var fn = adapter && (p.isTimeline ? adapter.prepareTimeline : adapter.prepare);
    if (!fn) { sendResponse(P.fail('adapter_not_found')); return; }
    Promise.resolve().then(function () {
      return fn(p.text || '', p.images || [], p.opts || {});
    }).then(function (r) {
      sendResponse(P.ok({ paragraphs: r.paragraphs, images: (p.images || []).length }));
    }).catch(function (e) {
      sendResponse(P.fail(e.code || 'prepare_error', e && e.message ? e.message : String(e)));
    });
  }

  function runSubmit(p, sendResponse) {
    var adapter = root['adapter-group'];
    var fn = adapter && (p.isTimeline ? adapter.postTimeline : adapter.post);
    Promise.resolve().then(function () {
      return fn({ isCancelled: function () { return cancelled; } });
    }).then(function (r) {
      if (r.cancelled) { sendResponse(P.ok({ cancelled: true })); return; }
      if (r.failed) { sendResponse(P.fail(r.errorCode || 'post_failed', r.errorText)); return; }
      sendResponse(P.ok({ posted: true }));
    }).catch(function (e) {
      sendResponse(P.fail(e.code || 'post_failed', e && e.message ? e.message : String(e)));
    });
  }

  function runScan(p, sendResponse) {
    var scanner = root.scanner;
    Promise.resolve().then(function () {
      return scanner.scan({ maxGroups: p.maxGroups || 300, maxScrolls: p.maxScrolls || 20 });
    }).then(function (groups) {
      sendResponse(P.ok({ groups: groups }));
    }).catch(function (e) {
      sendResponse(P.fail('scan_error', e && e.message ? e.message : String(e)));
    });
  }

  chrome.runtime.onMessage.addListener(onMessage);
  root.installed.runner = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = {};
}
