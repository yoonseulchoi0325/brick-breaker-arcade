"use strict";

// ===== 튜닝하기 쉬운 주요 상수 =====
const CANVAS = { width: 480, height: 640 };
const PADDLE = { baseWidth: 94, height: 14, y: 590, speed: 510 };
const BALL = { radius: 9, baseSpeed: 365, maxSpeed: 680 };
const BRICKS = { rows: 5, cols: 8, width: 49, height: 23, gap: 6, top: 105, side: 22 };
const START_LIVES = 3;
const POWERUP_CHANCE = 0.18;

// 난이도는 공의 속도에만 영향을 준다. 벽돌 내구도와 파워업 확률은 공정하게 고정한다.
const DIFFICULTIES = {
  easy: { speed: 0.82, label: "EASY" },
  normal: { speed: 1, label: "NORMAL" },
  hard: { speed: 1.20, label: "HARD" },
  insane: { speed: 1.42, label: "INSANE" }
};

// 계절과 색상별 팔레트. 공통 렌더링 코드는 이 값만 바꿔 사용한다.
const THEMES = {
  neon: { bg1: "#111d47", bg2: "#050713", accent: "#56f7ff", paddle: "#50f6ff", ball: "#fff7a8", brick: ["#ff4c97", "#a760ff", "#4f90ff", "#33e7c6", "#ffe45f"] },
  spring: { bg1: "#482450", bg2: "#120d25", accent: "#ff9dcc", paddle: "#ff91c5", ball: "#fff4c9", brick: ["#ff5d9f", "#ff8ab1", "#f5a0d0", "#b68cff", "#6fe3d1"] },
  summer: { bg1: "#004e75", bg2: "#031729", accent: "#51efff", paddle: "#3ce9ff", ball: "#fff3a6", brick: ["#fae45b", "#ffb34d", "#51d8ff", "#4ba5ff", "#58f0b7"] },
  autumn: { bg1: "#5d231c", bg2: "#1c0b16", accent: "#ffb24d", paddle: "#ff9f43", ball: "#fff1c7", brick: ["#ff5e42", "#f57c36", "#ffb03d", "#d64d58", "#a463d8"] },
  winter: { bg1: "#143e69", bg2: "#071225", accent: "#a4edff", paddle: "#7ee8ff", ball: "#ffffff", brick: ["#66d9ff", "#79a8ff", "#b2a3ff", "#85f0d6", "#e2f7ff"] },
  violet: { bg1: "#35185e", bg2: "#0d0820", accent: "#d68aff", paddle: "#c65cff", ball: "#fff1a1", brick: ["#f15bb5", "#c65cff", "#9b5de5", "#4ea8de", "#42e2b8"] },
  mono: { bg1: "#35404c", bg2: "#101319", accent: "#e3edf5", paddle: "#e4edf5", ball: "#ffffff", brick: ["#fafafa", "#d2dae3", "#b2bec9", "#8795a1", "#66737e"] }
};

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const difficultySelect = document.getElementById("difficulty");
const themeSelect = document.getElementById("theme");
const rankingPanel = document.getElementById("rankingPanel");
const resultTitle = document.getElementById("resultTitle");
const resultScore = document.getElementById("resultScore");
const scoreForm = document.getElementById("scoreForm");
const playerName = document.getElementById("playerName");
const rankingStatus = document.getElementById("rankingStatus");
const leaderboard = document.getElementById("leaderboard");

// 전역 변수 대신 게임에 필요한 모든 가변 상태를 이 객체에서 관리한다.
const game = {
  state: "start", score: 0, lives: START_LIVES, level: 1, difficulty: "normal", theme: "neon",
  paddle: null, balls: [], bricks: [], powerups: [], particles: [], keys: {}, lastTime: 0,
  audio: null, effectTimer: 0, ranking: null, scoreSaved: false
};

// Firebase 설정이 채워진 경우에만 전 세계 랭킹 기능을 비동기로 활성화한다.
Promise.resolve()
  .then(() => window.createRankingService())
  .then(service => { game.ranking = service; if (service) loadLeaderboard(); })
  .catch(error => { console.error("Firebase ranking connection failed:", error); rankingStatus.textContent = "랭킹 연결에 실패했습니다. 인터넷 연결과 Firebase 설정을 확인해 주세요."; });

