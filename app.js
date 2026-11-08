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
// 🌟 CUSTOM FESTIVAL ARTWORK & ANIMATION ENGINE 🌟
// ========================================================

function getSmartCalendarFestival() {
  var now = new Date();
  var m = now.getMonth() + 1;
  var d = now.getDate();
  var y = now.getFullYear();

  if ((m === 12 && d >= 31) || (m === 1 && d <= 2)) return { name: "HAPPY NEW YEAR " + ((m === 12) ? y + 1 : y), type: "newyear" };
  if (m === 1 && d >= 13 && d <= 17) return { name: "HAPPY SANKRANTI", type: "sankranti" };
  if (m === 1 && d >= 25 && d <= 27) return { name: "HAPPY REPUBLIC DAY", type: "tricolor" };
  if ((m === 2 && d >= 24) || (m === 3 && d <= 3)) return { name: "HAPPY MAHA SHIVARATRI", type: "diwali" };
  if (m === 3 && d >= 20 && d <= 26) return { name: "HAPPY HOLI", type: "holi" };
  if ((m === 3 && d >= 28) || (m === 4 && d <= 2)) return { name: "HAPPY UGADI", type: "sankranti" };
  if ((m === 3 && d >= 29) || (m === 4 && d <= 5)) return { name: "EID MUBARAK", type: "eid" };
  if (m === 4 && d >= 5 && d <= 9) return { name: "HAPPY SRI RAMA NAVAMI", type: "diwali" };
  if (m === 6 && d >= 14 && d <= 18) return { name: "EID-AL-ADHA MUBARAK", type: "eid" };
  if (m === 8 && d >= 14 && d <= 16) return { name: "HAPPY INDEPENDENCE DAY", type: "tricolor" };
  if (m === 8 && d >= 26 && d <= 29) return { name: "HAPPY RAKSHA BANDHAN", type: "sankranti" };
  if ((m === 8 && d >= 30) || (m === 9 && d <= 4)) return { name: "HAPPY KRISHNA JANMASHTAMI", type: "diwali" };
  if (m === 9 && d >= 10 && d <= 16) return { name: "HAPPY VINAYAKA CHAVITHI", type: "diwali" };
  if (m === 10 && d >= 15 && d <= 22) return { name: "HAPPY DUSSEHRA", type: "diwali" };
  if (m === 11 && d >= 5 && d <= 12) return { name: "HAPPY DIWALI", type: "diwali" };
  if (m === 12 && d >= 22 && d <= 27) return { name: "MERRY CHRISTMAS", type: "christmas" };

  return null;
}

async function fetchOnlineIndianFestival() {
  try {
    var now = new Date();
    var y = now.getFullYear();
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 2500);

    var res = await fetch("https://date.nager.at/api/v3/PublicHolidays/" + y + "/IN", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    var holidays = await res.json();
    
    var match = holidays.find(function (h) {
      var hDate = new Date(h.date);
      return Math.abs((now - hDate) / (1000 * 60 * 60 * 24)) <= 1.2;
    });

    if (match) {
      var name = match.localName || match.name;
      var lower = name.toLowerCase();
      var type = "general";
      if (lower.includes("diwali") || lower.includes("deepavali")) type = "diwali";
      else if (lower.includes("sankranti") || lower.includes("pongal")) type = "sankranti";
      else if (lower.includes("holi")) type = "holi";
      else if (lower.includes("eid") || lower.includes("id-ul")) type = "eid";
      else if (lower.includes("christmas")) type = "christmas";
      else if (lower.includes("republic") || lower.includes("independence")) type = "tricolor";
      else if (lower.includes("year")) type = "newyear";

      return { name: "HAPPY " + name.toUpperCase(), type: type };
    }
  } catch (e) {}
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
      // ADMIN SWITCH OFF => STOP IMMEDIATELY
      if (data[0].value.enabled === false) {
        return;
      }

      if (data[0].value.enabled === true) {
        var custName = (data[0].value.name || "").trim();
        if (custName && custName !== "HAPPY FESTIVAL") {
          var lower = custName.toLowerCase();
          var manualType = "general";
          if (lower.includes("diwali") || lower.includes("deepavali") || lower.includes("cracker")) manualType = "diwali";
          else if (lower.includes("sankranti") || lower.includes("pongal") || lower.includes("kite")) manualType = "sankranti";
          else if (lower.includes("holi") || lower.includes("color")) manualType = "holi";
          else if (lower.includes("christmas") || lower.includes("xmas") || lower.includes("santa")) manualType = "christmas";
          else if (lower.includes("eid") || lower.includes("ramzan")) manualType = "eid";
          else if (lower.includes("republic") || lower.includes("independence")) manualType = "tricolor";
          else if (lower.includes("new year") || lower.includes("202")) manualType = "newyear";

          activeFestival = { name: custName, type: manualType };
        }
      }
    }
  } catch (err) {
    console.warn("Manual check bypassed:", err);
  }

  // If enabled without custom name, check online then offline calendar
  if (!activeFestival) {
    activeFestival = await fetchOnlineIndianFestival();
  }
  if (!activeFestival) {
    activeFestival = getSmartCalendarFestival();
  }

  if (activeFestival) {
    renderAdaptiveNeonBanner(activeFestival.name, activeFestival.type);
    startAdaptiveVisualEffect(activeFestival.type);
  }
}

