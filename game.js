(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // --- Canvas/game config ---
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 90;
  const DURATION = 30; // seconds

  // Reward-like spawn pacing (not rain)
  const SPAWN_SLOW = 1150; // ms
  const SPAWN_FAST = 750;  // ms

  // Images + Audio files
  const BG_FILE = "bg.png";
  const SPRITE_FILE = "semina.png";
  const MUSIC_FILE = "music.mp3";

  // Sprite sizing (no distortion: preserve aspect ratio)
  const SPRITE_TARGET_H = 175; // try 150–200
  const SPRITE_Y_OFFSET = 12;  // + down, - up

  // Subtle animation (no distortion: position-only movement)
  const BOB_AMPLITUDE = 3.5; // px
  const BOB_SPEED = 2.1;
  const SWAY_AMPLITUDE = 2.0; // px
  const SWAY_SPEED = 1.2;

  // Messages
  const CATCH_MESSAGES = [
    "I love your smile 💖",
    "You make my days lighter ☀️",
    "I’m proud of you 🫶",
    "My favourite person 😌",
    "You’re my peace 🕊️",
    "You + me = perfect 💘",
    "Thank you for choosing me 🥺",
    "I’m lucky to have you 🍀",
    "My heart is yours ❤️"
  ];

  const MISS_MESSAGE = "No matter what you do, I’ll always love you — even if you fall 💖";
  const WIN_MESSAGE  = "Semina… will you be my Valentine? 💘";

  // --- State ---
  let state = "menu"; // menu | play | end
  let caught = 0;
  let missed = 0;
  let timeLeft = DURATION;
  let lastTime = 0;

  const hearts = [];
  let lastSpawn = 0;
  let msgIndex = 0;

  // toast popup
  let toast = { text: "", t: 0, kind: "catch" }; // catch | miss

  // Player
  const player = {
    x: W / 2,
    y: GROUND_Y,
    speed: 560,
    targetX: W / 2,
    prevX: W / 2
  };

  // Input
  const keys = { left:false, right:false };
  let dragging = false;

  // --- Load images ---
  const bgImage = new Image();
  let bgLoaded = false;
  bgImage.src = BG_FILE;
  bgImage.onload = () => { bgLoaded = true; };

  const playerImage = new Image();
  let playerImageLoaded = false;
  playerImage.src = SPRITE_FILE;
  playerImage.onload = () => { playerImageLoaded = true; };

  // --- Background music (starts after user interaction) ---
  const bgMusic = new Audio(MUSIC_FILE);
  bgMusic.loop = true;
  bgMusic.volume = 0.45;

  let musicStarted = false;
  function startMusic() {
    if (musicStarted) return;
    musicStarted = true;

    // Gentle fade-in
    bgMusic.volume = 0;
    bgMusic.play().catch(() => {});
    let v = 0;
    const fade = setInterval(() => {
      v += 0.03;
      bgMusic.volume = Math.min(v, 0.45);
      if (v >= 0.45) clearInterval(fade);
    }, 100);
  }

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => a + Math.random() * (b - a);
  const nowSec = () => (performance?.now?.() ?? Date.now()) / 1000;

  function roundedRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // Heart draw (big + visible)
  function drawHeart(x, y, s, fill="#ff4fa3") {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    ctx.shadowColor = fill;
    ctx.shadowBlur = 30;

    ctx.beginPath();
    ctx.moveTo(0, 0.6);
    ctx.bezierCurveTo(-1.15, -0.2, -0.62, -1.25, 0, -0.65);
    ctx.bezierCurveTo(0.62, -1.25, 1.15, -0.2, 0, 0.6);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(-0.35, -0.35, 0.22, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  const HEART_FILLS = {
    pink:   "#ff4fa3",
    gold:   "#ffd36b",
    purple: "#b46bff",
    blue:   "#55b7ff",
    mint:   "#52ffd6"
  };

  function spawnHeart() {
    const size = rand(150, 220); // bigger hearts

    const progress = 1 - (timeLeft / DURATION);
    const baseVy = 135 + progress * 95;
    const vy = rand(baseVy, baseVy + 70);

    const kinds = ["pink", "gold", "purple", "blue", "mint"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];

    hearts.push({
      x: rand(44, W - 44),
      y: -95,
      vy,
      size,
      kind,
      trail: []
    });
  }

  function showToast(text, kind="catch") {
    toast.text = text;
    toast.t = 1.9;
    toast.kind = kind;
  }

  function resetGame() {
    caught = 0;
    missed = 0;
    timeLeft = DURATION;
    hearts.length = 0;
    lastSpawn = 0;
    msgIndex = 0;
    toast = { text:"", t:0, kind:"catch" };
    player.x = W/2;
    player.prevX = W/2;
    player.targetX = W/2;
  }

  // Draw background image "cover" (no distortion)
  function drawBackgroundCover() {
    if (!bgLoaded) return;

    const imgW = bgImage.naturalWidth || bgImage.width;
    const imgH = bgImage.naturalHeight || bgImage.height;

    const canvasRatio = W / H;
    const imgRatio = imgW / imgH;

    let drawW, drawH, offsetX, offsetY;

    if (imgRatio > canvasRatio) {
      drawH = H;
      drawW = H * imgRatio;
      offsetX = (W - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = W;
      drawH = W / imgRatio;
      offsetX = 0;
      offsetY = (H - drawH) / 2;
    }

    ctx.drawImage(
      bgImage,
      Math.round(offsetX),
      Math.round(offsetY),
      Math.round(drawW),
      Math.round(drawH)
    );
  }

  // Draw sprite without distortion (no shadow)
  function drawPlayerSprite(x, y, movingStrength) {
    if (!playerImageLoaded) return;

    const t = nowSec();
    const bob = Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
    const sway = Math.sin(t * SWAY_SPEED) * SWAY_AMPLITUDE;

    // Tiny bounce when moving (position only)
    const moveBounce = Math.sin(t * 12) * (movingStrength * 1.8);

    const imgW = playerImage.naturalWidth || playerImage.width;
    const imgH = playerImage.naturalHeight || playerImage.height;

    const targetH = Math.round(SPRITE_TARGET_H);
    const targetW = Math.round(targetH * (imgW / imgH));

    const drawX = Math.round((x + sway) - targetW / 2);
    const drawY = Math.round((y + bob - moveBounce) - targetH + SPRITE_Y_OFFSET);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(playerImage, drawX, drawY, targetW, targetH);
    ctx.restore();
  }

  // UI
  function drawTopHUD() {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    roundedRect(14, 14, W-28, 54, 16);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "700 16px system-ui";
    ctx.fillText(`💘 Caught: ${caught}`, 28, 46);

    ctx.textAlign = "center";
    ctx.fillText(`💔 Missed: ${missed}`, W/2, 46);

    ctx.textAlign = "right";
    ctx.fillText(`⏳ ${Math.ceil(timeLeft)}s`, W-28, 46);

    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawToast() {
    if (toast.t <= 0) return;
    const alpha = clamp(toast.t / 1.9, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    const isMiss = toast.kind === "miss";
    ctx.fillStyle = isMiss ? "rgba(0,0,0,.32)" : "rgba(255,79,163,.22)";
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;

    const padX = 18;
    ctx.font = "800 15px system-ui";
    const textW = ctx.measureText(toast.text).width;
    const boxW = clamp(textW + 2*padX, 260, W-28);
    const x = (W - boxW)/2;

    roundedRect(x, 86, boxW, 58, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.textAlign = "center";

    if (toast.text.length > 42) {
      const mid = toast.text.lastIndexOf(" ", 42);
      const a = toast.text.slice(0, mid);
      const b = toast.text.slice(mid+1);
      ctx.fillText(a, W/2, 114);
      ctx.fillText(b, W/2, 136);
    } else {
      ctx.fillText(toast.text, W/2, 126);
    }

    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawMenu() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Catch the Hearts 💘", W/2, 180);

    ctx.font = "600 16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText("Catch = sweet message • Miss = I still love you", W/2, 214);

    const bx = 70, by = 270, bw = W-140, bh = 60;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;
    roundedRect(bx, by, bw, bh, 18);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 18px system-ui";
    ctx.fillText("START", W/2, by+38);

    ctx.font = "600 14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.80)";
    ctx.fillText("Drag left/right", W/2, by+92);

    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawEnd() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("You won 💖", W/2, 170);

    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillText(`Caught: ${caught}   •   Missed: ${missed}`, W/2, 208);

    ctx.font = "900 18px system-ui";
    ctx.fillStyle = "rgba(255,79,163,.98)";
    ctx.fillText(WIN_MESSAGE, W/2, 258);

    const bw = W-140, bh = 58, bx = 70;

    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;
    roundedRect(bx, 310, bw, bh, 18);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 16px system-ui";
    ctx.fillText("OPEN SURPRISE ✨", W/2, 345);

    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    roundedRect(bx, 382, bw, bh, 18);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText("PLAY AGAIN", W/2, 417);

    ctx.textAlign = "left";
    ctx.restore();
  }

  // Update
  function update(dt) {
    if (state !== "play") {
      if (toast.t > 0) toast.t -= dt;
      return;
    }

    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      state = "end";
      showToast("Surprise unlocked 💝", "catch");
      return;
    }

    const progress = 1 - (timeLeft / DURATION);
    const spawnEvery = clamp(
      SPAWN_SLOW - progress * (SPAWN_SLOW - SPAWN_FAST),
      SPAWN_FAST,
      SPAWN_SLOW
    );

    lastSpawn += dt * 1000;
    if (lastSpawn >= spawnEvery) {
      lastSpawn = 0;
      spawnHeart();
    }

    player.prevX = player.x;

    let vx = 0;
    if (keys.left) vx -= player.speed;
    if (keys.right) vx += player.speed;

    if (dragging) {
      player.x += (player.targetX - player.x) * clamp(dt * 14, 0, 1);
    } else {
      player.x += vx * dt;
    }
    player.x = clamp(player.x, 40, W-40);

    const catchY = player.y - 22;

    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];

      h.trail.unshift({ x: h.x, y: h.y });
      if (h.trail.length > 3) h.trail.pop();

      h.y += h.vy * dt;

      const dx = Math.abs(h.x - player.x);
      const dy = Math.abs(h.y - catchY);

      if (dx < 50 && dy < 32) {
        hearts.splice(i, 1);
        caught++;
        const msg = CATCH_MESSAGES[msgIndex % CATCH_MESSAGES.length];
        msgIndex++;
        showToast(msg, "catch");
        continue;
      }

      if (h.y >= GROUND_Y + 10) {
        hearts.splice(i, 1);
        missed++;
        showToast(MISS_MESSAGE, "miss");
      }
    }

    if (toast.t > 0) toast.t -= dt;
  }

  // Render
  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    drawBackgroundCover();

    // Hearts
    for (const h of hearts) {
      const fill = HEART_FILLS[h.kind] || "#ff4fa3";

      for (let t = h.trail.length - 1; t >= 0; t--) {
        const p = h.trail[t];
        const a = (t / h.trail.length) * 0.10;
        ctx.save();
        ctx.globalAlpha = a;
        drawHeart(p.x, p.y, (h.size/22) * 0.58, fill);
        ctx.restore();
      }

      drawHeart(h.x, h.y, h.size/22, fill);
    }

    const movingStrength = clamp(Math.abs(player.x - player.prevX) / 18, 0, 1);
    drawPlayerSprite(player.x, player.y, movingStrength);

    if (state === "menu") drawMenu();
    if (state === "play") drawTopHUD();
    if (state === "end") drawEnd();

    drawToast();
  }

  function loop(ts) {
    const now = ts / 1000;
    const dt = lastTime ? Math.min(0.033, now - lastTime) : 0;
    lastTime = now;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // UI hit test
  function isInside(px, py, x, y, w, h) {
    return px >= x && px <= x+w && py >= y && py <= y+h;
  }

  function handleTap(px, py) {
    // Any user interaction can start music (mobile-friendly)
    startMusic();

    if (state === "menu") {
      const bx = 70, by = 270, bw = W-140, bh = 60;
      if (isInside(px, py, bx, by, bw, bh)) {
        resetGame();
        state = "play";
      }
    } else if (state === "end") {
      const bx = 70, bw = W-140, bh = 58;
      if (isInside(px, py, bx, 310, bw, bh)) window.location.href = "surprise.html";
      if (isInside(px, py, bx, 382, bw, bh)) { resetGame(); state = "play"; }
    }
  }

  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // Pointer controls
  canvas.addEventListener("pointerdown", (e) => {
    startMusic();

    const p = toCanvasCoords(e);
    handleTap(p.x, p.y);

    if (state === "play") {
      dragging = true;
      player.targetX = p.x;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || state !== "play") return;
    const p = toCanvasCoords(e);
    player.targetX = p.x;
  });

  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    startMusic();

    if (e.key === "ArrowLeft") keys.left = true;
    if (e.key === "ArrowRight") keys.right = true;
    if (e.key === "Enter" && state === "menu") { resetGame(); state="play"; }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });

  // Start loop
  requestAnimationFrame(loop);
})();
