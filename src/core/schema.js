(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.schema) return;

  var SCHEMA_VERSION = 1;

  var DEFAULT_SETTINGS = {
    minDelaySec: 60,
    maxDelaySec: 180,
    confirmWindowSec: 10,
    maxPerRun: 50,
    retryBeforeClick: 1,
    stopAfterConsecutiveFailures: 3,
    maxImagesPerPost: 10,
    imageMaxEdgePx: 1600,
    imageJpegQuality: 0.82
  };

  var Q_STATES = [
    'queued', 'navigating', 'filling', 'countdown',
    'clicking', 'verifying',
    'posted', 'failed', 'cancelled', 'unknown',
    'needs_manual', 'skipped'
  ];

  root.schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    Q_STATES: Q_STATES
  };
  root.installed.schema = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.schema;
}
