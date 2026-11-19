(function () {
  var isTV = /JJTV/i.test(navigator.userAgent) || /[?&]tv=1/.test(location.search);
  if (!isTV) return;
  document.documentElement.classList.add('tv-mode');

  var SEL = 'a[href],button:not([disabled]),input,select,.movie-card,[tabindex]';

  function mark() {
    document.querySelectorAll('.movie-card').forEach(function (c) { c.tabIndex = 0; });
    document.querySelectorAll('.movie-card .details-button').forEach(function (b) { b.tabIndex = -1; });
  }
  mark();
  new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });

  function scope() {
    var p = document.getElementById('inAppVideoModal');
    if (p && p.style.display !== 'none') return p;
    var m = document.getElementById('movieModal');
    if (m && !m.hidden) return m;
    return document;
  }

  function candidates() {
    return Array.prototype.filter.call(scope().querySelectorAll(SEL), function (el) {
      if (el.getAttribute('tabindex') === '-1') return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
  }

  function focusEl(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  function move(dir) {
    var list = candidates(), cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) < 0) {
      focusEl(scope() === document ? (document.querySelector('.menu-btn.active') || list[0]) : list[0]);
      return;
    }
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var q = el.getBoundingClientRect();
      var dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy, main, cross;
      if (dir === 'right') { if (dx <= 1) return; main = dx; cross = Math.abs(dy); }
      else if (dir === 'left') { if (dx >= -1) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === 'down') { if (dy <= 1) return; main = dy; cross = Math.abs(dx); }
      else { if (dy >= -1) return; main = -dy; cross = Math.abs(dx); }
      var score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    focusEl(best);
  }

  var DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  document.addEventListener('keydown', function (e) {
    var el = document.activeElement;
    var video = document.querySelector('#jjPlayerStage video');

    // Player: left/right = seek, OK = play/pause
    if (video && scope().id === 'inAppVideoModal' &&
        (!el || el === document.body || el === video)) {
      if (e.key === 'ArrowLeft')  { video.currentTime -= 10; e.preventDefault(); return; }
      if (e.key === 'ArrowRight') { video.currentTime += 10; e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        video.paused ? video.play() : video.pause();
        e.preventDefault(); return;
      }
    }

    if (e.key === 'Enter' && el && el.classList.contains('movie-card')) {
      var b = el.querySelector('.details-button');
      if (b) b.click();
      e.preventDefault(); return;
    }

    var dir = DIRS[e.key];
    if (!dir) return;
    if (el && el.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) return;
    e.preventDefault();
    move(dir);
  });
})();
