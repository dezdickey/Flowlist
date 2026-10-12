var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

/* ---- a stand-in for the database ---- */
var PUTS = [], GETS = 0, failNext = 0, remote = null;
function stubNet() {
  window.fetch = function (url, opt) {
    if (String(url).indexOf('firebaseio') === -1) return Promise.reject(new Error('not the database'));
    if (failNext > 0) { failNext--; return Promise.reject(new Error('offline')); }
    if (opt && opt.method === 'PUT') {
      remote = JSON.parse(opt.body);
      PUTS.push(remote);
      return Promise.resolve({ ok: true, status: 200 });
    }
    GETS++;
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(remote); } });
  };
}
/* a fake stream we can push messages down */
var streams = [];
function StubES(url) {
  this.url = url; this.listeners = {}; this.closed = false;
  streams.push(this);
}
StubES.prototype.addEventListener = function (k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); };
StubES.prototype.close = function () { this.closed = true; };
StubES.prototype.fire = function (k, data) {
  (this.listeners[k] || []).forEach(function (fn) { fn({ data: data === undefined ? undefined : JSON.stringify(data) }); });
};
var lastStream = function () { return streams[streams.length - 1]; };

function settle() {
  return Promise.resolve().then(function () {}).then(function () {}).then(function () {})
    .then(function () {}).then(function () {});
}
function cfgSet(o) {
  Store.mutate(function (s) {
    Object.keys(o).forEach(function (k) { s.settings.sync[k] = o[k]; });
  }, null, { silent: true });
}
var titles = function () {
  return Store.get().lists.map(function (l) { return l.name; }).join(',');
};

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    document.body.classList.remove('booting');
    document.body.classList.add('loaded');
    window.EventSource = StubES;
    stubNet();
    Store.reset();
    Sync.stop();

    /* ============================================================
       off until it is set up
       ============================================================ */
    ok('it starts switched off', !Sync.isOn());
    cfgSet({ on: true, url: '', room: '' });
    ok('...and stays off without a database to talk to', !Sync.isOn());
    cfgSet({ url: 'https://demo-default-rtdb.firebaseio.com', room: 'board-testroom', rev: 0 });
    ok('with both, it is on', Sync.isOn());
    ok('the room is a path under the database, not the root',
       Sync.roomUrl() === 'https://demo-default-rtdb.firebaseio.com/rooms/board-testroom.json',
       Sync.roomUrl());

    var key = Sync.randomKey();
    ok('a room key is long enough to be private', key.length >= 18, key);
    ok('...and a different one each time', key !== Sync.randomKey());

    /* ============================================================
       it never sends on the way in
       ============================================================ */
    PUTS = [];
    Sync.connect();
    ok('connecting opens a stream', !!lastStream() && !lastStream().closed);
    eq('...and sends nothing yet', PUTS.length, 0);

    /* an empty room: ours becomes the first copy */
    lastStream().fire('put', { path: '/', data: null });
    return settle().then(function () {
      eq('an empty room gets this board as its first copy', PUTS.length, 1);
      ok('...wrapped with who sent it', !!PUTS[0].from && PUTS[0].rev === 1);
      ok('...and the whole board inside', !!PUTS[0].state.lists);
      eq('...our revision moves with it', Store.settings().sync.rev, 1);

      /* ============================================================
         a change here goes out
         ============================================================ */
      PUTS = [];
      Store.addList('From this device');
      return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
        eq('a change is sent', PUTS.length, 1);
        eq('...with the next revision', PUTS[0].rev, 2);
        ok('...carrying the new category',
           PUTS[0].state.lists.some(function (l) { return l.name === 'From this device'; }));

        /* several changes in a row settle into one send */
        PUTS = [];
        Store.addList('A'); Store.addList('B'); Store.addList('C');
        return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
          eq('a flurry of changes goes as one', PUTS.length, 1);
          eq('...at one revision', PUTS[0].rev, 3);

          /* ============================================================
             what arrives from elsewhere
             ============================================================ */
          var theirs = {
            rev: 99, at: Date.now(), from: 'Phone',
            state: JSON.parse(Store.exportJSON())
          };
          theirs.state.lists = [{ id: 'x1', name: 'Only on the phone', color: '#5cc8ff', items: [], collapsed: false }];
          theirs.state.board = ['x1'];
          PUTS = [];
          remote = theirs;                 // the room holds what the stream says it does
          lastStream().fire('put', { path: '/', data: theirs });
          return settle().then(function () {
            eq('a newer board is adopted', titles(), 'Only on the phone');
            eq('...and our revision follows it', Store.settings().sync.rev, 99);
            eq('...without sending anything back', PUTS.length, 0);
            eq('...the status says where it came from', Sync.status().from, 'Phone');

            /* an older one is ignored */
            var stale = { rev: 12, at: Date.now(), from: 'Laptop', state: JSON.parse(Store.exportJSON()) };
            stale.state.lists = [{ id: 'old', name: 'Stale', color: '#fff', items: [], collapsed: false }];
            lastStream().fire('put', { path: '/', data: stale });
            return settle().then(function () {
              eq('an older board is ignored', titles(), 'Only on the phone');
              eq('...and our revision does not go backwards', Store.settings().sync.rev, 99);

              /* the same revision is not adopted either */
              var same = { rev: 99, at: Date.now(), from: 'Phone', state: JSON.parse(Store.exportJSON()) };
              same.state.lists = [{ id: 'z', name: 'Same rev', color: '#fff', items: [], collapsed: false }];
              lastStream().fire('put', { path: '/', data: same });
              return settle().then(function () {
                eq('the same revision changes nothing', titles(), 'Only on the phone');

                /* adopting keeps our own key and name, not theirs */
                ok('adopting keeps our room key', Store.settings().sync.room === 'board-testroom');
                ok('...and leaves sync switched on', Store.settings().sync.on === true);

                /* ============================================================
                   a change after adopting goes out on top
                   ============================================================ */
                PUTS = [];
                Store.addList('After the phone');
                return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
                  eq('editing after adopting sends', PUTS.length, 1);
                  eq('...one past what arrived', PUTS[0].rev, 100);

                  /* ============================================================
                     trouble
                     ============================================================ */
                  failNext = 1;
                  PUTS = [];
                  Store.addList('While offline');
                  return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
                    eq('a failed send posts nothing', PUTS.length, 0);
                    ok('...and says so', Sync.status().error.length > 0, Sync.status().error);
                    ok('...while the board is still fine locally',
                       Store.get().lists.some(function (l) { return l.name === 'While offline'; }));

                    Store.addList('Back again');
                    return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
                      eq('the next change goes out', PUTS.length, 1);
                      ok('...and the trouble clears', Sync.status().error === '');

                      /* a board too big to send says so rather than failing quietly */
                      var big = 'x';
                      for (var i = 0; i < 21; i++) big += big;      // ~2 MB
                      Store.addNode ? null : null;
                      Store.mutate(function (s) { s.canvases[0].nodes.push({ id: 'big', kind: 'image', src: big, x: 0, y: 0, w: 10, h: 10 }); }, null, { silent: true });
                      PUTS = [];
                      Sync.pushNow();
                      return settle().then(function () {
                        eq('a board too big to send is not sent', PUTS.length, 0);
                        ok('...and it says why', Sync.status().error.indexOf('too big') !== -1,
                           Sync.status().error);
                        Store.mutate(function (s) {
                          s.canvases[0].nodes = s.canvases[0].nodes.filter(function (n) { return n.id !== 'big'; });
                        }, null, { silent: true });

                        /* ============================================================
                           switching off
                           ============================================================ */
                        Sync.stop();
                        ok('stopping closes the stream', lastStream().closed);
                        eq('...and says it is off', Sync.status().state, 'off');
                        PUTS = [];
                        cfgSet({ on: false });
                        Store.addList('While off');
                        return new Promise(function (r) { setTimeout(r, 1400); }).then(settle).then(function () {
                          eq('nothing is sent while it is off', PUTS.length, 0);

                          /* ============================================================
                             the settings panel
                             ============================================================ */
                          cfgSet({ on: false, url: '', room: '' });
                          Themes.openDrawer();
                          var names = [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
                            .map(function (r) { return r.textContent; });
                          ok('there is a Sync switch', names.indexOf('Sync between devices') !== -1,
                             names.join(' | '));
                          var row = [].slice.call(document.querySelectorAll('#settings-body .toggle-row'))
                            .filter(function (r) {
                              var n = r.querySelector('.tr-name');
                              return n && n.textContent === 'Sync between devices';
                            })[0];
                          var sub = row.nextElementSibling;
                          ok('...its details are folded away while it is off',
                             sub.classList.contains('is-hidden'));
                          row.querySelector('.switch').click();
                          ok('turning it on opens them', !sub.classList.contains('is-hidden'));
                          ok('...and makes a room key for you',
                             /^board-[a-z2-9]{14}$/.test(Store.settings().sync.room),
                             Store.settings().sync.room);
                          var after = [].slice.call(document.querySelectorAll('#settings-body .tr-name'))
                            .map(function (r) { return r.textContent; });
                          ok('...asking for the database URL', after.indexOf('Database URL') !== -1);
                          ok('...the room key', after.indexOf('Room key') !== -1);
                          ok('...and what to call this device', after.indexOf('This device is called') !== -1);
                          Themes.closeDrawer();
                          Sync.stop();

                          /* an older save picks it up switched off */
                          var older = JSON.parse(Store.exportJSON());
                          delete older.settings.sync;
                          Store.importJSON(JSON.stringify(older));
                          ok('a save from before sync existed opens with it off',
                             Store.settings().sync && Store.settings().sync.on === false);
                          eq('...and no room key', Store.settings().sync.room, '');
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'SYNC ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'syncresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2600);
