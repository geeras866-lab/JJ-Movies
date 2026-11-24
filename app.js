// Zero external URLs, zero API keys, zero secrets, zero GitHub references
var API_BASE = "./api";

var movies = [];
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
var currentActiveMovieTitle = "JJ Movies";
var MOVIES_CACHE_KEY = "jj_movies_cache_v1";

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

// ---------- Environment Detection ----------
function isRunningInsideApk() {
  var ua = navigator.userAgent || "";
  var isCap = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var isWv = /wv|Android.*Version\/[0-9.]+/i.test(ua);
  var isTv = /JJTV/i.test(ua) || /[?&]tv=1/.test(location.search);
  return isCap || isWv || isTv || hasNativeVlcBridge() || window.location.protocol === "capacitor:" || window.location.hostname === "localhost";
}

function hasNativeVlcBridge() {
  return Boolean(window.AndroidVlc && typeof window.AndroidVlc.playVideo === "function");
}

// ---------- Server Proxy Helpers ----------
async function fetchFromApi(type, params) {
  var queryObj = Object.assign({ type: type }, params || {});
  var query = new URLSearchParams(queryObj).toString();
  var res = await fetch(API_BASE + "/movies?" + query, { cache: "no-store" });
  if (!res.ok) throw new Error("API request failed: " + res.status);
  return res.json();
}

// Token-only stream resolver: permanent direct URLs are never returned raw
async function resolveTokenStreamUrl(rawUrl, linkType, meta) {
  var mode = String(linkType || "token").toLowerCase().trim();
  if (mode !== "token") {
    throw new Error("Only token-protected streams are allowed.");
  }

  var workerFile = extractWorkerFileName(rawUrl);
  var queryParams = new URLSearchParams();
  if (workerFile) {
    queryParams.set("file", workerFile);
  } else if (rawUrl) {
    queryParams.set("ref", String(rawUrl).trim());
  }
  if (meta && meta.id) queryParams.set("id", String(meta.id));
  if (meta && meta.episodeId) queryParams.set("episode_id", String(meta.episodeId));

  var res = await fetch(API_BASE + "/get-token?" + queryParams.toString(), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!res.ok) throw new Error("Token generation failed: " + res.status);
  var data = await res.json();
  if (!data || !data.url) throw new Error("Invalid token stream response");
  return String(data.url).trim();
}

// ---------- Basic Helpers ----------
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

function isSeries(movie) {
  return Boolean(movie && movie.type === "series");
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
  var isWifi = Boolean(conn && conn.type === "wifi" && !conn.saveData);
  if (val.includes("image.tmdb.org/t/p/")) {
    return isWifi
      ? val.replace(/\/t\/p\/[^\/]+/, "/t/p/w500")
      : val.replace(/\/t\/p\/[^\/]+/, "/t/p/w185");
  }
  return val;
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

function handleMissingPoster(imgElement, movieTitle) {
  showTextPlaceholder(imgElement, movieTitle);
}
window.handleMissingPoster = handleMissingPoster;

// ---------- Stream Helpers (Token-Enforced App Only) ----------
function isDirectVideoFile(url) {
  if (!url) return false;
  return /\.(mp4|mkv|webm|m3u8|avi|mov|ts|flv|m4v)(\?.*)?$/i.test(url);
}

function isB2PrefixedFile(val) {
  return /^[a-zA-Z0-9_-]+\/.+\.(mp4|mkv|webm|m3u8|avi|mov|ts|flv|m4v)(\?.*)?$/i.test(String(val || "").trim());
}

function safeTokenRefValue(value) {
  var val = String(value || "").trim();
  if (!val) return "";
  if (!/^https?:\/\//i.test(val) && (isB2PrefixedFile(val) || (val.indexOf("/") === -1 && isDirectVideoFile(val)))) {
    return val;
  }
  return safeURL(val);
}

function extractWorkerFileName(rawUrl) {
  var val = String(rawUrl || "").trim();
  if (!val) return "";

  if (/^https?:\/\/[^\/]+\.workers\.dev\//i.test(val)) {
    try {
      var u = new URL(val);
      return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    } catch (e) {
      return val.replace(/^https?:\/\/[^\/]+/i, "").replace(/^\/+/, "").split("?")[0];
    }
  }

  if (!/^https?:\/\//i.test(val) && (isB2PrefixedFile(val) || (val.indexOf("/") === -1 && isDirectVideoFile(val)))) {
    return val;
  }

  return "";
}

function isTokenEligibleLink(rawUrl, linkType) {
  var mode = String(linkType || "token").toLowerCase().trim();
  return mode === "token" && Boolean(String(rawUrl || "").trim());
}

function launchNativeVlc(playableUrl, title) {
  var activeTitle = title ||
    currentActiveMovieTitle ||
    (document.getElementById("modalMovieTitle") && document.getElementById("modalMovieTitle").textContent) ||
    "JJ Movies";
  if (hasNativeVlcBridge() && playableUrl) {
    window.AndroidVlc.playVideo(String(playableUrl), String(activeTitle));
    return true;
  }
  return false;
}

function loadHls(cb) {
  if (window.Hls) return cb();
  var s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js";
  s.onload = cb;
  document.head.appendChild(s);
}

// ---------- Fullscreen & Orientation (App Only) ----------
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
  return document.getElementById("vlcInAppIframe") || document.getElementById("vlcInAppPlayer") || document.getElementById("jjPlayerStage");
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
  if (isInFullscreen()) exitTrueFullscreen();
  else enterTrueFullscreen();
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
  if (!isRunningInsideApk()) return;
  var modal = document.getElementById("inAppVideoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "inAppVideoModal";
    modal.className = "jj-player-modal-overlay";
    modal.style.display = "none";
    modal.innerHTML =
      '<div class="jj-player-modal-box">' +
        '<div class="jj-player-header">' +
          '<div class="jj-player-title-wrap">' +
            '<span class="jj-vlc-badge">▶ IN-APP PLAYER</span>' +
            '<h3 id="modalMovieTitle" class="jj-player-title">Playing Movie</h3>' +
          '</div>' +
          '<div class="jj-player-header-actions">' +
            '<button type="button" id="jjFullscreenBtn" class="jj-player-fs-btn" onclick="togglePlayerFullscreen()">⛶ Rotate Fullscreen</button>' +
            '<button type="button" class="jj-player-close" onclick="closeInAppPlayer()" aria-label="Close">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div id="serverSwitchContainer" class="jj-server-bar"></div>' +
        '<div id="jjPlayerStage" class="jj-player-stage"></div>' +
      '</div>';
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeInAppPlayer();
    });
    document.body.appendChild(modal);
  }
}

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
  if (!isRunningInsideApk()) return;
  var movie = movies.find(function (item) { return String(item.id) === String(movieId); });
  if (!movie) return;
  openServerSelection(movie.title, movie.stream1, movie.stream2, movie.linkType, { id: movie.id });
}