function renderLeaderboard(entries) {
  leaderboard.replaceChildren();
  if (!entries.length) { const row = document.createElement("li"); row.textContent = "아직 등록된 기록이 없습니다."; leaderboard.append(row); return; }
  entries.forEach(entry => {
    const row = document.createElement("li"), name = document.createElement("span"), score = document.createElement("span"), date = document.createElement("span");
    name.textContent = String(entry.name || "익명"); score.textContent = Number(entry.score || 0).toLocaleString();
    // Firestore 서버 시간이 들어오며, 화면에서는 항상 서울 시간대로 통일해 표시한다.
    date.textContent = entry.createdAt?.toDate ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(entry.createdAt.toDate()) : "방금";
    row.append(name, score, date); leaderboard.append(row);
  });
}

async function loadLeaderboard() {
  if (!game.ranking) return;
  try { renderLeaderboard(await game.ranking.topTen()); rankingStatus.textContent = "전 세계 상위 10개 기록"; }
  catch (_) { rankingStatus.textContent = "랭킹을 불러오지 못했습니다. Firestore 규칙을 확인해 주세요."; }
}

function showResultPanel(kind) {
  resultTitle.textContent = kind === "win" ? "🎉 승리 기록 저장" : "게임 결과 저장";
  resultScore.textContent = `최종 점수: ${game.score.toLocaleString()}`;
  rankingPanel.hidden = false; playerName.focus();
  if (game.ranking) loadLeaderboard();
  else rankingStatus.textContent = "Firebase 설정 전입니다. firebase-config.js를 채우면 글로벌 랭킹이 열립니다.";
}

function hideResultPanel() { rankingPanel.hidden = true; playerName.value = ""; }

async function finishGame(kind) {
  game.state = kind; showResultPanel(kind);
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// AABB: 공은 충돌 판정 때 작은 사각형으로 변환해 벽돌/패들과 비교한다.
function aabb(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function makeBall(stuck = true) {
  return { x: game.paddle.x + game.paddle.width / 2, y: PADDLE.y - BALL.radius - 2, vx: 0, vy: 0, stuck };
}

function createBricks() {
  game.bricks = [];
  for (let row = 0; row < BRICKS.rows; row++) {
    for (let col = 0; col < BRICKS.cols; col++) {
      // 하단은 1회, 중단은 일부 2회, 상단은 일부 3회 충돌을 견딘다.
      const roll = Math.random();
      // 어느 난이도에서도 같은 벽돌 구성을 사용한다.
      const hp = row < 2 && roll < .48 ? 3 : row < 4 && roll < .43 ? 2 : 1;
      game.bricks.push({ x: BRICKS.side + col * (BRICKS.width + BRICKS.gap), y: BRICKS.top + row * (BRICKS.height + BRICKS.gap), width: BRICKS.width, height: BRICKS.height, row, hp, maxHp: hp, points: (BRICKS.rows - row) * 40 });
    }
  }
}

function resetBall() {
  game.paddle.width = PADDLE.baseWidth;
  game.paddle.x = (CANVAS.width - game.paddle.width) / 2;
  game.balls = [makeBall(true)];
  game.powerups = [];
  game.effectTimer = 0;
}

function newGame() {
  game.difficulty = difficultySelect.value;
  game.theme = themeSelect.value;
  game.score = 0; game.lives = START_LIVES; game.level = 1;
  game.paddle = { x: (CANVAS.width - PADDLE.baseWidth) / 2, y: PADDLE.y, width: PADDLE.baseWidth, height: PADDLE.height };
  game.particles = []; game.scoreSaved = false; createBricks(); resetBall(); game.state = "playing"; hideResultPanel();
}

function launch() {
  if (game.state !== "playing") return;
  const speed = BALL.baseSpeed * DIFFICULTIES[game.difficulty].speed * (1 + (game.level - 1) * 0.11);
  game.balls.forEach(ball => { if (ball.stuck) { ball.stuck = false; ball.vx = speed * (Math.random() < .5 ? -.42 : .42); ball.vy = -Math.sqrt(speed * speed - ball.vx * ball.vx); } });
}

function addParticles(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) { const angle = Math.random() * Math.PI * 2, speed = 55 + Math.random() * 130; game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 + Math.random() * .35, max: .8, color }); }
}

