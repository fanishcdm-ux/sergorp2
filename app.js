// Basic in-memory store: [{ id, blobUrl, ts, sentiment, energy }]
const clips = [];

let mediaRecorder = null;
let chunks = [];
let isRecording = false;
let recordStart = null;

const recordBtn = document.getElementById("recordBtn");
const recordInfo = document.getElementById("recordInfo");
const player = document.getElementById("player");

const todayCanvas = document.getElementById("todayCanvas");
const weekCanvas = document.getElementById("weekCanvas");

let todayCtx, weekCtx;
let todayParticles = [];
let weekRings = [];

const tooltip = document.getElementById("tooltip");

const modeToday = document.getElementById("modeToday");
const modeWeek = document.getElementById("modeWeek");

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  [todayCanvas, weekCanvas].forEach((canvas) => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  todayCtx = todayCanvas.getContext("2d");
  weekCtx = weekCanvas.getContext("2d");
}

window.addEventListener("resize", () => {
  resizeCanvases();
  rebuildVisuals();
});

resizeCanvases();

// Sentiment palette
const palette = {
  calm: "#7a9d6d",
  energetic: "#d4a574",
  tense: "#8b6f47",
  neutral: "#9b9b9b",
};

function randomSentiment() {
  const keys = Object.keys(palette);
  return keys[Math.floor(Math.random() * keys.length)];
}

function sentimentToEnergy(sentiment) {
  switch (sentiment) {
    case "calm":
      return 0.35;
    case "energetic":
      return 0.85;
    case "tense":
      return 0.7;
    default:
      return 0.5;
  }
}

async function initMedia() {
  if (mediaRecorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      chunks = [];

      const ts = Date.now();
      const sentiment = randomSentiment();
      const energy = sentimentToEnergy(sentiment);

      const clip = {
        id: ts + "-" + Math.random().toString(16).slice(2),
        blobUrl: url,
        ts,
        sentiment,
        energy,
      };
      clips.push(clip);
      rebuildVisuals();
    };
  } catch (err) {
    console.error("Mic error", err);
    recordInfo.textContent = "Mic blocked. Check permissions.";
  }
}

