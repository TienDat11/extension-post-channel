(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.lease) return;

  // KTD17: lease = Web Lock 'fbq-engine'. Chrome tự nhả lock khi tab đóng,
  // crash hay bị discard, nên không heartbeat. `locks` được truyền vào
  // (thường là navigator.locks) để test dùng bản giả; module không đọc
  // navigator trực tiếp.
  var LOCK_NAME = 'fbq-engine';

  // Giành lock nếu còn trống. Resolve đúng một lần:
  //  - { held: true, owner, release, promise } khi giữ được; `promise` là lệnh
  //    giữ trả về cho Web Locks, chỉ resolve khi release được gọi.
  //  - { held: false, owner: null } khi lock đang do tab khác giữ.
  function acquire(locks, owner) {
    return new Promise(function (resolve) {
      if (!locks || typeof locks.request !== 'function') {
        resolve({ held: false, owner: null });
        return;
      }
      var holdResolve = null;
      function endHold() {
        if (holdResolve) {
          var done = holdResolve;
          holdResolve = null;
          handle.held = false;
          handle.owner = null;
          done();
        }
      }
      var handle = { held: false, owner: null, promise: null, release: endHold };
      try {
        locks.request(LOCK_NAME, { ifAvailable: true }, function (lock) {
          if (!lock) {
            resolve({ held: false, owner: null });
            return undefined;
          }
          handle.held = true;
          handle.owner = owner;
          handle.promise = new Promise(function (done) { holdResolve = done; });
          resolve(handle);
          return handle.promise;
        });
      } catch (e) {
        resolve({ held: false, owner: null });
      }
    });
  }

  // Nhả lock. Gọi nhiều lần: lần sau là no-op, không ném lỗi.
  // Trả promise giữ (đã resolve) để caller chờ lock được nhả thật; thiếu thì undefined.
  function release(handle) {
    if (!handle || typeof handle.release !== 'function') return undefined;
    handle.release();
    return handle.promise || undefined;
  }

  // true nếu lock 'fbq-engine' đang có người giữ. locks thiếu query() → false.
  function isHeld(locks) {
    if (!locks || typeof locks.query !== 'function') return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        locks.query().then(function (snapshot) {
          var held = snapshot && Array.isArray(snapshot.held) ? snapshot.held : [];
          for (var i = 0; i < held.length; i++) {
            if (held[i] && held[i].name === LOCK_NAME) { resolve(true); return; }
          }
          resolve(false);
        }).catch(function () { resolve(false); });
      } catch (e) {
        resolve(false);
      }
    });
  }

  root.lease = { LOCK_NAME: LOCK_NAME, acquire: acquire, release: release, isHeld: isHeld };
  root.installed.lease = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.lease;
}
