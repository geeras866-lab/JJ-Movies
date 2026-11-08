var SUPABASE_URL = "https://tswyabgdldbsaopipvug.supabase.co";
var SUPABASE_KEY = "sb_publishable_902itkUPAUe272Q4B4jF0w_OEKDNuxr";
var TELEGRAM_BOT_USERNAME = "jj_files_bot";

var movies = [];
var messages = [];

var movieGrid = document.getElementById("movieGrid");
var searchInput = document.getElementById("searchInput");
var genreFilter = document.getElementById("genreFilter");
var yearFilter = document.getElementById("yearFilter");
var movieCount = document.getElementById("movieCount");
var emptyMessage = document.getElementById("emptyMessage");
var movieModal = document.getElementById("movieModal");
var modalDetails = document.getElementById("modalDetails");

var carouselInterval = null;

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

// Clean direct link resolver
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

  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var isWifi = false;

  if (conn) {
    if (conn.type === "wifi" && !conn.saveData) {
      isWifi = true;
    }
  }

  if (originalUrl.includes("image.tmdb.org/t/p/")) {
    return isWifi
      ? originalUrl.replace(/\/t\/p\/[^\/]+/, "/t/p/w500")
      : originalUrl.replace(/\/t\/p\/[^\/]+/, "/t/p/w185");
  }

  if (originalUrl.includes("telegram.org")) {
    var width = isWifi ? 400 : 200;
    return "https://wsrv.nl/?url=" + encodeURIComponent(originalUrl) + "&w=" + width + "&q=65&output=webp";
  }

  return originalUrl;
}

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
      
      .jj-ticker-slide.active {
        display: inline-block;
      }
      
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
      
      .jj-ticker-btn:hover {
        background: #ff2450;
        border-color: #ff2450;
        color: #ffffff;
      }
      
      .jj-pin-badge { color:#ff7293; font-size:12px; font-weight:bold; overflow-wrap:anywhere; }
      #modalVersionContainer { min-height: 80px; }

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
        padding: 4px 10px;
        border-radius: 6px;
        margin: 4px 0 6px 0;
        transition: 0.2s;
        width: fit-content;
      }

      .btn-modal-trailer:hover {
        background: #ff2450;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  var collection = document.getElementById("collection");

  if (collection && !document.getElementById("jjPinnedSection")) {
    var pinned = document.createElement("section");
    pinned.id = "jjPinnedSection";
    pinned.className = "jj-feature-section";
    pinned.innerHTML = '<h2 id="jjPinnedHeading" style="color:#94a3b8; font-size:13px; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px; font-weight:700;">📌 Featured Movies</h2><div id="jjPinnedGrid" class="movie-grid"></div>';
    collection.parentNode.insertBefore(pinned, collection);
  }

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
}

function getHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY
  };
}

// ========================================================
// NEON FESTIVAL MODE ENGINE
// ========================================================
async function initNeonFestivalMode() {
  try {
    var res = await fetch(SUPABASE_URL + "/rest/v1/site_settings?key=eq.festival_config&select=value", {
      headers: getHeaders()
    });
    var data = await res.json();
    if (!data || !data[0] || !data[0].value || data[0].value.enabled !== true) return;

    var festivalName = data[0].value.name || "HAPPY FESTIVAL";
    renderNeonBanner(festivalName);
    startNeonCrackers();
  } catch (err) {
    console.warn("Festival mode check skipped:", err);
  }
}

