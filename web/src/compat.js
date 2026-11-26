/*
 * compat.js
 *
 * Whether this browser can run the game, asked of the browser itself, never of its name or version: the page's
 * first script (vite.config.ts writes it into index.html, after the boot screen), in ES5 so that any browser at all runs it (eslint holds it
 * to ES5). The game's module needs the syntax and the calls listed below; a browser short of any of them would show
 * the boot screen and nothing more (an old Android System WebView, say), so it is told what is missing instead.
 *
 * For what no list can foresee, it also watches: an error in the game's own scripts before the game has started, or a
 * game not started after STALL_MS, is put on the screen over the boot screen, and taken away if the game starts after
 * all. The game has started when the boot screen is gone (main.ts takes it away for the title, or for its own
 * "Failed to start" on the canvas).
 *
 * The lists follow the build (vite.config.ts build.target, ES2022) and the calls the game makes unguarded: a new one
 * of either goes here too.
 */
(function (win) {
  /** How long the game may take to start before it is said not to have. */
  var STALL_MS = 20000;

  /** Syntax the game's module is written in: each is compiled (never run) to see that it parses. */
  var SYNTAX = [
    ['class fields', 'class A { x = 1; }'],
    ['optional chaining (?.)', 'var a = null; return a?.b?.[0]?.();'],
    ['nullish coalescing (??)', 'var a = null; return a ?? 1;'],
    ['logical assignment (??=)', 'var a = null; a ??= 1; a ||= 1; a &&= 1;'],
    ['async functions', 'async function f() { await 0; } var g = async () => {};'],
  ];

  /** Calls the game cannot start or play without. */
  var CALLS = [
    [
      'JavaScript modules',
      function (w) {
        return 'noModule' in w.document.createElement('script');
      },
    ],
    [
      'canvas drawing',
      function (w) {
        return !!w.document.createElement('canvas').getContext('2d');
      },
    ],
    [
      'fetch',
      function (w) {
        return typeof w.fetch === 'function';
      },
    ],
    [
      'Promise.allSettled',
      function (w) {
        return typeof w.Promise === 'function' && typeof w.Promise.allSettled === 'function';
      },
    ],
    [
      'Array.prototype.at',
      function (w) {
        return typeof w.Array.prototype.at === 'function';
      },
    ],
    [
      'Array.prototype.flatMap',
      function (w) {
        return typeof w.Array.prototype.flatMap === 'function';
      },
    ],
    [
      'Object.entries',
      function (w) {
        return typeof w.Object.entries === 'function';
      },
    ],
    [
      'String.prototype.padStart',
      function (w) {
        return typeof w.String.prototype.padStart === 'function';
      },
    ],
    [
      'globalThis',
      function (w) {
        return typeof w.globalThis === 'object';
      },
    ],
    [
      'Map and Set',
      function (w) {
        return typeof w.Map === 'function' && typeof w.Set === 'function' && typeof w.WeakMap === 'function';
      },
    ],
    [
      'typed arrays',
      function (w) {
        return typeof w.Uint8Array === 'function' && typeof w.DataView === 'function';
      },
    ],
    [
      'URLSearchParams',
      function (w) {
        return typeof w.URLSearchParams === 'function';
      },
    ],
    [
      'ResizeObserver',
      function (w) {
        return typeof w.ResizeObserver === 'function';
      },
    ],
    [
      'requestAnimationFrame',
      function (w) {
        return typeof w.requestAnimationFrame === 'function';
      },
    ],
    [
      'performance.now',
      function (w) {
        return !!w.performance && typeof w.performance.now === 'function';
      },
    ],
  ];

  /** Calls whose want costs a part of the game, not the whole: what is lost, and the check. */
  var PARTS = [
    [
      'sound (Web Audio)',
      function (w) {
        return typeof w.AudioContext === 'function';
      },
    ],
    [
      'saving the game (local storage)',
      function (w) {
        var key = 'ultima3-compat-check';
        w.localStorage.setItem(key, '1');
        w.localStorage.removeItem(key);
        return true;
      },
    ],
  ];

  /** The names of the checks `w` fails; a check that throws fails. */
  function failing(w, checks) {
    var out = [];
    for (var i = 0; i < checks.length; i++) {
      var ok;
      try {
        ok = checks[i][1](w);
      } catch (e) {
        ok = false;
      }
      if (!ok) out.push(checks[i][0]);
    }
    return out;
  }

  /** The syntax `w` cannot parse. */
  function unparsed(w) {
    var out = [];
    for (var i = 0; i < SYNTAX.length; i++) {
      try {
        new w.Function(SYNTAX[i][1]);
      } catch (e) {
        out.push(SYNTAX[i][0]);
      }
    }
    return out;
  }

  /** What `w` lacks: `needed`, without which the game cannot run, and `parts`, the parts of it lost. */
  function check(w) {
    return { needed: unparsed(w).concat(failing(w, CALLS)), parts: failing(w, PARTS) };
  }

  win.u3Compat = { check: check, show: show };
  if (!win.document || !win.document.body) return;
  var doc = win.document;

  /** The notice up now, and whether it goes when the game starts. */
  var notice = null;
  var goesOnStart = false;

  function started() {
    return !doc.getElementById('boot');
  }

  function close() {
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
    notice = null;
  }

  function element(tag, text, css) {
    var e = doc.createElement(tag);
    if (text) e.appendChild(doc.createTextNode(text));
    if (css) e.style.cssText = css;
    return e;
  }

  /**
   * Put a notice over the page: a title, its lines, the browser's own description of itself (for a report), and a
   * button that dismisses it. `onStart`: taken away when the game starts.
   */
  function show(title, lines, onStart) {
    close();
    goesOnStart = !!onStart;
    notice = element(
      'div',
      '',
      'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1000;overflow:auto;background:rgba(0,0,0,0.88);' +
        'color:#e8e8e8;font:16px/1.45 sans-serif;padding:24px 16px;box-sizing:border-box;text-align:left'
    );
    notice.setAttribute('role', 'alertdialog');
    var box = element('div', '', 'max-width:34em;margin:0 auto');
    box.appendChild(element('h1', title, 'font-size:22px;margin:0 0 12px;color:#fff'));
    for (var i = 0; i < lines.length; i++) box.appendChild(element('p', lines[i], 'margin:0 0 10px'));
    box.appendChild(
      element(
        'p',
        'Browser: ' + (win.navigator ? win.navigator.userAgent : 'unknown'),
        'margin:16px 0;font-size:12px;color:#999;word-wrap:break-word'
      )
    );
    var button = element('button', onStart ? 'Close' : 'Continue anyway', 'font:inherit;padding:8px 18px;cursor:pointer');
    button.onclick = close;
    box.appendChild(button);
    notice.appendChild(box);
    doc.body.appendChild(notice);
  }

  var UPDATE =
    'Updating the browser should fix this. On Android, the game runs in the Android System WebView app: update it (and Chrome) from the Play Store.';

  var lacking = check(win);
  if (lacking.needed.length) {
    show("This browser can't run Ultima III", ['It is missing: ' + lacking.needed.join(', ') + '.', UPDATE], false);
  } else if (lacking.parts.length) {
    show('Ultima III will run here without some things', ['Not available: ' + lacking.parts.join(', ') + '.', UPDATE], false);
  }

  /** Errors in the game's own scripts (the built chunks, under assets/) before it started. */
  var errors = [];
  function own(url) {
    return typeof url === 'string' && url.indexOf('/assets/') >= 0;
  }
  function stalled(why) {
    if (started() || (notice && !goesOnStart)) return;
    show("Ultima III hasn't started", why.concat([UPDATE]), true);
  }
  if (win.addEventListener) {
    win.addEventListener(
      'error',
      function (e) {
        if (started()) return;
        var target = e.target;
        var text = null;
        if (target && target.tagName === 'SCRIPT' && own(target.src)) text = 'A script failed to load: ' + target.src;
        else if (e.message && own(e.filename)) text = e.message + ' (' + e.filename + ':' + e.lineno + ')';
        if (!text) return;
        errors.push(text);
        stalled(errors);
      },
      true
    );
  }
  win.setTimeout(function () {
    stalled(errors.length ? errors : ['It has been loading for ' + STALL_MS / 1000 + ' seconds. It may yet start.']);
  }, STALL_MS);
  // Once the game has started, a notice about its not starting goes.
  var watch = win.setInterval(function () {
    if (!started()) return;
    win.clearInterval(watch);
    if (goesOnStart) close();
  }, 500);
})(this);
