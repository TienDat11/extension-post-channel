'use strict';
var assert = require('node:assert');
var test = require('node:test');
var lease = require('../src/core/lease.js');

// Bản giả navigator.locks: một lock duy nhất tại một thời điểm. Giống Web
// Locks thật: lock được nhả khi promise mà callback request trả về resolve
// (lock object thật không có phương thức release nào để gọi).
function fakeLocksReal() {
  var current = null; // entry đang giữ, hoặc null
  return {
    request: function (name, _opts, cb) {
      setTimeout(function () {
        if (current) { cb(null); return; }
        var entry = { name: name };
        current = entry;
        var ret = cb({ name: name });
        if (ret && typeof ret.then === 'function') {
          ret.then(function () {
            if (current === entry) current = null;
          });
        } else {
          if (current === entry) current = null;
        }
      }, 0);
    },
    query: function () {
      return Promise.resolve({
        held: current ? [{ name: current.name, mode: 'exclusive' }] : []
      });
    }
  };
}

test('hai acquire đồng thời trên cùng locks giả -> đúng một bên held:true', async function () {
  var locks = fakeLocksReal();
  var both = await Promise.all([
    lease.acquire(locks, 'tab-A'),
    lease.acquire(locks, 'tab-B')
  ]);
  var heldCount = both.filter(function (h) { return h.held === true; }).length;
  assert.strictEqual(heldCount, 1);
  var winner = both[0].held ? both[0] : both[1];
  var loser = both[0].held ? both[1] : both[0];
  assert.strictEqual(winner.owner, 'tab-A');
  assert.strictEqual(loser.held, false);
  assert.strictEqual(loser.owner, null);
  await lease.release(winner);
});

test('acquire lần hai khi đang giữ (khác owner) -> held:false', async function () {
  var locks = fakeLocksReal();
  var first = await lease.acquire(locks, 'tab-A');
  assert.strictEqual(first.held, true);
  var second = await lease.acquire(locks, 'tab-B');
  assert.strictEqual(second.held, false);
  assert.strictEqual(second.owner, null);
  await lease.release(first);
});

test('release rồi acquire lại -> lần sau held:true', async function () {
  var locks = fakeLocksReal();
  var first = await lease.acquire(locks, 'tab-A');
  assert.strictEqual(first.held, true);
  await lease.release(first);
  var second = await lease.acquire(locks, 'tab-B');
  assert.strictEqual(second.held, true);
  assert.strictEqual(second.owner, 'tab-B');
  await lease.release(second);
});

test('A nhả thì B giành được (kịch bản tab A đóng, tab B vào)', async function () {
  var locks = fakeLocksReal();
  var a = await lease.acquire(locks, 'tab-A');
  var b1 = await lease.acquire(locks, 'tab-B');
  assert.strictEqual(b1.held, false);
  await lease.release(a);
  var b2 = await lease.acquire(locks, 'tab-B');
  assert.strictEqual(b2.held, true);
  await lease.release(b2);
});

test('isHeld true khi có lock, false sau release', async function () {
  var locks = fakeLocksReal();
  var h = await lease.acquire(locks, 'tab-A');
  assert.strictEqual(await lease.isHeld(locks), true);
  await lease.release(h);
  assert.strictEqual(await lease.isHeld(locks), false);
});

test('isHeld với locks không có query -> false, không ném', async function () {
  assert.strictEqual(await lease.isHeld({}), false);
  assert.strictEqual(await lease.isHeld(null), false);
  assert.strictEqual(await lease.isHeld(undefined), false);
});

test('release gọi hai lần không ném', async function () {
  var locks = fakeLocksReal();
  var h = await lease.acquire(locks, 'tab-A');
  await lease.release(h);
  await lease.release(h); // lần hai: no-op
  assert.strictEqual(await lease.isHeld(locks), false);
  await lease.release(null);
  await lease.release(undefined);
});

test('release với handle không có release là no-op', async function () {
  await lease.release({ held: false, owner: null });
  await lease.release({});
});

test('promise giữ lock không bao giờ tự resolve (race với timeout 50ms -> timeout thắng)', async function () {
  var locks = fakeLocksReal();
  var h = await lease.acquire(locks, 'tab-A');
  assert.strictEqual(h.held, true);
  var timeoutWon = false;
  var result = await Promise.race([
    h.promise.then(function () { return 'resolved'; }),
    new Promise(function (r) { setTimeout(function () { timeoutWon = true; r('timeout'); }, 50); })
  ]);
  assert.strictEqual(result, 'timeout');
  assert.strictEqual(timeoutWon, true);
  await lease.release(h);
});

test('acquire với locks thiếu request -> held:false, không ném', async function () {
  var r = await lease.acquire({}, 'tab-A');
  assert.strictEqual(r.held, false);
  assert.strictEqual(r.owner, null);
  var r2 = await lease.acquire(null, 'tab-A');
  assert.strictEqual(r2.held, false);
});
