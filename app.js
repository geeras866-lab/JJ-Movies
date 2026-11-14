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
  if (conn && conn.type === "wifi" && !conn.saveData) {
    isWifi = true;
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

// 🔥 Live IMDb Fallback for missing posters
function handleMissingPoster(imgElement, movieTitle) {
  if (imgElement.dataset.fallbackTried) return;
  imgElement.dataset.fallbackTried = "true";

  var cleanTitle = movieTitle.replace(/Season \d+/, "").trim().toLowerCase();
  
  fetch("https://v3.sg.media-imdb.com/suggestion/x/" + encodeURIComponent(cleanTitle) + ".json", {
    headers: { "User-Agent": "Mozilla/5.0" }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    var hits = data && data.d ? data.d : [];
    var matched = hits.find(function(item) {
      return item.id && item.id.indexOf("tt") === 0 && item.i && item.i.imageUrl;
    });
    if (matched && matched.i && matched.i.imageUrl) {
      var highResUrl = matched.i.imageUrl.replace(/\._V1_.*\.jpg$/i, "._V1_UX700_.jpg");
      imgElement.src = highResUrl;
    }
  })
  .catch(function(err) {
    console.error("Dynamic IMDb poster load failed:", err);
  });
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
      .btn-modal-trailer:hover { background: #ff2450; color: #ffffff; }
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
// 🌟 EXACT 12 AM TIME-TRIGGERED FESTIVAL ENGINE 🌟
// ========================================================

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
      if (data[0].value.enabled === false) {
        return;
      }

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
    borderCol = "#ffb703"; shadowCol = "#fb8500";
    leftIcon = "🪔"; rightIcon = "🪔";
  } else if (type === "sankranti") {
    borderCol = "#06d6a0"; shadowCol = "#ffd166";
    leftIcon = "🪁"; rightIcon = "🪁";
  } else if (type === "christmas") {
    borderCol = "#ff3838"; shadowCol = "#2ed573";
    leftIcon = "🎅"; rightIcon = "🦌";
  } else if (type === "holi") {
    borderCol = "#ff007f"; shadowCol = "#00e5ff";
    leftIcon = "🎨"; rightIcon = "🎨";
  } else if (type === "tricolor") {
    borderCol = "#ff9933"; shadowCol = "#138808";
    leftIcon = "🇮🇳"; rightIcon = "🇮🇳";
  } else if (type === "newyear") {
    borderCol = "#00f0ff"; shadowCol = "#7209b7";
    leftIcon = "🎆"; rightIcon = "🎆";
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
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
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
          <img src="${posterSrc}" alt="${escapeHTML(movie.title)}" class="banner-bg-img" onerror="handleMissingPoster(this, '${escapeHTML(movie.title)}')">
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

  // 🔥 Smart URL Validation Check: Filters out bad text captions or file names stored in poster_url
  var hasValidPoster = movie.poster && 
                       (movie.poster.startsWith("http://") || movie.poster.startsWith("https://")) && 
                       !movie.poster.toLowerCase().includes("poster") &&
                       !movie.poster.toLowerCase().includes("world premiere");

  if (hasValidPoster) {
    image.src = getAdaptivePosterUrl(movie.poster);
  } else {
    image.src = ""; // Invalid/text link unte empty ga petti direct ga fallback trigger chestham
  }

  image.onerror = function () {
    if (typeof handleMissingPoster === "function") {
      handleMissingPoster(image, movie.title);
    }
  };

  wrapper.appendChild(image);
  card.appendChild(wrapper);

  // If poster URL is invalid or contains text, trigger IMDb fallback immediately
  if (!hasValidPoster && typeof handleMissingPoster === "function") {
    handleMissingPoster(image, movie.title);
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
      <img class="modal-mini-poster" src="${getAdaptivePosterUrl(movie.poster)}" alt="${escapeHTML(movie.title)}" onerror="handleMissingPoster(this, '${escapeHTML(movie.title)}')">
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
