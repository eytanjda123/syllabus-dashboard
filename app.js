/* =============================================================================
   Coursework — a personal syllabus dashboard
   Reads courses/manifest.json, then one JSON file per course. No backend.
   ============================================================================= */

(function () {
  'use strict';

  /* --------------------------------------------------------------- constants */

  var TYPES = ['reading', 'assignment', 'exam', 'project', 'deliverable', 'other'];
  var TYPE_LABEL = {
    reading: 'Reading',
    assignment: 'Assignment',
    exam: 'Exam',
    project: 'Project',
    deliverable: 'Deliverable',
    other: 'Other'
  };
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var URGENT_HOURS = 48;

  /* ----------------------------------------------------------------- storage */

  var KEY = {
    completed: 'sd.completed',
    pool: 'sd.poolSelected',
    monthDots: 'sd.monthDots',
    view: 'sd.view'
  };

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private browsing, quota — non-fatal */ }
  }

  var completed = read(KEY.completed, {});
  var poolSelected = read(KEY.pool, {});

  function itemKey(courseId, itemId) { return courseId + '::' + itemId; }
  function domId(key) { return key.replace(/:/g, '-'); }
  function isDone(it) { return !!completed[itemKey(it.courseId, it.id)]; }
  function isPlanned(it) { return !!poolSelected[itemKey(it.courseId, it.id)]; }

  /* ------------------------------------------------------- cross-device sync
     No server involved: progress travels as a link or a file, device to
     device, and merges in additively (it only ever adds checked-off items,
     never removes them). */

  function b64urlEncode(str) {
    var b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return null; }
  }

  function syncPayload() {
    return { completed: completed, poolSelected: poolSelected };
  }

  function mergeSyncData(data) {
    var n = 0;
    function mergeInto(target, src) {
      if (!src) return;
      Object.keys(src).forEach(function (k) {
        if (src[k] && !target[k]) { target[k] = true; n++; }
      });
    }
    mergeInto(completed, data.completed);
    mergeInto(poolSelected, data.poolSelected);
    if (n) {
      write(KEY.completed, completed);
      write(KEY.pool, poolSelected);
    }
    return n;
  }

  function importSyncPayload(payloadB64) {
    var json = b64urlDecode(payloadB64);
    if (!json) return 0;
    var data;
    try { data = JSON.parse(json); } catch (e) { return 0; }
    return mergeSyncData(data);
  }

  function buildSyncLink() {
    return window.location.href.split('#')[0] + '#/sync/import/' + b64urlEncode(JSON.stringify(syncPayload()));
  }

  function copySyncLink() {
    var url = buildSyncLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        state.syncMessage = 'Sync link copied. Send it to your other device (Messages, email, AirDrop) and open it there — it merges in automatically.';
        render();
      }, function () { showSyncLinkFallback(url); });
    } else {
      showSyncLinkFallback(url);
    }
  }

  function showSyncLinkFallback(url) {
    state.syncMessage = 'Could not copy automatically — tap the link below, select all, and copy it yourself.';
    state.syncFallbackLink = url;
    render();
  }

  function downloadSyncFile() {
    var data = syncPayload();
    data.exportedAt = new Date().toISOString();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'coursework-progress-' + ymd(today()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    state.syncMessage = 'Backup file downloaded. Import it on another device the same way.';
    render();
  }

  function countKeys(obj) { return Object.keys(obj).filter(function (k) { return obj[k]; }).length; }

  /* ------------------------------------------------------------------- state */

  var state = {
    courses: [],
    archive: [],
    manifest: null,
    view: read(KEY.view, 'day'),
    selected: null,       // 'YYYY-MM-DD'
    monthAnchor: null,    // Date, first of displayed month
    weekAnchor: null,     // Date, Monday of displayed week
    expanded: {},         // itemKey -> true (session only)
    loadErrors: []
  };

  /* ------------------------------------------------------------------- dates */

  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // Sunday-first index
  function dowIndex(d) { return d.getDay(); }

  function startOfWeek(d) { return addDays(d, -dowIndex(d)); }

  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  // Deadline moment: the stated time, or end of day when none is given.
  function dueAt(it) {
    var d = parseDate(it.date);
    if (!d) return null;
    if (it.time && /^\d{1,2}:\d{2}$/.test(it.time)) {
      var p = it.time.split(':');
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), +p[0], +p[1]);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
  }

  function fmtTime(t) {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return '';
    var p = t.split(':'), h = +p[0], m = p[1];
    var suffix = h < 12 ? 'am' : 'pm';
    var hr = h % 12; if (hr === 0) hr = 12;
    return hr + ':' + m + suffix;
  }

  function fmtDayLong(d) {
    return DAY_SHORT[dowIndex(d)] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function fmtDayShort(d) {
    return DAY_SHORT[dowIndex(d)] + ' ' + MON_SHORT[d.getMonth()] + ' ' + d.getDate();
  }

  // Relative label used in the urgent bar and nudges
  function fmtWhen(it) {
    var d = parseDate(it.date), t0 = today();
    var diff = daysBetween(t0, d);
    var label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Tomorrow';
    else if (diff === -1) label = 'Yesterday';
    else if (diff > 1 && diff < 7) label = DAY_SHORT[dowIndex(d)];
    else label = MON_SHORT[d.getMonth()] + ' ' + d.getDate();
    var tm = fmtTime(it.time);
    return tm ? label + ' ' + tm : label;
  }

  /* ------------------------------------------------------------------ escape */

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function attr(s) { return esc(s); }

  /* ------------------------------------------------------------- data loading */

  function normalizeCourse(course, sourcePath) {
    course.sourcePath = sourcePath;
    course.items = (course.items || []).map(function (it) {
      it.courseId = course.courseId;
      it.courseName = course.courseName;
      if (TYPES.indexOf(it.type) === -1) it.type = 'other';
      if (!it.pool) it.pool = { isPool: false, poolId: null, requiredCount: null, totalOptions: null };
      it._due = dueAt(it);
      return it;
    }).filter(function (it) { return !!it._due; });
    course.items.sort(function (a, b) { return a._due - b._due; });
    course.classSessions = course.classSessions || [];
    return course;
  }

  function fetchJSON(path) {
    // The single-file preview build inlines its data; the deployed site fetches.
    if (window.SD_EMBED && window.SD_EMBED[path]) {
      return Promise.resolve(JSON.parse(JSON.stringify(window.SD_EMBED[path])));
    }
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.json();
    });
  }

  function loadAll() {
    return fetchJSON('courses/manifest.json').then(function (manifest) {
      state.manifest = manifest;
      var active = manifest.courses || [];
      var archived = manifest.archive || [];

      function loadList(paths, bucket) {
        return Promise.all(paths.map(function (p) {
          return fetchJSON(p).then(function (c) {
            return normalizeCourse(c, p);
          }).catch(function (e) {
            state.loadErrors.push(p + ' — ' + e.message);
            return null;
          });
        })).then(function (list) {
          list.forEach(function (c) {
            if (!c) return;
            if (c.archived === true && bucket === state.courses) state.archive.push(c);
            else bucket.push(c);
          });
        });
      }

      return Promise.all([
        loadList(active, state.courses),
        loadList(archived, state.archive)
      ]);
    });
  }

  /* --------------------------------------------------------------- queries */

  function activeItems() {
    var out = [];
    state.courses.forEach(function (c) {
      c.items.forEach(function (it) { out.push(it); });
    });
    out.sort(function (a, b) { return a._due - b._due; });
    return out;
  }

  function itemsOn(dateStr) {
    return activeItems().filter(function (it) { return it.date === dateStr; });
  }

  function courseById(id, includeArchive) {
    var pool = includeArchive ? state.courses.concat(state.archive) : state.courses;
    for (var i = 0; i < pool.length; i++) if (pool[i].courseId === id) return pool[i];
    return null;
  }

  // Everything due in the next 48 hours, still open. Never touched by completion
  // of *other* items — this is pure date arithmetic against the real clock.
  function urgentItems() {
    var now = new Date();
    var limit = new Date(now.getTime() + URGENT_HOURS * 3600000);
    return activeItems().filter(function (it) {
      return !isDone(it) && it._due >= now && it._due <= limit;
    });
  }

  function lookAheadItems() {
    var now = new Date();
    return activeItems().filter(function (it) {
      return it.major && !isDone(it) && it._due >= now;
    });
  }

  function poolStats(course, poolId) {
    var members = course.items.filter(function (it) {
      return it.pool && it.pool.isPool && it.pool.poolId === poolId;
    });
    var required = members.length ? (members[0].pool.requiredCount || 0) : 0;
    var total = members.length ? (members[0].pool.totalOptions || members.length) : 0;
    var done = members.filter(isDone).length;
    var planned = members.filter(function (it) { return isPlanned(it) && !isDone(it); }).length;
    var remainingOpen = members.filter(function (it) {
      return !isDone(it) && it._due >= new Date();
    }).length;
    return { members: members, required: required, total: total, done: done, planned: planned, remainingOpen: remainingOpen };
  }

  function poolIdsFor(course) {
    var seen = {}, out = [];
    course.items.forEach(function (it) {
      if (it.pool && it.pool.isPool && it.pool.poolId && !seen[it.pool.poolId]) {
        seen[it.pool.poolId] = true;
        out.push(it.pool.poolId);
      }
    });
    return out;
  }

  function shortCourse(name) {
    if (!name) return '';
    return name.length > 26 ? name.slice(0, 24).replace(/\s+\S*$/, '') + '…' : name;
  }

  /* ---------------------------------------------------------- item rendering */

  function dotsFor(items) {
    // Group by type so the mix of work is visible, not just the count.
    var counts = {};
    items.forEach(function (it) {
      var t = TYPES.indexOf(it.type) === -1 ? 'other' : it.type;
      if (!counts[t]) counts[t] = { open: 0, done: 0 };
      if (isDone(it)) counts[t].done++; else counts[t].open++;
    });
    var html = '';
    TYPES.forEach(function (t) {
      if (!counts[t]) return;
      var c = counts[t];
      for (var i = 0; i < Math.min(c.open, 6); i++) {
        html += '<span class="dot dot-' + t + '" title="' + attr(TYPE_LABEL[t]) + '"></span>';
      }
      for (var j = 0; j < Math.min(c.done, 4); j++) {
        html += '<span class="dot dot--hollow dot-' + t + '" title="' + attr(TYPE_LABEL[t] + ' (done)') + '"></span>';
      }
    });
    return html;
  }

  function renderItem(it, opts) {
    opts = opts || {};
    var key = itemKey(it.courseId, it.id);
    var open = !!state.expanded[key];
    var done = isDone(it);
    var overdue = !done && it._due < new Date();
    var urgent = !done && (it._due - new Date()) <= URGENT_HOURS * 3600000;
    var isPool = !!(it.pool && it.pool.isPool);

    var cls = 'item';
    if (done) cls += ' item--done';
    if (isPool) cls += ' item--pool';
    if (overdue && opts.flagOverdue !== false) cls += ' item--overdue';
    if (urgent && opts.flagOverdue !== false) cls += ' item--urgent';

    var meta = [];
    if (opts.showDate) meta.push('<span>' + esc(fmtWhen(it)) + '</span>');
    else if (it.time) meta.push('<span>' + esc(fmtTime(it.time)) + '</span>');
    if (opts.showCourse) meta.push('<span>' + esc(shortCourse(it.courseName)) + '</span>');
    if (isPool) {
      var course = courseById(it.courseId, true);
      var st = course ? poolStats(course, it.pool.poolId) : null;
      if (st) {
        meta.push('<span class="poolchip' + (st.done >= st.required ? ' poolchip--met' : '') + '">' +
          st.done + ' of ' + st.required + ' done' +
          (st.planned ? ', ' + st.planned + ' planned' : '') + '</span>');
      }
    }

    var html = '';
    html += '<li class="' + cls + '" id="item-' + domId(key) + '">';
    html += '<input class="check" type="checkbox" data-complete="' + attr(key) + '"' +
            (done ? ' checked' : '') + ' aria-label="Mark ' + attr(it.summary) + ' complete">';
    html += '<div class="body">';
    html += '<button class="disclose" type="button" data-toggle="' + attr(key) + '" aria-expanded="' + (open ? 'true' : 'false') + '">';
    html += '<span class="itemtag itemtag-' + it.type + '">' + esc(TYPE_LABEL[it.type]) + '</span>';
    html += '<span class="summary">' + esc(it.summary) + '</span>';
    if (meta.length) html += '<span class="meta">' + meta.join('') + '</span>';
    html += '</button>';

    if (open) {
      html += '<div class="detail">';
      html += '<p class="verbatim">' + esc(it.verbatim || 'No original text was captured for this item.') + '</p>';
      var link = it.link || {};
      if (link.url) {
        html += '<p class="resource">';
        html += '<a href="' + attr(link.url) + '" target="_blank" rel="noopener noreferrer">Open the resource</a>';
        if (link.sourceType === 'claude-found') html += '<span class="found">found by Claude</span>';
        html += '</p>';
        if (link.sourceType === 'claude-found' && link.note) {
          html += '<p class="found-note">' + esc(link.note) + '</p>';
        }
      }
      if (isPool) {
        html += '<p class="resource"><button class="btn" type="button" data-plan="' + attr(key) + '">' +
          (isPlanned(it) ? 'Remove from my plan' : 'Plan to do this one') + '</button></p>';
      }
      html += '</div>';
    }

    html += '</div></li>';
    return html;
  }

  function renderItemList(items, opts) {
    if (!items.length) return '';
    return '<ul class="items">' + items.map(function (it) { return renderItem(it, opts); }).join('') + '</ul>';
  }

  function renderDayDetail(dateStr) {
    var d = parseDate(dateStr);
    var items = itemsOn(dateStr);
    var html = '';
    var doneToday = items.filter(isDone).length;
    html += '<h2 class="section-head">' + esc(fmtDayLong(d));
    html += '<span class="sub">' + (items.length ? doneToday + ' of ' + items.length + ' done' : 'nothing due') + '</span></h2>';

    // Class sessions that meet today, with any deviation flagged.
    var sessions = [];
    state.courses.forEach(function (c) {
      c.classSessions.forEach(function (s) {
        if (s.date === dateStr) sessions.push({ course: c, s: s });
      });
    });
    if (sessions.length) {
      html += '<p class="legend">' + sessions.map(function (x) {
        return '<span>' + esc(shortCourse(x.course.courseName)) +
          (x.s.time ? ' at ' + esc(fmtTime(x.s.time)) : '') +
          ' — ' + esc(x.s.topic) +
          (x.s.note ? ' <strong>(' + esc(x.s.note) + ')</strong>' : '') + '</span>';
      }).join('') + '</p>';
    }

    if (!items.length) {
      html += '<p class="empty">No readings or deadlines on this day.</p>';
      return html;
    }

    // Grouped by course so the day reads as "what each class wants from me".
    var byCourse = {};
    items.forEach(function (it) {
      if (!byCourse[it.courseId]) byCourse[it.courseId] = [];
      byCourse[it.courseId].push(it);
    });

    state.courses.forEach(function (c) {
      var list = byCourse[c.courseId];
      if (!list) return;
      var listDone = list.filter(isDone).length;
      html += '<section class="coursegroup">';
      html += '<h4><a href="#/course/' + attr(c.courseId) + '">' + esc(c.courseName) + '</a>' +
              (c.section ? '<span class="sub">' + esc(c.section) + '</span>' : '') +
              '<span class="donecount">' + listDone + ' of ' + list.length + '</span></h4>';
      html += renderItemList(list, {});
      html += '</section>';
    });

    return html;
  }

  /* ------------------------------------------------------------- urgent strip */

  function renderUrgent() {
    var el = document.getElementById('urgent');
    var items = urgentItems();
    if (!items.length) {
      el.className = 'urgent urgent--quiet';
      el.innerHTML = '<span class="urgent-label">Next 48 hours</span><ul><li>Nothing due.</li></ul>';
      return;
    }
    el.className = 'urgent';
    el.innerHTML = '<span class="urgent-label">Next 48 hours</span><ul>' +
      items.map(function (it) {
        return '<li><span class="when">' + esc(fmtWhen(it)) + '</span>' +
          '<span><a href="#/course/' + attr(it.courseId) + '">' + esc(shortCourse(it.courseName)) + '</a> — ' +
          esc(it.summary) + '</span></li>';
      }).join('') + '</ul>';
  }

  /* ------------------------------------------------------------------ nudges */

  function renderLookAhead() {
    var items = lookAheadItems();
    if (!items.length) return '';
    var html = '<section class="nudge nudge--ahead"><h3>Further out</h3>';
    html += '<p class="sub">Bigger milestones for the rest of the semester — projects, exams, essays, presentations, and the like. Readings and routine assignments aren\'t included.</p>';
    html += '<ul>' + items.map(function (it) {
      var days = daysBetween(today(), parseDate(it.date));
      var when = days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's');
      return '<li><span class="when">' + when + '</span><span>' +
        esc(shortCourse(it.courseName)) + ' — <strong class="kind kind-' + it.type + '">' +
        esc(TYPE_LABEL[it.type]) + '</strong>: <span class="desc">' + esc(it.summary) + '</span></span></li>';
    }).join('') + '</ul></section>';
    return html;
  }

  /* -------------------------------------------------------------- home views */

  function renderViewBar() {
    var html = '<div class="viewbar">';
    html += '<div class="segmented" role="group" aria-label="Time range">';
    ['day', 'week', 'month'].forEach(function (v, i) {
      html += '<button type="button" data-view="' + v + '" aria-pressed="' + (state.view === v ? 'true' : 'false') + '">' +
        v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
    });
    html += '</div>';

    if (state.view === 'month') {
      html += '<label class="toggle-line"><input type="checkbox" id="dotsToggle"' +
        (read(KEY.monthDots, true) ? ' checked' : '') + '> Show workload colours</label>';
    }

    var range;
    if (state.view === 'month') range = MONTHS[state.monthAnchor.getMonth()] + ' ' + state.monthAnchor.getFullYear();
    else if (state.view === 'week') range = fmtDayShort(state.weekAnchor) + ' – ' + fmtDayShort(addDays(state.weekAnchor, 6));
    else range = fmtDayLong(parseDate(state.selected));

    html += '<div class="stepper">';
    html += '<button type="button" data-step="-1" aria-label="Previous">&#8592;</button>';
    html += '<span class="range">' + esc(range) + '</span>';
    html += '<button type="button" data-step="1" aria-label="Next">&#8594;</button>';
    html += '<button class="btn" type="button" data-step="today">Today</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function renderWeekStrip() {
    var t0 = today();
    var html = '<div class="weekstrip">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(state.weekAnchor, i);
      var ds = ymd(d);
      var items = itemsOn(ds);
      var open = items.filter(function (it) { return !isDone(it); }).length;
      var cls = 'daytile';
      if (i === 0 || i === 6) cls += ' is-weekend';
      if (sameDay(d, t0)) cls += ' is-today';
      if (d < t0) cls += ' is-past';
      html += '<button type="button" class="' + cls + '" data-day="' + ds + '" aria-pressed="' + (ds === state.selected ? 'true' : 'false') + '">';
      html += '<span class="dname">' + DAY_SHORT[i] + '</span>';
      html += '<span class="dnum">' + d.getDate() + '</span>';
      html += '<span class="dots">' + dotsFor(items) + '</span>';
      html += '<span class="tile-count">' + (items.length ? open + ' open' : '') + '</span>';
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderMonthGrid() {
    var showDots = read(KEY.monthDots, true);
    var first = state.monthAnchor;
    var gridStart = startOfWeek(first);
    var t0 = today();
    var html = '<div class="monthgrid">';
    DAY_SHORT.forEach(function (n, i) { html += '<div class="hdr' + (i === 0 || i === 6 ? ' is-weekend' : '') + '">' + n + '</div>'; });

    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i);
      if (i >= 35 && d.getMonth() !== first.getMonth()) break;
      var ds = ymd(d);
      var items = itemsOn(ds);
      var cls = 'mcell';
      if (d.getDay() === 0 || d.getDay() === 6) cls += ' is-weekend';
      if (d.getMonth() !== first.getMonth()) cls += ' is-outside';
      if (sameDay(d, t0)) cls += ' is-today';
      html += '<button type="button" class="' + cls + '" data-day="' + ds + '" aria-pressed="' + (ds === state.selected ? 'true' : 'false') + '">';
      html += '<span class="mnum">' + d.getDate() + '</span>';
      if (showDots) html += '<span class="dots">' + dotsFor(items) + '</span>';
      else if (items.length) html += '<span class="tile-count">' + items.length + '</span>';
      html += '</button>';
    }
    html += '</div>';
    html += '<p class="legend">' + TYPES.map(function (t) {
      return '<span><span class="dot dot-' + t + '"></span>' + TYPE_LABEL[t] + '</span>';
    }).join('') + '<span><span class="dot dot--hollow dot-other"></span>Checked off</span></p>';
    return html;
  }

  function renderHome() {
    if (!state.courses.length) {
      return '<p class="empty">No courses loaded yet. Drop a course JSON file in <code>courses/</code> and list it in <code>courses/manifest.json</code> — see the <a href="#/courses">Courses</a> page.</p>';
    }
    var html = '';
    html += renderViewBar();

    if (state.view === 'month') {
      html += renderMonthGrid();
      html += renderDayDetail(state.selected);
    } else if (state.view === 'week') {
      html += renderWeekStrip();
      for (var i = 0; i < 7; i++) {
        var d = addDays(state.weekAnchor, i);
        var ds = ymd(d);
        if (!itemsOn(ds).length) continue;
        html += renderDayDetail(ds);
      }
      if (!activeItems().some(function (it) {
        return it._due >= state.weekAnchor && it._due < addDays(state.weekAnchor, 7);
      })) {
        html += '<p class="empty">Nothing due this week.</p>';
      }
    } else {
      html += renderWeekStrip();
      html += renderDayDetail(state.selected);
    }

    html += renderLookAhead();
    return html;
  }

  /* ------------------------------------------------------------- course view */

  function renderCourse(courseId, fromArchive) {
    var c = courseById(courseId, true);
    if (!c) return '<p class="empty">That course isn\'t loaded.</p>';

    var now = new Date(), t0 = today();
    var buckets = [
      { title: 'Today and tomorrow', items: [] },
      { title: 'Later this week', items: [] },
      { title: 'Rest of the semester', items: [] },
      { title: 'Already past', items: [] }
    ];

    c.items.forEach(function (it) {
      var diff = daysBetween(t0, parseDate(it.date));
      if (it._due < now) buckets[3].items.push(it);
      else if (diff <= 1) buckets[0].items.push(it);
      else if (diff <= 7) buckets[1].items.push(it);
      else buckets[2].items.push(it);
    });
    buckets[3].items.reverse();

    var html = '<div class="course-view">';
    html += '<header class="coursehead"><h2>' + esc(c.courseName) + '</h2>';
    html += '<p class="who">' + esc(c.professor || '') +
      (c.section ? ', ' + esc(c.section) : '') +
      (c.semester ? ', ' + esc(c.semester) : '') + '</p>';
    if (c.syllabusLink) {
      html += '<p class="source-link"><a href="' + attr(c.syllabusLink) + '" target="_blank" rel="noopener noreferrer">Original syllabus (PDF) ↗</a></p>';
    }
    html += '</header>';

    poolIdsFor(c).forEach(function (pid) {
      var st = poolStats(c, pid);
      html += '<div class="poolbanner"><span>Choose ' + st.required + ' of ' + st.total + '</span>' +
        '<span class="poolchip' + (st.done >= st.required ? ' poolchip--met' : '') + '">' +
        st.done + ' of ' + st.required + ' done</span>' +
        (st.planned ? '<span>' + st.planned + ' planned</span>' : '') +
        '<span>' + st.remainingOpen + ' chances left</span></div>';
    });

    buckets.forEach(function (b) {
      if (!b.items.length) return;
      html += '<h3 class="section-head">' + b.title + '<span class="sub">' + b.items.length + '</span></h3>';
      html += renderItemList(b.items, { showDate: true, flagOverdue: b.title !== 'Already past' });
    });

    if (!c.items.length) html += '<p class="empty">No dated items in this file.</p>';

    html += '<a class="backlink" href="' + (fromArchive ? '#/archive' : '#/') + '">' +
      (fromArchive ? 'Back to past semesters' : 'Back to what\'s due') + '</a>';
    html += '</div>';
    return html;
  }

  /* ---------------------------------------------------------- reference page */

  function renderReference() {
    var html = '<h2 class="section-head">Office hours and grading</h2>';
    html += '<p class="empty" style="font-style:normal;font-family:inherit;font-size:.85rem;padding-top:0">' +
            'Reference material, kept out of the daily feed. Tap a course to open it.</p>';
    if (!state.courses.length) return html + '<p class="empty">No active courses loaded.</p>';

    state.courses.forEach(function (c) {
      html += '<details class="refcourse">';
      html += '<summary><span class="rc-name">' + esc(c.courseName) + '</span>' +
        '<span class="rc-who">' + esc(c.professor || '') + (c.section ? ', ' + esc(c.section) : '') + '</span></summary>';
      html += '<div class="rc-body">';

      if (c.syllabusLink) {
        html += '<p class="rc-source"><a href="' + attr(c.syllabusLink) + '" target="_blank" rel="noopener noreferrer">Original syllabus (PDF) ↗</a></p>';
      }

      var oh = c.officeHours || {};
      html += '<div class="rc-card"><h4>Office hours</h4>';
      html += '<p>' + esc(oh.note || 'Not listed in the syllabus.') + '</p>';
      if (oh.details) html += '<p>' + esc(oh.details) + '</p>';
      html += '</div>';

      html += '<h4>Grading</h4>';
      html += '<p>' + boldPercents(c.gradingPolicy || 'Not listed in the syllabus.') + '</p>';

      var defs = c.definitions || {};
      var keys = Object.keys(defs).filter(function (k) { return k !== '...' && defs[k]; });
      if (keys.length) {
        html += '<h4>What the terms mean in this course</h4><dl class="defs">';
        keys.forEach(function (k) {
          html += '<div class="def-row"><dt>' + esc(humanizeKey(k)) + '</dt><dd>' + esc(defs[k]) + '</dd></div>';
        });
        html += '</dl>';
      }
      html += '</div></details>';
    });
    return html;
  }

  function humanizeKey(k) {
    var s = String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function boldPercents(text) {
    return esc(text || '').replace(/(\d+(?:\.\d+)?%)/g, '<strong>$1</strong>');
  }

  /* --------------------------------------------------------------- sync page */

  function renderSync() {
    var html = '<h2 class="section-head">Sync across devices</h2>';
    html += '<p class="empty" style="font-style:normal;font-family:inherit;font-size:.85rem;padding-top:0">' +
      'Checked-off items live in this browser only, so a phone and a laptop keep separate progress. ' +
      'Move it over with a link or a file — nothing goes through a server, it stays on your devices.</p>';

    if (state.syncMessage) {
      html += '<p class="poolbanner">' + esc(state.syncMessage) + '</p>';
      delete state.syncMessage;
    }
    if (state.syncFallbackLink) {
      html += '<input class="synclink" type="text" readonly value="' + attr(state.syncFallbackLink) + '">';
      delete state.syncFallbackLink;
    }

    var n = countKeys(completed) + countKeys(poolSelected);
    html += '<p style="font-size:.85rem;color:var(--ink-soft);margin-top:.9rem">' +
      n + ' item' + (n === 1 ? '' : 's') + ' checked off or planned on this device.</p>';

    html += '<div class="nudge-actions">';
    html += '<button class="btn" type="button" data-sync="link">Copy a sync link</button>';
    html += '<button class="btn" type="button" data-sync="file">Download a backup file</button>';
    html += '<label class="btn" for="syncImportFile">Import a file&hellip;</label>';
    html += '<input type="file" id="syncImportFile" accept="application/json" class="sr-only">';
    html += '</div>';

    html += '<p class="found-note" style="margin-top:.6rem;max-width:34rem">' +
      'On the device that has your progress: tap <strong>Copy a sync link</strong>, send it to yourself, and open it on the other device — it merges in on its own. ' +
      '<strong>Download a backup file</strong> does the same thing through Files or email instead of a link. Importing only adds items; it never unchecks anything.</p>';

    return html;
  }

  /* ------------------------------------------------------------ courses page */

  function renderCourses() {
    var html = '<h2 class="section-head">Loaded courses<span class="sub">' + state.courses.length + ' active</span></h2>';
    if (!state.courses.length) {
      html += '<p class="empty">No course files are listed in courses/manifest.json yet. Add one and it shows up here.</p>';
      return html;
    }
    html += '<ul class="courselist">';
    state.courses.forEach(function (c) {
      var open = c.items.filter(function (it) { return !isDone(it) && it._due >= new Date(); });
      var next = open.length ? open[0] : null;
      html += '<li>';
      html += '<span class="name"><a href="#/course/' + attr(c.courseId) + '">' + esc(c.courseName) + '</a></span>';
      html += '<span class="stat">' + c.items.length + ' items</span>';
      html += '<span class="stat">' + (next ? 'next: ' + esc(fmtWhen(next)) : 'nothing upcoming') + '</span>';
      html += '<span class="file">' + esc(c.sourcePath) + '</span>';
      html += '</li>';
    });
    html += '</ul>';
    html += '<p class="footnote" style="margin-top:1.2rem">To add a course, drop its JSON file in <code>courses/</code> and add the path to <code>courses/manifest.json</code>. To drop one, remove that line. Nothing else changes.</p>';
    return html;
  }

  /* ------------------------------------------------------------ archive page */

  function renderArchive() {
    var html = '<h2 class="section-head">Past semesters</h2>';
    html += '<p class="empty" style="font-style:normal;font-family:inherit;font-size:.85rem;padding-top:0">' +
            'Browsable only. Nothing here counts toward what\'s due.</p>';
    if (!state.archive.length) return html + '<p class="empty">No archived courses.</p>';

    var bySem = {};
    state.archive.forEach(function (c) {
      var s = c.semester || 'Undated';
      if (!bySem[s]) bySem[s] = [];
      bySem[s].push(c);
    });

    Object.keys(bySem).forEach(function (sem) {
      html += '<h3 class="section-head">' + esc(sem) + '</h3><ul class="courselist">';
      bySem[sem].forEach(function (c) {
        html += '<li><span class="name"><a href="#/archive/' + attr(c.courseId) + '">' + esc(c.courseName) + '</a></span>' +
          '<span class="stat">' + esc(c.professor || '') + '</span>' +
          '<span class="stat">' + c.items.length + ' items</span>' +
          '<span class="file">' + esc(c.sourcePath) + '</span></li>';
      });
      html += '</ul>';
    });
    return html;
  }

  /* ---------------------------------------------------------------- search */

  function buildSearchIndex() {
    var out = [];
    function addFrom(list, fromArchive) {
      list.forEach(function (c) {
        c.items.forEach(function (it) {
          out.push({
            courseId: c.courseId, courseName: c.courseName, fromArchive: fromArchive,
            id: it.id, type: it.type, date: it.date, time: it.time,
            summary: it.summary, verbatim: it.verbatim || '', _due: it._due
          });
        });
      });
    }
    addFrom(state.courses, false);
    addFrom(state.archive, true);
    return out;
  }

  function searchMatch(entry, q) {
    return entry.summary.toLowerCase().indexOf(q) !== -1 ||
           entry.verbatim.toLowerCase().indexOf(q) !== -1 ||
           entry.courseName.toLowerCase().indexOf(q) !== -1 ||
           TYPE_LABEL[entry.type].toLowerCase().indexOf(q) !== -1;
  }

  function searchResultHtml(entry, i) {
    var when = fmtWhen({ date: entry.date, time: entry.time, _due: entry._due });
    return '<li' + (i === 0 ? ' class="is-active"' : '') + '>' +
      '<button type="button" data-result="' + i + '">' +
      '<span class="kind kind-' + entry.type + '">' + esc(TYPE_LABEL[entry.type]) + '</span>' +
      '<span class="summary">' + esc(entry.summary) + '</span>' +
      '<span class="meta">' + esc(shortCourse(entry.courseName)) + ' — ' + esc(when) + '</span>' +
      '</button></li>';
  }

  function renderSearchResults(q) {
    var list = document.getElementById('searchResults');
    var empty = document.getElementById('searchEmpty');
    var index = buildSearchIndex();
    var results;
    if (!q) {
      results = index.filter(function (e) { return e._due >= new Date(); })
        .sort(function (a, b) { return a._due - b._due; }).slice(0, 12);
    } else {
      var needle = q.toLowerCase();
      results = index.filter(function (e) { return searchMatch(e, needle); })
        .sort(function (a, b) { return a._due - b._due; }).slice(0, 40);
    }
    state.searchResults = results;
    if (!results.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.textContent = q ? 'No matches.' : 'Nothing upcoming.';
    } else {
      empty.hidden = true;
      list.innerHTML = results.map(searchResultHtml).join('');
    }
  }

  function openSearch() {
    var modal = document.getElementById('searchModal');
    modal.hidden = false;
    var input = document.getElementById('searchInput');
    input.value = '';
    renderSearchResults('');
    input.focus();
  }

  function closeSearch() {
    document.getElementById('searchModal').hidden = true;
  }

  function goToSearchResult(entry) {
    closeSearch();
    var key = itemKey(entry.courseId, entry.id);
    state.expanded[key] = true;
    var path = (entry.fromArchive ? '#/archive/' : '#/course/') + encodeURIComponent(entry.courseId);
    history.pushState(null, '', path);
    render();
    var el = document.getElementById('item-' + domId(key));
    if (el) el.scrollIntoView({ block: 'center' });
  }

  /* ----------------------------------------------------------------- router */

  function currentRoute() {
    var h = window.location.hash.replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'course') return { name: 'course', id: decodeURIComponent(parts[1] || '') };
    if (parts[0] === 'archive' && parts[1]) return { name: 'archiveCourse', id: decodeURIComponent(parts[1]) };
    if (parts[0] === 'archive') return { name: 'archive' };
    if (parts[0] === 'reference') return { name: 'reference' };
    if (parts[0] === 'courses') return { name: 'courses' };
    if (parts[0] === 'sync' && parts[1] === 'import' && parts[2]) return { name: 'syncImport', payload: parts[2] };
    if (parts[0] === 'sync') return { name: 'sync' };
    return { name: 'home' };
  }

  function render() {
    var route = currentRoute();

    if (route.name === 'syncImport') {
      var imported = importSyncPayload(route.payload);
      state.syncMessage = imported > 0
        ? ('Imported ' + imported + ' item' + (imported === 1 ? '' : 's') + ' from the link.')
        : 'That link had nothing new to add.';
      window.location.hash = '#/sync';
      return;
    }

    var main = document.getElementById('view');
    var html = '';

    if (state.loadErrors.length) {
      html += '<div class="err"><strong>Some course files did not load.</strong><ul>' +
        state.loadErrors.map(function (e) { return '<li><code>' + esc(e) + '</code></li>'; }).join('') +
        '</ul>Check the path in <code>courses/manifest.json</code> and that the JSON parses.</div>';
    }

    if (route.name === 'course') html += renderCourse(route.id, false);
    else if (route.name === 'archiveCourse') html += renderCourse(route.id, true);
    else if (route.name === 'reference') html += renderReference();
    else if (route.name === 'courses') html += renderCourses();
    else if (route.name === 'archive') html += renderArchive();
    else if (route.name === 'sync') html += renderSync();
    else html += renderHome();

    main.innerHTML = html;
    renderUrgent();

    var navKey = route.name === 'course' ? 'home'
      : route.name === 'archiveCourse' ? 'archive' : route.name;
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
      if (a.getAttribute('data-route') === navKey) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    document.getElementById('todayLine').textContent = fmtDayLong(today()) + ', ' + today().getFullYear();
  }

  /* ----------------------------------------------------------------- events */

  function setView(v) {
    state.view = v;
    write(KEY.view, v);
    syncAnchors();
    render();
  }

  function syncAnchors() {
    var sel = parseDate(state.selected) || today();
    state.weekAnchor = startOfWeek(sel);
    state.monthAnchor = startOfMonth(sel);
  }

  function step(dir) {
    var sel = parseDate(state.selected);
    if (dir === 'today') {
      state.selected = ymd(today());
    } else if (state.view === 'day') {
      state.selected = ymd(addDays(sel, dir));
    } else if (state.view === 'week') {
      state.selected = ymd(addDays(sel, dir * 7));
    } else {
      var m = new Date(state.monthAnchor.getFullYear(), state.monthAnchor.getMonth() + dir, 1);
      // keep the same day-of-month where possible
      var day = Math.min(sel.getDate(), new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate());
      state.selected = ymd(new Date(m.getFullYear(), m.getMonth(), day));
    }
    syncAnchors();
    render();
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'searchTrigger') { openSearch(); return; }
    if (e.target.id === 'searchModal') { closeSearch(); return; }

    var result = e.target.closest ? e.target.closest('[data-result]') : null;
    if (result) {
      var idx = parseInt(result.getAttribute('data-result'), 10);
      var entry = state.searchResults && state.searchResults[idx];
      if (entry) goToSearchResult(entry);
      return;
    }

    var t = e.target.closest ? e.target.closest('[data-view],[data-step],[data-day],[data-toggle],[data-plan],[data-sync],.synclink') : null;
    if (!t) return;

    if (t.classList && t.classList.contains('synclink')) { t.select(); return; }
    if (t.hasAttribute('data-sync')) {
      var kind = t.getAttribute('data-sync');
      if (kind === 'link') copySyncLink();
      else if (kind === 'file') downloadSyncFile();
      return;
    }
    if (t.hasAttribute('data-view')) { setView(t.getAttribute('data-view')); return; }
    if (t.hasAttribute('data-step')) {
      var s = t.getAttribute('data-step');
      step(s === 'today' ? 'today' : parseInt(s, 10));
      return;
    }
    if (t.hasAttribute('data-day')) {
      state.selected = t.getAttribute('data-day');
      syncAnchors();
      render();
      return;
    }
    if (t.hasAttribute('data-toggle')) {
      var k = t.getAttribute('data-toggle');
      if (state.expanded[k]) delete state.expanded[k]; else state.expanded[k] = true;
      render();
      return;
    }
    if (t.hasAttribute('data-plan')) {
      var pk = t.getAttribute('data-plan');
      if (poolSelected[pk]) delete poolSelected[pk]; else poolSelected[pk] = true;
      write(KEY.pool, poolSelected);
      render();
      return;
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches && el.matches('[data-complete]')) {
      var k = el.getAttribute('data-complete');
      if (el.checked) completed[k] = true; else delete completed[k];
      write(KEY.completed, completed);
      render();
      return;
    }
    if (el.id === 'dotsToggle') {
      write(KEY.monthDots, el.checked);
      render();
      return;
    }
    if (el.id === 'syncImportFile' && el.files && el.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        var data = null;
        try { data = JSON.parse(reader.result); } catch (e) { data = null; }
        var n = data ? mergeSyncData(data) : 0;
        state.syncMessage = data
          ? ('Imported ' + n + ' item' + (n === 1 ? '' : 's') + ' from the file.')
          : 'That file could not be read — make sure it’s a backup downloaded from this dashboard.';
        render();
      };
      reader.readAsText(el.files[0]);
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'searchInput') renderSearchResults(e.target.value.trim());
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearch();
      return;
    }

    if (e.target.id === 'searchInput') {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      var items = document.querySelectorAll('#searchResults li');
      if (!items.length) return;
      var activeIdx = 0;
      items.forEach(function (li, i) { if (li.classList.contains('is-active')) activeIdx = i; });
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[activeIdx].classList.remove('is-active');
        var next = e.key === 'ArrowDown' ? (activeIdx + 1) % items.length : (activeIdx - 1 + items.length) % items.length;
        items[next].classList.add('is-active');
        items[next].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        var btn = items[activeIdx].querySelector('[data-result]');
        if (btn) btn.click();
        return;
      }
      return;
    }

    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.altKey) return;

    var onHome = currentRoute().name === 'home';
    var mod = e.metaKey || e.ctrlKey;

    if (e.key === '1' || e.key === '2' || e.key === '3') {
      var v = { '1': 'day', '2': 'week', '3': 'month' }[e.key];
      if (mod || (!mod && onHome)) {
        e.preventDefault();
        if (!onHome) window.location.hash = '#/';
        setView(v);
      }
      return;
    }
    if ((e.key === 'd' || e.key === 'D') && !mod) {
      e.preventDefault();
      window.location.hash = '#/';
      return;
    }
    if (!onHome || mod) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); step('today'); }
  });

  window.addEventListener('hashchange', function () {
    render();
    window.scrollTo(0, 0);
  });

  /* ------------------------------------------------------------------- boot */

  state.selected = ymd(today());
  syncAnchors();

  document.getElementById('footnote').innerHTML =
    'Checkboxes are saved in this browser only and never change what the dashboard treats as due — see <a href="#/sync">Sync</a> to move them to another device. ' +
    'Keyboard: D for due, 1 day, 2 week, 3 month, arrows to move, T for today.';

  loadAll().then(function () {
    render();
  }).catch(function (err) {
    document.getElementById('view').innerHTML =
      '<div class="err"><strong>Could not read courses/manifest.json.</strong><p>' + esc(err.message) + '</p>' +
      '<p>If you are opening this file directly from disk, most browsers block the fetch. Run a local server instead — ' +
      '<code>python3 -m http.server</code> in this folder — or push to GitHub Pages, where it works as-is.</p></div>';
  });

})();
