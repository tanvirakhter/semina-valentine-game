(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // --- Canvas/game config ---
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 90;
  const DURATION = 35; // a bit longer feels nicer

  // Spawn pacing (gets faster over time)
  const SPAWN_SLOW = 1050; // ms
  const SPAWN_FAST = 520;  // ms

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

  // Petals
  const PETAL_COUNT = 12;

  // Rare hearts/powerups
  const GOLD_CHANCE = 0.14;     // 14%
  const MAGNET_CHANCE = 0.06;   // 6% rare ⭐
  const MAGNET_SECONDS = 6.0;

  // “Addictive” scoring
  let score = 0;
  let streak = 0;           // increases multiplier
  let bestStreak = 0;
  let multiplier = 1;       // based on streak
  let magnetTime = 0;       // seconds remaining

  // Goal for basket bar
  const GOAL = 18;

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
  const MAGNET_MESSAGE = "⭐ MAGNET MODE! Catch everything 😈💘";
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

  const sparkles = [];
  const floatTexts = []; // "Nice!", "+20", etc

  // toast popup
  let toast = { text: "", t: 0, kind: "catch" }; // catch | miss

  // Player
  const player = {
    x: W / 2,
    y: GROUND_Y,
    speed: 610,  // slightly snappier
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

  // --- Background music ---
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

  // --- Tiny pop sounds (no extra files) ---
  let audioCtx = null;
  function popSound(type = "pink") {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();

      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      const t = audioCtx.currentTime;
      o.type = "sine";

      const base =
        type === "gold" ? 980 :
        type === "magnet" ? 740 :
        620;

      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.08);

      const vol =
        type === "gold" ? 0.11 :
        type === "magnet" ? 0.09 :
        0.07;

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
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

  // ✅ NEW: Phone-safe heart shape (pixel-based, no weird scaling)
  function drawHeartPx(x, y, size, fill, glow = true) {
    // size is in pixels (bigger = bigger heart)
    const top = size * 0.30;
    ctx.save();

    if (glow) {
      ctx.shadowColor = fill;
      ctx.shadowBlur = Math.max(10, size * 0.35);
    }

    ctx.beginPath();
    ctx.moveTo(x, y + top);

    // left half
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + top);
    ctx.bezierCurveTo(x - size / 2, y + (size + top) / 2, x, y + (size + top) / 2, x, y + size);

    // right half
    ctx.bezierCurveTo(x, y + (size + top) / 2, x + size / 2, y + (size + top) / 2, x + size / 2, y + top);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + top);

    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // highlight
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x - size * 0.18, y + size * 0.18, Math.max(2, size * 0.09), 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // Heart colors
  const HEART_FILLS = {
    pink:   "#ff4fa3",
    gold:   "#ffd36b",
    purple: "#b46bff",
    blue:   "#55b7ff",
    mint:   "#52ffd6"
  };

  // Petals
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

  // Sparkles for pops
  function spawnSparkles(x, y, kind) {
    const count = kind === "gold" ? 18 : (kind === "magnet" ? 22 : 10);
    for (let i = 0; i < count; i++) {
      sparkles.push({
        x, y,
        vx: rand(-140, 140),
        vy: rand(-210, -80),
        life: rand(0.35, 0.75),
        t: 0,
        r: rand(1.6, 3.4),
        kind
      });
    }
  }

  function drawSparkles() {
    for (const s of sparkles) {
      const a = 1 - (s.t / s.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle =
        s.kind === "gold" ? "rgba(255,230,160,1)" :
        s.kind === "magnet" ? "rgba(180,255,255,1)" :
        "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function addFloatText(text, x, y, color = "rgba(255,255,255,.95)") {
    floatTexts.push({ text, x, y, vy: -40, t: 0, life: 0.9, color });
  }

  function drawFloatTexts() {
    for (const f of floatTexts) {
      const a = 1 - (f.t / f.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = "900 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function calcMultiplier() {
    // every 5 streak adds +0.5 up to 3x
    const tier = Math.floor(streak / 5);
    multiplier = clamp(1 + tier * 0.5, 1, 3);
  }

  // Spawn hearts + powerups
  function spawnDrop() {
    const progress = 1 - (timeLeft / DURATION);

    // Bigger hearts on mobile feel
   const heartSize = rand(30, 44);  // ✅ bigger and clearer on phones

    // Falling speed ramps up
    const baseVy = 150 + progress * 140;
    const vy = rand(baseVy, baseVy + 90);

    // Decide drop type
    const roll = Math.random();
    let kind = "pink";
    let type = "heart"; // heart | magnet

    if (roll < MAGNET_CHANCE) {
      type = "magnet";
      kind = "magnet";
    } else if (roll < MAGNET_CHANCE + GOLD_CHANCE) {
      kind = "gold";
    } else {
      const kinds = ["pink", "purple", "blue", "mint"];
      kind = kinds[Math.floor(Math.random() * kinds.length)];
    }

    hearts.push({
      x: rand(44, W - 44),
      y: -110,
      vy,
      size: heartSize, // pixels
      kind,
      type,
      trail: []
    });
  }

  function showToast(text, kind="catch") {
    toast.text = text;
    toast.t = 1.8;
    toast.kind = kind;
  }

  function resetGame() {
    score = 0;
    streak = 0;
    bestStreak = 0;
    multiplier = 1;
    magnetTime = 0;

    caught = 0;
    missed = 0;
    timeLeft = DURATION;

    hearts.length = 0;
    sparkles.length = 0;
    floatTexts.length = 0;

    lastSpawn = 0;
    msgIndex = 0;

    toast = { text:"", t:0, kind:"catch" };
    player.x = W/2;
    player.prevX = W/2;
    player.targetX = W/2;
  }

  // Background cover
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

    // soft vignette at top for UI
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, 0, 190);
    grd.addColorStop(0, "rgba(0,0,0,0.38)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, 190);
    ctx.restore();

    // magnet mode tint (subtle)
    if (magnetTime > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(100,255,255,0.06)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // Sprite
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

  // HUD
  function drawTopHUD() {
    // top bar
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(0,0,0,.30)";
    roundedRect(14, 14, W-28, 66, 16);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.font = "800 14px system-ui";
    ctx.fillText(`Score: ${score}`, 28, 40);

    ctx.textAlign = "center";
    ctx.fillText(`🔥 Streak: ${streak}  x${multiplier.toFixed(1)}`, W/2, 40);

    ctx.textAlign = "right";
    ctx.fillText(`⏳ ${Math.ceil(timeLeft)}s`, W-28, 40);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.font = "700 12px system-ui";
    ctx.fillText(`💘 ${caught}   💔 ${missed}`, 28, 62);

    if (magnetTime > 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(180,255,255,.95)";
      ctx.fillText(`⭐ Magnet: ${magnetTime.toFixed(1)}s`, W-28, 62);
      ctx.textAlign = "left";
    }

    ctx.restore();

    // basket fill bar
    const p = clamp(caught / GOAL, 0, 1);
    const x = 14, y = 88, w = W - 28, h = 16;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(0,0,0,.22)";
    roundedRect(x, y, w, h, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,79,163,.60)";
    roundedRect(x, y, Math.max(18, w * p), h, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "800 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`Basket: ${Math.min(caught, GOAL)}/${GOAL} 💝`, W/2, y + 12);
    ctx.textAlign = "left";
    ctx.restore();
  }

  function drawToast() {
    if (toast.t <= 0) return;
    const alpha = clamp(toast.t / 1.8, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;

    const isMiss = toast.kind === "miss";
    ctx.fillStyle = isMiss ? "rgba(0,0,0,.36)" : "rgba(255,79,163,.22)";
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;

    const padX = 18;
    ctx.font = "900 15px system-ui";
    const textW = ctx.measureText(toast.text).width;
    const boxW = clamp(textW + 2*padX, 270, W-28);
    const x = (W - boxW)/2;

    roundedRect(x, 114, boxW, 56, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.97)";
    ctx.textAlign = "center";

    if (toast.text.length > 42) {
      const mid = toast.text.lastIndexOf(" ", 42);
      const a = toast.text.slice(0, mid);
      const b = toast.text.slice(mid+1);
      ctx.fillText(a, W/2, 142);
      ctx.fillText(b, W/2, 162);
    } else {
      ctx.fillText(toast.text, W/2, 154);
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

    ctx.font = "700 15px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillText("Build streaks • Get multipliers • Find ⭐ Magnet!", W/2, 214);

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
    ctx.save();
    ctx.fillStyle = "rgba(255,105,180,0.10)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("You won 💖", W/2, 170);

    ctx.font = "800 16px system-ui";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText(`Score: ${score}   •   Best Streak: ${bestStreak}`, W/2, 208);

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
    // petals
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

    // sparkles
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 560 * dt;
      if (s.t >= s.life) sparkles.splice(i, 1);
    }

    // float texts
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i];
      f.t += dt;
      f.y += f.vy * dt;
      if (f.t >= f.life) floatTexts.splice(i, 1);
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

    // magnet countdown
    if (magnetTime > 0) {
      magnetTime = Math.max(0, magnetTime - dt);
    }

    // spawn drops (faster over time)
    const progress = 1 - (timeLeft / DURATION);
    const spawnEvery = clamp(
      SPAWN_SLOW - progress * (SPAWN_SLOW - SPAWN_FAST),
      SPAWN_FAST,
      SPAWN_SLOW
    );

    lastSpawn += dt * 1000;
    if (lastSpawn >= spawnEvery) {
      lastSpawn = 0;
      spawnDrop();
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

    // update drops
    const catchY = player.y - 28;

    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];

      // trail
      h.trail.unshift({ x: h.x, y: h.y });
      if (h.trail.length > 3) h.trail.pop();

      // magnet effect
      if (magnetTime > 0 && h.type === "heart") {
        const dxToPlayer = player.x - h.x;
        const pull = clamp(Math.abs(dxToPlayer) / 180, 0.15, 1);
        h.x += dxToPlayer * pull * dt * 2.2; // pull strength
      }

      h.y += h.vy * dt;

      // collision (based on size)
      const hitX = h.size * 1.15;
      const hitY = h.size * 0.85;

      const dx = Math.abs(h.x - player.x);
      const dy = Math.abs(h.y - catchY);

      if (dx < hitX && dy < hitY) {
        hearts.splice(i, 1);

        // scoring & streak
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        calcMultiplier();

        // points
        let basePoints = 10;

        if (h.type === "magnet") {
          magnetTime = MAGNET_SECONDS;
          basePoints = 25;
          popSound("magnet");
          spawnSparkles(h.x, h.y, "magnet");
          showToast(MAGNET_MESSAGE, "catch");
          addFloatText("+25 ⭐", h.x, h.y - 8, "rgba(180,255,255,.95)");
        } else if (h.kind === "gold") {
          basePoints = 30;
          popSound("gold");
          spawnSparkles(h.x, h.y, "gold");
          showToast(GOLD_MESSAGE, "catch");
          addFloatText("+30 ✨", h.x, h.y - 8, "rgba(255,230,160,.98)");
        } else {
          popSound("pink");
          spawnSparkles(h.x, h.y, "pink");
          const msg = CATCH_MESSAGES[msgIndex % CATCH_MESSAGES.length];
          msgIndex++;
          showToast(msg, "catch");
          addFloatText(`+${Math.round(10 * multiplier)}`, h.x, h.y - 8, "rgba(255,255,255,.96)");
        }

        const gained = Math.round(basePoints * multiplier);
        score += gained;

        // counts
        caught += 1;

        // combo hype
        if (streak === 5) addFloatText("NICE! 🔥", W/2, 220, "rgba(255,79,163,.95)");
        if (streak === 10) addFloatText("PERFECT! 💘", W/2, 220, "rgba(255,79,163,.95)");
        if (streak === 15) addFloatText("UNSTOPPABLE! 😈", W/2, 220, "rgba(255,79,163,.95)");

        // micro-shake
        canvas.style.transform = "translateY(1px)";
        setTimeout(() => (canvas.style.transform = "translateY(0)"), 70);

        continue;
      }

      // miss
      if (h.y >= GROUND_Y + 18) {
        hearts.splice(i, 1);
        missed++;

        // reset streak (addictive consequence)
        if (streak >= 5) addFloatText("Streak lost 😭", W/2, 220, "rgba(255,255,255,.9)");
        streak = 0;
        calcMultiplier();

        // don’t spam miss toast every time; only sometimes
        if (missed % 2 === 1) showToast(MISS_MESSAGE, "miss");
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

    // drops
    for (const h of hearts) {
      // trail
      for (let t = h.trail.length - 1; t >= 0; t--) {
        const p = h.trail[t];
        const a = (t / h.trail.length) * 0.08;
        ctx.save();
        ctx.globalAlpha = a;
        if (h.type === "magnet") {
          // simple star-ish dot trail
          ctx.fillStyle = "rgba(180,255,255,1)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2, h.size * 0.12), 0, Math.PI * 2);
          ctx.fill();
        } else {
          const fill = HEART_FILLS[h.kind] || HEART_FILLS.pink;
          drawHeartPx(p.x, p.y, h.size * 0.55, fill, false);
        }
        ctx.restore();
      }

      // main
      if (h.type === "magnet") {
        // ⭐ magnet drop (a glowing star-like dot + ring)
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "rgba(180,255,255,1)";
        ctx.shadowColor = "rgba(180,255,255,1)";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.size * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = "rgba(180,255,255,1)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.size * 0.40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        const fill = HEART_FILLS[h.kind] || HEART_FILLS.pink;
        // ✅ bigger & clean heart
        drawHeartPx(h.x, h.y, h.size, fill, true);
      }
    }

    // sparkles
    drawSparkles();

    // player sprite
    const movingStrength = clamp(Math.abs(player.x - player.prevX) / 18, 0, 1);
    drawPlayerSprite(player.x, player.y, movingStrength);

    // UI
    if (state === "menu") drawMenu();
    if (state === "play") drawTopHUD();
    if (state === "end") drawEnd();

    drawFloatTexts();
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

  requestAnimationFrame(loop);
})();
