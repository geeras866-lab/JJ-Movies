var SUPABASE_URL = "https://tswyabgdldbsaopipvug.supabase.co";
var SUPABASE_KEY = "sb_publishable_902itkUPAUe272Q4B4jF0w_OEKDNuxr";
var TELEGRAM_BOT_USERNAME = "jj_files_bot";
var TMDB_API_KEY = "200b7daf6101f22010cdd5eccea4a119";

// Build workflow auto-injects window.JJ_BUILD_VERSION inside APK
var CURRENT_APK_VERSION = window.JJ_BUILD_VERSION || "1.0.0";

var movies = [];
var posterCache = {};

var movieGrid = document.getElementById("movieGrid");
var searchInput = document.getElementById("searchInput");
var genreFilter = document.getElementById("genreFilter");
var yearFilter = document.getElementById("yearFilter");
var movieCount = document.getElementById("movieCount");
var emptyMessage = document.getElementById("emptyMessage");
var movieModal = document.getElementById("movieModal");
var modalDetails = document.getElementById("modalDetails");

var carouselInterval = null;
var inlineSearch = "";
var currentActiveStreamUrl = "";

// ---------- Notch / cutout support + black background ----------
(function () {
  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) {
    vp = document.createElement("meta");
    vp.name = "viewport";
    document.head.appendChild(vp);
  }
  vp.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
  var st = document.createElement("style");
  st.textContent = "html,body{background:#000;}";
  document.head.appendChild(st);
})();

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c];
  });
}

function safeURL(value) {
  if (!value) return "";
  var val = String(value).trim();
  if (!val) return "";
  if (!val.startsWith("http://") && !val.startsWith("https://")) {
    val = "https://" + val;
  }
  return val;
}

function getMoviePinLabel(movie) {
  if (!movie || movie.pinned !== true) return "";
  return String(movie.pinLabel || "").trim();
}

function getAdaptivePosterUrl(originalUrl) {
  if (!originalUrl) return "";
  var val = String(originalUrl).trim();

  if (
    (!val.startsWith("http://") && !val.startsWith("https://")) ||
    val.includes(" ") ||
    val.includes("api.telegram.org") ||
    val.includes("t.me")
  ) {
    return "";
  }

  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var isWifi = false;
  if (conn && conn.type === "wifi" && !conn.saveData) {
    isWifi = true;
  }
  if (val.includes("image.tmdb.org/t/p/")) {
    return isWifi
      ? val.replace(/\/t\/p\/[^\/]+/, "/t/p/w500")
      : val.replace(/\/t\/p\/[^\/]+/, "/t/p/w185");
  }
  return val;
}

// ---------- Strict poster matching helpers ----------
var posterMatchLog = {};

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearClose(a, b, tol) {
  var x = parseInt(a, 10), y = parseInt(b, 10);
  if (!x || !y) return false;
  return Math.abs(x - y) <= tol;
}

async function imdbSearch(q) {
  var key = String(q || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "_");
  if (!key) return [];
  var url = "https://v2.sg.media-imdb.com/suggestion/" + key[0] + "/" + encodeURIComponent(key) + ".json";
  var r = await fetch(url);
  if (!r.ok) return [];
  var j = await r.json();
  return j.d || [];
}