recordBtn.addEventListener("click", async () => {
  await initMedia();
  if (!mediaRecorder) return;

  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

function startRecording() {
  isRecording = true;
  recordStart = Date.now();
  mediaRecorder.start();
  recordBtn.classList.add("recording");
  recordInfo.textContent = "Recording…";
  tickRecording();
}

function stopRecording() {
  isRecording = false;
  mediaRecorder.stop();
  recordBtn.classList.remove("recording");
  recordInfo.textContent = "Saved.";
}

function tickRecording() {
  if (!isRecording) return;
  const elapsed = (Date.now() - recordStart) / 1000;
  const clamped = Math.min(20, Math.max(5, elapsed));
  recordInfo.textContent = formatSeconds(clamped);

  if (elapsed >= 20) {
    stopRecording();
    return;
  }
  requestAnimationFrame(tickRecording);
}

function formatSeconds(secs) {
  return `${secs.toFixed(1)}s`;
}

// Build visuals
function rebuildVisuals() {
  buildTodayParticles();
  buildWeekRings();
}

function isToday(ts) {
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function buildTodayParticles() {
  todayParticles = [];
  const rect = todayCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const todaysClips = clips.filter((c) => isToday(c.ts));

  todaysClips.forEach((clip) => {
    const hours = new Date(clip.ts).getHours() + 1;
    const x = (hours / 24) * width;
    const centerY = height * 0.5;
    const energy = clip.energy;
    const spread = height * 0.35 * energy;

    const y = centerY + (Math.random() - 0.5) * spread;
    const radius = 4 + 8 * energy;

    todayParticles.push({
      clip,
      x,
      y,
      radius,
      baseRadius: radius,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  });
}

function buildWeekRings() {
  weekRings = [];
  const rect = weekCanvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const baseRadius = Math.min(rect.width, rect.height) * 0.2;

  const dayClips = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayClips[key] = [];
  }

  clips.forEach((clip) => {
    const key = new Date(clip.ts).toISOString().slice(0, 10);
    if (dayClips[key]) {
      dayClips[key].push(clip);
    }
  });

  const sentiments = ["calm", "energetic", "tense", "neutral"];

  sentiments.forEach((sentiment, idx) => {
    const ringRadius = baseRadius + idx * 22;
    const segments = [];

    const keys = Object.keys(dayClips).sort(); // oldest to newest

    keys.forEach((key, dIndex) => {
      const clipsForDay = dayClips[key].filter(
        (c) => c.sentiment === sentiment
      );
      const count = clipsForDay.length;
      if (!count) return;

      const angleStep = (2 * Math.PI) / keys.length;
      const angleStart = dIndex * angleStep;
      const intensity = Math.min(1, count / 4);
      segments.push({
        start: angleStart,
        end: angleStart + angleStep * 0.9,
        intensity,
        count,
        dayKey: key,
        sentiment,
        cx,
        cy,
        radius: ringRadius,
      });
    });

    if (segments.length) {
      weekRings.push({
        sentiment,
        radius: ringRadius,
        segments,
      });
    }
  });
}

// Animation loop
function animate() {
  renderToday();
  renderWeek();
  requestAnimationFrame(animate);
}

function renderToday() {
  if (!todayCtx) return;
  const rect = todayCanvas.getBoundingClientRect();
  todayCtx.clearRect(0, 0, rect.width, rect.height);

  const gradient = todayCtx.createRadialGradient(
    rect.width * 0.5,
    rect.height * 0.1,
    rect.width * 0.1,
    rect.width * 0.5,
    rect.height * 0.5,
    rect.width
  );
  gradient.addColorStop(0, "rgba(18,20,30,0.8)");
  gradient.addColorStop(1, "rgba(5,6,8,1)");
  todayCtx.fillStyle = gradient;
  todayCtx.fillRect(0, 0, rect.width, rect.height);

  const now = Date.now() / 1000;

  todayParticles.forEach((p) => {
    const pulse = 0.15 * Math.sin(now + p.pulsePhase);
    const r = p.baseRadius * (1 + pulse);

    const col = palette[p.clip.sentiment] || "#9b9b9b";
    const g = todayCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
    g.addColorStop(0, adjustAlpha(col, 0.9));
    g.addColorStop(0.5, adjustAlpha(col, 0.25));
    g.addColorStop(1, "rgba(0,0,0,0)");

    todayCtx.fillStyle = g;
    todayCtx.beginPath();
    todayCtx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
    todayCtx.fill();
  });
}

function renderWeek() {
  if (!weekCtx) return;
  const rect = weekCanvas.getBoundingClientRect();
  weekCtx.clearRect(0, 0, rect.width, rect.height);

  const cx = rect.width / 2;
  const cy = rect.height / 2;

  const bgGradient = weekCtx.createRadialGradient(
    cx,
    cy,
    rect.width * 0.05,
    cx,
    cy,
    rect.width * 0.5
  );
  bgGradient.addColorStop(0, "rgba(12,13,20,1)");
  bgGradient.addColorStop(1, "rgba(5,6,8,1)");
  weekCtx.fillStyle = bgGradient;
  weekCtx.fillRect(0, 0, rect.width, rect.height);

  const baseCircleRadius = Math.min(rect.width, rect.height) * 0.16;
  weekCtx.beginPath();
  weekCtx.arc(cx, cy, baseCircleRadius, 0, Math.PI * 2);
  weekCtx.strokeStyle = "rgba(255,255,255,0.06)";
  weekCtx.lineWidth = 1;
  weekCtx.stroke();

  weekRings.forEach((ring) => {
    ring.segments.forEach((seg) => {
      const color = palette[seg.sentiment] || "#9b9b9b";
      weekCtx.beginPath();
      weekCtx.arc(
        seg.cx,
        seg.cy,
        seg.radius,
        seg.start,
        seg.end,
        false
      );
      weekCtx.strokeStyle = adjustAlpha(color, 0.15 + seg.intensity * 0.7);
      weekCtx.lineWidth = 8;
      weekCtx.lineCap = "round";
      weekCtx.stroke();
    });
  });

  const sentiments = ["calm", "energetic", "tense", "neutral"];
  const labels = ["Soft", "Bright", "Dense", "Still"];
  sentiments.forEach((s, i) => {
    const r = baseCircleRadius + i * 22;
    weekCtx.beginPath();
    weekCtx.arc(cx, cy, r, -0.3, 0.3);
    weekCtx.strokeStyle = adjustAlpha(palette[s], 0.3);
    weekCtx.lineWidth = 1;
    weekCtx.stroke();
    const tx = cx + Math.cos(0.3) * r + 4;
    const ty = cy + Math.sin(0.3) * r;
    weekCtx.fillStyle = "rgba(200,200,210,0.5)";
    weekCtx.font = "10px system-ui";
    weekCtx.fillText(labels[i], tx, ty);
  });
}

function adjustAlpha(hex, alpha) {
  const c = hex.replace("#", "");
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Hover / click interaction
todayCanvas.addEventListener("mousemove", (e) => {
  handleHover(e, todayCanvas, todayParticles.map(mapParticleHover));
});

todayCanvas.addEventListener("click", (e) => {
  handleClick(e, todayCanvas, todayParticles.map(mapParticleHover));
});

weekCanvas.addEventListener("mousemove", (e) => {
  handleHover(e, weekCanvas, buildWeekHoverTargets());
});

weekCanvas.addEventListener("click", (e) => {
  handleClick(e, weekCanvas, buildWeekHoverTargets());
});

function mapParticleHover(p) {
  return {
    centerX: p.x,
    centerY: p.y,
    radius: p.radius * 2.2,
    clip: p.clip,
    label: formatTimeOfDay(p.clip.ts),
  };
}

function buildWeekHoverTargets() {
  const targets = [];
  weekRings.forEach((ring) => {
    ring.segments.forEach((seg) => {
      const midAngle = (seg.start + seg.end) / 2;
      const cx = seg.cx + Math.cos(midAngle) * seg.radius;
      const cy = seg.cy + Math.sin(midAngle) * seg.radius;
      targets.push({
        centerX: cx,
        centerY: cy,
        radius: 14,
        seg,
        label: `${seg.dayKey} · ${seg.sentiment}`,
      });
    });
  });
  return targets;
}

function handleHover(evt, canvas, targets) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  let found = null;
  for (const t of targets) {
    const dx = x - t.centerX;
    const dy = y - t.centerY;
    if (Math.sqrt(dx * dx + dy * dy) <= t.radius) {
      found = t;
      break;
    }
  }

  if (found) {
    tooltip.classList.remove("hidden");
    tooltip.textContent = found.label;
    tooltip.style.left = `${evt.clientX + 8}px`;
    tooltip.style.top = `${evt.clientY + 8}px`;
  } else {
    tooltip.classList.add("hidden");
  }
}

function handleClick(evt, canvas, targets) {
  const rect = canvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  let found = null;
  for (const t of targets) {
    const dx = x - t.centerX;
    const dy = y - t.centerY;
    if (Math.sqrt(dx * dx + dy * dy) <= t.radius) {
      found = t;
      break;
    }
  }

  if (!found) return;

  const clip = found.clip;
  if (!clip) return;
  player.src = clip.blobUrl;
  player.play();
}

function formatTimeOfDay(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  let m = d.getMinutes();
  if (m < 10) m = "0" + m;
  return `${h}:${m}`;
}

// Mode switching
modeToday.addEventListener("click", () => {
  modeToday.classList.add("active");
  modeWeek.classList.remove("active");
  todayCanvas.classList.remove("hidden");
  weekCanvas.classList.add("hidden");
});

modeWeek.addEventListener("click", () => {
  modeWeek.classList.add("active");
  modeToday.classList.remove("active");
  todayCanvas.classList.add("hidden");
  weekCanvas.classList.remove("hidden");
});

animate();
