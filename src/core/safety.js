(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.safety) return;

  var DAY_MS = 86400000;

  var PRESETS = {
    safe: {
      dailyCap: 20,
      groupCooldownDays: 3,
      minDelaySec: 90,
      maxDelaySec: 240,
      confirmWindowSec: 10,
      longPauseChance: 0.15,
      longPauseMinSec: 300,
      longPauseMaxSec: 900,
      batchSize: 8,
      batchBreakSec: 1800,
      stopAfterConsecutiveFailures: 2,
      maxPerRun: 20,
      retryBeforeClick: 0
    },
    medium: {
      dailyCap: 40,
      groupCooldownDays: 2,
      minDelaySec: 60,
      maxDelaySec: 150,
      confirmWindowSec: 8,
      longPauseChance: 0.08,
      longPauseMinSec: 240,
      longPauseMaxSec: 600,
      batchSize: 12,
      batchBreakSec: 900,
      stopAfterConsecutiveFailures: 3,
      maxPerRun: 40,
      retryBeforeClick: 1
    },
    fast: {
      dailyCap: 80,
      groupCooldownDays: 1,
      minDelaySec: 30,
      maxDelaySec: 90,
      confirmWindowSec: 5,
      longPauseChance: 0.03,
      longPauseMinSec: 180,
      longPauseMaxSec: 420,
      batchSize: 20,
      batchBreakSec: 600,
      stopAfterConsecutiveFailures: 4,
      maxPerRun: 80,
      retryBeforeClick: 1
    }
  };

  var SAFETY_DEFAULTS = { preset: 'safe' };
  var k;
  for (k in PRESETS.safe) {
    if (Object.prototype.hasOwnProperty.call(PRESETS.safe, k)) {
      SAFETY_DEFAULTS[k] = PRESETS.safe[k];
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function randInt(min, max, rng) {
    if (rng == null) rng = Math.random;
    if (min > max) {
      var t = min;
      min = max;
      max = t;
    }
    return min + Math.floor(rng() * (max - min + 1));
  }

  function remainingToday(dayRecord, dailyCap) {
    return Math.max(0, dailyCap - (dayRecord && dayRecord.count || 0));
  }

  function chooseDelaySec(settings, rng) {
    if (rng == null) rng = Math.random;
    if (rng() < settings.longPauseChance) {
      return randInt(settings.longPauseMinSec, settings.longPauseMaxSec, rng);
    }
    return randInt(settings.minDelaySec, settings.maxDelaySec, rng);
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

  function filterEligible(groups, nowTs, settings) {
    var eligible = [];
    var skipped = [];
    var cd = settings.groupCooldownDays * DAY_MS;
    var i;
    var g;
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      if (g.enabled === false) {
        skipped.push({ key: g.key, reason: 'disabled' });
      } else if (g.lastPostedAt > 0 && nowTs - g.lastPostedAt < cd) {
        skipped.push({ key: g.key, reason: 'cooldown', nextAt: g.lastPostedAt + cd });
      } else {
        eligible.push(g);
      }
    }
    return { eligible: eligible, skipped: skipped };
  }

  function textSeedForTarget(runId, key) {
    return root.hash.fnv1a(String(runId) + '|' + String(key));
  }

  function resolveText(rawText, seed) {
    try {
      return root.spintax.render(root.spintax.parse(rawText), seed >>> 0);
    } catch (e) {
      return rawText;
    }
  }

  function variantCount(rawText) {
    try {
      return root.spintax.size(root.spintax.parse(rawText));
    } catch (e) {
      return 0;
    }
  }

  function isRateLimitAlert(text) {
    return /temporarily blocked|limit how often you can post|we limit how often|you're posting too fast|Bạn đang đăng quá nhanh|tạm thời bị chặn|giới hạn tần suất|đăng quá nhiều/i.test(text);
  }

  function pruneCutoffDayKey(nowTs) {
    return dayKey(nowTs - 6 * DAY_MS);
  }

  function isDayKeyOlderThan(key, cutoffKey) {
    return String(key) < String(cutoffKey);
  }

  root.safety = {
    DAY_MS: DAY_MS,
    PRESETS: PRESETS,
    SAFETY_DEFAULTS: SAFETY_DEFAULTS,
    dayKey: dayKey,
    randInt: randInt,
    remainingToday: remainingToday,
    chooseDelaySec: chooseDelaySec,
    shuffle: shuffle,
    filterEligible: filterEligible,
    textSeedForTarget: textSeedForTarget,
    resolveText: resolveText,
    variantCount: variantCount,
    isRateLimitAlert: isRateLimitAlert,
    pruneCutoffDayKey: pruneCutoffDayKey,
    isDayKeyOlderThan: isDayKeyOlderThan
  };
  root.installed.safety = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.safety;
}
