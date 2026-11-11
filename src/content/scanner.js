(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.scanner) return;

  var RESERVED_KEYS = { feed: 1, discover: 1, joins: 1, create: 1, notifications: 1, search: 1, categories: 1, settings: 1, your_groups: 1 };

  function groupKeyFromUrl(url) {
    var m = String(url).match(/\/groups\/([^/?#]+)/);
    if (!m) return null;
    if (RESERVED_KEYS[m[1].toLowerCase()]) return null;
    return m[1];
  }

  function absoluteUrl(href) {
    try {
      return new URL(String(href), location.origin).href;
    } catch (e) {
      return String(href);
    }
  }

  function trimEnds(s) {
    return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
  }

  function extractGroupName(link, key) {
    if (link.getAttribute) {
      var al = trimEnds(link.getAttribute('aria-label') || '');
      if (al && al !== key) return al;
    }
    var txt = trimEnds(link.innerText || link.textContent || '');
    if (!txt) return '';
    var lines = txt.split(/\n+/);
    for (var i = 0; i < lines.length; i++) {
      var line = trimEnds(lines[i]);
      if (!line) continue;
      if (/^(Xem nhóm|View group|Lần hoạt động gần nhất|Last active)/i.test(line)) continue;
      return line;
    }
    return '';
  }

  function collectLinks(byKey, order, limit) {
    var links = document.querySelectorAll('a[href*="/groups/"]');
    var out = [];
    var i, link, href, url, key, name;
    for (i = 0; i < links.length; i++) {
      link = links[i];
      href = link.getAttribute && link.getAttribute('href');
      if (!href) continue;
      url = absoluteUrl(href);
      key = groupKeyFromUrl(url);
      if (!key) continue;
      url = 'https://www.facebook.com/groups/' + key;
      name = extractGroupName(link, key);
      if (byKey[key]) {
        var existing = byKey[key];
        if ((!existing.name || existing.name === key) && name && name !== key) {
          existing.name = name;
          out.push(existing);
        }
        continue;
      }
      var rec = { key: key, url: url, name: name || key };
      byKey[key] = rec;
      order.push(key);
      out.push(rec);
      if (limit > 0 && order.length >= limit) break;
    }
    return out;
  }

  function scan(arg1, arg2, arg3) {
    var maxGroups = 300;
    var maxScrolls = 15;
    var cb = null;
    if (arg1 && typeof arg1 === 'object') {
      maxGroups = Number(arg1.maxGroups) || 300;
      maxScrolls = Number(arg1.maxScrolls) || 15;
      if (typeof arg2 === 'function') cb = arg2;
    } else {
      if (arg1) maxGroups = Number(arg1) || 300;
      if (arg2) maxScrolls = Number(arg2) || 15;
      if (typeof arg3 === 'function') cb = arg3;
      else if (typeof arg2 === 'function' && !arg3) cb = arg2;
    }

    var promise = new Promise(function (resolve, reject) {
      function done(err, groups) {
        if (typeof cb === 'function') {
          try { cb(err, groups); } catch (e) { /* ignore */ }
        }
        if (err) reject(err);
        else resolve({ groups: groups });
      }
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        setTimeout(function () { done(new Error('scanner.scan: requires a browser document/window')); }, 0);
        return;
      }
      var byKey = {};
      var order = [];
      var groups = [];
      var scrolls = 0;
      var stale = 0;
      var lastY = -1;
      function finish() {
        groups = order.map(function (k) { return byKey[k]; });
        done(null, groups);
      }
      function step() {
        var before = order.length;
        collectLinks(byKey, order, maxGroups);
        if (order.length > before) stale = 0; else stale += 1;
        if (order.length >= maxGroups) return finish();
        if (scrolls >= maxScrolls) return finish();
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        var atBottom = lastY >= 0 && y >= lastY && stale >= 2;
        lastY = y;
        if (atBottom) return finish();
        scrolls += 1;
        window.scrollBy(0, window.innerHeight);
        setTimeout(step, 650);
      }
      setTimeout(step, 0);
    });
    // keep old array-callback contract friendly
    promise.groups = promise; // noop
    return promise;
  }

  root.scanner = { scan: scan, groupKeyFromUrl: groupKeyFromUrl, _collectLinks: collectLinks };
  root.installed.scanner = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.scanner;
}
