const assert = require('node:assert');
const test = require('node:test');

global.document = {
  createElement: function () {
    return {
      width: 0,
      height: 0,
      getContext: function () {
        return { drawImage: function () {} };
      },
      toBlob: function (cb) { cb({ size: 100, type: 'image/jpeg' }); }
    };
  }
};
// Giống trình duyệt: ảnh chỉ tải khi gán src. Không gán src thì onload/onerror không bao giờ chạy.
global.Image = function () {
  this.naturalWidth = 100;
  this.naturalHeight = 100;
  var self = this;
  this.onload = null;
  this.onerror = null;
  var src = '';
  Object.defineProperty(this, 'src', {
    get: function () { return src; },
    set: function (v) {
      src = v;
      setTimeout(function () { if (self.onload) self.onload(); }, 0);
    }
  });
};
global.URL = { createObjectURL: function () { return 'blob:mock'; }, revokeObjectURL: function () {} };
global.indexedDB = {
  open: function (name, version) {
    var store = {};
    var db = {
      objectStoreNames: { contains: function () { return false; } },
      createObjectStore: function (n) { store[n] = {}; },
      transaction: function (name, mode) {
        var tx = {
          objectStore: function () {
            return {
              put: function (v) { store[v.id] = v; },
              get: function (id) {
                var r = { result: store[id] || null };
                setTimeout(function () { if (r.onsuccess) r.onsuccess(); }, 0);
                return r;
              },
              delete: function (id) { delete store[id]; }
            };
          },
          oncomplete: null,
          onerror: null
        };
        setTimeout(function () { if (tx.oncomplete) tx.oncomplete(); }, 0);
        return tx;
      }
    };
    var req = {
      result: db,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null
    };
    setTimeout(function () {
      if (req.onupgradeneeded) req.onupgradeneeded({});
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
};

const assets = require('../src/core/assets.js');

function call(fn) {
  return new Promise(function (resolve, reject) {
    fn(function (err) {
      if (err) reject(err);
      else resolve();
    }, function (err, value) {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

function callVal(fn) {
  return new Promise(function (resolve, reject) {
    fn(function (err, value) {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

test('assets.downscale returns downscaled asset', async function () {
  var file = { name: 'a.jpg', type: 'image/jpeg' };
  var asset = await Promise.race([
    callVal(function (cb) { assets.downscale(file, 1600, 0.82, cb); }),
    new Promise(function (_, reject) { setTimeout(function () { reject(new Error('downscale không gọi callback (thiếu img.src?)')); }, 1000); })
  ]);
  assert.strictEqual(asset.mime, 'image/jpeg');
  assert.strictEqual(asset.w, 100);
  assert.strictEqual(asset.h, 100);
  assert.strictEqual(asset.bytes, 100);
});

test('assets put/get/delete round trip', async function () {
  var db = await new Promise(function (resolve) { assets.openDB(resolve); });
  await call(function (cb) {
    assets.putAsset(db, 'img-1', { blob: {}, mime: 'image/jpeg', w: 10, h: 10, bytes: 50 }, cb);
  });
  var item = await callVal(function (cb) {
    assets.getAsset(db, 'img-1', cb);
  });
  assert.strictEqual(item.id, 'img-1');
  await call(function (cb) {
    assets.deleteAsset(db, 'img-1', cb);
  });
  var item2 = await callVal(function (cb) {
    assets.getAsset(db, 'img-1', cb);
  });
  assert.strictEqual(item2, null);
});
