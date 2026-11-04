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
  try {
    var url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch (e) {}
  return "";
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
      .jj-feature-section { max-width:1200px; margin:28px auto; padding:0 20px; }
      .jj-feature-section h2 { color:#f4f5fa; margin-bottom:18px; }
      .jj-update-card { background:#111827; border:1px solid #ff3867; border-radius:12px; padding:17px; margin:12px 0; overflow-wrap:anywhere; box-shadow: 0 4px 15px rgba(255, 56, 103, 0.15); }
      .jj-update-card h3 { margin:0 0 8px; color:#ff7293; }
      .jj-update-card p { color:#c5ccdc; line-height:1.6; margin-bottom:12px; }
      .jj-trailer-button { display:inline-block; padding:10px 14px; background:#ff3867; color:white; text-decoration:none; border-radius:7px; margin:8px 0; font-weight:bold; }
      .jj-pin-badge { color:#ff7293; font-size:12px; font-weight:bold; overflow-wrap:anywhere; }
      #modalVersionContainer { min-height: 80px; }
    `;
    document.head.appendChild(style);
  }

  var collection = document.getElementById("collection");

  if (collection && !document.getElementById("jjPinnedSection")) {
    var pinned = document.createElement("section");
    pinned.id = "jjPinnedSection";
    pinned.className = "jj-feature-section";
    pinned.innerHTML = '<h2 id="jjPinnedHeading">📌 Movies</h2><div id="jjPinnedGrid" class="movie-grid"></div>';
    collection.parentNode.insertBefore(pinned, collection);
  }

  if (collection && !document.getElementById("jjUpdatesSection")) {
    var updates = document.createElement("section");
    updates.id = "jjUpdatesSection";
    updates.className = "jj-feature-section";
    updates.innerHTML = '<h2>📝 JJ Movies — Important Updates</h2><div id="jjUpdatesList"><p class="muted">Loading updates...</p></div>';
    collection.parentNode.insertBefore(updates, collection);
  }
}

function getHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY
  };
}

function loadMovies() {
  movieCount.textContent = "Loading movies...";

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
          trailer: safeURL(item.trailer_url || ""),
          versions: []
        };
      });

      setupYears();
      renderMovies();
      loadMessages();
    })
    .catch(function (error) {
      console.error("JJ Movies error:", error);
      movieCount.textContent = "Unable to load movies";
      emptyMessage.hidden = false;
      emptyMessage.textContent = "Movies load avvaledu.";
      movieGrid.innerHTML = "";
      loadMessages();
    });
}

function setupYears() {
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
  var search = searchInput.value.toLowerCase().trim();
  var selectedCategory = genreFilter ? genreFilter.value.toLowerCase().trim() : "all";
  var year = yearFilter.value;

  var movieCategory = String(movie.category || "").toLowerCase().trim();

  return (
    movie.title.toLowerCase().indexOf(search) !== -1 &&
    (selectedCategory === "all" || movieCategory === selectedCategory) &&
    (year === "all" || String(movie.year) === year)
  );
}

function createMovieCard(movie) {
  var card = document.createElement("article");
  card.className = "movie-card";

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
    card.appendChild(image);
  } else {
    var placeholder = document.createElement("div");
    placeholder.className = "poster-placeholder";
    placeholder.textContent = movie.title;
    card.appendChild(placeholder);
  }

  var info = document.createElement("div");
  info.className = "movie-info";

  var pinLabel = getMoviePinLabel(movie);
  if (pinLabel) {
    var badge = document.createElement("div");
    badge.className = "jj-pin-badge";
    badge.textContent = pinLabel;
    info.appendChild(badge);
  }

  var title = document.createElement("h3");
  title.textContent = movie.title;

  var metaParts = [];
  metaParts.push(movie.year || "Year unknown");
  if (movie.category) metaParts.push(movie.category);
  if (movie.runtime) metaParts.push(movie.runtime);

  var meta = document.createElement("div");
  meta.className = "movie-meta";
  meta.textContent = metaParts.join(" • ");

  var button = document.createElement("button");
  button.className = "details-button";
  button.type = "button";
  button.textContent = "View Details";
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
  var filtered = movies.filter(matchesFilters);
  var pinnedGrid = document.getElementById("jjPinnedGrid");
  var pinnedHeading = document.getElementById("jjPinnedHeading");

  movieGrid.innerHTML = "";

  filtered.forEach(function (movie) {
    movieGrid.appendChild(createMovieCard(movie));
  });

  if (pinnedHeading) {
    var pinnedMoviesWithLabel = movies.filter(function (movie) {
      return movie.pinned && getMoviePinLabel(movie) !== "";
    });
    pinnedHeading.textContent = pinnedMoviesWithLabel.length
      ? "📌 " + getMoviePinLabel(pinnedMoviesWithLabel[0])
      : "📌 Featured Movies";
  }

  if (pinnedGrid) {
    pinnedGrid.innerHTML = "";
    var pinnedMovies = filtered.filter(function (movie) { return movie.pinned; });
    pinnedMovies.forEach(function (movie) {
      pinnedGrid.appendChild(createMovieCard(movie));
    });
    if (!pinnedMovies.length) {
      var note = document.createElement("p");
      note.className = "muted";
      note.textContent = "No pinned movies match your current filters.";
      pinnedGrid.appendChild(note);
    }
  }

  movieCount.textContent = filtered.length + (filtered.length === 1 ? " movie" : " movies");
  emptyMessage.hidden = filtered.length !== 0;
}

async function showMovieDetails(movieId) {
  var movie = movies.find(function (item) { return String(item.id) === String(movieId); });
  if (!movie) return;

  var pinLabel = getMoviePinLabel(movie);
  var pinBadgeHTML = pinLabel ? '<div class="jj-pin-badge" style="margin-bottom:8px;">' + escapeHTML(pinLabel) + '</div>' : '';

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
        <p class="movie-desc-text">${escapeHTML(movie.description || "No description available.")}</p>
      </div>
    </div>

    <div class="prints-header-bar">
      <span>Available Quality Prints</span>
      <span class="status-dot-active">● Ready to Download</span>
    </div>

    <div id="modalVersionContainer">
      <p style="color:#64748b; font-size:12px; text-align:center; padding:16px 0;">Loading prints from bot...</p>
    </div>
  `;

  movieModal.hidden = false;

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
      container.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:12px;">No versions added yet.</p>`;
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
  var updatesList = document.getElementById("jjUpdatesList");
  if (!updatesList) return;

  fetch(
    SUPABASE_URL + "/rest/v1/jj_messages?select=id,title,message,link_url,created_at&is_published=eq.true&order=created_at.desc",
    { headers: getHeaders() }
  )
    .then(function (response) { return response.json(); })
    .then(function (data) {
      messages = data || [];
      updatesList.innerHTML = "";
      if (!messages.length) {
        updatesList.textContent = "No latest updates yet.";
        return;
      }
      messages.forEach(function (item) {
        var card = document.createElement("article");
        card.className = "jj-update-card";

        var linkHTML = item.link_url 
          ? '<p><a class="jj-trailer-button" href="' + safeURL(item.link_url) + '" target="_blank" rel="noopener noreferrer">🔗 Open Link</a></p>' 
          : "";

        card.innerHTML = "<h3>" + escapeHTML(item.title) + "</h3><p>" + escapeHTML(item.message) + "</p>" + linkHTML;
        updatesList.appendChild(card);
      });
    });
}

function closeMovieModal() {
  movieModal.hidden = true;
}

searchInput.addEventListener("input", renderMovies);
if (genreFilter) genreFilter.addEventListener("change", renderMovies);
yearFilter.addEventListener("change", renderMovies);

document.getElementById("closeModal").addEventListener("click", closeMovieModal);
movieModal.addEventListener("click", function (event) {
  if (event.target === movieModal) closeMovieModal();
});
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeMovieModal();
});

createExtraSections();
loadMovies();
