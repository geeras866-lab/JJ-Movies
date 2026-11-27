// Zero external URLs, zero API keys, zero secrets, zero GitHub references
var API_BASE = "./api";
var TELEGRAM_BOT_USERNAME = "jj_files_bot";

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
function isTvAppMode() {
  var ua = navigator.userAgent || "";
  return /JJTV/i.test(ua) || /[?&]tv=1/.test(location.search);
}

function isRunningInsideApk() {
  var ua = navigator.userAgent || "";
  var isCap = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var isWv = /wv|Android.*Version\/[0-9.]+/i.test(ua);
  return isCap || isWv || isTvAppMode() || hasNativeVlcBridge() || window.location.protocol === "capacitor:" || window.location.hostname === "localhost";
}

function hasNativeVlcBridge() {
  return Boolean(window.AndroidVlc && typeof window.AndroidVlc.playVideo === "function");
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

function safeAppDownloadURL(value) {
  var val = String(value || "").trim();
  if (!val) return "";
  if (val === "./jj-movies.apk" || val === "/jj-movies.apk" || val === "jj-movies.apk") {
    return "./jj-movies.apk";
  }
  if (val === "./jj-movies-tv.apk" || val === "/jj-movies-tv.apk" || val === "jj-movies-tv.apk") {
    return "./jj-movies-tv.apk";
  }
  return safeURL(val);
}

function applyAppDownloadUrlFromSettings(data) {
  if (isTvAppMode() || !Array.isArray(data)) return;

  function bindDownloadButtons(ids, rawUrl) {
    var targetUrl = safeAppDownloadURL(rawUrl);
    if (!targetUrl) return;
    var isExternal = /^https?:\/\//i.test(targetUrl);
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.setAttribute("href", targetUrl);
      if (isExternal) {
        el.removeAttribute("download");
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        el.setAttribute("download", "");
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    });
  }

  var appCfgRow = data.find(function (r) { return r && r.key === "app_download_config"; });
  if (appCfgRow && appCfgRow.value && appCfgRow.value.url) {
    bindDownloadButtons(["navAppDownloadLink", "bannerAppDownloadLink", "footerAppDownloadLink"], appCfgRow.value.url);
  }

  var tvDlRow = data.find(function (r) { return r && r.key === "tv_app_download_config"; });
  var tvCtrlRow = data.find(function (r) { return r && r.key === "tv_app_control_config"; });
  var tvUrl = (tvDlRow && tvDlRow.value && tvDlRow.value.url) ||
    (tvCtrlRow && tvCtrlRow.value && (tvCtrlRow.value.tv_update_url || tvCtrlRow.value.update_url)) || "";
  if (tvUrl) {
    bindDownloadButtons(["navTvDownloadLink", "bannerTvDownloadLink", "footerTvDownloadLink"], tvUrl);
  }
}

// ---------- Strict App Maintenance & Version Control (Mobile APK Only) ----------
window.__JJ_APP_BLOCKED = false;

function getInstalledApkVersionCode() {
  try {
    if (window.AndroidVlc && typeof window.AndroidVlc.getAppVersionCode === "function") {
      var code = parseInt(window.AndroidVlc.getAppVersionCode(), 10);
      if (!isNaN(code) && code > 0) return code;
    }
  } catch (e) {}
  // Old APKs lo getAppVersionCode() ledu kabatti automatic ga Version 1 ga count avtayi
  return 1;
}

