(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.bg) return;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.tabs || !chrome.notifications) {
    root.bg = {};
    root.installed.bg = 1;
    return;
  }

  function reply(sendResponse, ok, type, payload) {
    if (typeof sendResponse === 'function') {
      sendResponse({ v: 1, ok: ok, type: type, payload: payload || {} });
    }
  }

  function openPanel() {
    chrome.tabs.query({ url: chrome.runtime.getURL('src/ui/panel.html*') }, function (tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        return;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/panel.html'), active: true });
    });
  }

  chrome.action.onClicked.addListener(function () {
    openPanel();
  });

  function scanGroups(sendResponse) {
    var tabId = null;
    var finished = false;
    var attempt = 0;
    var deadlineTimer = null;

    function cleanup() {
      finished = true;
      clearTimeout(deadlineTimer);
      try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) {}
      if (tabId != null) {
        try { chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; }); } catch (e) {}
      }
    }

    function listener(changedId, info) {
      if (finished) return;
      if (changedId !== tabId || info.status !== 'complete') return;
      probe();
    }

    function probe() {
      if (finished || attempt >= 40) return;
      attempt += 1;
      chrome.tabs.sendMessage(tabId, { v: 1, type: 'fbq:scan', payload: { maxGroups: 300, maxScrolls: 20 } }, function (res) {
        if (finished) return;
        if (chrome.runtime.lastError || res === undefined || !res.ok) {
          setTimeout(probe, 1000);
          return;
        }
        mergeAndFinish(res.payload.groups || []);
      });
    }

    function mergeAndFinish(groups) {
      if (finished) return;
      chrome.storage.local.get('groups', function (all) {
        if (finished) return;
        var merged = all && Array.isArray(all.groups) ? all.groups.slice() : [];
        var i, g, old;
        for (i = 0; i < groups.length; i++) {
          g = groups[i];
          if (!g || !g.key) continue;
          old = null;
          var k;
          for (k = 0; k < merged.length; k++) {
            if (merged[k].key === g.key) { old = merged[k]; break; }
          }
          if (old) {
            old.name = g.name || old.name;
            old.url = g.url || old.url;
          } else {
            old = { key: g.key, url: g.url, name: g.name || g.key, enabled: true, lastPostedAt: 0 };
            merged.push(old);
          }
        }
        cleanup();
        chrome.storage.local.set({ groups: merged }, function () {
          reply(sendResponse, true, 'scanResult', { ok: true, count: merged.length, groups: merged });
        });
      });
    }

    function fail(code) {
      if (finished) return;
      cleanup();
      reply(sendResponse, false, 'error', { ok: false, code: code });
    }

    deadlineTimer = setTimeout(function () { fail('scan_timeout'); }, 45000);

    chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false }, function (tab) {
      if (finished) return;
      if (!tab || typeof tab.id !== 'number') {
        fail('scan_no_tab');
        return;
      }
      tabId = tab.id;
      chrome.tabs.onUpdated.addListener(listener);
      probe();
    });
  }

  function onMessage(msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') {
      reply(sendResponse, false, 'error', { code: 'bad_envelope' });
      return true;
    }
    switch (msg.type) {
      case 'ping':
        reply(sendResponse, true, 'pong', { ok: true });
        return true;
      case 'fbq:open-panel':
        openPanel();
        reply(sendResponse, true, 'opened', {});
        return true;
      case 'fbq:scan-groups':
        scanGroups(sendResponse);
        return true;
      case 'notify':
        (function () {
          var p = msg.payload || {};
          chrome.notifications.create(p.id, {
            type: 'basic',
            title: p.title || '',
            message: p.body || ''
          }, function (id) {
            reply(sendResponse, true, 'notified', { id: id });
          });
        })();
        return true;
      default:
        reply(sendResponse, false, 'error', { code: 'unknown_type', type: msg.type });
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);

  root.bg = { onMessage: onMessage, openPanel: openPanel, scanGroups: scanGroups };
  root.installed.bg = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.bg;
}