async function openServerSelection(title, s1, s2, linkType, meta) {
  if (!isRunningInsideApk()) return;
  var cleanTitle = title || "Playing Movie";
  var mode = String(linkType || "token").toLowerCase().trim();
  currentActiveMovieTitle = cleanTitle;

  if (mode !== "token") {
    alert("Only token-protected links are enabled for playback.");
    return;
  }

  var servers = [];
  if (s1) servers.push({ name: "⚡ Server 1 (Token)", url: s1, linkType: mode });
  if (s2) servers.push({ name: "🚀 Server 2 (Token)", url: s2, linkType: mode });
  if (!servers.length) return;

  if (hasNativeVlcBridge()) {
    try {
      var playableUrl = await resolveTokenStreamUrl(servers[0].url, servers[0].linkType, meta);
      currentActiveStreamUrl = playableUrl;
      launchNativeVlc(playableUrl, cleanTitle);
    } catch (err) {
      alert("Token Stream Error: " + err.message);
    }
    return;
  }

  ensureInAppPlayerModal();
  var modal = document.getElementById("inAppVideoModal");
  var titleElem = document.getElementById("modalMovieTitle");
  var serverContainer = document.getElementById("serverSwitchContainer");
  if (!modal) return;

  if (titleElem) titleElem.textContent = cleanTitle;
  modal.style.display = "flex";
  modal.style.visibility = "visible";
  modal.style.opacity = "1";
  modal.style.zIndex = "99999";

  try { history.pushState({ jjPlayerOpen: true }, "", window.location.href); } catch (e) {}

  serverContainer.innerHTML = "";
  servers.forEach(function (srv, idx) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "jj-server-btn" + (idx === 0 ? " active" : "");
    btn.textContent = srv.name;
    btn.addEventListener("click", function () {
      serverContainer.querySelectorAll(".jj-server-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      playMovieStream(srv.url, cleanTitle, srv.linkType, meta);
    });
    serverContainer.appendChild(btn);
  });

  playMovieStream(servers[0].url, cleanTitle, servers[0].linkType, meta);
}

