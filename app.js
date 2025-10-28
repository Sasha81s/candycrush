window.onload = () => {
  // ======================= UI state =======================
  const screens = {
    home: document.getElementById('screen-home'),
    game: document.getElementById('screen-game'),
  };
  const modals = {
    leader: document.getElementById('leader-modal'),
  };

  // Function to show the correct screen (home or game)
  function showScreen(name) {
    const home = document.getElementById('screen-home');
    const game = document.getElementById('screen-game');

    // Hide both screens
    home?.classList.remove('active');
    game?.classList.remove('active');

    // Show requested screen
    if (name === 'game') {
      game?.classList.add('active');
    } else {
      home?.classList.add('active');
    }

    // housekeeping
    if (name === 'home') stopTimer();
  }


  // Add event listener for the play button
document.getElementById('btn-play')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('loading');
  
  try {
    // Check if running in Farcaster mini-app
    const inMini = !!(window.sdk && window.sdk.wallet);

    // If in Farcaster, ensure the wallet is connected and send a mandatory transaction
    if (inMini) {
      await ensureConnected();  // Ensure wallet connection
      await sendMandatoryTx();  // Send transaction before starting game
    }

    // Preload assets (image, game assets)
    await preload(ASSETS);

    // Start the game after preload
    startGame();

  } catch (err) {
    console.error('Error starting game:', err);
    alert('Transaction required to start the game');
  } finally {
    // Reset button state
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

function startGame() {
  console.log("Game is starting...");

  // reset score, timer, and board
  score = 0;
  if (scoreEl) scoreEl.textContent = '0';
  if (timeEl) timeEl.textContent = '60';

  // force-show game screen with inline styles
  const home = document.getElementById('screen-home');
  const game = document.getElementById('screen-game');
  if (home) { home.classList.remove('active'); home.style.display = 'none'; home.style.visibility = 'hidden'; }
  if (game) { game.classList.add('active'); game.style.display = 'block'; game.style.visibility = 'visible'; game.style.zIndex = '2'; }

  // Initialize the game board after render
  const board = document.getElementById('board');
  if (board) {
    board.style.minWidth = '200px';
    board.style.minHeight = '200px';
    board.style.backgroundImage = 'repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 1px, transparent 1px 48px)';
    board.style.outline = '2px solid rgba(255,255,255,.25)';
    board.style.borderRadius = '12px';

    // Proceed with building the board
    cells = [];
    types = new Array(W * W);
    resolving = false;

    buildBoard(board);
    fitBoard();
    startTimer();  // Start the game timer
    console.log("[Game] Board initialized, starting the game!");
  } else {
    console.error("[Game] Error: No game board element found.");
  }
}

  // ========== Farcaster Wallet Connect ==========

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

  async function connectFarcasterWallet() {
    try {
      const provider = await getProvider();
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      connectedAddr = accounts?.[0] || null;
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

  // Add event listener for the connect wallet button
  document.getElementById('btn-connect')?.addEventListener('click', async () => {
    try {
      await connectFarcasterWallet();
    } catch {}
  });

  // ========== Game Button Logic ==========

  // Add event listener for the play button
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

  // ========== Leaderboard Logic ==========

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

  // Start with the home screen visible
  showScreen('home');

  // Ask player name once if not set
  if (!localStorage.getItem('cc_name')) {
    const n = prompt('enter your name for the leaderboard') || 'guest';
    localStorage.setItem('cc_name', n.slice(0, 16));
  }

  // Safety: ensure Farcaster SDK is ready
  setTimeout(() => { try { window.sdk?.actions?.ready() } catch {} }, 0);
};
