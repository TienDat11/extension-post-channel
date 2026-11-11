(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.queue) return;

  var DAY_MS = 86400000;

  function randInt(min, max, rng) {
    if (rng == null) rng = Math.random;
    if (min > max) {
      var t = min;
      min = max;
      max = t;
    }
    return min + Math.floor(rng() * (max - min + 1));
  }

  function shuffle(list, rng) {
    if (rng == null) rng = Math.random;
    var out = list.slice();
    var i = out.length;
    var j;
    var t;
    while (i > 1) {
      i--;
      j = Math.floor(rng() * (i + 1));
      t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  function cleanUrl(u) {
    return String(u == null ? '' : u).split('?')[0].split('#')[0].replace(/\/+$/, '');
  }

  function buildQueue(groups, settings, opts) {
    opts = opts || {};
    settings = settings || {};
    groups = groups || [];
    var now = opts.now != null ? opts.now : Date.now();
    var rng = opts.rng || Math.random;
    var timeline = opts.timeline || {};
    var dayCount = opts.dayCount || 0;
    var skipped = [];
    var eligible = [];
    var limit;
    var chosen;
    var items = [];
    var i;
    var g;
    var item;

    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      if (g && g.enabled === false) {
        skipped.push({ key: g.key, reason: 'disabled' });
      } else if (g && g.lastPostedAt > 0 && now - g.lastPostedAt < (settings.groupCooldownDays || 0) * DAY_MS) {
        skipped.push({ key: g.key, reason: 'cooldown' });
      } else {
        eligible.push(g);
      }
    }

    limit = Math.min(settings.maxPerRun != null ? settings.maxPerRun : 50,
      Math.max(0, (settings.dailyCap != null ? settings.dailyCap : 0) - dayCount));
    chosen = shuffle(eligible, rng).slice(0, limit);

    for (i = 0; i < chosen.length; i++) {
      g = chosen[i];
      item = {
        key: g.key,
        url: g.url,
        name: g.name || '',
        isTimeline: false,
        state: 'queued',
        attempts: 0,
        errorCode: null,
        errorText: null,
        text: '',
        imageIds: [],
        postedAt: 0,
        lastStepAt: 0
      };
      items.push(item);
    }

    if (timeline.enabled) {
      items.push({
        key: 'timeline',
        url: timeline.url,
        name: 'Tường của tôi',
        isTimeline: true,
        state: 'queued',
        attempts: 0,
        errorCode: null,
        errorText: null,
        text: timeline.text || '',
        imageIds: timeline.imageIds || [],
        postedAt: 0,
        lastStepAt: 0
      });
    }

    return { items: items, skipped: skipped };
  }

  function urlsMatch(a, b) {
    var A = cleanUrl(a);
    var B = cleanUrl(b);
    if (A === B) return true;
    return A.indexOf(B) === 0 || B.indexOf(A) === 0;
  }

  function nextIndex(run) {
    var items = run && run.items;
    var i;
    if (!items) return -1;
    for (i = 0; i < items.length; i++) {
      if (items[i] && items[i].state === 'queued') return i;
    }
    return -1;
  }

  function computeDelayMs(settings, rng) {
    settings = settings || {};
    var safety = root && root.safety;
    if (safety && typeof safety.chooseDelaySec === 'function') {
      return safety.chooseDelaySec(settings, rng) * 1000;
    }
    return randInt(settings.minDelaySec || 60, settings.maxDelaySec || 180, rng) * 1000;
  }

  function applyResult(run, key, patch) {
    var items = run && run.items;
    var i;
    var item;
    var k;
    if (!items) return run;
    for (i = 0; i < items.length; i++) {
      if (items[i] && items[i].key === key) {
        item = items[i];
        for (k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) {
            item[k] = patch[k];
          }
        }
        if (!Object.prototype.hasOwnProperty.call(patch, 'lastStepAt')) {
          item.lastStepAt = Date.now();
        }
        if (patch.state === 'failed') {
          run.consecutiveFails = (run.consecutiveFails || 0) + 1;
        } else if (patch.state === 'posted') {
          run.consecutiveFails = 0;
        }
        break;
      }
    }
    return run;
  }

  root.queue = {
    buildQueue: buildQueue,
    urlsMatch: urlsMatch,
    nextIndex: nextIndex,
    computeDelayMs: computeDelayMs,
    applyResult: applyResult
  };
  root.installed.queue = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.queue;
}