async function resolvePosterUrl(movieTitle, movieYear) {
  var cleanTitle = String(movieTitle || "")
    .replace(/Marvel Studios'?\s*/i, "")
    .replace(/\s*-\s*World Premiere/i, "")
    .replace(/\s*Season\s*\d+/i, "")
    .replace(/\s*\(\d{4}\)/, "")
    .trim();

  if (!cleanTitle) return null;
  var cacheKey = (cleanTitle + "_" + (movieYear || "")).toLowerCase();
  if (posterCache[cacheKey]) return posterCache[cacheKey];

  var candidates = [{ term: cleanTitle, tol: 1 }];
  if (movieYear && cleanTitle.indexOf(":") > 0) {
    var beforeColon = cleanTitle.split(":")[0].trim();
    if (beforeColon.length > 2) candidates.push({ term: beforeColon, tol: 0 });
  }

  for (var s = 0; s < candidates.length; s++) {
    try {
      var cand = candidates[s];
      var list = await imdbSearch(cand.term);
      var wanted = normTitle(cand.term);
      var hit = list.find(function (x) {
        if (!x.id || x.id.indexOf("tt") !== 0) return false;
        if (!x.i || !x.i.imageUrl) return false;
        if (!/feature|tv|video/i.test(String(x.q || ""))) return false;
        if (normTitle(x.l) !== wanted) return false;
        if (movieYear) return yearClose(x.y, movieYear, cand.tol);
        return true;
      });
      if (hit) {
        var img = hit.i.imageUrl.replace(/\._V1_.*\.jpg$/i, "._V1_SX600.jpg");
        posterCache[cacheKey] = img;
        posterMatchLog[cacheKey] = { src: "IMDb", matched: hit.l, year: hit.y, id: hit.id };
        return img;
      }
    } catch (e) {}
  }

  if (TMDB_API_KEY) {
    for (var t = 0; t < candidates.length; t++) {
      try {
        var c2 = candidates[t];
        var tmdbRes = await fetch(
          "https://api.themoviedb.org/3/search/multi?api_key=" + encodeURIComponent(TMDB_API_KEY) +
          "&query=" + encodeURIComponent(c2.term)
        );
        if (tmdbRes.ok) {
          var tmdbData = await tmdbRes.json();
          var wantedT = normTitle(c2.term);
          var best = (tmdbData.results || []).find(function (r) {
            if (!r.poster_path) return false;
            if (r.media_type !== "movie" && r.media_type !== "tv") return false;
            var nm = r.title || r.name || r.original_title || r.original_name;
            if (normTitle(nm) !== wantedT) return false;
            var d = r.release_date || r.first_air_date || "";
            if (movieYear) return yearClose(d.slice(0, 4), movieYear, c2.tol);
            return true;
          });
          if (best) {
            var tmdbImg = "https://image.tmdb.org/t/p/w500" + best.poster_path;
            posterCache[cacheKey] = tmdbImg;
            posterMatchLog[cacheKey] = { src: "TMDB", matched: best.title || best.name, year: (best.release_date || best.first_air_date || "").slice(0, 4) };
            return tmdbImg;
          }
        }
      } catch (e) {}
    }
  }

  try {
    var tvRes = await fetch("https://api.tvmaze.com/singlesearch/shows?q=" + encodeURIComponent(cleanTitle));
    if (tvRes.ok) {
      var tv = await tvRes.json();
      var tvYear = (tv.premiered || "").slice(0, 4);
      var okName = normTitle(tv.name) === normTitle(cleanTitle);
      var okYear = !movieYear || yearClose(tvYear, movieYear, 1);
      if (okName && okYear && tv.image && (tv.image.original || tv.image.medium)) {
        var tvImg = tv.image.original || tv.image.medium;
        posterCache[cacheKey] = tvImg;
        posterMatchLog[cacheKey] = { src: "TVMaze", matched: tv.name, year: tvYear };
        return tvImg;
      }
    }
  } catch (e) {}

  return null;
}

async function generatePosterSQL() {
  var sql = [], missing = [], rows = [];
  for (var i = 0; i < movies.length; i++) {
    var m = movies[i];
    var url = await resolvePosterUrl(m.title, m.year);
    if (url) {
      var cleanKey = (String(m.title).replace(/\s*\(\d{4}\)/, "").trim() + "_" + (m.year || "")).toLowerCase();
      var info = posterMatchLog[cleanKey] || {};
      rows.push({ "Mee movie": m.title, "Mee year": m.year, "Match dorikindi": info.matched, "Match year": info.year, "Source": info.src });
      sql.push("update movies set poster_url = '" + url.replace(/'/g, "''") + "' where id = '" + String(m.id).replace(/'/g, "''") + "';");
    } else {
      missing.push(m.title);
    }
    await new Promise(function (r) { setTimeout(r, 300); });
  }
  var out = sql.join("\n");
  console.table(rows);
  console.log(out);
  console.log("DORAKANIVI - manual ga poster pettali (" + missing.length + "):", missing);
  try { copy(out); } catch (e) {}
  return { sql: out, missing: missing };
}
window.generatePosterSQL = generatePosterSQL;

function handleMissingPoster(imgElement, movieTitle, movieYear) {
  if (!imgElement || imgElement.dataset.fallbackTried === "true") {
    if (imgElement && imgElement.dataset.fallbackTried === "true" && imgElement.dataset.final === "true") {
      showTextPlaceholder(imgElement, movieTitle);
    }
    return;
  }
  imgElement.dataset.fallbackTried = "true";

  resolvePosterUrl(movieTitle, movieYear).then(function (foundUrl) {
    if (foundUrl) {
      imgElement.dataset.final = "true";
      imgElement.onerror = function () {
        showTextPlaceholder(imgElement, movieTitle);
      };
      imgElement.src = foundUrl;
    } else {
      showTextPlaceholder(imgElement, movieTitle);
    }
  });
}

function showTextPlaceholder(imgElement, movieTitle) {
  if (!imgElement || !imgElement.parentNode) return;
  if (imgElement.classList.contains("modal-mini-poster") || imgElement.classList.contains("banner-bg-img")) {
    imgElement.style.display = "none";
    return;
  }
  var placeholder = document.createElement("div");
  placeholder.className = "poster-placeholder";
  placeholder.textContent = movieTitle || "Movie";
  imgElement.replaceWith(placeholder);
}

window.handleMissingPoster = handleMissingPoster;

// ---------- 🎬 IN-APP PLAYER ----------
function isDirectVideoFile(url) {
  if (!url) return false;
  return /\.(mp4|mkv|webm|m3u8)(\?.*)?$/i.test(url);
}

function normalizeStreamUrl(url) {
  var u = safeURL(url);
  if (!u || isDirectVideoFile(u)) return u;
  if (u.indexOf("/e/") !== -1) return u;
  var m = u.match(/^(https?:\/\/[^\/]+)\/(?:d|v)\/([A-Za-z0-9]+)(\?.*)?$/i);
  if (m) return m[1] + "/e/" + m[2] + (m[3] || "");
  return u.replace(/streamlare\.com\/(v|d)\//, "streamlare.com/e/");
}

function loadHls(cb) {
  if (window.Hls) return cb();
  var s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js";
  s.onload = cb;
  document.head.appendChild(s);
}

// ---------- NATIVE FULLSCREEN (Chrome-like, works on all phones) ----------
function lockLandscape() {
  try {
    var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation;
    if (P) { P.lock({ orientation: "landscape" }); return; }
  } catch (e) {}
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock("landscape").catch(function () {});
  }
}

function unlockOrientation() {
  try {
    var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation;
    if (P) { P.unlock(); return; }
  } catch (e) {}
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) {}
  }
}

function jjFsTarget() {
  return document.getElementById("vlcInAppIframe") || document.getElementById("vlcInAppPlayer");
}

function isInFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

async function enterTrueFullscreen() {
  var el = jjFsTarget();
  if (!el) return;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) {}
}

async function exitTrueFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) {}
  var btn = document.getElementById("jjFullscreenBtn");
  if (btn) btn.textContent = "⛶ Rotate Fullscreen";
}

function togglePlayerFullscreen() {
  if (isInFullscreen()) {
    exitTrueFullscreen();
  } else {
    enterTrueFullscreen();
  }
}

function handleNativeFullscreenChange() {
  var btn = document.getElementById("jjFullscreenBtn");
  if (isInFullscreen()) {
    lockLandscape();
    if (btn) btn.textContent = "✕ Exit Fullscreen";
  } else {
    unlockOrientation();
    if (btn) btn.textContent = "⛶ Rotate Fullscreen";
  }
}

document.addEventListener("fullscreenchange", handleNativeFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleNativeFullscreenChange);

