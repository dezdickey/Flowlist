var OUT = [], PASS = 0, FAIL = 0;
function ok(n, c, e) { (c ? PASS++ : FAIL++); OUT.push((c ? 'PASS  ' : 'FAIL  ') + n + (e !== undefined && !c ? '   [' + e + ']' : '')); }
function eq(n, got, want) { ok(n, got === want, 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }

/* ---- harness ---- */
var posts = [], failNext = 0;
function stubFetch() {
  window.fetch = function (url, opt) {
    if (failNext > 0) { failNext--; return Promise.reject(new Error('offline')); }
    posts.push({ url: url, body: JSON.parse(opt.body) });
    return Promise.resolve({ ok: true, status: 200 });
  };
}
/* let the send promises finish */
function settle() {
  return Promise.resolve().then(function () {}).then(function () {}).then(function () {}).then(function () {});
}
function at(h, m) { var d = new Date(); d.setHours(h, m || 0, 0, 0); return d.getTime(); }
function cfgSet(o) {
  Store.mutate(function (s) {
    Object.keys(o).forEach(function (k) { s.settings.ntfy[k] = o[k]; });
  }, null, { silent: true });
}
function clearSent() { Store.mutate(function (s) { s.settings.ntfy.sent = {}; }, null, { silent: true }); }
/* the module is only ever "on" for the length of one deliberate pass, so the
   background interval cannot wander in and send something mid-test */
function runAt(now) {
  cfgSet({ on: true });
  var r = Ntfy.pass(now);
  cfgSet({ on: false });
  return r;
}
function since(n) { return posts.slice(n).map(function (p) { return p.body.message; }); }
function seedToday(hours) {
  var s = Store.get(), items = [];
  s.lists.forEach(function (l) { l.items.forEach(function (i) { items.push({ listId: l.id, item: i }); }); });
  Store.mutate(function (st) { st.today.length = 0; }, null, { silent: true });
  var picked = [];
  hours.forEach(function (h, n) {
    var e = items[n];
    Store.mutate(function () { e.item.hour = h; e.item.done = false; }, null, { silent: true });
    Store.addToToday(e.listId, e.item.id);
    picked.push(e);
  });
  clearSent();
  return picked;
}

setTimeout(function () {
  Promise.resolve().then(function () {
    var sp = document.getElementById('splash'); if (sp) sp.remove();
    Ntfy.stop();
    stubFetch();
    Store.reset();
    Ntfy.stop();
    cfgSet({ on: false, topic: 'flowlist-testtopic', lead: 30, alert2: false, lead2: 50,
             timeFormat: 'compact', heading: 'left', priority: 'normal',
             skipDone: true, ahead: false, sent: {} });

    /* ============================================================
       how the time reads
       ============================================================ */
    eq('10pm', Ntfy.hourText(22, 'compact'), '10pm');
    eq('7am', Ntfy.hourText(7, 'compact'), '7am');
    eq('noon is 12pm', Ntfy.hourText(12, 'compact'), '12pm');
    eq('the timeline calls midnight 24', Ntfy.hourText(24, 'compact'), '12am');
    eq('spaced', Ntfy.hourText(22, 'spaced'), '10 PM');
    eq('with minutes', Ntfy.hourText(22, 'clock'), '10:00 PM');
    eq('24 hour', Ntfy.hourText(22, '24'), '22:00');
    eq('24 hour pads', Ntfy.hourText(7, '24'), '07:00');
    eq('24 hour midnight', Ntfy.hourText(24, '24'), '00:00');
    eq('an unknown format falls back to the compact one', Ntfy.hourText(22, 'wat'), '10pm');

    eq('minutes', Ntfy.leadText(30), '30 min');
    eq('an exact hour', Ntfy.leadText(60), '1 hr');
    eq('an hour and a bit', Ntfy.leadText(90), '1 hr 30 min');

    /* ============================================================
       the message
       ============================================================ */
    var p = { hour: 22, text: 'Call parents at 11 pm', lead: 30, alert: 0 };
    eq('the hour goes in front of the task',
       Ntfy.messageFor(p, Store.settings().ntfy), '10pm Call parents at 11 pm');
    cfgSet({ timeFormat: '24' });
    eq('...in whichever format is set',
       Ntfy.messageFor(p, Store.settings().ntfy), '22:00 Call parents at 11 pm');
    cfgSet({ timeFormat: 'compact' });
    ok('an untitled task still says something',
       Ntfy.messageFor({ hour: 22, text: '' }, Store.settings().ntfy) === '10pm Untitled');

    eq('the heading counts down', Ntfy.headingFor(p, { heading: 'left' }), 'In 30 min');
    eq('...or names the app', Ntfy.headingFor(p, { heading: 'app' }), 'Flowlist');
    eq('...or repeats the hour', Ntfy.headingFor(p, { heading: 'time', timeFormat: 'compact' }), '10pm');
    eq('...or is left off', Ntfy.headingFor(p, { heading: 'none' }), '');

    /* ============================================================
       what gets planned
       ============================================================ */
    seedToday([22, 22, 22, 22]);
    eq('one alert per item', Ntfy.plan(at(9)).length, 4);
    cfgSet({ alert2: true });
    eq('two alerts each once the early one is on', Ntfy.plan(at(9)).length, 8);
    var planned = Ntfy.plan(at(9));
    ok('the earliest goes first', planned[0].fire <= planned[7].fire);
    eq('the main alert lands 30 min before the hour', planned[7].fire, at(21, 30));
    eq('the early one lands 50 min before', planned[0].fire, at(21, 10));
    cfgSet({ alert2: false });

    var five = Ntfy.plan(at(9))[0];
    eq('an hour means that hour today', five.target, at(22));
    eq('midnight belongs to the end of today', Ntfy.targetFor(24, at(9)), at(24));

    /* items with no hour, and things not in Do Today, are not scheduled */
    var all = Ntfy.plan(at(9)).length;
    Store.mutate(function (s) { s.lists[1].items[0].hour = 22; }, null, { silent: true });
    eq('an hour on a note outside Do Today schedules nothing', Ntfy.plan(at(9)).length, all);

    /* ============================================================
       one notification per thing, at the right moment
       ============================================================ */
    var mark0 = posts.length;
    runAt(at(21, 29));
    return settle().then(function () {
      eq('nothing goes a minute early', posts.length - mark0, 0);

      var mark = posts.length;
      runAt(at(21, 30));
      return settle().then(function () {
        eq('four things at 10pm send four notifications', posts.length - mark, 4);
        var msgs = since(mark);
        ok('each one names its own task', msgs.join('|').indexOf('10pm Review the Q3 numbers') !== -1, msgs.join(' | '));
        ok('every message leads with the hour',
           msgs.every(function (m) { return m.indexOf('10pm ') === 0; }), msgs.join(' | '));
        eq('the heading says how long is left', posts[mark].body.title, 'In 30 min');
        eq('it goes to the topic', posts[mark].body.topic, 'flowlist-testtopic');
        eq('at normal priority', posts[mark].body.priority, 3);
        eq('and to the server root', posts[mark].url, 'https://ntfy.sh/');
        ok('nothing is scheduled for later', posts[mark].body.delay === undefined);

        /* the same pass again must not repeat itself */
        var m2 = posts.length;
        runAt(at(21, 31));
        return settle().then(function () {
          eq('a second look sends nothing twice', posts.length - m2, 0);

          /* nor does changing the lead after the fact */
          cfgSet({ lead: 45 });
          runAt(at(21, 40));
          return settle().then(function () {
            eq('moving the lead does not re-send', posts.length - m2, 0);
            cfgSet({ lead: 30 });

            /* ============================================================
               once the hour has come round, the moment has passed
               ============================================================ */
            seedToday([22]);
            var m3 = posts.length;
            runAt(at(22, 5));
            return settle().then(function () {
              eq('nothing arrives after the hour it was for', posts.length - m3, 0);

              /* ============================================================
                 two alerts
                 ============================================================ */
              seedToday([22]);
              cfgSet({ alert2: true, lead2: 50 });
              var m4 = posts.length;
              runAt(at(21, 10));
              return settle().then(function () {
                eq('the heads-up goes first', posts.length - m4, 1);
                eq('...and says how far out it is', posts[m4].body.title, 'In 50 min');
                runAt(at(21, 30));
                return settle().then(function () {
                  eq('the reminder follows', posts.length - m4, 2);
                  eq('...with its own countdown', posts[m4 + 1].body.title, 'In 30 min');

                  /* opened late: both are ripe, but one buzz is enough */
                  seedToday([22]);
                  var m5 = posts.length;
                  runAt(at(21, 35));
                  return settle().then(function () {
                    eq('catching up sends one, not two', posts.length - m5, 1);
                    eq('...the later of the two', posts[m5].body.title, 'In 30 min');
                    runAt(at(21, 40));
                    return settle().then(function () {
                      eq('and the missed one is written off', posts.length - m5, 1);
                      cfgSet({ alert2: false });

                      /* ============================================================
                         what is skipped
                         ============================================================ */
                      var picked = seedToday([22]);
                      Store.mutate(function () { picked[0].item.done = true; }, null, { silent: true });
                      var m6 = posts.length;
                      runAt(at(21, 30));
                      return settle().then(function () {
                        eq('a finished task says nothing', posts.length - m6, 0);
                        cfgSet({ skipDone: false });
                        clearSent();
                        runAt(at(21, 30));
                        return settle().then(function () {
                          eq('...unless you asked to be told anyway', posts.length - m6, 1);
                          cfgSet({ skipDone: true });

                          /* off, or with no topic, is silence */
                          seedToday([22]);
                          var m7 = posts.length;
                          Ntfy.pass(at(21, 30));
                          return settle().then(function () {
                            eq('switched off, nothing is sent', posts.length - m7, 0);
                            cfgSet({ topic: '' });
                            runAt(at(21, 30));
                            return settle().then(function () {
                              eq('without a topic, nothing is sent', posts.length - m7, 0);
                              cfgSet({ topic: 'flowlist-testtopic' });

                              /* ============================================================
                                 wording carries through to the wire
                                 ============================================================ */
                              seedToday([24]);
                              cfgSet({ timeFormat: 'clock', heading: 'app', priority: 'urgent' });
                              var m8 = posts.length;
                              runAt(at(23, 30));
                              return settle().then(function () {
                                eq('midnight reads as 12:00 AM',
                                   posts[m8].body.message.indexOf('12:00 AM ') === 0, true);
                                eq('the heading follows the setting', posts[m8].body.title, 'Flowlist');
                                eq('urgent is priority 5', posts[m8].body.priority, 5);
                                eq('it carries a tag', posts[m8].body.tags.length, 1);
                                cfgSet({ timeFormat: 'compact', heading: 'left', priority: 'normal' });

                                /* no heading at all leaves the field off */
                                seedToday([22]);
                                cfgSet({ heading: 'none' });
                                var m9 = posts.length;
                                runAt(at(21, 30));
                                return settle().then(function () {
                                  ok('no heading means no title field', posts[m9].body.title === undefined);
                                  cfgSet({ heading: 'left' });

                                  /* a server of your own */
                                  seedToday([22]);
                                  cfgSet({ server: 'https://push.example.com/' });
                                  var m10 = posts.length;
                                  runAt(at(21, 30));
                                  return settle().then(function () {
                                    eq('a custom server is used, with one slash',
                                       posts[m10].url, 'https://push.example.com/');
                                    cfgSet({ server: 'https://ntfy.sh' });

                                    /* ============================================================
                                       handing them over early
                                       ============================================================ */
                                    seedToday([22, 23]);
                                    cfgSet({ ahead: true });
                                    var m11 = posts.length;
                                    runAt(at(9));
                                    return settle().then(function () {
                                      eq('both are handed to ntfy in advance', posts.length - m11, 2);
                                      eq('...timed for the moment they are wanted',
                                         posts[m11].body.delay, String(at(21, 30) / 1000));
                                      var m12 = posts.length;
                                      runAt(at(9, 5));
                                      return settle().then(function () {
                                        eq('a second pass hands nothing over twice', posts.length - m12, 0);
                                        runAt(at(21, 30));
                                        return settle().then(function () {
                                          eq('and it is not sent again on the day', posts.length - m12, 0);
                                          cfgSet({ ahead: false });

                                          /* ============================================================
                                             a send that fails is tried again
                                             ============================================================ */
                                          seedToday([22]);
                                          failNext = 1;
                                          var m13 = posts.length;
                                          runAt(at(21, 30));
                                          return settle().then(function () {
                                            eq('a failed send posts nothing', posts.length - m13, 0);
                                            ok('...and is reported', Ntfy.status().error.length > 0, Ntfy.status().error);
                                            runAt(at(21, 31));
                                            return settle().then(function () {
                                              eq('the next look tries it again', posts.length - m13, 1);
                                              ok('...and the trouble clears', Ntfy.status().error === '');

                                              /* ============================================================
                                                 the log of what has gone
                                                 ============================================================ */
                                              var log = Store.settings().ntfy.sent;
                                              ok('sends are remembered', Object.keys(log).length > 0);
                                              Store.mutate(function (s) {
                                                s.settings.ntfy.sent['stale|1|0'] = at(22) - 72 * 3600 * 1000;
                                              }, null, { silent: true });
                                              seedToday([22]);
                                              Store.mutate(function (s) {
                                                s.settings.ntfy.sent['stale|1|0'] = at(22) - 72 * 3600 * 1000;
                                              }, null, { silent: true });
                                              runAt(at(9));
                                              return settle().then(function () {
                                                ok('yesterday drops out of it',
                                                   Store.settings().ntfy.sent['stale|1|0'] === undefined);

                                                Store.flush();
                                                ok('the settings are saved',
                                                   JSON.parse(localStorage.getItem('flowlist.state.v1'))
                                                     .settings.ntfy.topic === 'flowlist-testtopic');

                                                var older = JSON.parse(Store.exportJSON());
                                                delete older.settings.ntfy;
                                                Store.importJSON(JSON.stringify(older));
                                                Ntfy.stop();
                                                var c = Store.settings().ntfy;
                                                ok('a save from before this existed still opens', !!c);
                                                eq('...switched off', c.on, false);
                                                eq('...at half an hour', c.lead, 30);
                                                ok('...with an empty log', c.sent && Object.keys(c.sent).length === 0);

                                                eq('a fresh topic is long enough to be private',
                                                   Ntfy.randomTopic().length > 16, true);
                                                ok('...and is a different one each time',
                                                   Ntfy.randomTopic() !== Ntfy.randomTopic());

                                                /* ============================================================
                                                   the settings panel
                                                   ============================================================ */
                                                Store.mutate(function (s) { s.today.length = 0; }, null, { silent: true });
                                                cfgSet({ on: false, topic: '', sent: {} });
                                                Themes.openDrawer();
                                                var groups = [].slice.call(document.querySelectorAll('.set-group'));
                                                var phone = groups.filter(function (g) {
                                                  return g.querySelector('.set-label').textContent === 'Phone';
                                                })[0];
                                                ok('there is a Phone group in Settings', !!phone);
                                                var rows = [].slice.call(phone.querySelectorAll('.tr-name'))
                                                  .map(function (r) { return r.textContent; });
                                                ok('the master switch is there', rows.indexOf('Send to my phone') !== -1, rows.join(' | '));
                                                ok('so is the lead', rows.indexOf('How early it goes') !== -1);
                                                ok('so is the second alert', rows.indexOf('A second, earlier one') !== -1);
                                                ok('so is the time format', rows.indexOf('How the time reads') !== -1);
                                                ok('so is the heading', rows.indexOf('Heading') !== -1);
                                                ok('and the server', rows.indexOf('Server') !== -1);

                                                var sub = phone.querySelector('.sub-rows');
                                                ok('the details stay folded away while it is off',
                                                   sub.classList.contains('is-hidden'));
                                                var master = phone.querySelector('.switch');
                                                master.click();
                                                Ntfy.stop();
                                                ok('turning it on opens them up', !sub.classList.contains('is-hidden'));
                                                ok('...and a topic word is made for you',
                                                   /^flowlist-[a-z2-9]{12}$/.test(Store.settings().ntfy.topic),
                                                   Store.settings().ntfy.topic);
                                                eq('...which is filled into the box',
                                                   phone.querySelector('.set-input').value, Store.settings().ntfy.topic);

                                                var body = phone.querySelector('.np-body');
                                                eq('the preview shows what the phone will get',
                                                   body.textContent, '10pm Call parents at 11 pm');
                                                eq('...under a heading', phone.querySelector('.np-head').textContent, 'In 30 min');

                                                /* changing the wording repaints it without a full re-render */
                                                var segs = [].slice.call(phone.querySelectorAll('.segmented'))[0]
                                                  .querySelectorAll('.seg');
                                                segs[3].click();     // 22:00
                                                eq('picking a format updates the preview',
                                                   phone.querySelector('.np-body').textContent, '22:00 Call parents at 11 pm');
                                                ok('...and moves the pill', segs[3].classList.contains('on') && !segs[0].classList.contains('on'));
                                                eq('...and is remembered', Store.settings().ntfy.timeFormat, '24');
                                                segs[0].click();

                                                var heads = [].slice.call(phone.querySelectorAll('.segmented'))[1]
                                                  .querySelectorAll('.seg');
                                                heads[3].click();    // none
                                                ok('turning the heading off takes it out of the preview',
                                                   !phone.querySelector('.np-head'));
                                                heads[0].click();

                                                var before = posts.length;
                                                phone.querySelector('.set-btn').click();
                                                return settle().then(function () {
                                                  eq('the test button sends one', posts.length - before, 1);
                                                  eq('...worded like the real thing',
                                                     posts[before].body.message, '10pm Call parents at 11 pm');
                                                  Themes.closeDrawer();
                                                  Ntfy.stop();
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
    });
  }).catch(function (e) {
    FAIL++; OUT.push('THREW  ' + (e && e.stack ? e.stack : e));
  }).then(function () {
    document.title = 'NTFY ' + PASS + ' passed ' + FAIL + ' failed';
    var pre = document.createElement('pre'); pre.id = 'ntfyresults';
    pre.textContent = OUT.join('\n');
    document.body.appendChild(pre);
  });
}, 2400);