async function playMovieStream(rawUrl, title, linkType, meta) {
  if (!isRunningInsideApk()) return;
  var stage = document.getElementById("jjPlayerStage");
  if (!stage) return;
  var raw = String(rawUrl || "").trim();
  if (title) currentActiveMovieTitle = title;

  stage.innerHTML = '<div style="color:#cbd5e1;padding:30px;text-align:center;font-size:13px;">🔐 Generating temporary token link...</div>';

  var url = "";
  try {
    url = await resolveTokenStreamUrl(raw, linkType, meta);
  } catch (err) {
    stage.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;font-size:13px;">Token Error: ' + escapeHTML(err.message) + '</div>';
    return;
  }

  currentActiveStreamUrl = url;
  stage.innerHTML = "";

  if (hasNativeVlcBridge()) {
    closeInAppPlayer();
    launchNativeVlc(url, currentActiveMovieTitle);
    return;
  }

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
      stage.innerHTML = '<div style="color:#fff;padding:20px;text-align:center;font-size:13px;">Token stream expired or failed. Please reopen video.</div>';
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
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media; screen-wake-lock");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    stage.appendChild(iframe);
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
window.launchNativeVlc = launchNativeVlc;

// ---------- UI Styles & Updates Ticker ----------
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
      .jj-alert-ticker-content { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #e2e8f0; font-weight: 500; min-width: 0; flex: 1; }
      .jj-ticker-badge { background: #ff2450; color: #fff; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; flex-shrink: 0; }
      .jj-ticker-text-wrapper { overflow: hidden; position: relative; flex: 1; display: flex; align-items: center; height: 16px; }
      .jj-ticker-slide { display: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; animation: tickerFade 0.4s ease-in-out; }
      .jj-ticker-slide.active { display: inline-block; }
      @keyframes tickerFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .jj-ticker-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #f1f5f9; text-decoration: none; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
      .jj-ticker-btn:hover { background: #ff2450; border-color: #ff2450; color: #fff; }
      .jj-pin-badge { color:#ff7293; font-size:12px; font-weight:bold; overflow-wrap:anywhere; }
      .jj-watch-online-hero-wrap { margin: 14px 0 12px 0; padding: 12px 14px; background: linear-gradient(135deg, rgba(255,36,80,0.16), rgba(255,107,0,0.14)); border: 1.5px solid rgba(255,65,102,0.55); border-radius: 14px; }
      .btn-big-watch-online { width: 100%; padding: 14px 18px; background: linear-gradient(135deg, #ff2450, #ff6b00); color: #fff !important; border: none; border-radius: 10px; font-size: 15px; font-weight: 900; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
      .jj-watch-subtext { text-align: center; font-size: 11px; color: #cbd5e1; margin-top: 7px; font-weight: 600; }
      .jj-player-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(4,8,16,0.98); z-index: 10000; justify-content: center; align-items: center; padding: 12px; }
      .jj-player-modal-box { width: 100%; max-width: 920px; background: #0d1526; border: 1px solid rgba(255,36,80,0.3); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; }
      .jj-player-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      .jj-player-title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
      .jj-player-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .jj-player-fs-btn { background: linear-gradient(135deg, #ff2450, #ff6b00); border: none; color: #fff; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
      .jj-vlc-badge { background: #ff6b00; color: #fff; font-size: 9px; font-weight: 800; padding: 3px 6px; border-radius: 4px; flex-shrink: 0; }
      .jj-player-title { color: #f8fafc; font-size: 15px; font-weight: 700; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .jj-player-close { background: rgba(255,255,255,0.12); border: none; color: #fff; font-size: 22px; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; }
      .jj-server-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .jj-server-btn { background: #162238; border: 1px solid rgba(255,255,255,0.14); color: #cbd5e1; font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
      .jj-server-btn.active { background: #ff2450; border-color: #ff2450; color: #fff; }
      .jj-player-stage { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; overflow: hidden; position: relative; }
      .jj-episodes-wrap { margin: 14px 0 12px; padding: 12px; background: #0d1526; border: 1.5px solid rgba(255,65,102,0.45); border-radius: 14px; }
      .jj-episodes-head { color: #fff; font-weight: 800; font-size: 14px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 3px; }
      .jj-episodes-sub { color: #94a3b8; font-size: 10px; font-weight: 600; }
      .jj-season-tabs { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 10px; }
      .jj-season-btn { flex-shrink: 0; background: #162238; border: 1px solid rgba(255,255,255,0.14); color: #cbd5e1; font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
      .jj-season-btn.active { background: #ff2450; border-color: #ff2450; color: #fff; }
      .jj-ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
      .jj-ep-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: linear-gradient(135deg, #ff2450, #ff6b00); color: #fff; border: none; border-radius: 9px; padding: 10px 12px; cursor: pointer; }
      .jj-ep-btn.disabled { background: #1a2536; color: #64748b; cursor: not-allowed; }
      .jj-ep-num { font-size: 12px; font-weight: 800; }
      .jj-ep-sub { font-size: 10px; font-weight: 600; opacity: 0.9; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jj-ep-empty { color: #64748b; font-size: 12px; text-align: center; padding: 10px 0; margin: 0; }
    `;
    document.head.appendChild(style);
  }

  var collection = document.getElementById("collection");
  if (collection && !document.getElementById("jjUpdatesSection")) {
    var updates = document.createElement("section");
    updates.id = "jjUpdatesSection";
    updates.className = "jj-feature-section";
    updates.innerHTML =
      '<div id="jjAlertsTicker" class="jj-alert-ticker-container" style="display:none;">' +
        '<div class="jj-alert-ticker-content">' +
          '<span class="jj-ticker-badge">UPDATES</span>' +
          '<div id="jjTickerTextWrapper" class="jj-ticker-text-wrapper"></div>' +
        '</div>' +
        '<div id="jjTickerActionArea"></div>' +
      '</div>';
    collection.parentNode.insertBefore(updates, collection);
  }

  ensureInAppPlayerModal();
}

// ---------- Festival Mode ----------
function getSmartCalendarFestival() {
  var now = new Date();
  var m = now.getMonth() + 1, d = now.getDate(), y = now.getFullYear();
  if ((m === 12 && d >= 31) || (m === 1 && d <= 1)) return { name: "HAPPY NEW YEAR " + (m === 12 ? y + 1 : y), type: "newyear" };
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
    var data = await fetchFromApi("settings");
    var cfgRow = Array.isArray(data) ? data.find(function (r) { return r.key === "festival_config"; }) : null;
    if (cfgRow && cfgRow.value) {
      if (cfgRow.value.enabled === false) return;
      if (cfgRow.value.enabled === true) {
        var custName = (cfgRow.value.name || "").trim();
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
  } catch (err) {}

  if (!activeFestival) activeFestival = getSmartCalendarFestival();
  if (activeFestival) {
    renderSubtleNeonBanner(activeFestival.name, activeFestival.type);
    startSubtleHeaderSparks(activeFestival.type);
  }
}

function renderSubtleNeonBanner(text, type) {
  var style = document.createElement("style");
  var borderCol = "#00f0ff", shadowCol = "#ff007f", leftIcon = "✨", rightIcon = "✨";
  if (type === "diwali") { borderCol = "#ffb703"; shadowCol = "#fb8500"; leftIcon = "🪔"; rightIcon = "🪔"; }
  else if (type === "sankranti") { borderCol = "#06d6a0"; shadowCol = "#ffd166"; leftIcon = "🪁"; rightIcon = "🪁"; }
  else if (type === "christmas") { borderCol = "#ff3838"; shadowCol = "#2ed573"; leftIcon = "🎅"; rightIcon = "🦌"; }
  else if (type === "holi") { borderCol = "#ff007f"; shadowCol = "#00e5ff"; leftIcon = "🎨"; rightIcon = "🎨"; }
  else if (type === "tricolor") { borderCol = "#ff9933"; shadowCol = "#138808"; leftIcon = "🇮🇳"; rightIcon = "🇮🇳"; }
  else if (type === "newyear") { borderCol = "#00f0ff"; shadowCol = "#7209b7"; leftIcon = "🎆"; rightIcon = "🎆"; }

  style.textContent =
    ".subtle-fest-header{background:linear-gradient(90deg,rgba(8,13,24,.95),rgba(16,24,40,.98),rgba(8,13,24,.95));border-bottom:1.5px solid " + borderCol + ";padding:8px 12px;text-align:center;position:sticky;top:0;z-index:1002;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:40px;}" +
    ".subtle-fest-text{font-size:clamp(13px,2.8vw,16px);font-weight:800;letter-spacing:1.8px;color:#fff;text-transform:uppercase;text-shadow:0 0 6px #fff,0 0 14px " + shadowCol + ";display:flex;align-items:center;gap:10px;z-index:2;}" +
    "#festHeaderCanvas{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;}";
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "subtle-fest-header";
  banner.innerHTML =
    '<canvas id="festHeaderCanvas"></canvas>' +
    '<div class="subtle-fest-text"><span>' + leftIcon + '</span><span>' + escapeHTML(text) + '</span><span>' + rightIcon + '</span></div>';
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
    if (banner) { width = canvas.width = banner.offsetWidth; height = canvas.height = banner.offsetHeight; }
  });
  var sparks = [];
  var colors = type === "christmas" ? ["#fff", "#2ed573", "#ff4757", "#ffd700"]
    : type === "sankranti" ? ["#00f0ff", "#ffd166", "#06d6a0", "#ff007f"]
    : type === "holi" ? ["#ff007f", "#00e5ff", "#76ff03", "#ffea00"]
    : ["#ffd700", "#ffea00", "#fff", "#ff8800"];

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
    this.x += this.vx; this.y += this.vy; this.vy += 0.08; this.alpha -= this.decay;
    return this.alpha > 0;
  };
  MiniSpark.prototype.draw = function () {
    ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  function loop() {
    ctx.clearRect(0, 0, width, height);
    if (Math.random() > 0.4) { sparks.push(new MiniSpark(width * 0.08)); sparks.push(new MiniSpark(width * 0.92)); }
    for (var i = sparks.length - 1; i >= 0; i--) {
      if (!sparks[i].update()) sparks.splice(i, 1);
      else sparks[i].draw();
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ---------- Movies Data & Rendering ----------
function applyMoviesData(data) {
  movies = (Array.isArray(data) ? data : []).map(function (item) {
    var rawTrailer = item.trailer_url || item.trailer || item.trailer_link || item.video_url || item.youtube_link || item.trailerUrl || "";
    var rawStream1 = item.stream_url_1 || item.stream_url || item.stream1 || "";
    var rawStream2 = item.stream_url_2 || item.stream2 || "";
    var linkType = String(item.link_type || item.stream_type || "token").toLowerCase().trim();
    return {
      id: item.id,
      title: item.title || "Untitled",
      year: item.release_year || "",
      runtime: item.runtime || "",
      category: item.category || "",
      type: String(item.content_type || "movie").toLowerCase() === "series" ? "series" : "movie",
      genre: item.genre || "",
      poster: item.poster_url || "",
      description: item.description || "",
      pinned: item.is_pinned === true,
      pinLabel: String(item.pin_label || "").trim(),
      linkType: linkType,
      trailer: safeURL(rawTrailer),
      stream1: safeTokenRefValue(rawStream1),
      stream2: safeTokenRefValue(rawStream2),
      versions: []
    };
  });

  setupYears();
  renderMovies();
  renderShowcaseCarousel();

  var qid = new URLSearchParams(window.location.search).get("movie");
  if (qid) showMovieDetails(qid);

  loadMessages();
}
window.applyMoviesData = applyMoviesData;

function readMoviesCache() {
  try {
    var raw = localStorage.getItem(MOVIES_CACHE_KEY);
    var arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch (e) { return null; }
}

function loadMovies() {
  if (movieCount) movieCount.textContent = "Loading movies...";

  fetchFromApi("movies")
    .then(function (data) {
      try { localStorage.setItem(MOVIES_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      hideOfflineBar();
      applyMoviesData(data);
    })
    .catch(function () {
      var cached = readMoviesCache();
      if (cached) {
        applyMoviesData(cached);
        showOfflineBar();
        return;
      }
      if (movieCount) movieCount.textContent = "Unable to load movies";
      if (emptyMessage) {
        emptyMessage.hidden = false;
        emptyMessage.textContent = navigator.onLine === false
          ? "No internet connection. Please turn on your internet and pull down to refresh."
          : "Unable to load movies. Please pull down to refresh.";
      }
      if (movieGrid) movieGrid.innerHTML = "";
      showOfflineBar();
      loadMessages();
    });
}

function renderShowcaseCarousel() {
  var bannerContainer = document.getElementById("bannerCarousel");
  if (!bannerContainer) return;

  var pinnedList = movies.filter(function (movie) { return movie.pinned === true; });
  var showpiece = pinnedList.length > 0 ? pinnedList : movies.slice(0, 3);
  if (!showpiece.length) return;

  var inApp = isRunningInsideApk();

  bannerContainer.innerHTML = showpiece.map(function (movie, index) {
    var isCurrent = index === 0 ? "active" : "";
    var tagBadge = getMoviePinLabel(movie) || "POPULAR";
    var posterSrc = getAdaptivePosterUrl(movie.poster);
    var hasTokenStream = inApp && !isSeries(movie) && movie.linkType === "token" && Boolean(movie.stream1 || movie.stream2);

    return (
      '<div class="banner-slide ' + isCurrent + '">' +
        '<div class="banner-backdrop">' +
          '<img src="' + escapeHTML(posterSrc) + '" data-movie-title="' + escapeHTML(movie.title) + '" alt="' + escapeHTML(movie.title) + '" class="banner-bg-img">' +
          '<div class="banner-vignette"></div>' +
        '</div>' +
        '<div class="banner-overlay-content">' +
          '<div class="banner-badge-group">' +
            '<span class="banner-badge-tag crimson">' + escapeHTML(tagBadge) + '</span>' +
            '<span class="banner-badge-tag">' + escapeHTML(movie.year || "2026") + '</span>' +
            (movie.runtime ? '<span class="banner-badge-tag">' + escapeHTML(movie.runtime) + '</span>' : '') +
          '</div>' +
          '<h1 class="banner-title">' + escapeHTML(movie.title) + '</h1>' +
          '<p class="banner-desc">' + escapeHTML(movie.description || "Explore details and available formats.") + '</p>' +
          '<div class="banner-action-row">' +
            '<button onclick="showMovieDetails(\'' + escapeHTML(movie.id) + '\')" class="btn-banner-primary">' + (isSeries(movie) ? "⚡ View Series Details" : "⚡ View Movie Details") + '</button>' +
            (hasTokenStream ? '<button onclick="openMoviePlayerById(\'' + escapeHTML(movie.id) + '\')" class="btn-banner-secondary">▶ Watch Online</button>' : '') +
            (movie.trailer ? '<a href="' + escapeHTML(movie.trailer) + '" target="_blank" rel="noopener noreferrer" class="btn-banner-secondary">▶ Trailer</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join("");

  bannerContainer.querySelectorAll(".banner-bg-img").forEach(function (img) {
    var mTitle = img.getAttribute("data-movie-title");
    img.onerror = function () { handleMissingPoster(img, mTitle); };
    if (!img.getAttribute("src")) handleMissingPoster(img, mTitle);
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
window.renderShowcaseCarousel = renderShowcaseCarousel;

function setupYears() {
  if (!yearFilter) return;
  yearFilter.innerHTML = '<option value="all">All Years</option>';
  var years = [];
  movies.forEach(function (movie) {
    if (movie.year && years.indexOf(String(movie.year)) === -1) years.push(String(movie.year));
  });
  years.sort(function (a, b) { return Number(b) - Number(a); });
  years.forEach(function (year) {
    var option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
}
window.setupYears = setupYears;

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

  var tagBadgeLeftText = getMoviePinLabel(movie) || movie.category || (isSeries(movie) ? "SERIES" : "FILMS");
  var badgeLeft = document.createElement("div");
  badgeLeft.className = "card-badge-top-left";
  badgeLeft.textContent = tagBadgeLeftText;

  var badgeRight = document.createElement("div");
  badgeRight.className = "card-badge-top-right";
  badgeRight.textContent = movie.year || "2026";

  wrapper.appendChild(badgeLeft);
  wrapper.appendChild(badgeRight);

  var image = document.createElement("img");
  image.className = "poster";
  image.alt = movie.title + " poster";
  image.loading = "lazy";
  image.decoding = "async";

  image.onload = function () {
    if (image.naturalWidth > image.naturalHeight) {
      image.style.objectFit = "contain";
      image.style.background = "#000";
    }
  };
  image.onerror = function () { handleMissingPoster(image, movie.title); };

  wrapper.appendChild(image);
  card.appendChild(wrapper);

  var adaptiveSrc = getAdaptivePosterUrl(movie.poster);
  if (adaptiveSrc) image.src = adaptiveSrc;
  else handleMissingPoster(image, movie.title);

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

  var inApp = isRunningInsideApk();
  var button = document.createElement("button");
  button.className = "details-button";
  button.type = "button";
  button.textContent = inApp
    ? (isSeries(movie) || (movie.linkType === "token" && (movie.stream1 || movie.stream2)) ? "▶ Watch Now" : "View Details")
    : "⚡ View Details";
  button.addEventListener("click", function () { showMovieDetails(movie.id); });

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
  filtered.forEach(function (movie) { movieGrid.appendChild(createMovieCard(movie)); });

  if (movieCount) movieCount.textContent = filtered.length + (filtered.length === 1 ? " title" : " titles");
  if (emptyMessage) emptyMessage.hidden = filtered.length !== 0;
}
window.renderMovies = renderMovies;

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
    return (movie.title || "").toLowerCase().includes(search) ||
      (movie.description || "").toLowerCase().includes(search) ||
      (movie.category || "").toLowerCase().includes(search);
  });

  searchGrid.innerHTML = "";
  if (countEl) countEl.textContent = matches.length + (matches.length === 1 ? " movie" : " movies");
  if (titleEl) titleEl.textContent = 'Results for "' + search + '"';

  if (!matches.length) {
    searchGrid.innerHTML = '<p class="empty-message" style="grid-column:1/-1;">No movies found matching your search.</p>';
    return;
  }
  matches.forEach(function (movie) { searchGrid.appendChild(createMovieCard(movie)); });
}

function clearLiveSearch() {
  if (searchInput) {
    searchInput.value = "";
    handleLiveSearch();
    searchInput.focus();
  }
}
window.clearLiveSearch = clearLiveSearch;

// ---------- Series Episodes (Token-Enforced App Only) ----------
async function loadEpisodes(movie) {
  if (!isRunningInsideApk()) return;
  var box = document.getElementById("modalEpisodesContainer");
  if (!box) return;
  try {
    var eps = await fetchFromApi("episodes", { movie_id: movie.id });
    try { localStorage.setItem("jj_eps_" + movie.id, JSON.stringify(eps)); } catch (e) {}
    box = document.getElementById("modalEpisodesContainer");
    if (!box) return;
    if (!eps || !eps.length) {
      box.innerHTML = '<p class="jj-ep-empty">No episodes added yet.</p>';
      return;
    }
    renderEpisodes(movie, eps, box);
  } catch (err) {
    box = document.getElementById("modalEpisodesContainer");
    if (!box) return;
    var cachedEps = null;
    try { cachedEps = JSON.parse(localStorage.getItem("jj_eps_" + movie.id) || "null"); } catch (e) {}
    if (cachedEps && cachedEps.length) renderEpisodes(movie, cachedEps, box);
    else box.innerHTML = '<p class="jj-ep-empty" style="color:#ef4444;">Unable to load episodes.</p>';
  }
}

function renderEpisodes(movie, eps, box) {
  var seasons = [];
  eps.forEach(function (e) {
    var n = Number(e.season_number) || 1;
    if (seasons.indexOf(n) === -1) seasons.push(n);
  });
  seasons.sort(function (a, b) { return a - b; });
  var activeSeason = seasons[0];

  function draw() {
    var tabs = '<div class="jj-season-tabs">' + seasons.map(function (n) {
      return '<button type="button" class="jj-season-btn' + (n === activeSeason ? " active" : "") + '" data-season="' + n + '">Season ' + n + '</button>';
    }).join("") + '</div>';

    var list = eps.filter(function (e) { return (Number(e.season_number) || 1) === activeSeason; });
    var grid = list.map(function (e) {
      var epLinkType = String(e.link_type || e.stream_type || movie.linkType || "token").toLowerCase().trim();
      var playable = epLinkType === "token" && Boolean(e.stream_url_1 || e.stream_url_2);
      var sub = e.title ? '<span class="jj-ep-sub">' + escapeHTML(e.title) + '</span>' : "";
      return '<button type="button" class="jj-ep-btn' + (playable ? "" : " disabled") + '" data-ep="' + escapeHTML(e.id) + '"' + (playable ? "" : " disabled") + '>' +
        '<span class="jj-ep-num">▶ Episode ' + escapeHTML(e.episode_number) + '</span>' + sub + '</button>';
    }).join("");

    box.innerHTML = tabs + '<div class="jj-ep-grid">' + grid + '</div>';

    box.querySelectorAll(".jj-season-btn").forEach(function (b) {
      b.addEventListener("click", function () { activeSeason = Number(b.getAttribute("data-season")); draw(); });
    });
    box.querySelectorAll(".jj-ep-btn:not(.disabled)").forEach(function (b) {
      b.addEventListener("click", function () {
        var ep = eps.find(function (x) { return String(x.id) === b.getAttribute("data-ep"); });
        if (!ep) return;
        var epLinkType = String(ep.link_type || ep.stream_type || movie.linkType || "token").toLowerCase().trim();
        var label = movie.title + " • S" + (Number(ep.season_number) || 1) + " • Episode " + ep.episode_number;
        openServerSelection(
          label,
          safeTokenRefValue(ep.stream_url_1),
          safeTokenRefValue(ep.stream_url_2),
          epLinkType,
          { id: movie.id, episodeId: ep.id }
        );
      });
    });
  }
  draw();
}

// ---------- Movie Details Modal ----------
async function showMovieDetails(movieId) {
  var movie = movies.find(function (item) { return String(item.id) === String(movieId); });
  if (!movie) return;

  var inApp = isRunningInsideApk();
  var pinLabel = getMoviePinLabel(movie);
  var pinBadgeHTML = pinLabel ? '<div class="jj-pin-badge" style="margin-bottom:8px;">' + escapeHTML(pinLabel) + '</div>' : '';
  var trailerLink = movie.trailer || ("https://www.youtube.com/results?search_query=" + encodeURIComponent(movie.title + " Telugu trailer"));
  var modalPosterSrc = getAdaptivePosterUrl(movie.poster);
  var seriesMode = isSeries(movie);
  var hasTokenStream = movie.linkType === "token" && Boolean(movie.stream1 || movie.stream2);

  // Watch Online & Episodes: ONLY in App for token-protected streams
  var episodesSectionHTML = (inApp && seriesMode)
    ? '<div class="jj-episodes-wrap"><div class="jj-episodes-head">▶ WATCH ONLINE <span class="jj-episodes-sub">🔐 Token-Protected In-App Streaming</span></div><div id="modalEpisodesContainer"><p class="jj-ep-empty">Loading episodes...</p></div></div>'
    : "";

  var bigWatchOnlineSectionHTML = (inApp && !seriesMode && hasTokenStream)
    ? '<div class="jj-watch-online-hero-wrap">' +
        '<button type="button" onclick="openMoviePlayerById(\'' + escapeHTML(movie.id) + '\')" class="btn-big-watch-online"><span>▶</span> WATCH ONLINE (INSTANT HD PLAYER)</button>' +
        '<div class="jj-watch-subtext">🔐 Temporary Token Stream • No Download Required</div>' +
      '</div>'
    : "";

  // Telegram Downloads / Prints: ONLY on Website (hidden in Normal App)
  var printsSectionHTML = !inApp
    ? '<div class="prints-header-bar"><span>Available Quality Prints</span><span class="status-dot-active">● Ready</span></div>' +
      '<div id="modalVersionContainer"><p style="color:#64748b;font-size:12px;text-align:center;padding:16px 0;">Loading prints...</p></div>'
    : "";

  modalDetails.innerHTML =
    pinBadgeHTML +
    '<div class="movie-header-flex">' +
      '<img id="modalPosterImg" class="modal-mini-poster" src="' + escapeHTML(modalPosterSrc) + '" alt="' + escapeHTML(movie.title) + '">' +
      '<div class="movie-header-info">' +
        '<h2>' + escapeHTML(movie.title) + '</h2>' +
        '<div class="movie-meta-chips">' +
          '<span>' + escapeHTML(movie.year || "N/A") + '</span>' +
          (movie.runtime ? '<span>• ' + escapeHTML(movie.runtime) + '</span>' : '') +
          (movie.category ? '<span class="genre-badge">• ' + escapeHTML(movie.category) + '</span>' : '') +
        '</div>' +
        '<p class="movie-desc-text" style="margin-top:6px;">' + escapeHTML(movie.description || "No description available.") + '</p>' +
        '<div class="modal-action-buttons-row">' +
          '<a href="' + escapeHTML(trailerLink) + '" target="_blank" rel="noopener noreferrer" class="btn-modal-trailer">▶ Watch Trailer</a>' +
        '</div>' +
      '</div>' +
    '</div>' +
    bigWatchOnlineSectionHTML +
    episodesSectionHTML +
    printsSectionHTML +
    '<div class="modal-footer-sharing">' +
      '<span>Share with friends:</span>' +
      '<a id="btnShareModalWhatsApp" href="#" class="btn-whatsapp-share" target="_blank" rel="noopener noreferrer">💚 Share to WhatsApp</a>' +
    '</div>';

  var modalImg = document.getElementById("modalPosterImg");
  if (modalImg) {
    modalImg.onerror = function () { handleMissingPoster(modalImg, movie.title); };
    if (!modalPosterSrc) handleMissingPoster(modalImg, movie.title);
  }

  var wasHidden = movieModal.hidden;
  movieModal.hidden = false;
  if (wasHidden) {
    try { history.pushState({ jjModalOpen: true }, "", window.location.href); } catch (e) {}
  }

  if (inApp && seriesMode) loadEpisodes(movie);

  var shareAnchor = document.getElementById("btnShareModalWhatsApp");
  if (shareAnchor) {
    var shareUrl = window.location.origin + window.location.pathname + "?movie=" + encodeURIComponent(movie.id);
    var customText = "🍿 *Watch " + movie.title + "* (" + (movie.year || "Movie") + ") on JJ Movies: " + shareUrl;
    shareAnchor.href = "https://api.whatsapp.com/send?text=" + encodeURIComponent(customText);
  }

  // Load prints ONLY on Website
  if (!inApp) {
    try {
      var versions = await fetchFromApi("versions", { movie_id: movieId });
      var container = document.getElementById("modalVersionContainer");
      if (!container) return;

      if (!Array.isArray(versions) || versions.length === 0) {
        container.innerHTML = '<p style="color:#64748b;font-size:12px;text-align:center;padding:12px;">No prints added yet.</p>';
        return;
      }

      container.innerHTML = '<div class="version-list-grid">' + versions.map(function (v) {
        var link = v.bot_url || v.viewing_url || "#";
        return (
          '<div class="version-tile">' +
            '<div class="version-tile-info">' +
              '<span class="version-quality-title">💾 ' + escapeHTML(v.quality || "Standard") + '</span>' +
              '<span class="version-audio-sub">Audio: ' + escapeHTML(v.audio_language || "Telugu") + '</span>' +
            '</div>' +
            '<a class="btn-tele-bot" href="' + escapeHTML(link) + '" target="_blank" rel="noopener noreferrer">⚡ Get File</a>' +
          '</div>'
        );
      }).join("") + '</div>';
    } catch (err) {
      var errContainer = document.getElementById("modalVersionContainer");
      if (errContainer) errContainer.innerHTML = '<p style="color:#ef4444;font-size:12px;text-align:center;">Failed to load prints.</p>';
    }
  }
}
window.showMovieDetails = showMovieDetails;

// ---------- Messages Ticker ----------
function loadMessages() {
  var tickerWrapper = document.getElementById("jjTickerTextWrapper");
  var tickerContainer = document.getElementById("jjAlertsTicker");
  var actionArea = document.getElementById("jjTickerActionArea");
  if (!tickerWrapper || !tickerContainer) return;

  fetchFromApi("messages")
    .then(function (data) {
      var activeMessages = Array.isArray(data) ? data : [];
      if (!activeMessages.length) { tickerContainer.style.display = "none"; return; }

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
          actionArea.innerHTML = '<a class="jj-ticker-btn" href="' + escapeHTML(safeURL(link)) + '" target="_blank" rel="noopener noreferrer">Open ➜</a>';
          actionArea.style.display = "block";
        } else {
          actionArea.innerHTML = "";
          actionArea.style.display = "none";
        }
      }

      updateButtonLink(tickerWrapper.querySelector(".jj-ticker-slide.active"));
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
    .catch(function () {});
}

function closeMovieModal() {
  if (!movieModal.hidden) {
    movieModal.hidden = true;
    if (history.state && history.state.jjModalOpen) {
      try { history.back(); } catch (e) {}
    }
  }
}

// ---------- Hide APK Download Buttons Inside Android App ----------
(function configureApkDownloadButtons() {
  if (isRunningInsideApk()) {
    var st = document.createElement("style");
    st.textContent = '.nav-download-app, .footer-app-link, a[href*="jj-movies.apk"] { display: none !important; }';
    document.head.appendChild(st);
  }
})();

// ---------- Event Listeners ----------
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

// ---------- Offline Bar & Pull-to-Refresh ----------
var OFFLINE_TEXT = "📡 No internet connection. Please turn on your internet and pull down to refresh.";

function showOfflineBar() {
  var bar = document.getElementById("jjOfflineBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "jjOfflineBar";
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom, 0px));z-index:99999;background:#ff2450;color:#fff;font-size:12px;font-weight:700;text-align:center;padding:10px 14px;border-radius:10px;";
    bar.textContent = OFFLINE_TEXT;
    document.body.appendChild(bar);
  }
  bar.style.display = "block";
}

function hideOfflineBar() {
  var bar = document.getElementById("jjOfflineBar");
  if (bar) bar.style.display = "none";
}

window.addEventListener("offline", showOfflineBar);
window.addEventListener("online", function () { hideOfflineBar(); loadMovies(); });
if (navigator.onLine === false) showOfflineBar();

(function initPullToRefresh() {
  var startY = 0, dist = 0, active = false, THRESH = 90;
  var ind = document.createElement("div");
  ind.style.cssText = "position:fixed;top:calc(8px + env(safe-area-inset-top, 0px));left:50%;transform:translate(-50%,-70px);z-index:99998;background:#162238;border:1px solid rgba(255,255,255,0.18);color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:999px;transition:transform 0.15s;pointer-events:none;";
  ind.textContent = "↓ Pull down to refresh";
  document.body.appendChild(ind);

  function blocked(t) {
    return t && t.closest && t.closest('[id*="odal"], [id*="layer"], [class*="modal"], [class*="player"]');
  }

  document.addEventListener("touchstart", function (e) {
    if ((window.scrollY || document.documentElement.scrollTop) > 0 || blocked(e.target)) { active = false; return; }
    startY = e.touches[0].clientY; dist = 0; active = true;
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!active) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0) {
      ind.style.transition = "none";
      ind.style.transform = "translate(-50%," + (Math.min(dist / 2, 70) - 70) + "px)";
      ind.textContent = dist > THRESH ? "Release to refresh" : "↓ Pull down to refresh";
    }
  }, { passive: true });

  document.addEventListener("touchend", function () {
    if (!active) return;
    active = false;
    ind.style.transition = "transform 0.15s";
    ind.style.transform = "translate(-50%,-70px)";
    if (dist > THRESH) {
      if (navigator.onLine === false) showOfflineBar();
      else {
        ind.textContent = "Refreshing...";
        ind.style.transform = "translate(-50%,0)";
        setTimeout(function () { window.location.reload(); }, 250);
      }
    }
  });
})();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  });
}