function showStrictAppBlockOverlay(cfg) {
  window.__JJ_APP_BLOCKED = true;
  var existing = document.getElementById("jjStrictBlockOverlay");
  if (existing) existing.remove();

  var noticeModal = document.getElementById("jjStartupNoticeModal");
  if (noticeModal) noticeModal.remove();

  var wrap = document.createElement("div");
  wrap.id = "jjStrictBlockOverlay";
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#080d18;display:flex;align-items:center;justify-content:center;padding:24px;";

  var btnHtml = cfg.actionUrl
    ? '<a class="jj-strict-update-btn" href="' + escapeHTML(cfg.actionUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;width:100%;padding:14px 18px;margin-top:18px;background:linear-gradient(135deg,#ff2450,#ff6b00);color:#fff;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;">⬇ ' + escapeHTML(cfg.actionLabel || "Update New App") + '</a>'
    : "";

  wrap.innerHTML =
    '<div style="width:100%;max-width:380px;background:#111827;border:1.5px solid rgba(255,36,80,.45);border-radius:20px;padding:26px 22px;text-align:center;color:#f8fafc;box-shadow:0 24px 60px rgba(0,0,0,.95);">' +
      '<div style="font-size:44px;margin-bottom:10px;">' + escapeHTML(cfg.icon || "🛠️") + '</div>' +
      '<div style="display:inline-block;background:#ff2450;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;padding:3px 10px;border-radius:999px;margin-bottom:12px;">JJ MOVIES</div>' +
      '<h2 style="margin:0 0 10px;font-size:21px;font-weight:900;color:#fff;">' + escapeHTML(cfg.title) + '</h2>' +
      '<p style="margin:0;font-size:14px;line-height:1.6;color:#cbd5e1;white-space:pre-line;">' + escapeHTML(cfg.message) + '</p>' +
      btnHtml +
    '</div>';

  document.body.style.overflow = "hidden";
  document.body.appendChild(wrap);
}

function applyAppControlFromSettings(data) {
  if (!isRunningInsideApk() || isTvAppMode() || !Array.isArray(data)) return;

  var ctrlRow = data.find(function (r) { return r && r.key === "app_control_config"; });
  if (!ctrlRow || !ctrlRow.value) return;
  var cfg = ctrlRow.value;

  if (cfg.maintenance === true) {
    showStrictAppBlockOverlay({
      icon: "🛠️",
      title: "App Under Maintenance",
      message: cfg.maintenance_message || "This app is currently under maintenance. Please check back soon.",
      actionUrl: "",
      actionLabel: ""
    });
    return;
  }

  var minVer = parseInt(cfg.min_version_code, 10) || 1;
  var currentVer = getInstalledApkVersionCode();
  if (currentVer < minVer) {
    var fallbackAppRow = data.find(function (r) { return r && r.key === "app_download_config"; });
    var downloadLink = safeAppDownloadURL(cfg.update_url || (fallbackAppRow && fallbackAppRow.value && fallbackAppRow.value.url) || "./jj-movies.apk");
    showStrictAppBlockOverlay({
      icon: "🚀",
      title: cfg.update_title || "Update New App",
      message: cfg.update_message || "You are using an older version of JJ Movies. Please update to the latest version to continue.",
      actionUrl: downloadLink,
      actionLabel: "Update New App"
    });
  }
}

function buildTelegramBotStartUrl(versionOrId) {
  var payload = String(versionOrId == null ? "" : versionOrId).trim();
  if (!payload) return "https://t.me/" + TELEGRAM_BOT_USERNAME;
  return "https://t.me/" + TELEGRAM_BOT_USERNAME + "?start=" + encodeURIComponent(payload);
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

// ---------- Server Proxy Helpers ----------
async function fetchFromApi(type, params) {
  var queryObj = Object.assign({ type: type }, params || {});
  var query = new URLSearchParams(queryObj).toString();
  var res = await fetch(API_BASE + "/movies?" + query, { cache: "no-store" });
  if (!res.ok) throw new Error("API request failed: " + res.status);
  return res.json();
}

async function fetchSignedUrlByFileName(fileName, meta) {
  var cleanFile = String(fileName || "").trim().replace(/^\/+/, "");
  if (!cleanFile) throw new Error("Missing file name");

  var queryParams = new URLSearchParams();
  queryParams.set("file", cleanFile);
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

// ---------- Pixeldrain + Filemoon + B2 Worker Helpers ----------
function isDirectVideoFile(url) {
  if (!url) return false;
  return /\.(mp4|mkv|webm|m3u8|avi|mov|ts|flv|m4v)(\?.*)?$/i.test(url);
}

function isPlainOrB2FileName(val) {
  var s = String(val || "").trim().replace(/^\/+/, "");
  if (!s || /^https?:\/\//i.test(s)) return false;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(s)) return false;
  return /^[a-zA-Z0-9_-]+\/.+$/.test(s) || (s.indexOf("/") === -1 && isDirectVideoFile(s));
}

function safeTokenRefValue(value) {
  var val = String(value || "").trim();
  if (!val) return "";
  if (isPlainOrB2FileName(val)) return val;
  return safeURL(val);
}

function extractWorkerFileName(rawUrl) {
  var val = String(rawUrl || "").trim();
  if (!val) return "";

  var b2FakeUrl = val.match(/^https?:\/\/(b2_[a-zA-Z0
