(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.assets) return;

  function openDB(cb) {
    var req = indexedDB.open('fbq', 1);
    req.onupgradeneeded = function (ev) {
      var db = req.result;
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'id' });
      }
    };
    req.onsuccess = function () { cb(req.result); };
    req.onerror = function () { cb(null, req.error); };
  }

  function putAsset(db, id, asset, cb) {
    var tx = db.transaction('assets', 'readwrite');
    var store = tx.objectStore('assets');
    store.put({ id: id, blob: asset.blob, mime: asset.mime, w: asset.w, h: asset.h, bytes: asset.bytes, createdAt: asset.createdAt || Date.now() });
    tx.oncomplete = function () { cb(null); };
    tx.onerror = function () { cb(tx.error); };
  }

  function getAsset(db, id, cb) {
    var tx = db.transaction('assets', 'readonly');
    var store = tx.objectStore('assets');
    var req = store.get(id);
    req.onsuccess = function () { cb(null, req.result || null); };
    req.onerror = function () { cb(req.error); };
  }

  function deleteAsset(db, id, cb) {
    var tx = db.transaction('assets', 'readwrite');
    var store = tx.objectStore('assets');
    store.delete(id);
    tx.oncomplete = function () { cb(null); };
    tx.onerror = function () { cb(tx.error); };
  }

  function downscale(file, maxEdge, quality, cb) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var scale = 1;
      if (Math.max(w, h) > maxEdge) {
        scale = maxEdge / Math.max(w, h);
      }
      var nw = Math.round(w * scale);
      var nh = Math.round(h * scale);
      var canvas = document.createElement('canvas');
      canvas.width = nw;
      canvas.height = nh;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, nw, nh);
      canvas.toBlob(function (blob) {
        cb(null, {
          blob: blob,
          mime: blob.type || 'image/jpeg',
          w: nw,
          h: nh,
          bytes: blob.size
        });
      }, 'image/jpeg', quality);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      cb(new Error('cannot load image'));
    };
    img.src = url;
  }

  root.assets = { openDB: openDB, putAsset: putAsset, getAsset: getAsset, deleteAsset: deleteAsset, downscale: downscale };
  root.installed.assets = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.assets;
}
