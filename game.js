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

  // Files
  const BG_FILE = "bg.png";
  const SPRITE_FILE = "semina.png";
  const MUSIC_FILE = "music.mp3";

  // Sprite sizing (preserve aspect ratio)
  const SPRITE_TARGET_H = 175; // try 150–200
  const SPRITE_Y_OFFSET = 12;  // + down, - up

  // Subtle animation (position only)
  const BOB_AMPLITUDE = 3.5;
  const BOB_SPEED = 2.1;
  const SWAY_AMPLITUDE = 2.0;
  const SWAY_SPEED = 1.2;

  // --- NEW: Petals config ---
  const PETAL_COUNT = 12;

  // --- NEW: Golden hearts ---
  const GOLD_CHANCE = 0.14; // 14% rare heart chance
  const GOLD_BONUS = 2;     // extra points for gold

  // --- NEW: Basket fill goal ---
  const GOAL = 14; // hearts to “fill” (purely visual)

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
  const GOLD_MESSAGE = "✨ GOLD HEART! You’re my forever 💍";
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

  // NEW: sparkles particles
  const sparkles = [];

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

    bgMusic.muted = false;
    bgMusic.volume = 0;
    bgMusic.play().catch(() => {});
    let v = 0;
    const fade = setInterval(() => {
      v += 0.03;
      bgMusic.volume = Math.min(v, 0.45);
      if (v >= 0.45) clearInterval(fade);
    }, 100);
  }

  // --- NEW: Tiny pop sound (no extra file) ---
  let audioCtx = null;
  function popSound(kind = "pink") {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();

      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";

      const t = audioCtx.currentTime;
      const base = kind === "gold" ? 880 : 660;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.08);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === "gold" ? 0.09 : 0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);

      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.11);
    } catch (_) {}
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

  // Heart draw
  function drawHeart(x, y, s, fill="#ff4fa3") {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    ctx.shadowColor = fill;
    ctx.shadowBlur = 26;

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

  // NEW: Petals (background alive)
  const petals = Array.from({ length: PETAL_COUNT }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    speed: rand(14, 28),
    sway: rand(0.7, 2.2),
    size: rand(2.2, 3.8),
    rot: rand(0, Math.PI),
    rotSpeed: rand(-1.4, 1.4)
  }));

  function drawPetals() {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,182,193,0.85)";

    for (const p of petals) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 1.65, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // NEW: Sparkles (catch pop)
  function spawnSparkles(x, y, kind) {
    const count = kind === "gold" ? 16 : 10;
    for (let i = 0; i < count; i++) {
      sparkles.push({
        x, y,
        vx: rand(-120, 120),
        vy: rand(-180, -70),
        life: rand(0.35, 0.6),
        t: 0,
        r: rand(1.6, 3.2),
        kind
      });
    }
  }

  function drawSparkles() {
    for (const s of sparkles) {
      const a = 1 - (s.t / s.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = s.kind === "gold" ? "rgba(255,230,160,1)" : "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnHeart() {
    // Bigger hearts
    const size = rand(80, 115);

    // Gentle speed ramp
    const progress = 1 - (timeLeft / DURATION);
    const baseVy = 135 + progress * 95;
    const vy = rand(baseVy, baseVy + 70);

    // NEW: rare gold hearts
    const isGold = Math.random() < GOLD_CHANCE;

    let kind;
    if (isGold) {
      kind = "gold";
    } else {
      const kinds = ["pink", "purple", "blue", "mint"];
      kind = kinds[Math.floor(Math.random() * kinds.length)];
    }

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
    sparkles.length = 0;
    lastSpawn = 0;
    msgIndex = 0;
    toast = { text:"", t:0, kind:"catch" };
    player.x = W/2;
    player.prevX = W/2;
    player.targetX = W/2;
  }

  // Background cover (no distortion)
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

    // Soft top vignette for readability
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, "rgba(0,0,0,0.35)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, 160);
    ctx.restore();
  }

  // Draw sprite (no shadow, no distortion)
  function drawPlayerSprite(x, y, movingStrength) {
    if (!playerImageLoaded) return;

    const t = nowSec();
    const bob = Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
    const sway = Math.sin(t * SWAY_SPEED) * SWAY_AMPLITUDE;
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
    // top bar
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,.28)";
    roundedRect(14, 14, W-28, 54, 16);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "700 16px system-ui";
    ctx.fillText(`💘 Caught: ${caught}`, 28, 46);

    ctx.textAlign = "center";
    ctx.fillText(`💔 Missed: ${missed}`, W/2, 46);

    ctx.textAlign = "right";
    ctx.fillText(`⏳ ${Math.ceil(timeLeft)}s`, W-28, 46);
    ctx.textAlign = "left";
    ctx.restore();

    // NEW: basket fill progress
    const progress = clamp(caught / GOAL, 0, 1);
    const x = 14, y = 78, w = W - 28, h = 16;

    ctx.save();
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = "rgba(0,0,0,.22)";
    roundedRect(x, y, w, h, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,79,163,.55)";
    roundedRect(x, y, Math.max(18, w * progress), h, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "700 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`Basket: ${Math.min(caught, GOAL)}/${GOAL} 💝`, W/2, y + 12);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawToast() {
    if (toast.t <= 0) return;
    const alpha = clamp(toast.t / 1.9, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    const isMiss = toast.kind === "miss";
    ctx.fillStyle = isMiss ? "rgba(0,0,0,.34)" : "rgba(255,79,163,.22)";
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;

    const padX = 18;
    ctx.font = "800 15px system-ui";
    const textW = ctx.measureText(toast.text).width;
    const boxW = clamp(textW + 2*padX, 260, W-28);
    const x = (W - boxW)/2;

    roundedRect(x, 108, boxW, 58, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.textAlign = "center";

    if (toast.text.length > 42) {
      const mid = toast.text.lastIndexOf(" ", 42);
      const a = toast.text.slice(0, mid);
      const b = toast.text.slice(mid+1);
      ctx.fillText(a, W/2, 136);
      ctx.fillText(b, W/2, 158);
    } else {
      ctx.fillText(toast.text, W/2, 148);
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
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillText("Catch = sweet message • Gold = special surprise ✨", W/2, 214);

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
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.fillText("Drag left/right", W/2, by+92);

    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawEnd() {
    // soft romantic overlay
    ctx.save();
    ctx.fillStyle = "rgba(255,105,180,0.10)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("You won 💖", W/2, 170);

    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.90)";
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
    // petals update always (menu too)
    for (const p of petals) {
      p.y += p.speed * dt;
      p.x += Math.sin(p.y * 0.02) * p.sway;
      p.rot += p.rotSpeed * dt;

      if (p.y > H + 12) {
        p.y = -12;
        p.x = Math.random() * W;
        p.speed = rand(14, 28);
        p.sway = rand(0.7, 2.2);
        p.size = rand(2.2, 3.8);
        p.rot = rand(0, Math.PI);
        p.rotSpeed = rand(-1.4, 1.4);
      }
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
    }

    // sparkles update always
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 520 * dt; // gravity
      if (s.t >= s.life) sparkles.splice(i, 1);
    }

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

    // spawn hearts
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

    // player move
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

    // update hearts
    const catchY = player.y - 22;

    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];

      h.trail.unshift({ x: h.x, y: h.y });
      if (h.trail.length > 3) h.trail.pop();

      h.y += h.vy * dt;

      const dx = Math.abs(h.x - player.x);
      const dy = Math.abs(h.y - catchY);

      // collision tuned for big hearts
      if (dx < 65 && dy < 45) {
        hearts.splice(i, 1);

        // NEW: gold bonus
        if (h.kind === "gold") caught += (1 + GOLD_BONUS);
        else caught += 1;

        popSound(h.kind);
        spawnSparkles(h.x, h.y, h.kind);

        if (h.kind === "gold") {
          showToast(GOLD_MESSAGE, "catch");
        } else {
          const msg = CATCH_MESSAGES[msgIndex % CATCH_MESSAGES.length];
          msgIndex++;
          showToast(msg, "catch");
        }

        // tiny “satisfy” micro-shake
        canvas.style.transform = "translateY(1px)";
        setTimeout(() => (canvas.style.transform = "translateY(0)"), 70);

        continue;
      }

      // miss
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
    drawPetals();

    // hearts
    for (const h of hearts) {
      const fill = HEART_FILLS[h.kind] || "#ff4fa3";

      // trail
      for (let t = h.trail.length - 1; t >= 0; t--) {
        const p = h.trail[t];
        const a = (t / h.trail.length) * 0.10;
        ctx.save();
        ctx.globalAlpha = a;
        drawHeart(p.x, p.y, (h.size/22) * 0.55, fill);
        ctx.restore();
      }

      drawHeart(h.x, h.y, h.size/22, fill);
    }

    // sparkles (pop)
    drawSparkles();

    // player sprite
    const movingStrength = clamp(Math.abs(player.x - player.prevX) / 18, 0, 1);
    drawPlayerSprite(player.x, player.y, movingStrength);

    // UI
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

  // Keyboard (optional)
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

  requestAnimationFrame(loop);
})();