// 외부 음원 없이 아주 짧은 아케이드 비프음을 합성한다.
function beep(freq, duration, type = "sine") {
  try { const AudioCtx = window.AudioContext || window.webkitAudioContext; game.audio ||= new AudioCtx(); const o = game.audio.createOscillator(), g = game.audio.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(.045, game.audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, game.audio.currentTime + duration); o.connect(g).connect(game.audio.destination); o.start(); o.stop(game.audio.currentTime + duration); } catch (_) { /* 오디오를 지원하지 않아도 게임은 정상 진행 */ }
}

function spawnPowerup(brick) {
  if (Math.random() > POWERUP_CHANCE) return;
  const types = ["wide", "narrow", "multi", "slow", "life"];
  const type = types[Math.floor(Math.random() * types.length)];
  game.powerups.push({ x: brick.x + brick.width / 2 - 11, y: brick.y, width: 22, height: 22, type, vy: 125 });
}

function applyPowerup(type) {
  if (type === "wide") { game.paddle.width = Math.min(150, game.paddle.width + 30); game.effectTimer = 10; }
  if (type === "narrow") { game.paddle.width = Math.max(54, game.paddle.width - 22); game.effectTimer = 8; }
  if (type === "slow") game.balls.forEach(b => { b.vx *= .75; b.vy *= .75; });
  if (type === "life") game.lives = Math.min(5, game.lives + 1);
  if (type === "multi" && game.balls.length < 4) { const source = game.balls[0]; for (const angle of [-.52, .52]) game.balls.push({ x: source.x, y: source.y, vx: Math.cos(angle - Math.PI / 2) * BALL.baseSpeed, vy: Math.sin(angle - Math.PI / 2) * BALL.baseSpeed, stuck: false }); }
  beep(700, .09, "square");
}

function update(dt) {
  if (game.state !== "playing") return;
  const dir = (game.keys.ArrowLeft || game.keys.KeyA ? -1 : 0) + (game.keys.ArrowRight || game.keys.KeyD ? 1 : 0);
  game.paddle.x = Math.max(0, Math.min(CANVAS.width - game.paddle.width, game.paddle.x + dir * PADDLE.speed * dt));
  if (game.effectTimer > 0 && (game.effectTimer -= dt) <= 0) game.paddle.width = PADDLE.baseWidth;
  game.balls.forEach(ball => { if (ball.stuck) { ball.x = game.paddle.x + game.paddle.width / 2; ball.y = game.paddle.y - BALL.radius - 2; } else updateBall(ball, dt); });
  game.balls = game.balls.filter(ball => ball.y - BALL.radius < CANVAS.height + 20);
  if (!game.balls.length) { game.lives--; if (game.lives <= 0) { finishGame("gameover"); beep(110, .5, "sawtooth"); } else resetBall(); }
  updatePowerups(dt); updateParticles(dt);
  // 한 판의 모든 벽돌을 깨면 곧바로 승리 화면으로 전환한다.
  if (!game.bricks.length) { finishGame("win"); beep(880, .15); setTimeout(() => beep(1175, .18), 140); }
}

function updateBall(ball, dt) {
  // 이동 전 위치를 보관하면 공이 벽돌의 어느 면으로 들어왔는지 정확히 판별할 수 있다.
  const previousY = ball.y;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  if (ball.x - BALL.radius <= 0 || ball.x + BALL.radius >= CANVAS.width) { ball.x = Math.max(BALL.radius, Math.min(CANVAS.width - BALL.radius, ball.x)); ball.vx *= -1; beep(260, .03); }
  if (ball.y - BALL.radius <= 0) { ball.y = BALL.radius; ball.vy *= -1; beep(280, .03); }
  const box = { x: ball.x - BALL.radius, y: ball.y - BALL.radius, width: BALL.radius * 2, height: BALL.radius * 2 };
  if (ball.vy > 0 && aabb(box, game.paddle)) { const relative = (ball.x - (game.paddle.x + game.paddle.width / 2)) / (game.paddle.width / 2); const speed = Math.min(BALL.maxSpeed, Math.hypot(ball.vx, ball.vy) * 1.025); const angle = relative * Math.PI / 3; ball.vx = speed * Math.sin(angle); ball.vy = -Math.abs(speed * Math.cos(angle)); ball.y = game.paddle.y - BALL.radius - 1; beep(420, .055, "square"); }
  for (let i = game.bricks.length - 1; i >= 0; i--) {
    const brick = game.bricks[i];
    if (!aabb(box, brick)) continue;

    // 이전 위치를 기준으로 반사 면을 결정한다. 위로 날아간 공은 반드시 벽돌의 아랫면에서 반사한다.
    if (ball.vy < 0 && previousY - BALL.radius >= brick.y + brick.height - 2) {
      ball.y = brick.y + brick.height + BALL.radius + 1;
      ball.vy = Math.abs(ball.vy);
    } else if (ball.vy > 0 && previousY + BALL.radius <= brick.y + 2) {
      ball.y = brick.y - BALL.radius - 1;
      ball.vy = -Math.abs(ball.vy);
    } else if (ball.vx < 0) {
      ball.x = brick.x + brick.width + BALL.radius + 1;
      ball.vx = Math.abs(ball.vx);
    } else {
      ball.x = brick.x - BALL.radius - 1;
      ball.vx = -Math.abs(ball.vx);
    }
    brick.hp--; addParticles(ball.x, ball.y, THEMES[game.theme].brick[brick.row]); beep(brick.hp ? 350 : 620, .045, "triangle");
    if (brick.hp <= 0) { game.score += brick.points; spawnPowerup(brick); game.bricks.splice(i, 1); }
    break;
  }
}

