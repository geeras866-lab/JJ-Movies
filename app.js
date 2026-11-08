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
