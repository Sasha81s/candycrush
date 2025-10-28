/* ======================= UI state ======================= */
const screens = {
  home: document.getElementById('screen-home'),
  game: document.getElementById('screen-game'),
};
const modals = {
  leader: document.getElementById('leader-modal'),
};

function showScreen(name) {
  const home = document.getElementById('screen-home');
  const game = document.getElementById('screen-game');

  /* ===== remote leaderboard config ===== */
const API_BASE = ""; // same origin

/* ===== wallet-sign helper (Farcaster mini app) ===== */
async function signScore(score) {
  if (!window.sdk?.wallet?.getEthereumProvider) throw new Error("no-wallet");
  const provider = await window.sdk.wallet.getEthereumProvider();
  const [addr] = await provider.request({ method: "eth_requestAccounts" });
  const ts = Date.now();
  const message = `cc-score:${score}|ts:${ts}`;
  const sig = await provider.request({ method: "personal_sign", params: [message, addr] });
  return { addr, ts, sig };
}

/* ===== remote submit + fetch ===== */
async function submitScoreRemote(name, score) {
  const { addr, ts, sig } = await signScore(score);
  const r = await fetch(`${API_BASE}/api/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addr, name, score, ts, sig })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.err || "submit failed");
}

async function fetchTop(n = 10) {
  const r = await fetch(`${API_BASE}/api/top?n=${n}`, { cache: "no-store" });
  if (!r.ok) throw new Error("bad fetch");
  return r.json();
}

  // always hide modal
  modals.leader?.classList.remove('show');
  modals.leader?.setAttribute('hidden', '');

  // hide both
  home?.classList.remove('active');
  game?.classList.remove('active');

  // show requested
  (name === 'game' ? game : home)?.classList.add('active');

  // housekeeping
  if (name === 'home') stopTimer();
}

document.getElementById('btn-exit').addEventListener('click', () => showScreen('home'));
document.getElementById('btn-leader').addEventListener('click', async () => {
  const btn = document.getElementById('btn-leader');
  if (btn) btn.disabled = true;
  await renderLeaderboard();
  modals.leader?.removeAttribute('hidden');
  modals.leader?.classList.add('show');
  if (btn) btn.disabled = false;
});

document.getElementById('btn-close-leader').addEventListener('click', () => {
  modals.leader?.classList.remove('show');
  modals.leader?.setAttribute('hidden', '');
});

/* ========== farcaster mini-app connect + mandatory tx (no wagmi) ========== */
const BASE_CHAIN_ID_HEX = '0x2105'; // Base mainnet
let connectedAddr = null;
let ethProvider = null;
let providerEventsBound = false;

async function getProvider() {
  if (ethProvider) return ethProvider;
  if (!window.sdk || !window.sdk.wallet || typeof window.sdk.wallet.getEthereumProvider !== 'function') {
    throw new Error('not-in-miniapp');
  }
  ethProvider = await window.sdk.wallet.getEthereumProvider();

  // bind once
  if (!providerEventsBound && ethProvider) {
    providerEventsBound = true;

    ethProvider.on?.('accountsChanged', (acc) => {
      connectedAddr = acc?.[0] || null;
      const pill = document.getElementById('addr-pill');
      const btn = document.getElementById('btn-connect');
      if (!connectedAddr) {
        if (pill?.style) pill.style.display = 'none';
        if (btn) {
          btn.textContent = 'connect';
          btn.classList.remove('connected');
          btn.disabled = false;
        }
      } else {
        if (pill?.style) pill.style.display = 'block';
        if (pill) pill.textContent = `connected: ${connectedAddr.slice(0, 6)}…${connectedAddr.slice(-4)}`;
      }
    });

    ethProvider.on?.('chainChanged', async (hex) => {
      if (hex !== BASE_CHAIN_ID_HEX) {
        try {
          await ethProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_ID_HEX }],
          });
        } catch {}
      }
    });
  }

  return ethProvider;
}

async function ensureBaseChain(provider) {
  try {
    const current = await provider.request({ method: 'eth_chainId' });
    if (current !== BASE_CHAIN_ID_HEX) {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    }
  } catch {
    // host may already be on Base
  }
}

async function connectFarcasterWallet() {
  try {
    const provider = await getProvider();
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    connectedAddr = accounts?.[0] || null;
    await ensureBaseChain(provider);

    const pill = document.getElementById('addr-pill');
    if (pill && connectedAddr) {
      pill.style.display = 'block';
      pill.textContent = `connected: ${connectedAddr.slice(0, 6)}…${connectedAddr.slice(-4)}`;
    }
    const btn = document.getElementById('btn-connect');
    if (btn) {
      btn.textContent = 'connected';
      btn.classList.add('connected');
      btn.disabled = true;
    }
    return connectedAddr;
  } catch (err) {
    console.error('wallet connect failed', err);
    alert('open this inside Farcaster to connect the wallet');
    throw err;
  }
}

async function ensureConnected() {
  if (connectedAddr) return connectedAddr;
  return connectFarcasterWallet();
}

// mandatory entry transaction
async function sendMandatoryTx() {
  const addr = await ensureConnected();
  const provider = await getProvider();

  // ensure Base
  try {
    const chain = await provider.request({ method: 'eth_chainId' });
    if (chain !== BASE_CHAIN_ID_HEX) {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    }
  } catch {}

  const tx = {
    from: addr,
    to: '0xA13a9d5Cdc6324dA1Ca6A18Bc9B548904033858C',
    value: '0x9184e72a000', // 0.00001 ETH in wei
  };

  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });
  return hash;
}

/* buttons */
document.getElementById('btn-connect')?.addEventListener('click', async () => {
  try { await connectFarcasterWallet(); } catch {}
});

document.getElementById('btn-play')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const inMini = !!(window.sdk && window.sdk.wallet);
    if (inMini) {
      await ensureConnected();
      await sendMandatoryTx();
      await preload(ASSETS);
      startGame();
    } else {
      await preload(ASSETS);
      startGame(); // dev mode outside Farcaster
    }
  } catch (err) {
    console.error(err);
    alert('transaction required to start');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

/* ======================= leaderboard ======================= */
const KEY = 'cc_scores_v1';
function loadScores() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') ?? []; } catch { return []; } }
function saveScores(arr) { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 50))); }
function submitScore(name, score) {
  const list = loadScores();
  list.push({ name, score, ts: Date.now() });
  list.sort((a,b) => b.score - a.score || a.ts - b.ts);
  saveScores(list);
}

async function renderLeaderboard() {
  const ol = document.getElementById('leader-list');
  if (!ol) return;
  ol.innerHTML = 'loading…';

  try {
    const r = await fetch('https://candycrush-liard.vercel.app/api/top');
    const data = await r.json();

    ol.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
      ol.innerHTML = '<li>no scores yet</li>';
      return;
    }

    data.forEach((row, i) => {
      const li = document.createElement('li');
      const short =
        row.addr && row.addr.length > 10
          ? `${row.addr.slice(0, 6)}…${row.addr.slice(-4)}`
          : '';
      li.textContent = `${i + 1}. ${row.name || 'guest'}  -  ${row.score}${
        short ? '  (' + short + ')' : ''
      }`;
      ol.appendChild(li);
    });
  } catch (err) {
    console.error('[leaderboard]', err);
    ol.innerHTML = '<li>error loading leaderboard</li>';
  }
}



/* ======================= game core ======================= */
document.addEventListener('dragstart', e => e.preventDefault());

const W = 8;
const TYPES = 6;
let cells = [];
let types = new Array(W * W);
let score = 0;
let resolving = false;

// timer
let time = 60;
let timerId = null;
const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');

function startTimer() {
  stopTimer();
  let t = time;
  if (timeEl) timeEl.textContent = String(t);
  timerId = setInterval(() => {
    t = Math.max(0, t - 1);
    if (timeEl) timeEl.textContent = String(t);
    if (t <= 0) endGame();
  }, 1000);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

// board sizing
function fitBoard() {
  const wrap = document.getElementById('game-root');
  if (!wrap) return;
  const pad = 20;
  const size = Math.min(wrap.clientWidth, wrap.clientHeight) - pad * 2;
  const clamped = Math.max(360, Math.min(512, size));
  document.documentElement.style.setProperty('--board', clamped + 'px');
}
window.addEventListener('resize', fitBoard);
document.addEventListener('visibilitychange', () => { if (!document.hidden) fitBoard(); });

// helpers
const id = (r, c) => r * W + c;
const inBounds = (r, c) => r >= 0 && r < W && c >= 0 && c < W;
const urlFor = t => t === 0 ? 'none' : `url("img/color (${t}).png")`;
function renderCell(i) { cells[i].style.backgroundImage = urlFor(types[i]); }
function renderAll() { for (let i = 0; i < cells.length; i++) renderCell(i); }
function randomType() { return 1 + Math.floor(Math.random() * TYPES); }

function createsLine(r, c, t) {
  // horizontal
  let cnt = 1, cc = c - 1;
  while (cc >= 0 && types[id(r, cc)] === t) { cnt++; cc--; }
  cc = c + 1;
  while (cc < W && types[id(r, c)] === t) { cnt++; cc++; }
  if (cnt >= 3) return true;
  // vertical
  cnt = 1; let rr = r - 1;
  while (rr >= 0 && types[id(rr, c)] === t) { cnt++; rr--; }
  rr = r + 1;
  while (rr < W && types[id(rr, c)] === t) { cnt++; rr++; }
  return cnt >= 3;
}
function rollTypeSafe(r, c) { let t; do { t = randomType(); } while (createsLine(r, c, t)); return t; }

function buildBoard(boardEl) {
  cells = []; types.fill(0);
  boardEl.innerHTML = '';
  for (let r = 0; r < W; r++) {
    for (let c = 0; c < W; c++) {
      const i = id(r,c);
      const div = document.createElement('div');
      div.className = 'box';
      div.dataset.r = String(r);
      div.dataset.c = String(c);
      types[i] = rollTypeSafe(r,c);
      div.style.backgroundImage = urlFor(types[i]);
      boardEl.appendChild(div);
      cells.push(div);
    }
  }
  enableSlideSwap(boardEl, trySwap);
  cascadeResolve();
}

function adjacent(a,b){ return Math.abs(a.r-b.r)+Math.abs(a.c-b.c) === 1; }
function trySwap(from,to){
  if (resolving) return;
  if (!inBounds(from.r,from.c) || !inBounds(to.r,to.c)) return;
  if (!adjacent(from,to)) return;

  const i = id(from.r,from.c), j = id(to.r,to.c);
  [types[i], types[j]] = [types[j], types[i]];
  renderCell(i); renderCell(j);

  const matches = findMatches();
  if (matches.size === 0) {
    [types[i], types[j]] = [types[j], types[i]];
    renderCell(i); renderCell(j);
    return;
  }
  cascadeResolve(matches);
}

function findMatches(){
  const out = new Set();
  // horizontal
  for (let r=0;r<W;r++){
    let c=0;
    while(c<W){
      const t = types[id(r,c)]; if(!t){c++;continue;}
      let run=1; while(c+run<W && types[id(r,c+run)]===t) run++;
      if(run>=3) for(let k=0;k<run;k++) out.add(id(r,c+k));
      c+=run;
    }
  }
  // vertical
  for (let c=0;c<W;c++){
    let r=0;
    while(r<W){
      const t = types[id(r,c)]; if(!t){r++;continue;}
      let run=1; while(r+run<W && types[id(r+run,c)]===t) run++;
      if(run>=3) for(let k=0;k<run;k++) out.add(id(r+k,c));
      r+=run;
    }
  }
  return out;
}
function clearMatches(set){
  if(!set || set.size===0) return 0;
  let cleared=0;
  set.forEach(i => { if(types[i]!==0){ types[i]=0; cleared++; }});
  renderAll();
  return cleared;
}
function applyGravity(){
  for(let c=0;c<W;c++){
    let write=W-1;
    for(let r=W-1;r>=0;r--){
      const i=id(r,c);
      if(types[i]!==0){
        const j=id(write,c);
        if(i!==j){ types[j]=types[i]; types[i]=0; }
        write--;
      }
    }
    for(let r=write;r>=0;r--) types[id(r,c)] = randomType();
  }
  renderAll();
}
function cascadeResolve(pre){
  resolving = true;
  function step(matches){
    const set = matches ?? findMatches();
    if(set.size===0){ resolving=false; return; }
    const cleared = clearMatches(set);
    score += cleared;
    if (scoreEl) scoreEl.textContent = String(score);
    setTimeout(() => { applyGravity(); setTimeout(() => step(findMatches()), 120); }, 120);
  }
  step(pre);
}

/* slide swap input */
function enableSlideSwap(root, onSwap) {
  let active = null, preview = null;
  const rc = t => (t?.dataset && Number.isFinite(+t.dataset.r) && Number.isFinite(+t.dataset.c))
    ? { r:+t.dataset.r, c:+t.dataset.c } : null;

  function clearFx(){
    if(active?.el){ active.el.classList.remove('dragging'); active.el.style.transform=''; }
    if(preview){ preview.classList.remove('preview'); preview.style.transform=''; }
    active=null; preview=null;
  }

  root.addEventListener('pointerdown', e => {
    const from = rc(e.target); if(!from) return;
    const el = e.target;
    const rect = el.getBoundingClientRect();
    active = { el, from, startX:e.clientX, startY:e.clientY, axis:null, size:Math.min(rect.width, rect.height) };
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('dragging');
  }, { passive:true });

  root.addEventListener('pointermove', e => {
    if(!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    if(!active.axis){
      const mag = Math.hypot(dx,dy);
      if(mag>6) active.axis = Math.abs(dx)>=Math.abs(dy) ? 'x' : 'y';
    }
    const axis = active.axis || 'x';
    const off = axis==='x' ? dx : dy;
    const clamp = Math.max(-active.size, Math.min(active.size, off));
    const x = axis==='x' ? clamp : 0;
    const y = axis==='y' ? clamp : 0;
    active.el.style.transform = `translate(${x}px, ${y}px)`;

    let to = { ...active.from };
    if(axis==='x') to.c += clamp>0 ? 1 : -1;
    else           to.r += clamp>0 ? 1 : -1;

    const next = root.querySelector(`.box[data-r="${to.r}"][data-c="${to.c}"]`);
    if(preview && preview!==next){ preview.classList.remove('preview'); preview.style.transform=''; preview=null; }
    if(next){ preview = next; preview.classList.add('preview'); preview.style.transform = `translate(${-x}px, ${-y}px)`; }
  }, { passive:true });

  root.addEventListener('pointerup', e => {
    if(!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    const axis = active.axis || (Math.abs(dx)>=Math.abs(dy)?'x':'y');
    const off = axis==='x' ? dx : dy;
    const TH = active.size * 0.4;
    let to = { ...active.from };
    if(axis==='x') to.c += off>0 ? 1 : -1;
    else           to.r += off>0 ? 1 : -1;

    if(preview){ preview.classList.remove('preview'); preview.style.transform=''; }
    active.el.classList.remove('dragging');

    const valid = Math.abs(off) >= TH && inBounds(to.r,to.c);
    active.el.style.transform = '';
    if(valid) onSwap(active.from, to);
    active=null; preview=null;
  }, { passive:true });

  root.addEventListener('pointercancel', clearFx, { passive:true });
  root.addEventListener('mouseleave', clearFx, { passive:true });
}

/* ======================= assets preload ======================= */
const ASSETS = Array.from({ length: TYPES }, (_, i) => `img/color (${i + 1}).png`);
async function preload(srcs) {
  try {
    await Promise.all(
      srcs.map(
        s =>
          new Promise(res => {
            const i = new Image();
            i.src = s;
            i.onload = i.onerror = res;
          })
      )
    );
  } catch {}
}

/* ======================= game flow ======================= */
function startGame() {
  // reset
  score = 0;
  if (scoreEl) scoreEl.textContent = '0';
  if (timeEl) timeEl.textContent = '60';

  // force-show game screen with inline styles
  const home = document.getElementById('screen-home');
  const game = document.getElementById('screen-game');
  if (home) { home.classList.remove('active'); home.style.display = 'none'; home.style.visibility = 'hidden'; }
  if (game) { game.classList.add('active'); game.style.display = 'block'; game.style.visibility = 'visible'; game.style.zIndex = '2'; }

  // build after paint
  const board = document.getElementById('board');
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (!board) { console.error('[mini] no #board'); alert('no #board element'); return; }

      // diagnostic grid
      board.style.minWidth = '200px';
      board.style.minHeight = '200px';
      board.style.backgroundImage = 'repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 48px)';
      board.style.outline = '2px solid rgba(255,255,255,.25)';
      board.style.borderRadius = '12px';

      // ensure fresh state
      cells = [];
      types = new Array(W * W);
      resolving = false;

      buildBoard(board);
      fitBoard();
      startTimer();

      console.log('[mini] board built, cells:', board.children.length);
      if (board.children.length !== 64) {
        alert('board not filled: ' + board.children.length + ' cells');
      }
    }, 0);
  });
}

async function endGame(){
  stopTimer();
  const name = localStorage.getItem("cc_name") || "guest";

  try {
    if (window.sdk?.wallet?.getEthereumProvider) {
      await submitScoreRemote(name, score); // signed submit when inside Farcaster
    } else {
      // dev browser fallback so it still shows something
      const list = loadScores();
      list.push({ name, score, ts: Date.now() });
      list.sort((a,b) => b.score - a.score || a.ts - b.ts);
      saveScores(list);
    }
  } catch (e) {
    console.error("[score] submit failed", e);
  }

  await renderLeaderboard();
  showScreen("home");
  document.getElementById("leader-modal")?.classList.add("show");
}


/* boot to home */
showScreen('home');

// ask player name once
if (!localStorage.getItem('cc_name')) {
  const n = prompt('enter your name for the leaderboard') || 'guest';
  localStorage.setItem('cc_name', n.slice(0, 16));
}

// safety
setTimeout(() => { try { window.sdk?.actions?.ready() } catch {} }, 0);
