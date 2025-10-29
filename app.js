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
  const popup = document.getElementById('end-game-popup'); // The game over popup


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

    // Hide the game-over popup when switching to home screen
  if (name === 'home' && popup) {
    popup.style.display = 'none';  // Hide the game-over popup
  }

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
  } catch (err) {
    console.error("Error switching chain:", err);
  }

  const tx = {
    from: addr,
    to: '0xA13a9d5Cdc6324dA1Ca6A18Bc9B548904033858C', // Your target address
    value: '0x9184e72a000', // 0.00001 ETH in wei
  };

  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    });
    console.log("Transaction hash:", hash);
    return hash;
  } catch (err) {
    console.error("Transaction failed:", err);
    throw new Error("Transaction failed");
  }
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
    const r = await fetch('/api/top');
    const data = await r.json();

    ol.innerHTML = '';
    if (!Array.isArray(data) || data.length === 0) {
      ol.innerHTML = '<li>no scores yet</li>';
      return;
    }

    data.forEach((row, i) => {
      const li = document.createElement('li');

      // Assign medal classes based on rank
      if (i === 0) {
        li.innerHTML = `<span class="gold-medal">🥇</span> ${i + 1}. ${row.name} — ${row.score}`;
      } else if (i === 1) {
        li.innerHTML = `<span class="silver-medal">🥈</span> ${i + 1}. ${row.name} — ${row.score}`;
      } else if (i === 2) {
        li.innerHTML = `<span class="bronze-medal">🥉</span> ${i + 1}. ${row.name} — ${row.score}`;
      } else {
        li.textContent = `${i + 1}. ${row.name} — ${row.score}`;
      }

      // Add the short address if available
      const short = row.addr ? `${row.addr.slice(0, 6)}…${row.addr.slice(-4)}` : '';
      if (short) li.textContent += ` (${short})`;

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
let time = 10;
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













// Function to show the popup at the start of the game
function showAddMiniAppPopup() {
  const popup = document.getElementById('add-mini-app-popup');
  popup.style.visibility = 'visible';
}

// Hide the popup
function hideAddMiniAppPopup() {
  const popup = document.getElementById('add-mini-app-popup');
  popup.style.visibility = 'hidden';
}

// Add event listener for the Cancel button
document.getElementById('cancel-btn').addEventListener('click', hideAddMiniAppPopup);

// Confirm button logic: when clicked, both actions will be triggered without checkboxes
document.getElementById('confirm-btn').addEventListener('click', async () => {
  console.log("Adding to Farcaster...");
  await addToFarcasterMiniApp(); // Add the mini-app

  console.log("Enabling notifications...");
  await enableFarcasterNotifications(); // Enable notifications

  hideAddMiniAppPopup(); // Hide popup after confirm
});

// Add to Farcaster mini-app (using Farcaster SDK)
async function addToFarcasterMiniApp() {
  try {
    if (!window.sdk) {
      console.error('Farcaster SDK is not loaded.');
      return;
    }

    // Assuming window.sdk has a method to add the app
    if (window.sdk.miniapp && window.sdk.miniapp.add) {
      const result = await window.sdk.miniapp.add(); // Method from Farcaster SDK
      console.log("Mini App added to Farcaster:", result);
    } else {
      console.error("Farcaster SDK or method is not available");
    }
  } catch (err) {
    console.error("Error adding to Farcaster:", err);
  }
}

// Enable notifications (using Farcaster SDK)
async function enableFarcasterNotifications() {
  try {
    if (!window.sdk) {
      console.error('Farcaster SDK is not loaded.');
      return;
    }

    // Assuming window.sdk has a method to enable notifications
    if (window.sdk.notifications && window.sdk.notifications.enable) {
      const result = await window.sdk.notifications.enable(); // Method from Farcaster SDK
      console.log("Notifications enabled:", result);
    } else {
      console.error("Farcaster SDK or method is not available");
    }
  } catch (err) {
    console.error("Error enabling notifications:", err);
  }
}

// Show the popup when the game starts
window.onload = showAddMiniAppPopup;  // Ensure popup shows as soon as the page loads














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

async function endGame() {
  stopTimer();

  const scoreValue = score;
  let name = localStorage.getItem('cc_name') || 'guest';
  let addr = null;
  let fid = null;

  console.log('[debug] Checking Farcaster identity');

  // try to fetch Farcaster ID and wallet address
  try {
    if (window.sdk?.user?.fid) {
      fid = window.sdk.user.fid;
      console.log('[debug] Farcaster ID (fid):', fid);
    }
    if (window.sdk?.wallet?.getEthereumProvider) {
      const provider = await window.sdk.wallet.getEthereumProvider();
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      addr = accounts?.[0] || null;
      console.log('[debug] Wallet address:', addr);
    }
  } catch (err) {
    console.warn('[debug] Error fetching Farcaster identity:', err);
  }

  // pick display name
  if (fid) name = 'fid' + fid;
  else if (addr) name = addr.slice(0, 6) + '…' + addr.slice(-4);

  // prepare payload
  const body = { name, score: scoreValue, addr, fid };

  try {
    const res = await fetch('https://candycrush-liard.vercel.app/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    console.log('[submit]', json);
  } catch (err) {
    console.error('[submit error]', err);
  }

  // Show end-game popup
  showEndGamePopup(scoreValue);
}

















// Track if the transaction is pending
let isTransactionPending = false;

function showEndGamePopup(score) {
  // Display the score in the popup
  document.getElementById('final-score').textContent = score;

  // Show the popup modal
  const popup = document.getElementById('end-game-popup');
  popup.style.display = 'flex';  // Ensure it's visible

  // Disable the Play Again button until transaction is confirmed
  const playAgainButton = document.getElementById('play-again-btn');
  playAgainButton.disabled = false;  // Ensure the button is clickable
  playAgainButton.innerHTML = "Play Again"; // Reset the button text

  // Reset event listener to prevent stacking event listeners
  playAgainButton.removeEventListener('click', playAgainListener); 
  playAgainButton.addEventListener('click', playAgainListener);  

  function playAgainListener() {
    // Prevent further actions if transaction is already pending
    if (isTransactionPending) return;

    // Mark the transaction as pending
    isTransactionPending = true;

    // Disable the button to prevent multiple clicks
    playAgainButton.disabled = true;
    playAgainButton.innerHTML = "Processing..."; // Show processing text

    // Trigger transaction
    sendMandatoryTx()
      .then(txHash => {
        // Wait for the transaction to be confirmed
        return waitForTransactionConfirmation(txHash);
      })
      .then(receipt => {
        if (receipt.status === '0x1') {
          console.log('Transaction confirmed. Restarting the game.');
          startGame(); // Restart game after successful transaction
          
          // Hide the popup after the game starts
          popup.style.display = 'none'; // Hide the popup after confirmation
        } else {
          throw new Error('Transaction failed');
        }
      })
      .catch((err) => {
        console.error('Transaction failed:', err);
        alert('Transaction failed. Please try again.');
      })
      .finally(() => {
        // Regardless of the transaction result, enable the button again
        isTransactionPending = false;
        playAgainButton.disabled = false;
        playAgainButton.innerHTML = "Play Again";  // Reset text to default
      });
  }
}

// Wait for the transaction to be confirmed
async function waitForTransactionConfirmation(txHash) {
  const provider = await getProvider();
  return new Promise((resolve, reject) => {
    const checkTransaction = async () => {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt) {
          if (receipt.blockNumber) {
            resolve(receipt); // Transaction confirmed
          } else {
            // Still pending, check again in 2 seconds
            setTimeout(checkTransaction, 2000);
          }
        } else {
          reject('Transaction receipt not found');
        }
      } catch (err) {
        reject('Error checking transaction receipt: ' + err.message);
      }
    };
    checkTransaction();
  });
}

// Transaction function
async function sendMandatoryTx() {
  const addr = await ensureConnected();
  const provider = await getProvider();

  const tx = {
    from: addr,
    to: '0xA13a9d5Cdc6324dA1Ca6A18Bc9B548904033858C', // Target address
    value: '0x9184e72a000', // 0.00001 ETH in wei
  };

  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    });
    console.log("Transaction hash:", hash);
    return hash;
  } catch (err) {
    console.error("Transaction failed:", err);
    throw new Error("Transaction failed");
  }
}





