function updatePowerups(dt) { for (let i = game.powerups.length - 1; i >= 0; i--) { const p = game.powerups[i]; p.y += p.vy * dt; if (aabb(p, game.paddle)) { applyPowerup(p.type); game.powerups.splice(i, 1); } else if (p.y > CANVAS.height) game.powerups.splice(i, 1); } }
function updateParticles(dt) { game.particles = game.particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; return (p.life -= dt) > 0; }); }

// 테마별 장식은 게임판 뒤쪽에 낮은 투명도로 그려서 플레이를 방해하지 않는다.
function drawThemeDecorations(theme) {
  const t = performance.now() / 1000;
  ctx.save();
  if (game.theme === "spring") {
    // 바람에 천천히 흩날리는 벚꽃잎
    ctx.fillStyle = "rgba(255, 194, 222, .30)";
    for (let i = 0; i < 22; i++) { const x = (i * 71 + t * 17) % 540 - 28, y = 78 + (i * 97 + t * (18 + i % 4 * 4)) % 520; ctx.save(); ctx.translate(x, y); ctx.rotate(t + i); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, .5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  } else if (game.theme === "summer") {
    // 화면 하단을 따라 천천히 흐르는 파도선
    ctx.strokeStyle = "rgba(124, 239, 255, .30)"; ctx.lineWidth = 2;
    for (let line = 0; line < 3; line++) { ctx.beginPath(); for (let x = 0; x <= CANVAS.width; x += 8) { const y = 548 + line * 10 + Math.sin(x / 34 + t * 2 + line) * 4; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  } else if (game.theme === "autumn") {
    // 붉은 단풍이 천천히 떨어진다.
    ctx.fillStyle = "rgba(255, 151, 73, .25)";
    for (let i = 0; i < 16; i++) { const x = (i * 103 + Math.sin(t + i) * 40) % 500 - 10, y = 80 + (i * 83 + t * 22) % 500; ctx.save(); ctx.translate(x, y); ctx.rotate(t * .7 + i); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
  } else if (game.theme === "winter") {
    // 눈송이는 별 모양으로 반짝인다.
    ctx.strokeStyle = "rgba(220, 249, 255, .36)"; ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) { const x = (i * 59 + Math.sin(t + i) * 12) % 480, y = 75 + (i * 79 + t * 14) % 530, r = 2 + i % 3; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); }
  } else {
    // 색상 테마에는 은은한 네온 오브를 배치한다.
    ctx.fillStyle = hexToRgba(theme.accent, .10);
    for (let i = 0; i < 8; i++) { const x = 42 + i * 62, y = 115 + (i % 3) * 155 + Math.sin(t + i) * 12; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function draw() {
  const theme = THEMES[game.theme], bg = ctx.createLinearGradient(0, 0, 0, CANVAS.height); bg.addColorStop(0, theme.bg1); bg.addColorStop(1, theme.bg2); ctx.fillStyle = bg; ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  drawThemeDecorations(theme);
  // 은은한 격자와 HUD는 네온 아케이드 분위기를 만든다.
  ctx.strokeStyle = hexToRgba(theme.accent, .08); ctx.lineWidth = 1; for (let x = 0; x < CANVAS.width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, CANVAS.height); ctx.stroke(); }
  ctx.fillStyle = "#f3f8ff"; ctx.font = "bold 16px sans-serif"; ctx.fillText(`SCORE  ${String(game.score).padStart(5, "0")}`, 18, 34); ctx.textAlign = "right"; ctx.fillText(`LIVES  ${"●".repeat(game.lives)}`, 462, 34); ctx.textAlign = "left";
  ctx.fillStyle = hexToRgba(theme.accent, .85); ctx.font = "12px sans-serif"; ctx.fillText(`ROUND ${game.level}  ·  ${DIFFICULTIES[game.difficulty].label}`, 18, 57);
  drawBricks(theme); drawPowerups(theme); drawPaddle(theme); drawBalls(theme); drawParticles();
  if (game.state !== "playing" || game.balls.some(b => b.stuck)) drawOverlay();
}

function drawBricks(theme) { game.bricks.forEach(b => { const color = theme.brick[b.row]; ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.fillStyle = hexToRgba(color, .45 + .55 * b.hp / b.maxHp); ctx.fillRect(b.x, b.y, b.width, b.height); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, 3); if (b.maxHp > 1) { ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(b.hp, b.x + b.width / 2, b.y + 16); ctx.textAlign = "left"; } ctx.restore(); }); }
function drawPaddle(theme) { ctx.save(); ctx.fillStyle = theme.paddle; ctx.shadowBlur = 16; ctx.shadowColor = theme.paddle; ctx.fillRect(game.paddle.x, game.paddle.y, game.paddle.width, game.paddle.height); ctx.restore(); }
function drawBalls(theme) { game.balls.forEach(b => { const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL.radius); g.addColorStop(0, "#fff"); g.addColorStop(1, theme.ball); ctx.fillStyle = g; ctx.shadowBlur = 16; ctx.shadowColor = theme.ball; ctx.beginPath(); ctx.arc(b.x, b.y, BALL.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }); }
function drawPowerups(theme) {
  game.powerups.forEach(p => {
    // 효과별 색과 그림을 다르게 해 떨어지는 순간에도 알아보기 쉽게 한다.
    const color = { wide: "#63e6ff", narrow: "#ff7295", multi: "#c88cff", slow: "#82e8b2", life: "#ff708d" }[p.type];
    ctx.save(); ctx.translate(p.x + 11, p.y + 11); ctx.fillStyle = color; ctx.shadowBlur = 10; ctx.shadowColor = color;
    if (p.type === "wide" || p.type === "narrow") { // 알약: +는 좋은 효과, −는 피하고 싶은 효과
      ctx.rotate(-.55); ctx.beginPath(); ctx.roundRect(-10, -6, 20, 12, 6); ctx.fill(); ctx.fillStyle = "#07111f"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.type === "wide" ? "+" : "−", 0, 5);
    } else if (p.type === "life") { // 하트: 목숨 증가
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-17, -2, -7, -13, 0, -5); ctx.bezierCurveTo(7, -13, 17, -2, 0, 8); ctx.fill();
    } else if (p.type === "multi") { // 세 개의 공: 멀티볼
      for (const x of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(x, x === 0 ? 0 : 3, 4, 0, Math.PI * 2); ctx.fill(); }
    } else { // 거북이: 공 속도 감소
      ctx.beginPath(); ctx.ellipse(0, 1, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(7, -1, 5, 4); ctx.strokeStyle = "#07111f"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 2); ctx.stroke();
    }
    ctx.restore();
  });
}
function drawParticles() { game.particles.forEach(p => { ctx.fillStyle = hexToRgba(p.color, Math.max(0, p.life / p.max)); ctx.fillRect(p.x, p.y, 3, 3); }); }
function drawMenuButton(y, text, color) {
  ctx.fillStyle = hexToRgba(color, .24); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(122, y, 236, 36, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(text, CANVAS.width / 2, y + 24);
}

function drawOverlay() {
  let title = "", sub = "";
  if (game.state === "start") { title = "벽돌깨기 아케이드"; sub = "먼저 테마와 난이도를 선택한 뒤, 화면을 터치하거나 드래그해서 시작하세요"; }
  else if (game.state === "paused") { title = "일시정지"; sub = "P 또는 ESC로 계속하기"; }
  else if (game.state === "gameover") { title = "GAME OVER"; sub = `최종 점수 ${game.score}  ·  SPACE바로 다시 시작`; }
  else if (game.state === "win") { title = "승리!"; sub = `점수 ${game.score}  ·  다음에는 무엇을 할까요?`; }
  else { title = "READY?"; sub = "SPACE 또는 클릭으로 공 발사"; }
  ctx.fillStyle = "rgba(3, 7, 20, .72)"; ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
  ctx.fillStyle = THEMES[game.theme].accent; ctx.textAlign = "center"; ctx.font = "bold 34px sans-serif"; ctx.fillText(title, CANVAS.width / 2, game.state === "win" ? 250 : 300);
  ctx.fillStyle = "#ffffff"; ctx.font = "15px sans-serif"; ctx.fillText(sub, CANVAS.width / 2, game.state === "win" ? 283 : 335);
  if (game.state === "win") {
    // 버튼을 캔버스에 직접 그려 클릭해서 다음 선택을 할 수 있게 한다.
    drawMenuButton(308, "다음 게임", "#62f4ff");
    drawMenuButton(354, "테마 · 난이도 다시 선택", "#d99bff");
    drawMenuButton(400, "처음 화면으로", "#ff9e70");
  }
  ctx.textAlign = "left";
}

function loop(time) { const dt = Math.min(.033, (time - game.lastTime) / 1000 || 0); game.lastTime = time; update(dt); draw(); requestAnimationFrame(loop); }
window.addEventListener("keydown", e => { if (["ArrowLeft", "ArrowRight", "Space", "Escape"].includes(e.code)) e.preventDefault(); game.keys[e.code] = true; if (e.code === "Space") { if (["start", "gameover", "win"].includes(game.state)) { newGame(); launch(); } else launch(); } if ((e.code === "KeyP" || e.code === "Escape") && game.state !== "start" && !["gameover", "win"].includes(game.state)) game.state = game.state === "paused" ? "playing" : "paused"; });
window.addEventListener("keyup", e => { game.keys[e.code] = false; });
canvas.addEventListener("mousemove", e => { const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) * CANVAS.width / rect.width; if (game.paddle) game.paddle.x = Math.max(0, Math.min(CANVAS.width - game.paddle.width, x - game.paddle.width / 2)); });
// 터치 드래그로도 마우스와 같은 방식으로 패들을 부드럽게 움직인다.
// 모바일에서는 손가락이 캔버스 밖으로 잠깐 나가도 입력이 끊기지 않도록 포인터를 캔버스에 고정한다.
canvas.addEventListener("pointerdown", e => {
  if (e.pointerType !== "mouse") {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 일부 구형 브라우저는 미지원 */ }
    if (["start", "gameover", "win"].includes(game.state)) { newGame(); launch(); } else launch();
  }
}, { passive: false });
canvas.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse") {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * CANVAS.width / rect.width;
    if (game.paddle) game.paddle.x = Math.max(0, Math.min(CANVAS.width - game.paddle.width, x - game.paddle.width / 2));
    e.preventDefault();
  }
}, { passive: false });
canvas.addEventListener("pointerup", e => { try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }, { passive: false });
canvas.addEventListener("click", event => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * CANVAS.width / rect.width;
  const y = (event.clientY - rect.top) * CANVAS.height / rect.height;
  if (game.state === "win") {
    // 승리 화면의 선택지를 처리한다. 설정 선택은 위의 드롭다운을 바꿀 수 있는 시작 화면으로 돌아간다.
    if (x >= 122 && x <= 358 && y >= 308 && y <= 344) { game.level++; createBricks(); resetBall(); game.state = "playing"; hideResultPanel(); launch(); }
    else if (x >= 122 && x <= 358 && y >= 354 && y <= 390) { game.state = "start"; hideResultPanel(); }
    else if (x >= 122 && x <= 358 && y >= 400 && y <= 436) { game.state = "start"; hideResultPanel(); }
    return;
  }
  if (["start", "gameover"].includes(game.state)) { newGame(); launch(); } else launch();
});
// 이름은 12자로 제한하고, 같은 게임 점수는 한 번만 저장한다.
scoreForm.addEventListener("submit", async event => {
  event.preventDefault();
  const name = playerName.value.trim();
  if (!name) return;
  if (!game.ranking) { rankingStatus.textContent = "먼저 firebase-config.js에 Firebase 웹 앱 설정을 입력해 주세요."; return; }
  if (game.scoreSaved) { rankingStatus.textContent = "이 게임의 점수는 이미 저장되었습니다."; return; }
  const button = scoreForm.querySelector("button"); button.disabled = true; rankingStatus.textContent = "점수를 저장하는 중…";
  try { await game.ranking.save(name, game.score); game.scoreSaved = true; rankingStatus.textContent = "저장 완료! 전 세계 랭킹을 갱신했습니다."; await loadLeaderboard(); }
  catch (_) { rankingStatus.textContent = "저장하지 못했습니다. 네트워크와 Firestore 규칙을 확인해 주세요."; }
  finally { button.disabled = false; }
});
difficultySelect.addEventListener("change", () => { if (game.state === "start") game.difficulty = difficultySelect.value; });
themeSelect.addEventListener("change", () => { game.theme = themeSelect.value; });
// 화면 좌우 버튼은 누르고 있는 동안 키보드 입력과 동일하게 동작한다.
document.querySelectorAll("[data-touch-dir]").forEach(button => {
  const code = button.dataset.touchDir === "left" ? "ArrowLeft" : "ArrowRight";
  const press = event => { event.preventDefault(); game.keys[code] = true; };
  const release = event => { event.preventDefault(); game.keys[code] = false; };
  button.addEventListener("pointerdown", press, { passive: false }); button.addEventListener("pointerup", release, { passive: false }); button.addEventListener("pointercancel", release, { passive: false }); button.addEventListener("pointerleave", release, { passive: false });
});
document.querySelector("[data-touch-action=launch]").addEventListener("click", () => { if (["start", "gameover", "win"].includes(game.state)) { newGame(); launch(); } else launch(); });

