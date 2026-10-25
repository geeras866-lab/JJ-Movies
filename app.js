
var SUPABASE_URL = "https://tswyabgdldbsaopipvug.supabase.co";
var SUPABASE_KEY = "sb_publishable_902itkUPAUe272Q4B4jF0w_OEKDNuxr";
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

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function loadMovies() {
  movieCount.textContent = "Loading movies...";

  fetch(
    SUPABASE_URL +
      "/rest/v1/movies?select=*&is_published=eq.true&order=created_at.desc",
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY
      }
    }
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
          audioLanguages: item.audio_languages || [],
          versions: []
        };
      });

      if (movies.length === 0) {
        setupYears();
        renderMovies();
        movieCount.textContent = "0 movies";
        emptyMessage.textContent = "No published movies yet.";
        return;
      }

      var ids = movies.map(function (movie) {
        return movie.id;
      });

      var idFilter = ids.join(",");

      return fetch(
        SUPABASE_URL +
          "/rest/v1/movie_versions?select=id,movie_id,quality,audio_language,source_type,viewing_url&movie_id=in.(" +
          encodeURIComponent(idFilter) +
          ")",
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
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

          setupYears();
          renderMovies();
        });
    })
    .catch(function (error) {
      console.error("JJ Movies error:", error);
      movieCount.textContent = "Unable to load movies";
      emptyMessage.hidden = false;
      emptyMessage.textContent =
        "Movies load avvaledu. Internet, Supabase API key, and database policies check chey.";
      movieGrid.innerHTML = "";
    });
}

function setupYears() {
  yearFilter.innerHTML = '<option value="all">All Years</option>';

  var years = [];

  movies.forEach(function (movie) {
    if (movie.year && years.indexOf(movie.year) === -1) {
      years.push(movie.year);
    }
  });

  years.sort(function (a, b) {
    return b - a;
  });

  years.forEach(function (year) {
    var option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
}

function renderMovies() {
  var search = searchInput.value.toLowerCase().trim();
  var genre = genreFilter.value;
  var year = yearFilter.value;

  var filtered = movies.filter(function (movie) {
    var matchesSearch =
      movie.title.toLowerCase().indexOf(search) !== -1;

    var matchesGenre =
      genre === "all" || movie.genre === genre;

    var matchesYear =
      year === "all" || String(movie.year) === year;

    return matchesSearch && matchesGenre && matchesYear;
  });

  movieGrid.innerHTML = "";

  filtered.forEach(function (movie) {
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

    var title = document.createElement("h3");
    title.textContent = movie.title;

    var meta = document.createElement("div");
    meta.className = "movie-meta";
    meta.textContent = movie.year + " • " + movie.genre;

    var button = document.createElement("button");
    button.className = "details-button";
    button.textContent = "View Details";
    button.type = "button";

    button.addEventListener("click", function () {
      showMovieDetails(movie.id);
    });

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(button);

    card.appendChild(info);
    movieGrid.appendChild(card);
  });

  movieCount.textContent =
    filtered.length + (filtered.length === 1 ? " movie" : " movies");

  emptyMessage.hidden = filtered.length !== 0;

  if (filtered.length === 0) {
    emptyMessage.textContent =
      movies.length === 0
        ? "No published movies yet."
        : "No movies match your search.";
  }
}

function showMovieDetails(movieId) {
  var movie = movies.find(function (item) {
    return String(item.id) === String(movieId);
  });

  if (!movie) return;

  var versionHTML = movie.versions.map(function (version) {
    var botURL =
      "https://t.me/" +
      TELEGRAM_BOT_USERNAME +
      "?start=" +
      encodeURIComponent(String(version.id));

    var sourceHTML = "";

    if (version.viewingUrl) {
      try {
        var parsedUrl = new URL(version.viewingUrl);

        if (
          parsedUrl.protocol === "https:" &&
          (parsedUrl.hostname === "t.me" ||
            parsedUrl.hostname === "telegram.me")
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

  modalDetails.innerHTML =
    "<h2>" + escapeHTML(movie.title) +
    (movie.year ? " (" + escapeHTML(movie.year) + ")" : "") +
    "</h2>" +
    "<p><strong>Genre:</strong> " + escapeHTML(movie.genre) + "</p>" +
    "<p>" + escapeHTML(movie.description) + "</p>" +
    "<h3>Available Versions</h3>" +
    (versionHTML
      ? '<div class="version-list">' + versionHTML + "</div>"
      : "<p>No versions added yet.</p>");

  movieModal.hidden = false;
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

loadMovies();