function renderAdaptiveNeonBanner(text, type) {
  var style = document.createElement("style");
  var borderCol = "#00f0ff";
  var shadowCol1 = "#ff007f";
  var shadowCol2 = "#00f0ff";
  var leftIcon = "✨";
  var rightIcon = "✨";

  if (type === "diwali") {
    borderCol = "#ffb703"; shadowCol1 = "#fb8500"; shadowCol2 = "#ffd166";
    leftIcon = "🪔"; rightIcon = "🪔";
  } else if (type === "sankranti") {
    borderCol = "#06d6a0"; shadowCol1 = "#ffd166"; shadowCol2 = "#118ab2";
    leftIcon = "🪁"; rightIcon = "🪁";
  } else if (type === "christmas") {
    borderCol = "#ff3838"; shadowCol1 = "#2ed573"; shadowCol2 = "#ffffff";
    leftIcon = "🎅"; rightIcon = "🦌";
  } else if (type === "holi") {
    borderCol = "#ff007f"; shadowCol1 = "#00f0ff"; shadowCol2 = "#70e000";
    leftIcon = "🎨"; rightIcon = "🎨";
  } else if (type === "eid") {
    borderCol = "#2ec4b6"; shadowCol1 = "#20bf6b"; shadowCol2 = "#ffd166";
    leftIcon = "🌙"; rightIcon = "⭐";
  } else if (type === "tricolor") {
    borderCol = "#ff9933"; shadowCol1 = "#138808"; shadowCol2 = "#ffffff";
    leftIcon = "🇮🇳"; rightIcon = "🇮🇳";
  } else if (type === "newyear") {
    borderCol = "#00f0ff"; shadowCol1 = "#7209b7"; shadowCol2 = "#4cc9f0";
    leftIcon = "🎆"; rightIcon = "🎆";
  }

  style.textContent = `
    .neon-fest-container {
      background: radial-gradient(circle at center, #101726 0%, #060911 100%);
      border-bottom: 2px solid ${borderCol};
      box-shadow: 0 0 20px ${borderCol}80, inset 0 0 14px ${shadowCol1}40;
      padding: 12px 14px;
      text-align: center;
      position: sticky;
      top: 0;
      z-index: 1001;
    }
    .neon-fest-title {
      font-size: clamp(15px, 3.2vw, 22px);
      font-weight: 900;
      letter-spacing: 2px;
      color: #ffffff;
      text-transform: uppercase;
      text-shadow: 0 0 5px #fff, 0 0 10px ${shadowCol1}, 0 0 22px ${shadowCol1}, 0 0 40px ${shadowCol2};
      animation: neonPulseFest 2s infinite alternate;
      margin: 0;
    }
    @keyframes neonPulseFest {
      0% { text-shadow: 0 0 5px #fff, 0 0 10px ${shadowCol1}, 0 0 22px ${shadowCol1}, 0 0 35px ${shadowCol2}; }
      100% { text-shadow: 0 0 8px #fff, 0 0 15px ${shadowCol2}, 0 0 30px ${shadowCol2}, 0 0 50px ${shadowCol1}; }
    }
    #festVisualCanvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);

  var banner = document.createElement("div");
  banner.className = "neon-fest-container";
  banner.innerHTML = `<div class="neon-fest-title">${leftIcon} ${escapeHTML(text)} ${rightIcon}</div>`;
  document.body.prepend(banner);
}

function startAdaptiveVisualEffect(type) {
  var canvas = document.createElement("canvas");
  canvas.id = "festVisualCanvas";
  document.body.appendChild(canvas);

  var ctx = canvas.getContext("2d");
  var width = (canvas.width = window.innerWidth);
  var height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", function () {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // ========================================================
  // 1. DIWALI (CHICHUBUDLU / FOUNTAINS + GROUND CRACKERS)
  // ========================================================
  if (type === "diwali") {
    var sparks = [];
    var fountains = [
      { x: width * 0.15, y: height - 10 },
      { x: width * 0.5, y: height - 10 },
      { x: width * 0.85, y: height - 10 }
    ];

    function FlowerPotSpark(fx, fy) {
      this.x = fx + (Math.random() - 0.5) * 20;
      this.y = fy;
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7; // Shoot upwards like flowerpot fountain
      var speed = Math.random() * 9 + 8;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.decay = Math.random() * 0.025 + 0.015;
      this.size = Math.random() * 2.8 + 1.2;
      var colors = ["#ffd700", "#ffea00", "#ff6b00", "#ffffff", "#ff0055"];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    FlowerPotSpark.prototype.update = function () {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.28; // Gravity pulls sparks down gracefully
      this.alpha -= this.decay;
      return this.alpha > 0;
    };

    FlowerPotSpark.prototype.draw = function () {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    function animDiwali() {
      ctx.clearRect(0, 0, width, height);

      // Continuously emit sparks from fountains
      fountains.forEach(function (f) {
        for (var i = 0; i < 4; i++) {
          sparks.push(new FlowerPotSpark(f.x, f.y));
        }
      });

      for (var s = sparks.length - 1; s >= 0; s--) {
        if (!sparks[s].update()) sparks.splice(s, 1);
        else sparks[s].draw();
      }
      requestAnimationFrame(animDiwali);
    }
    animDiwali();
  }

  // ========================================================
  // 2. CHRISTMAS (SANTA SLEIGH WITH REINDEER + RICH SNOW SPARKS)
  // ========================================================
  else if (type === "christmas") {
    var snowflakes = [];
    var santaX = -200;
    var santaY = height * 0.25;
    var santaSpeed = 2.4;

    // Rich snowfall & crystal falling effect
    for (var i = 0; i < 90; i++) {
      snowflakes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 3 + 1,
        sy: Math.random() * 2 + 0.8,
        sw: Math.random() * 0.03,
        opacity: Math.random() * 0.8 + 0.2
      });
    }

    function animChristmas() {
      ctx.clearRect(0, 0, width, height);

      // Flying Santa Sleigh
      santaX += santaSpeed;
      santaY = (height * 0.2) + Math.sin(santaX * 0.015) * 30; // Smooth wave flying
      if (santaX > width + 250) {
        santaX = -260;
      }

      ctx.save();
      ctx.font = "34px sans-serif";
      ctx.fillText("🦌 🦌 🛷 🎅", santaX, santaY);

      // Magic dust dropped from the sleigh (sparkling trail)
      if (Math.random() > 0.3) {
        snowflakes.push({
          x: santaX + 30 + (Math.random() * 25),
          y: santaY + 15,
          r: Math.random() * 3.5 + 1.2,
          sy: Math.random() * 2 + 1.5,
          sw: 0.04,
          opacity: 0.9,
          color: "#ffd700" // Golden magic trail particles
        });
      }
      ctx.restore();

      // Fall / Draw snowflakes & magic dust
      snowflakes.forEach(function (snow) {
        snow.y += snow.sy;
        snow.x += Math.sin(snow.y * snow.sw) * 0.5;
        if (snow.y > height) {
          snow.y = -10;
          snow.x = Math.random() * width;
        }

        ctx.save();
        ctx.globalAlpha = snow.opacity;
        ctx.fillStyle = snow.color || "#ffffff";
        ctx.shadowBlur = snow.color ? 12 : 6;
        ctx.shadowColor = snow.color || "#ffffff";
        ctx.beginPath();
        ctx.arc(snow.x, snow.y, snow.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      requestAnimationFrame(animChristmas);
    }
    animChristmas();
  }

  // ========================================================
  // 3. SANKRANTI (KITES + BHOGI FIRE + FESTIVE CONFETTI)
  // ========================================================
  else if (type === "sankranti") {
    var kiteColors = ["#ff0055", "#00f0ff", "#ffd166", "#06d6a0", "#a855f7"];
    var kites = [];
    var particles = []; // Multi-color festive bhogi confetti & sparks

    function FlyingKite() {
      this.x = Math.random() * width;
      this.y = height + 40;
      this.size = Math.random() * 14 + 20;
      this.speedY = Math.random() * 1.5 + 1.2;
      this.sway = Math.random() * 0.04 + 0.02;
      this.swayCount = Math.random() * 10;
      this.color = kiteColors[Math.floor(Math.random() * kiteColors.length)];
    }

    FlyingKite.prototype.update = function () {
      this.y -= this.speedY;
      this.swayCount += this.sway;
      this.x += Math.sin(this.swayCount) * 1.5;
      return this.y > -80;
    };

    FlyingKite.prototype.draw = function () {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.swayCount) * 0.2);

      ctx.fillStyle = this.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -this.size);
      ctx.lineTo(this.size * 0.7, 0);
      ctx.lineTo(0, this.size);
      ctx.lineTo(-this.size * 0.7, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, this.size);
      ctx.quadraticCurveTo(Math.sin(this.swayCount) * 15, this.size + 20, 0, this.size + 40);
      ctx.stroke();

      ctx.restore();
    };

    // Confetti particles blown from bhogi fire
    function FestivalConfetti(bx, by) {
      this.x = bx + (Math.random() - 0.5) * 40;
      this.y = by;
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      var speed = Math.random() * 7 + 4;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.decay = Math.random() * 0.015 + 0.01;
      this.size = Math.random() * 3.5 + 1.5;
      this.color = kiteColors[Math.floor(Math.random() * kiteColors.length)];
    }

    FestivalConfetti.prototype.update = function () {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.06; // Falls back down like confetti
      this.vx += Math.sin(this.y * 0.05) * 0.08; // sway sideways
      this.alpha -= this.decay;
      return this.alpha > 0;
    };

    FestivalConfetti.prototype.draw = function () {
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

    // Continuous kites launch
    setInterval(function () {
      if (kites.length < 8) kites.push(new FlyingKite());
    }, 2200);
    kites.push(new FlyingKite());

    function animKites() {
      ctx.clearRect(0, 0, width, height);

      // Emit bhogi festive confetti at the bottom middle of screen
      if (Math.random() > 0.4) {
        particles.push(new FestivalConfetti(width * 0.5, height - 10));
        particles.push(new FestivalConfetti(width * 0.2, height - 10));
        particles.push(new FestivalConfetti(width * 0.8, height - 10));
      }

      // Kites Draw
      for (var k = kites.length - 1; k >= 0; k--) {
        if (!kites[k].update()) kites.splice(k, 1);
        else kites[k].draw();
      }

      // Confetti & Sparks Draw
      for (var p = particles.length - 1; p >= 0; p--) {
        if (!particles[p].update()) particles.splice(p, 1);
        else particles[p].draw();
      }

      requestAnimationFrame(animKites);
    }
    animKites();
  }

  // ========================================================
  // 4. HOLI (GULAL COLOR POWDER EXPLOSIONS)
  // ========================================================
  else if (type === "holi") {
    var holiColors = ["#ff007f", "#00f0ff", "#76ff03", "#ffea00", "#d500f9", "#ff6d00"];
    var holiParticles = [];

    function GulalDrop(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 7 + 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 0.95;
      this.decay = Math.random() * 0.015 + 0.01;
      this.size = Math.random() * 6 + 3;
    }

    GulalDrop.prototype.update = function () {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.05;
      this.vx *= 0.96;
      this.size *= 0.98;
      this.alpha -= this.decay;
      return this.alpha > 0;
    };

    GulalDrop.prototype.draw = function () {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    function triggerGulalBlast() {
      var bx = Math.random() * (width * 0.8) + width * 0.1;
      var by = Math.random() * (height * 0.6) + height * 0.15;
      var col = holiColors[Math.floor(Math.random() * holiColors.length)];
      for (var i = 0; i < 40; i++) {
        holiParticles.push(new GulalDrop(bx, by, col));
      }
    }

    setInterval(triggerGulalBlast, 1300);
    triggerGulalBlast();

    function animHoli() {
      ctx.clearRect(0, 0, width, height);
      for (var p = holiParticles.length - 1; p >= 0; p--) {
        if (!holiParticles[p].update()) holiParticles.splice(p, 1);
        else holiParticles[p].draw();
      }
      requestAnimationFrame(animHoli);
    }
    animHoli();
  }

  // ========================================================
  // 5. NEW YEAR / TRICOLOR / GENERAL (GRAND SKY FIREWORKS)
  // ========================================================
  else {
    var skyPalette = (type === "tricolor") 
      ? ["#ff9933", "#ffffff", "#128807", "#000080"]
      : ["#00f0ff", "#7209b7", "#4cc9f0", "#f72585", "#ffffff", "#3a0ca3"];
    var rockets = [];
    var rParticles = [];

    function SkyRocket() {
      this.x = width * (0.15 + Math.random() * 0.7);
      this.y = height;
      this.targetY = height * (0.12 + Math.random() * 0.35);
      this.color = skyPalette[Math.floor(Math.random() * skyPalette.length)];
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      var speed = Math.random() * 3 + 12;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.trail = [];
    }

    SkyRocket.prototype.update = function () {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.08;

      if (this.vy >= -1 || this.y <= this.targetY) {
        var count = Math.floor(Math.random() * 25) + 45;
        for (var i = 0; i < count; i++) {
          rParticles.push(new SkyParticle(this.x, this.y, this.color, skyPalette));
        }
        return false;
      }
      return true;
    };

    SkyRocket.prototype.draw = function () {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (var i = 0; i < this.trail.length; i++) {
        var p = this.trail[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };

    function SkyParticle(x, y, color, pal) {
      this.x = x;
      this.y = y;
      this.color = Math.random() > 0.4 ? color : pal[Math.floor(Math.random() * pal.length)];
      var angle = Math.random() * Math.PI * 2;
      var speed = Math.random() * 5 + 1.2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.decay = Math.random() * 0.015 + 0.012;
      this.size = Math.random() * 2.5 + 1.2;
    }

    SkyParticle.prototype.update = function () {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.06;
      this.vx *= 0.98;
      this.alpha -= this.decay;
      return this.alpha > 0;
    };

    SkyParticle.prototype.draw = function () {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 9;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    setInterval(function () {
      rockets.push(new SkyRocket());
    }, 1100);
    rockets.push(new SkyRocket());

    function animSky() {
      ctx.clearRect(0, 0, width, height);
      for (var r = rockets.length - 1; r >= 0; r--) {
        if (!rockets[r].update()) rockets.splice(r, 1);
        else rockets[r].draw();
      }
      for (var p = rParticles.length - 1; p >= 0; p--) {
        if (!rParticles[p].update()) rParticles.splice(p, 1);
        else rParticles[p].draw();
      }
      requestAnimationFrame(animSky);
    }
    animSky();
  }
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
  if (isPremium) tagBadgeLeftText = isPremium;

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
