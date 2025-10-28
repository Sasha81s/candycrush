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

/* Leaderboard button click */
document.getElementById('btn-leader')?.addEventListener('click', async () => {
  console.log('Leaderboard button clicked');  // Log to verify if the button click is captured

  const btn = document.getElementById('btn-leader');
  if (btn) btn.disabled = true;  // Disable the button while loading leaderboard
  await renderLeaderboard();  // Fetch and render leaderboard
  modals.leader?.removeAttribute('hidden');
  modals.leader?.classList.add('show');
  if (btn) btn.disabled = false;  // Enable the button after fetching leaderboard
});

document.getElementById('btn-close-leader').addEventListener('click', () => {
  modals.leader?.classList.remove('show');
  modals.leader?.setAttribute('hidden', '');
});

/* ======================= farcaster mini-app connect + mandatory tx (no wagmi) ========== */
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