// 랭킹은 항상 보이고, 이름은 게임 시작 전에만 정한다.
scoreForm.addEventListener("submit", event => {
  event.preventDefault(); event.stopImmediatePropagation();
  const name = playerName.value.trim();
  if (!name) { rankingStatus.textContent = "이름을 입력해 주세요."; return; }
  game.playerName = name;
  resultTitle.textContent = `${name}님의 랭킹`;
  resultScore.textContent = "게임이 끝나면 점수가 자동 저장됩니다.";
  rankingStatus.textContent = "이름이 적용되었습니다. Space로 게임을 시작하세요.";
}, true);

function newGame() {
  const name = playerName.value.trim();
  if (!name) { rankingStatus.textContent = "게임 시작 전 이름을 입력해 주세요."; playerName.focus(); return false; }
  game.playerName = name;
  game.difficulty = difficultySelect.value; game.theme = themeSelect.value;
  game.score = 0; game.lives = START_LIVES; game.level = 1;
  game.paddle = { x: (CANVAS.width - PADDLE.baseWidth) / 2, y: PADDLE.y, width: PADDLE.baseWidth, height: PADDLE.height };
  game.particles = []; game.scoreSaved = false; createBricks(); resetBall(); game.state = "playing";
  resultTitle.textContent = `${name}님의 랭킹`; resultScore.textContent = "게임이 끝나면 점수가 자동 저장됩니다.";
  return true;
}

function hideResultPanel() { /* 랭킹 패널은 항상 표시 */ }
function showResultPanel(kind) {
  resultTitle.textContent = kind === "win" ? "WIN!" : "GAME OVER";
  resultScore.textContent = `최종 점수: ${game.score.toLocaleString()} · 자동 저장 중`;
}
async function saveCurrentScore() {
  if (!game.ranking || game.scoreSaved || !game.playerName) return;
  try { await game.ranking.save(game.playerName, game.score); game.scoreSaved = true; rankingStatus.textContent = "점수가 자동 저장되었습니다."; await loadLeaderboard(); }
  catch (_) { rankingStatus.textContent = "자동 저장에 실패했습니다. 인터넷 연결을 확인해 주세요."; }
}
async function finishGame(kind) { game.state = kind; showResultPanel(kind); await saveCurrentScore(); }

scoreForm.querySelector("button").textContent = "이름 적용";
rankingPanel.hidden = false;
game.paddle = { x: (CANVAS.width - PADDLE.baseWidth) / 2, y: PADDLE.y, width: PADDLE.baseWidth, height: PADDLE.height }; resetBall(); createBricks(); requestAnimationFrame(loop);