function ensureInAppPlayerModal() {
  var modal = document.getElementById("inAppVideoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "inAppVideoModal";
    modal.className = "jj-player-modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="jj-player-modal-box">
        <div class="jj-player-header">
          <div class="jj-player-title-wrap">
            <span class="jj-vlc-badge">▶ IN-APP PLAYER</span>
            <h3 id="modalMovieTitle" class="jj-player-title">Playing Movie</h3>
          </div>
          <div class="jj-player-header-actions">
            <button type="button" id="jjFullscreenBtn" class="jj-player-fs-btn" onclick="togglePlayerFullscreen()">⛶ Rotate Fullscreen</button>
            <button type="button" class="jj-player-close" onclick="closeInAppPlayer()" aria-label="Close">&times;</button>
          </div>
        </div>
        <div id="serverSwitchContainer" class="jj-server-bar"></div>
        <div id="jjPlayerStage" class="jj-player-stage"></div>
      </div>
    `;
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeInAppPlayer();
    });
    document.body.appendChild(modal);
  }
}

// Back button: close fullscreen -> player -> movie modal
window.addEventListener("popstate", function () {
  var vModal = document.getElementById("inAppVideoModal");

  if (vModal && vModal.style.display === "flex") {
    if (isInFullscreen()) {
      exitTrueFullscreen();
      try { history.pushState({ jjPlayerOpen: true }, "", window.location.href); } catch (e) {}
      return;
    }
    closeInAppPlayer(true);
    return;
  }

  if (movieModal && !movieModal.hidden) {
    movieModal.hidden = true;
  }
});

function openMoviePlayerById(movieId) {
  var movie = movies.find(function (item) { return String(item.id) === String(movieId); });
  if (!movie) return;
  openServerSelection(movie.title, movie.stream1, movie.stream2);
}

function openServerSelection(title, s1, s2) {
  ensureInAppPlayerModal();
  var modal = document.getElementById("inAppVideoModal");
  var titleElem = document.getElementById("modalMovieTitle");
  var serverContainer = document.getElementById("serverSwitchContainer");

  if (titleElem) titleElem.textContent = title || "Playing Movie";
  modal.style.display = "flex";

  try {
    history.pushState({ jjPlayerOpen: true }, "", window.location.href);
  } catch (e) {}

  serverContainer.innerHTML = "";
  var servers = [];
  if (s1) servers.push({ name: "⚡ Server 1", url: s1 });
  if (s2) servers.push({ name: "🚀 Server 2", url: s2 });

  servers.forEach(function (srv, idx) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "jj-server-btn" + (idx === 0 ? " active" : "");
    btn.textContent = srv.name;
    btn.addEventListener("click", function () {
      var allBtns = serverContainer.querySelectorAll(".jj-server-btn");
      allBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      playMovieStream(srv.url);
    });
    serverContainer.appendChild(btn);
  });

  if (servers.length > 0) {
    playMovieStream(servers[0].url);
  }
}

function playMovieStream(rawUrl) {
  var stage = document.getElementById("jjPlayerStage");
  if (!stage) return;
  var url = normalizeStreamUrl(rawUrl);
  currentActiveStreamUrl = url;
  stage.innerHTML = "";

  if (isDirectVideoFile(url)) {
    var video = document.createElement("video");
    video.id = "vlcInAppPlayer";
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("controlsList", "nodownload");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.background = "#000";
    video.style.objectFit = "contain";

    video.addEventListener("error", function () {
      stage.innerHTML = '<div style="color:#fff;padding:20px;text-align:center;font-size:13px;">Video play avvatledu. MP4 (H.264 + AAC) leda Server 2 use cheyyandi.</div>';
    });

    if (/\.m3u8(\?.*)?$/i.test(url) && !video.canPlayType("application/vnd.apple.mpegurl")) {
      loadHls(function () {
        if (window.Hls && Hls.isSupported()) {
          var h = new Hls();
          h.loadSource(url);
          h.attachMedia(video);
        }
      });
    } else {
      video.src = url;
    }

    stage.appendChild(video);
    video.play().catch(function () {});
  } else {
    var iframe = document.createElement("iframe");
    iframe.id = "vlcInAppIframe";
    iframe.src = url;
    iframe.allowFullscreen = true;
    iframe.setAttribute("webkitallowfullscreen", "true");
    iframe.setAttribute("mozallowfullscreen", "true");
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock; gyroscope; accelerometer");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    stage.appendChild(iframe);

    var arrowSyncBtn = document.createElement("button");
    arrowSyncBtn.type = "button";
    arrowSyncBtn.className = "jj-corner-arrow-btn";
    arrowSyncBtn.innerHTML = "⛶";
    arrowSyncBtn.title = "Fullscreen";
    arrowSyncBtn.onclick = function (e) {
      e.stopPropagation();
      togglePlayerFullscreen();
    };
    stage.appendChild(arrowSyncBtn);
  }
}

function closeInAppPlayer(fromPopState) {
  var modal = document.getElementById("inAppVideoModal");
  var stage = document.getElementById("jjPlayerStage");

  exitTrueFullscreen();

  if (stage) stage.innerHTML = "";
  if (modal) modal.style.display = "none";

  if (!fromPopState && history.state && history.state.jjPlayerOpen) {
    try { history.back(); } catch (e) {}
  }
}

window.openMoviePlayerById = openMoviePlayerById;
window.openServerSelection = openServerSelection;
window.playMovieStream = playMovieStream;
window.closeInAppPlayer = closeInAppPlayer;
window.togglePlayerFullscreen = togglePlayerFullscreen;

function createExtraSections() {
  if (!document.getElementById("jjExtraStyles")) {
    var style = document.createElement("style");
    style.id = "jjExtraStyles";
    style.textContent = `
      .jj-feature-section { max-width:1200px; margin:14px auto 8px; padding:0 12px; }
      .jj-alert-ticker-container {
        background: #0d1526;
        border: 1px solid rgba(255, 36, 80, 0.15);
        border-left: 3px solid #ff2450;
        border-radius: 6px;
        padding: 5px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 34px;
        margin-top: 4px;
      }
      .jj-alert-ticker-content {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #e2e8f0;
        font-weight: 500;
        min-width: 0;
        flex: 1;
      }
      .jj-ticker-badge {
        background: #ff2450;
        color: #ffffff;
        font-size: 8px;
        font-weight: 800;
        padding: 1px 4px;
        border-radius: 3px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .jj-ticker-text-wrapper {
        overflow: hidden;
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        height: 16px;
      }
      .jj-ticker-slide {
        display: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        animation: tickerFade 0.4s ease-in-out;
      }
      .jj-ticker-slide.active { display: inline-block; }
      @keyframes tickerFade {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .jj-ticker-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #f1f5f9;
        text-decoration: none;
        font-size: 9px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
        flex-shrink: 0;
        transition: 0.2s;
      }
      .jj-ticker-btn:hover { background: #ff2450; border-color: #ff2450; color: #ffffff; }
      .jj-pin-badge { color:#ff7293; font-size:12px; font-weight:bold; overflow-wrap:anywhere; }
      #modalVersionContainer { min-height: 80px; }
      .modal-action-buttons-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin: 8px 0 4px 0;
      }
      .btn-modal-trailer {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(255, 36, 80, 0.15);
        border: 1px solid #ff2450;
        color: #ffffff !important;
        text-decoration: none;
        font-size: 11px;
        font-weight: 700;
        padding: 5px 12px;
        border-radius: 6px;
        transition: 0.2s;
        width: fit-content;
        cursor: pointer;
      }
      .btn-modal-trailer:hover { background: #ff2450; color: #ffffff; }

      .jj-watch-online-hero-wrap {
        margin: 14px 0 12px 0;
        padding: 12px 14px;
        background: linear-gradient(135deg, rgba(255, 36, 80, 0.16) 0%, rgba(255, 107, 0, 0.14) 100%);
        border: 1.5px solid rgba(255, 65, 102, 0.55);
        border-radius: 14px;
        box-shadow: 0 8px 24px rgba(255, 36, 80, 0.2);
      }
      .btn-big-watch-online {
        width: 100%;
        padding: 14px 18px;
        background: linear-gradient(135deg, #ff2450 0%, #ff6b00 100%);
        color: #ffffff !important;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(255, 36, 80, 0.45);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .btn-big-watch-online:hover,
      .btn-big-watch-online:active {
        transform: translateY(-2px) scale(1.01);
        box-shadow: 0 10px 26px rgba(255, 36, 80, 0.65);
      }
      .jj-watch-subtext {
        text-align: center;
        font-size: 11px;
        color: #cbd5e1;
        margin-top: 7px;
        font-weight: 600;
      }

      /* In-App Player Modal Styles */
      .jj-player-modal-overlay {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(4, 8, 16, 0.98);
        z-index: 10000;
        justify-content: center;
        align-items: center;
        padding: 12px;
      }
      .jj-player-modal-box {
        width: 100%;
        max-width: 920px;
        background: #0d1526;
        border: 1px solid rgba(255, 36, 80, 0.3);
        border-radius: 14px;
        padding: 14px;
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85);
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
      }
      .jj-player-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .jj-player-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .jj-player-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .jj-player-fs-btn {
        background: linear-gradient(135deg, #ff2450, #ff6b00);
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(255, 36, 80, 0.35);
      }
      .jj-vlc-badge {
        background: #ff6b00;
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        padding: 3px 6px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .jj-player-title {
        color: #f8fafc;
        font-size: 15px;
        font-weight: 700;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .jj-player-close {
        background: rgba(255, 255, 255, 0.12);
        border: none;
        color: #fff;
        font-size: 22px;
        line-height: 1;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
      }
      .jj-player-close:hover { background: #ff2450; }
      .jj-server-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      .jj-server-btn {
        background: #162238;
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #cbd5e1;
        font-size: 11px;
        font-weight: 700;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        transition: 0.2s;
      }
      .jj-server-btn.active, .jj-server-btn:hover {
        background: #ff2450;
        border-color: #ff2450;
        color: #ffffff;
      }
      .jj-player-stage {
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
        position: relative;
      }
      .jj-corner-arrow-btn {
        position: absolute;
        bottom: 6px;
        right: 6px;
        width: 42px;
        height: 42px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.28);
        color: #ffffff;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 25;
        backdrop-filter: blur(4px);
      }
      .jj-corner-arrow-btn:active {
        background: #ff2450;
      }
    `;
    document.head.appendChild(style);
  }

  var collection = document.getElementById("collection");
  if (collection && !document.getElementById("jjUpdatesSection")) {
    var updates = document.createElement("section");
    updates.id = "jjUpdatesSection";
    updates.className = "jj-feature-section";
    updates.innerHTML = `
      <div id="jjAlertsTicker" class="jj-alert-ticker-container" style="display:none;">
        <div class="jj-alert-ticker-content">
          <span class="jj-ticker-badge">UPDATES</span>
          <div id="jjTickerTextWrapper" class="jj-ticker-text-wrapper"></div>
        </div>
        <div id="jjTickerActionArea"></div>
      </div>
    `;
    collection.parentNode.insertBefore(updates, collection);
  }

  ensureInAppPlayerModal();
}

function getHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY
  };
}

function getSmartCalendarFestival() {
  var now = new Date();
  var m = now.getMonth() + 1;
  var d = now.getDate();
  var h = now.getHours();
  var y = now.getFullYear();

  if ((m === 12 && d >= 31 && h >= 0) || (m === 1 && d <= 1)) return { name: "HAPPY NEW YEAR " + ((m === 12) ? y + 1 : y), type: "newyear" };
  if (m === 1 && d >= 14 && d <= 15) return { name: "HAPPY SANKRANTI", type: "sankranti" };
  if (m === 1 && d === 26) return { name: "HAPPY REPUBLIC DAY", type: "tricolor" };
  if (m === 3 && d === 25) return { name: "HAPPY HOLI", type: "holi" };
  if (m === 8 && d === 15) return { name: "HAPPY INDEPENDENCE DAY", type: "tricolor" };
  if (m === 11 && d >= 1 && d <= 2) return { name: "HAPPY DIWALI", type: "diwali" };
  if (m === 12 && d === 25) return { name: "MERRY CHRISTMAS", type: "christmas" };

  return null;
}

async function initNeonFestivalMode() {
  var activeFestival = null;

  try {
    var res = await fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.festival_config&select=value", {
      headers: getHeaders()
    });
    var data = await res.json();
    if (data && data[0] && data[0].value) {
      if (data[0].value.enabled === false) return;

      if (data[0].value.enabled === true) {
        var custName = (data[0].value.name || "").trim();
        if (custName && custName !== "HAPPY FESTIVAL") {
          var lower = custName.toLowerCase();
          var manualType = "general";
          if (lower.includes("diwali") || lower.includes("deepavali")) manualType = "diwali";
          else if (lower.includes("sankranti") || lower.includes("pongal")) manualType = "sankranti";
          else if (lower.includes("holi")) manualType = "holi";
          else if (lower.includes("christmas") || lower.includes("santa")) manualType = "christmas";
          else if (lower.includes("republic") || lower.includes("independence")) manualType = "tricolor";
          else if (lower.includes("new year")) manualType = "newyear";

          activeFestival = { name: custName, type: manualType };
        }
      }
    }
  } catch (err) {
    console.warn("Manual check skipped:", err);
  }

  if (!activeFestival) {
    activeFestival = getSmartCalendarFestival();
  }

  if (activeFestival) {
    renderSubtleNeonBanner(activeFestival.name, activeFestival.type);
    startSubtleHeaderSparks(activeFestival.type);
  }
}

function renderSubtleNeonBanner(text, type) {
  var style = document.createElement("style");
  var borderCol = "#00f0ff";
  var shadowCol = "#ff007f";
  var leftIcon = "✨";
  var rightIcon = "✨";

  if (type === "diwali") {
    borderCol = "#ffb703"; shadowCol = "#fb8500"; leftIcon = "🪔"; rightIcon = "🪔";
  } else if (type === "sankranti") {
    borderCol = "#06d6a0"; shadowCol = "#ffd166"; leftIcon = "🪁"; rightIcon = "🪁";
  } else if (type === "christmas") {
    borderCol = "#ff3838"; shadowCol = "#2ed573"; leftIcon = "🎅"; rightIcon = "🦌";
  } else if (type === "holi") {
    borderCol = "#ff007f"; shadowCol = "#00e5ff"; leftIcon = "🎨"; rightIcon = "🎨";
  } else if (type === "tricolor") {
    borderCol = "#ff9933"; shadowCol = "#138808"; leftIcon = "🇮🇳"; rightIcon = "🇮🇳";
  } else if (type === "newyear") {
    borderCol = "#00f0ff"; shadowCol = "#7209b7"; leftIcon = "🎆"; rightIcon = "🎆";
  }

  style.textContent = `
    .subtle-fest-header {
      background: linear-gradient(90deg, rgba(8, 13, 24, 0.95), rgba(16, 24, 40, 0.98), rgba(8, 13, 24, 0.95));
      border-bottom: 1.5px solid ${borderCol};
      box-shadow: 0 2px 14px ${borderCol}35;
      padding: 8px 12px;
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 1002;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
    }
    .subtle-fest-text {
      font-size: clamp(13px, 2.8vw, 16px);
      font-weight: 800;
      letter-spacing: 1.8px;
      color: #ffffff;
      text-transform: uppercase;
      text-shadow: 0 0 6px #ffffff, 0 0 14px ${shadowCol};
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 2;
    }
    #festHeaderCanvas {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;
    }
  `;
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "subtle-fest-header";
  banner.innerHTML = `
    <canvas id="festHeaderCanvas"></canvas>
    <div class="subtle-fest-text">
      <span>${leftIcon}</span>
      <span>${escapeHTML(text)}</span>
      <span>${rightIcon}</span>
    </div>
  `;
  document.body.prepend(banner);
}

function startSubtleHeaderSparks(type) {
  var canvas = document.getElementById("festHeaderCanvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var banner = canvas.parentElement;
  var width = (canvas.width = banner.offsetWidth);
  var height = (canvas.height = banner.offsetHeight);

  window.addEventListener("resize", function () {
    if (banner) {
      width = canvas.width = banner.offsetWidth;
      height = canvas.height = banner.offsetHeight;
    }
  });

  var sparks = [];
  var colors = ["#ffd700", "#ffea00", "#ffffff", "#ff8800"];
  if (type === "christmas") colors = ["#ffffff", "#2ed573", "#ff4757", "#ffd700"];
  else if (type === "sankranti") colors = ["#00f0ff", "#ffd166", "#06d6a0", "#ff007f"];
  else if (type === "holi") colors = ["#ff007f", "#00e5ff", "#76ff03", "#ffea00"];

  function MiniSpark(originX) {
    this.x = originX + (Math.random() - 0.5) * 40;
    this.y = height * 0.8;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = -(Math.random() * 2.5 + 1);
    this.alpha = 1;
    this.decay = Math.random() * 0.03 + 0.02;
    this.size = Math.random() * 1.8 + 1;
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }

  MiniSpark.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08;
    this.alpha -= this.decay;
    return this.alpha > 0;
  };

  MiniSpark.prototype.draw = function () {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  var santaX = -60;
  var isChristmas = (type === "christmas");

  function loop() {
    ctx.clearRect(0, 0, width, height);

    if (Math.random() > 0.4) {
      sparks.push(new MiniSpark(width * 0.08));
      sparks.push(new MiniSpark(width * 0.92));
    }

    if (isChristmas) {
      santaX += 1.2;
      if (santaX > width + 70) santaX = -70;
      ctx.save();
      ctx.font = "14px sans-serif";
      ctx.fillText("🦌🛷🎅", santaX, height * 0.65);
      ctx.restore();
    }

    for (var i = sparks.length - 1; i >= 0; i--) {
      if (!sparks[i].update()) {
        sparks.splice(i, 1);
      } else {
        sparks[i].draw();
      }
    }

    requestAnimationFrame(loop);
  }

  loop();
}

function loadMovies() {
  if (movieCount) movieCount.textContent = "Loading movies...";

  fetch(
    SUPABASE_URL + "/rest/v1/movies?select=*&is_published=eq.true&order=created_at.desc",
    { headers: getHeaders() }
  )
    .then(function (response) {
      if (!response.ok) throw new Error("Movies request failed: " + response.status);
      return response.json();
    })
    .then(function (data) {
      movies = data.map(function (item) {
        var rawTrailer = item.trailer_url || item.trailer || item.trailer_link || item.video_url || item.youtube_link || item.trailerUrl || "";
        var rawStream1 = item.stream_url_1 || item.stream_url || item.stream1 || "";
        var rawStream2 = item.stream_url_2 || item.stream2 || "";
        return {
          id: item.id,
          title: item.title || "Untitled",
          year: item.release_year || "",
          runtime: item.runtime || "",
          category: item.category || "",
          genre: item.genre || "",
          poster: item.poster_url || "",
          description: item.description || "",
          pinned: item.is_pinned === true,
          pinLabel: String(item.pin_label || "").trim(),
          trailer: safeURL(rawTrailer),
          stream1: safeURL(rawStream1),
          stream2: safeURL(rawStream2),
          versions: []
        };
      });

      setupYears();
      renderMovies();
      renderShowcaseCarousel();

      var qid = new URLSearchParams(window.location.search).get("movie");
      if (qid) showMovieDetails(qid);

      loadMessages();
    })
    .catch(function (error) {
      console.error("JJ Movies error:", error);
      if (movieCount) movieCount.textContent = "Unable to load movies";
      if (emptyMessage) {
        emptyMessage.hidden = false;
        emptyMessage.textContent = "Movies load avvaledu.";
      }
      if (movieGrid) movieGrid.innerHTML = "";
      loadMessages();
    });
}

function renderShowcaseCarousel() {
  var bannerContainer = document.getElementById("bannerCarousel");
  if (!bannerContainer) return;

  var pinnedList = movies.filter(function (movie) { return movie.pinned === true; });
  var showpiece = pinnedList.length > 0 ? pinnedList : movies.slice(0, 3);
  if (!showpiece.length) return;

  var carouselHTML = showpiece.map(function (movie, index) {
    var isCurrent = index === 0 ? "active" : "";
    var tagBadge = getMoviePinLabel(movie) || "POPULAR";
    var posterSrc = getAdaptivePosterUrl(movie.poster);
    var hasStream = Boolean(movie.stream1 || movie.stream2);

    return `
      <div class="banner-slide ${isCurrent}">
        <div class="banner-backdrop">
          <img src="${escapeHTML(posterSrc)}" data-movie-title="${escapeHTML(movie.title)}" data-movie-year="${escapeHTML(movie.year || "")}" alt="${escapeHTML(movie.title)}" class="banner-bg-img">
          <div class="banner-vignette"></div>
        </div>
        <div class="banner-overlay-content">
          <div class="banner-badge-group">
            <span class="banner-badge-tag crimson">${escapeHTML(tagBadge)}</span>
            <span class="banner-badge-tag">${escapeHTML(movie.year || "2026")}</span>
            ${movie.runtime ? `<span class="banner-badge-tag">${escapeHTML(movie.runtime)}</span>` : ""}
          </div>
          <h1 class="banner-title">${escapeHTML(movie.title)}</h1>
          <p class="banner-desc">${escapeHTML(movie.description || "Grab complete downloads and quality prints instantly on Telegram bot.")}</p>
          <div class="banner-action-row">
            <button onclick="showMovieDetails('${escapeHTML(movie.id)}')" class="btn-banner-primary">⚡ View Movie Details</button>
            ${hasStream ? `<button onclick="openMoviePlayerById('${escapeHTML(movie.id)}')" class="btn-banner-secondary">▶ Watch Online</button>` : ""}
            ${movie.trailer ? `<a href="${escapeHTML(movie.trailer)}" target="_blank" rel="noopener noreferrer" class="btn-banner-secondary">▶ Trailer</a>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  bannerContainer.innerHTML = carouselHTML;

  bannerContainer.querySelectorAll(".banner-bg-img").forEach(function (img) {
    var mTitle = img.getAttribute("data-movie-title");
    var mYear = img.getAttribute("data-movie-year");
    img.onerror = function () { handleMissingPoster(img, mTitle, mYear); };
    if (!img.getAttribute("src")) handleMissingPoster(img, mTitle, mYear);
  });

  if (carouselInterval) clearInterval(carouselInterval);
  var currentSlide = 0;
  carouselInterval = setInterval(function () {
    var slides = document.querySelectorAll(".banner-slide");
    if (slides.length <= 1) return;
    slides[currentSlide].classList.remove("active");
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add("active");
  }, 5500);
}

function setupYears() {
  if (!yearFilter) return;
  yearFilter.innerHTML = '<option value="all">All Years</option>';
  var years = [];
  movies.forEach(function (movie) {
    if (movie.year && years.indexOf(String(movie.year)) === -1) {
      years.push(String(movie.year));
    }
  });
  years.sort(function (a, b) { return Number(b) - Number(a); });
  years.forEach(function (year) {
    var option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
}

function matchesFilters(movie) {
  var selectedCategory = genreFilter ? genreFilter.value.toLowerCase().trim() : "all";
  var year = yearFilter ? yearFilter.value : "all";
  var movieCategory = (movie.category || "").toLowerCase().trim();
  var matchesCategory = selectedCategory === "all" || movieCategory === selectedCategory;
  var matchesYear = year === "all" || String(movie.year) === year;
  var matchesText = true;
  if (inlineSearch) {
    matchesText = (movie.title || "").toLowerCase().includes(inlineSearch) ||
      (movie.description || "").toLowerCase().includes(inlineSearch) ||
      (movie.category || "").toLowerCase().includes(inlineSearch);
  }
  return matchesCategory && matchesYear && matchesText;
}

function createMovieCard(movie) {
  var card = document.createElement("article");
  card.className = "movie-card";

  var wrapper = document.createElement("div");
  wrapper.className = "card-poster-wrapper";

  var tagBadgeLeftText = movie.category || "FILMS";
  var yearTagRightText = movie.year || "2026";
  var isPremium = getMoviePinLabel(movie);
  if (isPremium) tagBadgeLeftText = isPremium;

  var badgeLeft = document.createElement("div");
  badgeLeft.className = "card-badge-top-left";
  badgeLeft.textContent = tagBadgeLeftText;

  var badgeRight = document.createElement("div");
  badgeRight.className = "card-badge-top-right";
  badgeRight.textContent = yearTagRightText;

  wrapper.appendChild(badgeLeft);
  wrapper.appendChild(badgeRight);

  var image = document.createElement("img");
  image.className = "poster";
  image.alt = movie.title + " poster";
  image.loading = "lazy";
  image.decoding = "async";

  var adaptiveSrc = getAdaptivePosterUrl(movie.poster);

  // Landscape images: show full image instead of cropping
  image.onload = function () {
    if (image.naturalWidth > image.naturalHeight) {
      image.style.objectFit = "contain";
      image.style.background = "#000";
    }
  };

  image.onerror = function () {
    handleMissingPoster(image, movie.title, movie.year);
  };

  wrapper.appendChild(image);
  card.appendChild(wrapper);

  if (adaptiveSrc) {
    image.src = adaptiveSrc;
  } else {
    handleMissingPoster(image, movie.title, movie.year);
  }

  var info = document.createElement("div");
  info.className = "movie-info";

  var title = document.createElement("h3");
  title.textContent = movie.title;

  var metaParts = [];
  if (movie.runtime) metaParts.push(movie.runtime);
  if (movie.category) metaParts.push(movie.category);

  var meta = document.createElement("div");
  meta.className = "movie-meta";
  meta.textContent = metaParts.length ? metaParts.join(" • ") : (movie.year || "Movie");

  var button = document.createElement("button");
  button.className = "details-button";
  button.type = "button";
  button.textContent = (movie.stream1 || movie.stream2) ? "▶ Watch / Downloads" : "⚡ Get Downloads";
  button.addEventListener("click", function () {
    showMovieDetails(movie.id);
  });

  info.appendChild(title);
  info.appendChild(meta);
  info.appendChild(button);
  card.appendChild(info);

  return card;
}

function renderMovies() {
  if (!movieGrid) return;

  var filtered = movies.filter(matchesFilters);
  filtered.sort(function (a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  movieGrid.innerHTML = "";
  filtered.forEach(function (movie) {
    movieGrid.appendChild(createMovieCard(movie));
  });

  if (movieCount) {
    movieCount.textContent = filtered.length + (filtered.length === 1 ? " movie" : " movies");
  }
  if (emptyMessage) {
    emptyMessage.hidden = filtered.length !== 0;
  }
}

function handleLiveSearch() {
  var search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  var resultsSection = document.getElementById("searchResultsSection");
  var searchGrid = document.getElementById("searchGrid");
  var mainWrapper = document.getElementById("mainContentWrapper");
  var clearBtn = document.getElementById("clearSearchBtn");
  var countEl = document.getElementById("searchResultCount");
  var titleEl = document.getElementById("searchResultsTitle");

  if (!resultsSection || !searchGrid || !mainWrapper) {
    inlineSearch = search;
    if (clearBtn) clearBtn.style.display = search ? "block" : "none";
    renderMovies();
    return;
  }
  inlineSearch = "";

  if (clearBtn) clearBtn.style.display = search ? "block" : "none";

  if (search === "") {
    resultsSection.style.display = "none";
    mainWrapper.style.display = "block";
    renderMovies();
    return;
  }

  mainWrapper.style.display = "none";
  resultsSection.style.display = "block";

  var matches = movies.filter(function (movie) {
    var title = (movie.title || "").toLowerCase();
    var desc = (movie.description || "").toLowerCase();
    var category = (movie.category || "").toLowerCase();
    return title.includes(search) || desc.includes(search) || category.includes(search);
  });

  searchGrid.innerHTML = "";
  if (countEl) countEl.textContent = matches.length + (matches.length === 1 ? " movie" : " movies");
  if (titleEl) titleEl.textContent = 'Results for "' + search + '"';

  if (matches.length === 0) {
    searchGrid.innerHTML = '<p class="empty-message" style="grid-column:1/-1;">No movies found matching your search.</p>';
    return;
  }

  matches.forEach(function (movie) {
    searchGrid.appendChild(createMovieCard(movie));
  });
}

function clearLiveSearch() {
  if (searchInput) {
    searchInput.value = "";
    handleLiveSearch();
    searchInput.focus();
  }
}

async function showMovieDetails(movieId) {
  var movie = movies.find(function (item) { return String(item.id) === String(movieId); });
  if (!movie) return;

  var pinLabel = getMoviePinLabel(movie);
  var pinBadgeHTML = pinLabel ? '<div class="jj-pin-badge" style="margin-bottom:8px;">' + escapeHTML(pinLabel) + '</div>' : '';

  var trailerLink = movie.trailer
    ? movie.trailer
    : "https://www.youtube.com/results?search_query=" + encodeURIComponent(movie.title + " Telugu trailer");

  var modalPosterSrc = getAdaptivePosterUrl(movie.poster);
  var hasStream = Boolean(movie.stream1 || movie.stream2);

  var bigWatchOnlineSectionHTML = hasStream
    ? `
      <div class="jj-watch-online-hero-wrap">
        <button type="button" onclick="openMoviePlayerById('${escapeHTML(movie.id)}')" class="btn-big-watch-online">
          <span>▶</span> WATCH ONLINE (INSTANT HD PLAYER)
        </button>
        <div class="jj-watch-subtext">⚡ Direct In-App Streaming • No Download Required</div>
      </div>
    `
    : "";

  modalDetails.innerHTML = `
    ${pinBadgeHTML}
    <div class="movie-header-flex">
      <img id="modalPosterImg" class="modal-mini-poster" src="${escapeHTML(modalPosterSrc)}" alt="${escapeHTML(movie.title)}">
      <div class="movie-header-info">
        <h2>${escapeHTML(movie.title)}</h2>
        <div class="movie-meta-chips">
          <span>${escapeHTML(movie.year || "N/A")}</span>
          ${movie.runtime ? `<span>• ${escapeHTML(movie.runtime)}</span>` : ""}
          ${movie.category ? `<span class="genre-badge">• ${escapeHTML(movie.category)}</span>` : ""}
        </div>
        <p class="movie-desc-text" style="margin-top:6px;">${escapeHTML(movie.description || "No description available.")}</p>
        <div class="modal-action-buttons-row">
          <a href="${escapeHTML(trailerLink)}" target="_blank" rel="noopener noreferrer" class="btn-modal-trailer">
            ▶ Watch Trailer
          </a>
        </div>
      </div>
    </div>
    ${bigWatchOnlineSectionHTML}
    <div class="prints-header-bar">
      <span>Available Quality Prints</span>
      <span class="status-dot-active">● Ready to Download</span>
    </div>
    <div id="modalVersionContainer">
      <p style="color:#64748b; font-size:12px; text-align:center; padding:16px 0;">Loading prints from bot...</p>
    </div>
    <div class="modal-footer-sharing">
      <span>Share with friends:</span>
      <a id="btnShareModalWhatsApp" href="#" class="btn-whatsapp-share" target="_blank" rel="noopener noreferrer">
        💚 Share to WhatsApp
      </a>
    </div>
  `;

  var modalImg = document.getElementById("modalPosterImg");
  if (modalImg) {
    modalImg.onerror = function () { handleMissingPoster(modalImg, movie.title, movie.year); };
    if (!modalPosterSrc) handleMissingPoster(modalImg, movie.title, movie.year);
  }

  var wasHidden = movieModal.hidden;
  movieModal.hidden = false;
  if (wasHidden) {
    try {
      history.pushState({ jjModalOpen: true }, "", window.location.href);
    } catch (e) {}
  }

  var shareAnchor = document.getElementById("btnShareModalWhatsApp");
  if (shareAnchor) {
    var shareUrl = window.location.origin + window.location.pathname + "?movie=" + encodeURIComponent(movie.id);
    var customText = "🍿 *Watch " + movie.title + "* (" + (movie.year || "Movie") + ") on JJ Movies! Check downloads: " + shareUrl;
    shareAnchor.href = "https://api.whatsapp.com/send?text=" + encodeURIComponent(customText);
  }

  try {
    var res = await fetch(
      SUPABASE_URL + "/rest/v1/movie_versions?select=id,quality,audio_language,source_type,viewing_url&movie_id=eq." + encodeURIComponent(movieId) + "&order=sort_order.asc",
      { headers: getHeaders() }
    );

    if (!res.ok) throw new Error("Fetch failed");
    var versions = await res.json();
    var container = document.getElementById("modalVersionContainer");
    if (!container) return;

    if (!versions || versions.length === 0) {
      container.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:12px;">No prints added yet.</p>`;
      return;
    }

    var listHTML = versions.map(function (v) {
      var botURL = "https://t.me/" + TELEGRAM_BOT_USERNAME + "?start=" + encodeURIComponent(String(v.id));
      return `
        <div class="version-tile">
          <div class="version-tile-info">
            <span class="version-quality-title">💾 ${escapeHTML(v.quality || "Standard")}</span>
            <span class="version-audio-sub">Audio: ${escapeHTML(v.audio_language || "Telugu")}</span>
          </div>
          <a class="btn-tele-bot" href="${escapeHTML(botURL)}" target="_blank" rel="noopener noreferrer">
            ⚡ Get Files in Bot
          </a>
        </div>
      `;
    }).join("");

    container.innerHTML = `<div class="version-list-grid">${listHTML}</div>`;
  } catch (err) {
    console.error("Modal version load error:", err);
    var errContainer = document.getElementById("modalVersionContainer");
    if (errContainer) errContainer.innerHTML = `<p style="color:#ef4444; font-size:12px; text-align:center;">Failed to load prints.</p>`;
  }
}

window.showMovieDetails = showMovieDetails;
window.clearLiveSearch = clearLiveSearch;

function loadMessages() {
  var tickerWrapper = document.getElementById("jjTickerTextWrapper");
  var tickerContainer = document.getElementById("jjAlertsTicker");
  var actionArea = document.getElementById("jjTickerActionArea");
  if (!tickerWrapper || !tickerContainer) return;

  fetch(
    SUPABASE_URL + "/rest/v1/jj_messages?select=id,title,message,link_url,created_at&is_published=eq.true&order=created_at.desc",
    { headers: getHeaders() }
  )
    .then(function (response) { return response.json(); })
    .then(function (data) {
      var activeMessages = Array.isArray(data) ? data : [];
      if (!activeMessages.length) {
        tickerContainer.style.display = "none";
        return;
      }

      tickerContainer.style.display = "flex";
      tickerWrapper.innerHTML = "";

      activeMessages.forEach(function (item, index) {
        var slide = document.createElement("span");
        slide.className = "jj-ticker-slide" + (index === 0 ? " active" : "");
        slide.setAttribute("data-link", item.link_url || "");
        slide.innerHTML = "📢 <strong>" + escapeHTML(item.title) + "</strong>: " + escapeHTML(item.message);
        tickerWrapper.appendChild(slide);
      });

      function updateButtonLink(activeSlide) {
        if (!actionArea) return;
        var link = activeSlide ? activeSlide.getAttribute("data-link") : "";
        if (link) {
          actionArea.innerHTML = `<a class="jj-ticker-btn" href="${escapeHTML(safeURL(link))}" target="_blank" rel="noopener noreferrer">Open ➜</a>`;
          actionArea.style.display = "block";
        } else {
          actionArea.innerHTML = "";
          actionArea.style.display = "none";
        }
      }

      var firstSlide = tickerWrapper.querySelector(".jj-ticker-slide.active");
      updateButtonLink(firstSlide);

      var slides = tickerWrapper.querySelectorAll(".jj-ticker-slide");
      if (slides.length <= 1) return;

      var current = 0;
      setInterval(function () {
        slides[current].classList.remove("active");
        current = (current + 1) % slides.length;
        slides[current].classList.add("active");
        updateButtonLink(slides[current]);
      }, 4000);
    })
    .catch(function (err) {
      console.warn("Messages load error:", err);
    });
}

function closeMovieModal() {
  if (!movieModal.hidden) {
    movieModal.hidden = true;
    if (history.state && history.state.jjModalOpen) {
      try { history.back(); } catch (e) {}
    }
  }
}

function ensureSearchBar() {
  if (document.getElementById("searchInput")) {
    searchInput = document.getElementById("searchInput");
    return;
  }
  if (!document.getElementById("jjSearchStyles")) {
    var st = document.createElement("style");
    st.id = "jjSearchStyles";
    st.textContent = `
      .jj-search-wrap { max-width:1200px; margin:14px auto 6px; padding:0 12px; }
      .jj-search-box { position:relative; display:flex; align-items:center; }
      .jj-search-box input {
        width:100%; background:#0d1526; border:1px solid rgba(255,255,255,0.12);
        color:#f1f5f9; font-size:14px; padding:12px 40px 12px 40px; border-radius:10px; outline:none;
      }
      .jj-search-box input:focus { border-color:#ff2450; }
      .jj-search-icon { position:absolute; left:14px; font-size:14px; opacity:.7; pointer-events:none; }
      .jj-search-clear {
        position:absolute; right:10px; background:none; border:none; color:#94a3b8;
        font-size:16px; cursor:pointer; display:none; padding:4px 6px;
      }
    `;
    document.head.appendChild(st);
  }
  var wrap = document.createElement("section");
  wrap.className = "jj-search-wrap";
  wrap.innerHTML =
    '<div class="jj-search-box">' +
    '<span class="jj-search-icon">🔍</span>' +
    '<input id="searchInput" type="search" placeholder="Search movies..." autocomplete="off">' +
    '<button id="clearSearchBtn" class="jj-search-clear" type="button" aria-label="Clear">✕</button>' +
    '</div>';
  var anchor = document.getElementById("collection") || (movieGrid && movieGrid.parentNode);
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(wrap, anchor);
  } else {
    document.body.insertBefore(wrap, document.body.firstChild);
  }
  searchInput = document.getElementById("searchInput");
  var cb = document.getElementById("clearSearchBtn");
  if (cb) cb.addEventListener("click", clearLiveSearch);
}

// ---------- 📲 APK UPDATE POPUP (DISABLED) ----------
function isRunningInsideApk() {
  var ua = navigator.userAgent || "";
  var isCap = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var isWv = /wv|Android.*Version\/[0-9.]+/i.test(ua);
  return isCap || isWv || window.location.protocol === "capacitor:" || window.location.hostname === "localhost";
}

function isVersionOlder(currentVer, latestVer) {
  var c = String(currentVer || "1.0.0").split(".").map(Number);
  var l = String(latestVer || "1.0.0").split(".").map(Number);
  for (var i = 0; i < Math.max(c.length, l.length); i++) {
    var cv = c[i] || 0;
    var lv = l[i] || 0;
    if (cv < lv) return true;
    if (cv > lv) return false;
  }
  return false;
}

async function checkApkUpdate() {
  if (!isRunningInsideApk()) return;

  try {
    var res = await fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.app_version_config&select=value", {
      headers: getHeaders()
    });
    var data = await res.json();
    if (!data || !data[0] || !data[0].value) return;

    var cfg = data[0].value;
    var latestVersion = cfg.version || "1.0.0";

    if (isVersionOlder(CURRENT_APK_VERSION, latestVersion)) {
      showAppUpdateModal(latestVersion, cfg.apk_url || "./jj-movies.apk", cfg.notes, cfg.force === true);
    }
  } catch (err) {
    console.warn("App update check skipped:", err);
  }
}

function showAppUpdateModal(latestVer, apkUrl, notes, isForce) {
  if (document.getElementById("jjAppUpdateModal")) return;

  var modal = document.createElement("div");
  modal.id = "jjAppUpdateModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(4,8,16,0.92);backdrop-filter:blur(10px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:18px;";

  modal.innerHTML = `
    <div style="background:#0d1527;border:1.5px solid #ff2450;border-radius:18px;max-width:380px;width:100%;padding:24px 20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.9);">
      <div style="font-size:40px;margin-bottom:8px;">🚀</div>
      <h2 style="margin:0 0 6px;color:#fff;font-size:20px;">New Update Available!</h2>
      <p style="margin:0 0 14px;color:#38bdf8;font-size:12px;font-weight:bold;">
        Old Version: v${escapeHTML(CURRENT_APK_VERSION)}  ➜  New Version: v${escapeHTML(latestVer)}
      </p>
      <div style="background:#131c31;border-radius:10px;padding:12px;margin-bottom:18px;text-align:left;color:#cbd5e1;font-size:13px;line-height:1.5;">
        <strong style="color:#fff;display:block;margin-bottom:4px;">✨ What's New:</strong>
        ${escapeHTML(notes || "Kotha version vachindi! Daya chesi app ni update cheskondi.")}
      </div>
      <a href="${escapeHTML(apkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:block;width:100%;padding:13px;background:linear-gradient(135deg,#ff2450,#ff6b00);color:#fff;text-decoration:none;font-weight:800;font-size:14px;border-radius:10px;box-shadow:0 6px 20px rgba(255,36,80,0.4);">
        ⬇ UPDATE APP NOW
      </a>
      ${!isForce ? `<button id="jjUpdateLaterBtn" type="button" style="margin-top:12px;background:transparent;border:none;color:#94a3b8;font-size:12px;cursor:pointer;padding:6px;">Later</button>` : `<p style="margin:12px 0 0;color:#f87171;font-size:11px;font-weight:bold;">⚠️ Old APK panicheyadu, daya chesi update cheyandi.</p>`}
    </div>
  `;

  document.body.appendChild(modal);

  var laterBtn = document.getElementById("jjUpdateLaterBtn");
  if (laterBtn) {
    laterBtn.onclick = function () {
      modal.remove();
    };
  }
}

// ---------- 🙈 HIDE APK DOWNLOAD BUTTONS INSIDE ANDROID APP ----------
(function hideApkButtonsInApp() {
  if (isRunningInsideApk()) {
    var st = document.createElement("style");
    st.textContent = '.nav-download-app, .footer-app-link, a[href*="jj-movies.apk"] { display: none !important; }';
    document.head.appendChild(st);
  }
})();

ensureSearchBar();
if (searchInput) searchInput.addEventListener("input", handleLiveSearch);
if (genreFilter) genreFilter.addEventListener("change", renderMovies);
if (yearFilter) yearFilter.addEventListener("change", renderMovies);

var closeBtn = document.getElementById("closeModal");
if (closeBtn) closeBtn.addEventListener("click", closeMovieModal);

if (movieModal) {
  movieModal.addEventListener("click", function (event) {
    if (event.target === movieModal) closeMovieModal();
  });
}

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeInAppPlayer();
    closeMovieModal();
  }
});

createExtraSections();
loadMovies();
initNeonFestivalMode();
// checkApkUpdate();  // update popup disabled
// ---------- 🔄 ADD FLOATING / TOPBAR REFRESH BUTTON FOR APP ----------
(function addAppRefreshButton() {
  var topNav = document.querySelector(".top-nav-right");
  if (topNav && !document.getElementById("jjRefreshBtn")) {
    var refBtn = document.createElement("button");
    refBtn.id = "jjRefreshBtn";
    refBtn.type = "button";
    refBtn.innerHTML = "🔄";
    refBtn.title = "Refresh App";
    refBtn.style.cssText = "background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:0.2s;";
    
    refBtn.onclick = function() {
      refBtn.style.transform = "rotate(360deg)";
      setTimeout(function() { window.location.reload(); }, 300);
    };

    topNav.prepend(refBtn);
  }
})();
