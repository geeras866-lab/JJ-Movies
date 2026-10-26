
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

/* Extra sections and styles */
function createExtraSections() {
  if (!document.getElementById("jjExtraStyles")) {
    var style = document.createElement("style");
    style.id = "jjExtraStyles";
    style.textContent = `
      .jj-feature-section {
        max-width:1200px;
        margin:28px auto;
        padding:0 20px;
      }
      .jj-feature-section h2 {
        color:#f4f5fa;
        margin-bottom:18px;
      }
      .jj-pinned-label {
        color:#ff3867;
        font-size:13px;
        font-weight:bold;
        margin-bottom:8px;
      }
      .jj-update-card {
        background:#111827;
        border:1px solid #293044;
        border-radius:12px;
        padding:17px;
        margin:12px 0;
        overflow-wrap:anywhere;
      }
      .jj-update-card h3 {
        margin:0 0 8px;
        color:#ff7293;
      }
      .jj-update-card p {
        color:#c5ccdc;
        line-height:1.6;
      }
      .jj-trailer-button {
        display:inline-block;
        padding:10px 14px;
        background:#ff3867;
        color:white;
        text-decoration:none;
        border-radius:7px;
        margin:8px 0;
        font-weight:bold;
      }
      .jj-pin-badge {
        color:#ff7293;
        font-size:12px;
        font-weight:bold;
        overflow-wrap:anywhere;
      }
      .jj-feature-section .movie-grid {
        margin-bottom:20px;
      }
    `;
    document.head.appendChild(style);
  }

  var collection = document.getElementById("collection");
  var about = document.getElementById("about");

  if (collection && !document.getElementById("jjPinnedSection")) {
    var pinned = document.createElement("section");
    pinned.id = "jjPinnedSection";
    pinned.className = "jj-feature-section";
    pinned.innerHTML =
      '<h2 id="jjPinnedHeading">📌 Movies</h2>' +
      '<div id="jjPinnedGrid" class="movie-grid"></div>';

    collection.parentNode.insertBefore(pinned, collection);
  }

  if (about && !document.getElementById("jjUpdatesSection")) {
    var updates = document.createElement("section");
    updates.id = "jjUpdatesSection";
    updates.className = "jj-feature-section";
    updates.innerHTML =
      '<h2>📝 JJ Movies — Latest Updates</h2>' +
      '<div id="jjUpdatesList"><p class="muted">Loading updates...</p></div>';

    about.parentNode.insertBefore(updates, about);
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
    SUPABASE_URL +
      "/rest/v1/movies?select=*&is_published=eq.true&order=created_at.desc",
    { headers: getHeaders() }
  )
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Movies request failed: " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      movies = data.map(function (item) {
        return {
          id: item.id,
          title: item.title || "Untitled",
          year: item.release_year || "",
          genre: item.genre || "Other",
          poster: item.poster_url || "",
          description: item.description || "",
          pinned: item.is_pinned === true,
          pinLabel: String(item.pin_label || "").trim(),
          trailer: safeURL(item.trailer_url || ""),
          versions: []
        };
      });

      setupYears();

      if (!movies.length) {
        renderMovies();
        movieCount.textContent = "0 movies";
        loadMessages();
        return;
      }

      var ids = movies.map(function (movie) {
        return movie.id;
      });

      return fetch(
        SUPABASE_URL +
          "/rest/v1/movie_versions?select=id,movie_id,quality,audio_language,source_type,viewing_url&movie_id=in.(" +
          encodeURIComponent(ids.join(",")) + ")",
        { headers: getHeaders() }
      )
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Movie versions request failed: " + response.status);
          }
          return response.json();
        })
        .then(function (versions) {
          movies.forEach(function (movie) {
            movie.versions = versions
              .filter(function (version) {
                return String(version.movie_id) === String(movie.id);
              })
              .map(function (version) {
                return {
                  id: version.id,
                  quality: version.quality || "Standard",
                  audio: version.audio_language || "Not specified",
                  source: version.source_type || "Telegram",
                  viewingUrl: version.viewing_url || ""
                };
              });
          });

          renderMovies();
          loadMessages();
        });
    })
    .catch(function (error) {
      console.error("JJ Movies error:", error);
      movieCount.textContent = "Unable to load movies";
      emptyMessage.hidden = false;
      emptyMessage.textContent =
        "Movies load avvaledu. Internet, Supabase API key and database policies check cheyyi.";
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

  years.sort(function (a, b) {
    return Number(b) - Number(a);
  });

  years.forEach(function (year) {
    var option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
}

function matchesFilters(movie) {
  var search = searchInput.value.toLowerCase().trim();
  var genre = genreFilter.value;
  var year = yearFilter.value;

  return (
    movie.title.toLowerCase().indexOf(search) !== -1 &&
    (genre === "all" || movie.genre === genre) &&
    (year === "all" || String(movie.year) === year)
  );
}

function createMovieCard(movie) {
  var card = document.createElement("article");
  card.className = "movie-card";

  if (movie.poster) {
    var image = document.createElement("img");
    image.className = "poster";
    image.src = movie.poster;
    image.alt = movie.title + " poster";
    image.loading = "lazy";

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

  var meta = document.createElement("div");
  meta.className = "movie-meta";
  meta.textContent = (movie.year || "Year unknown") + " • " + movie.genre;

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

    var pinnedMovies = filtered.filter(function (movie) {
      return movie.pinned;
    });

    pinnedMovies.forEach(function (movie) {
      pinnedGrid.appendChild(createMovieCard(movie));
    });

    if (!pinnedMovies.length) {
      var note = document.createElement("p");
      note.className = "muted";
      note.textContent = movies.some(function (movie) {
        return movie.pinned;
      })
        ? "No pinned movies match your current filters."
        : "No featured movies right now.";
      pinnedGrid.appendChild(note);
    }
  }

  movieCount.textContent =
    filtered.length + (filtered.length === 1 ? " movie" : " movies");

  emptyMessage.hidden = filtered.length !== 0;

  if (!filtered.length) {
    emptyMessage.textContent = movies.length
      ? "No movies match your search."
      : "No published movies yet.";
  }
}

function showMovieDetails(movieId) {
  var movie = movies.find(function (item) {
    return String(item.id) === String(movieId);
  });

  if (!movie) return;

  var trailerHTML = movie.trailer
    ? '<p><a class="jj-trailer-button" href="' +
      escapeHTML(movie.trailer) +
      '" target="_blank" rel="noopener noreferrer">▶ Watch Trailer</a></p>'
    : "";

  var versionHTML = movie.versions.map(function (version) {
    var botURL =
      "https://t.me/" +
      TELEGRAM_BOT_USERNAME +
      "?start=" +
      encodeURIComponent(String(version.id));

    var sourceHTML = "";
    var telegramURL = safeURL(version.viewingUrl);

    if (telegramURL) {
      try {
        var parsedUrl = new URL(telegramURL);
        if (
          parsedUrl.hostname === "t.me" ||
          parsedUrl.hostname === "telegram.me"
        ) {
          sourceHTML =
            '<p class="version-source">Source: ' +
            escapeHTML(version.source) +
            "</p>";
        }
      } catch (e) {}
    }

    return (
      '<div class="version-item">' +
      "<strong>" + escapeHTML(version.quality) + "</strong>" +
      "<p>Audio: " + escapeHTML(version.audio) + "</p>" +
      sourceHTML +
      '<p><a class="details-button telegram-download-button" href="' +
      escapeHTML(botURL) +
      '" target="_blank" rel="noopener noreferrer">Get with Telegram Bot</a></p>' +
      "</div>"
    );
  }).join("");

  /* Custom label only: no hard-coded "Featured Movie" badge */
  var pinLabel = getMoviePinLabel(movie);
  var pinBadgeHTML = pinLabel
    ? '<p class="jj-pin-badge">' + escapeHTML(pinLabel) + "</p>"
    : "";

  modalDetails.innerHTML =
    pinBadgeHTML +
    "<h2>" +
    escapeHTML(movie.title) +
    (movie.year ? " (" + escapeHTML(movie.year) + ")" : "") +
    "</h2>" +
    "<p><strong>Genre:</strong> " +
    escapeHTML(movie.genre) +
    "</p>" +
    "<p>" +
    escapeHTML(movie.description) +
    "</p>" +
    trailerHTML +
    "<h3>Available Versions</h3>" +
    (versionHTML
      ? '<div class="version-list">' + versionHTML + "</div>"
      : "<p>No versions added yet.</p>");

  movieModal.hidden = false;
}

function loadMessages() {
  var updatesList = document.getElementById("jjUpdatesList");
  if (!updatesList) return;

  fetch(
    SUPABASE_URL +
      "/rest/v1/jj_messages?select=id,title,message,link_url,created_at&is_published=eq.true&order=created_at.desc",
    { headers: getHeaders() }
  )
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Updates request failed: " + response.status);
      }
      return response.json();
    })
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

        var heading = document.createElement("h3");
        heading.textContent = item.title || "JJ Movies Update";

        var paragraph = document.createElement("p");
        paragraph.textContent = item.message || "";

        card.appendChild(heading);
        card.appendChild(paragraph);

        var linkURL = safeURL(item.link_url || "");
        if (linkURL) {
          var link = document.createElement("a");
          link.className = "jj-trailer-button";
          link.href = linkURL;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open Link";
          card.appendChild(link);
        }

        updatesList.appendChild(card);
      });
    })
    .catch(function (error) {
      console.error("JJ Movies updates:", error);
      updatesList.textContent =
        "Updates load avvaledu. Supabase jj_messages table and public read policy check cheyyi.";
    });
}

function closeMovieModal() {
  movieModal.hidden = true;
}

searchInput.addEventListener("input", renderMovies);
genreFilter.addEventListener("change", renderMovies);
yearFilter.addEventListener("change", renderMovies);

document.getElementById("closeModal").addEventListener(
  "click",
  closeMovieModal
);

movieModal.addEventListener("click", function (event) {
  if (event.target === movieModal) {
    closeMovieModal();
  }
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeMovieModal();
  }
});

createExtraSections();
loadMovies();