// Share button functionality (sync-safe)
const shareBtn = document.getElementById('share-btn');

shareBtn.onclick = async () => {
  const shareText = `I just scored ${score} points in Candy Crush Mini!`;
  const shareUrl = 'https://farcaster.xyz/miniapps/C6_Zeg_0a7CL/candycrush'; // The URL you're sharing

  try {
    // Attempt to copy the content to clipboard first
    await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
    showCustomModal('Link copied to clipboard! You can now share it anywhere.');
  } catch (err) {
    console.error('Clipboard copy failed', err);
    // If copying fails, show a fallback modal
    showCustomModal(`Failed to copy to clipboard. You can manually share: ${shareText} ${shareUrl}`);
  }
};

// Function to display custom modal
function showCustomModal(message) {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.padding = '20px';
  modal.style.background = '#333';
  modal.style.color = 'white';
  modal.style.borderRadius = '10px';
  modal.style.fontSize = '18px';
  modal.style.zIndex = '9999';
  
  modal.innerHTML = `
    <p>${message}</p>
    <button style="background-color: #8a5cff; color: white; border: none; padding: 10px 20px; border-radius: 5px;">Close</button>
  `;
  
  document.body.appendChild(modal);

  // Close modal when button is clicked
  modal.querySelector('button').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
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