function renderNeonBanner(text) {
  var style = document.createElement("style");
  style.textContent = `
    .neon-fest-container {
      background: radial-gradient(circle at center, #111a2f 0%, #070b14 100%);
      border-bottom: 2px solid #00f0ff;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.45), inset 0 0 15px rgba(255, 0, 128, 0.3);
      padding: 12px 14px;
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 1001;
    }
    .neon-fest-title {
      font-size: clamp(16px, 3.2vw, 22px);
      font-weight: 900;
      letter-spacing: 2px;
      color: #fff;
      text-transform: uppercase;
      text-shadow:
        0 0 5px #fff,
        0 0 10px #ff007f,
        0 0 20px #ff007f,
        0 0 40px #ff007f;
      animation: neonPulse 2s infinite alternate;
      margin: 0;
    }
    @keyframes neonPulse {
      0% {
        text-shadow: 0 0 5px #fff, 0 0 10px #ff007f, 0 0 20px #ff007f, 0 0 35px #ff007f;
      }
      100% {
        text-shadow: 0 0 8px #fff, 0 0 15px #00f0ff, 0 0 30px #00f0ff, 0 0 50px #00f0ff;
      }
    }
    .neon-spark {
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      animation: sparkFall linear forwards;
    }
    @keyframes sparkFall {
      0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(105vh) rotate(360deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "neon-fest-container";
  banner.innerHTML = `<div class="neon-fest-title">✨ ${escapeHTML(text)} ✨</div>`;
  document.body.prepend(banner);
}

function startNeonCrackers() {
  var neonColors = ["#00f0ff", "#ff007f", "#ffe600", "#39ff14", "#bc13fe", "#ffffff"];
  setInterval(function () {
    var spark = document.createElement("div");
    spark.className = "neon-spark";
    var size = Math.random() * 6 + 4;
    spark.style.width = size + "px";
    spark.style.height = size + "px";
    var col = neonColors[Math.floor(Math.random() * neonColors.length)];
    spark.style.background = col;
    spark.style.boxShadow = "0 0 8px " + col;
    spark.style.borderRadius = "50%";
    spark.style.left = Math.random() * 100 + "vw";
    spark.style.top = "0px";
    spark.style.animationDuration = (Math.random() * 2.5 + 2) + "s";
    spark.style.opacity = Math.random() * 0.7 + 0.3;
    document.body.appendChild(spark);

    setTimeout(function () { spark.remove(); }, 4000);
  }, 220);
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
          versions: []
        };
      });

      setupYears();
      renderMovies();
      renderShowcaseCarousel();
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
    var posterSrc = getAdaptivePosterUrl(movie.poster) || movie.poster;

    return `
      <div class="banner-slide ${isCurrent}">
        <div class="banner-backdrop">
          <img src="${posterSrc}" alt="${escapeHTML(movie.title)}" class="banner-bg-img" onerror="this.src='${escapeHTML(movie.poster)}'">
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
            <button onclick="showMovieDetails('${movie.id}')" class="btn-banner-primary">⚡ View Movie Details</button>
            ${movie.trailer ? `<a href="${escapeHTML(movie.trailer)}" target="_blank" rel="noopener noreferrer" class="btn-banner-secondary">▶ Trailer</a>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  bannerContainer.innerHTML = carouselHTML;

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

  return matchesCategory && matchesYear;
}

function createMovieCard(movie) {
  var card = document.createElement("article");
  card.className = "movie-card";

  var wrapper = document.createElement("div");
  wrapper.className = "card-poster-wrapper";

  var tagBadgeLeftText = movie.category || "FILMS";
  var yearTagRightText = movie.year || "2026";

  var isPremium = getMoviePinLabel(movie);
  if (isPremium) {
    tagBadgeLeftText = isPremium;
  }

  var badgeLeft = document.createElement("div");
  badgeLeft.className = "card-badge-top-left";
  badgeLeft.textContent = tagBadgeLeftText;

  var badgeRight = document.createElement("div");
  badgeRight.className = "card-badge-top-right";
  badgeRight.textContent = yearTagRightText;

  wrapper.appendChild(badgeLeft);
  wrapper.appendChild(badgeRight);

  if (movie.poster) {
    var image = document.createElement("img");
    image.className = "poster";
    image.src = getAdaptivePosterUrl(movie.poster);
    image.alt = movie.title + " poster";
    image.loading = "lazy";
    image.decoding = "async";
    image.onerror = function () {
      var placeholder = document.createElement("div");
      placeholder.className = "poster-placeholder";
      placeholder.textContent = movie.title;
      image.replaceWith(placeholder);
    };
    wrapper.appendChild(image);
  } else {
    var placeholder = document.createElement("div");
    placeholder.className = "poster-placeholder";
    placeholder.textContent = movie.title;
    wrapper.appendChild(placeholder);
  }

  card.appendChild(wrapper);

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
  button.textContent = "⚡ Get Downloads";
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

// Spotlight Bottom Instant Live Search Logic
function handleLiveSearch() {
  var search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  var resultsSection = document.getElementById("searchResultsSection");
  var searchGrid = document.getElementById("searchGrid");
  var mainWrapper = document.getElementById("mainContentWrapper");
  var clearBtn = document.getElementById("clearSearchBtn");
  var countEl = document.getElementById("searchResultCount");
  var titleEl = document.getElementById("searchResultsTitle");

  if (!resultsSection || !searchGrid || !mainWrapper) {
    renderMovies();
    return;
  }

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
  if (titleEl) titleEl.textContent = 'Results for "' + escapeHTML(search) + '"';

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

  modalDetails.innerHTML = `
    ${pinBadgeHTML}

    <div class="movie-header-flex">
      <img class="modal-mini-poster" src="${getAdaptivePosterUrl(movie.poster)}" alt="${escapeHTML(movie.title)}" onerror="this.style.display='none'">
      <div class="movie-header-info">
        <h2>${escapeHTML(movie.title)}</h2>
        <div class="movie-meta-chips">
          <span>${escapeHTML(movie.year || "N/A")}</span>
          ${movie.runtime ? `<span>• ${escapeHTML(movie.runtime)}</span>` : ""}
          ${movie.category ? `<span class="genre-badge">• ${escapeHTML(movie.category)}</span>` : ""}
        </div>
        <a href="${escapeHTML(trailerLink)}" target="_blank" rel="noopener noreferrer" class="btn-modal-trailer">
          ▶ Watch Trailer
        </a>
        <p class="movie-desc-text" style="margin-top:6px;">${escapeHTML(movie.description || "No description available.")}</p>
      </div>
    </div>

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

  movieModal.hidden = false;

  var shareAnchor = document.getElementById("btnShareModalWhatsApp");
  if (shareAnchor) {
    var shareUrl = window.location.origin + window.location.pathname + "?movie=" + encodeURIComponent(movie.id);
    var customText = "🍿 *Watch " + movie.title + "* (" + (movie.year || "Movie") + ") on JJ Movies! Check downloads: " + shareUrl;
    shareAnchor.href = "https://api.whatsapp.com/send?text=" + encodeURIComponent(customText);
  }

  try {
    var res = await fetch(
      SUPABASE_URL + "/rest/v1/movie_versions?select=id,quality,audio_language,source_type,viewing_url&movie_id=eq." + movieId + "&order=sort_order.asc",
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
    var container = document.getElementById("modalVersionContainer");
    if (container) container.innerHTML = `<p style="color:#ef4444; font-size:12px; text-align:center;">Failed to load prints.</p>`;
  }
}

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
      var activeMessages = data || [];
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
          actionArea.innerHTML = `<a class="jj-ticker-btn" href="${safeURL(link)}" target="_blank" rel="noopener noreferrer">Open ➜</a>`;
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
    });
}

function closeMovieModal() {
  movieModal.hidden = true;
}

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
  if (event.key === "Escape") closeMovieModal();
});

createExtraSections();
loadMovies();
initNeonFestivalMode();
