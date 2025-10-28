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
  // Hide modals and screens
  modals.leader?.classList.remove('show');
  modals.leader?.setAttribute('hidden', '');
  home?.classList.remove('active');
  game?.classList.remove('active');
  
  (name === 'game' ? game : home)?.classList.add('active');
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

/* ======================= Farcaster Mini-App Wallet ======================= */
const BASE_CHAIN_ID_HEX = '0x2105'; // Base mainnet
let connectedAddr = null;
let ethProvider = null;
let providerEventsBound = false;

async function getProvider() {
  if (ethProvider) return ethProvider;
  if (!window.sdk?.wallet?.getEthereumProvider) throw new Error('not-in-miniapp');
  ethProvider = await window.sdk.wallet.getEthereumProvider();
  
  if (!providerEventsBound && ethProvider) {
    providerEventsBound = true;
    ethProvider.on?.('accountsChanged', updateAddress);
    ethProvider.on?.('chainChanged', handleChainChange);
  }

  return ethProvider;
}

function updateAddress(acc) {
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
}

function handleChainChange(hex) {
  if (hex !== BASE_CHAIN_ID_HEX) {
    ethProvider?.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  }
}

async function ensureConnected() {
  if (connectedAddr) return connectedAddr;
  return connectFarcasterWallet();
}

async function connectFarcasterWallet() {
  const provider = await getProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  connectedAddr = accounts?.[0] || null;
  await ensureBaseChain(provider);
  return connectedAddr;
}

async function ensureBaseChain(provider) {
  const current = await provider.request({ method: 'eth_chainId' });
  if (current !== BASE_CHAIN_ID_HEX) {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  }
}

async function sendMandatoryTx() {
  const addr = await ensureConnected();
  const provider = await getProvider();
  const tx = {
    from: addr,
    to: '0xA13a9d5Cdc6324dA1Ca6A18Bc9B548904033858C',
    value: '0x9184e72a000', // 0.00001 ETH in wei
  };

  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    });
    console.log("Transaction sent with hash:", hash);
    return hash;
  } catch (err) {
    console.error("Transaction failed:", err);
    throw new Error("Transaction failed");
  }
}

/* ======================= Game Control and Transaction Handling ======================= */
let isTransactionPending = false;

function showEndGamePopup(score) {
  // Display the score in the popup
  document.getElementById('final-score').textContent = score;

  // Show the popup modal
  const popup = document.getElementById('end-game-popup');
  popup.style.display = 'flex';

  // Disable game controls until the transaction is confirmed
  disableGameControls();

  const playAgainButton = document.getElementById('play-again-btn');
  playAgainButton.removeEventListener('click', playAgainListener);  // Reset the listener
  playAgainButton.addEventListener('click', playAgainListener);

  function playAgainListener() {
    if (isTransactionPending) return;

    isTransactionPending = true;

    sendMandatoryTx()
      .then((txHash) => waitForTransactionConfirmation(txHash))
      .then((receipt) => {
        if (receipt.status === '0x1') {
          startGame(); // Restart game after successful transaction
        } else {
          throw new Error('Transaction failed');
        }
      })
      .catch((err) => {
        console.error('Transaction failed:', err);
        alert('Transaction failed. Please try again.');
      })
      .finally(() => {
        isTransactionPending = false;
        enableGameControls();
      });
  }
}

function disableGameControls() {
  const gameElements = document.querySelectorAll('.game-element');
  gameElements.forEach(el => el.setAttribute('disabled', 'true'));
}

function enableGameControls() {
  const gameElements = document.querySelectorAll('.game-element');
  gameElements.forEach(el => el.removeAttribute('disabled'));
}

// Wait for transaction confirmation
async function waitForTransactionConfirmation(txHash) {
  const provider = await getProvider();
  return new Promise((resolve, reject) => {
    const checkTransaction = async () => {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt && receipt.blockNumber) {
          resolve(receipt);
        } else {
          setTimeout(checkTransaction, 2000); // Check every 2 seconds
        }
      } catch (err) {
        reject('Error checking transaction receipt: ' + err.message);
      }
    };
    checkTransaction();
  });
}

/* ======================= Game Flow ======================= */
function startGame() {
  // Reset game state
  score = 0;
  if (scoreEl) scoreEl.textContent = '0';
  if (timeEl) timeEl.textContent = '60';

  // Show game screen and hide home screen
  const home = document.getElementById('screen-home');
  const game = document.getElementById('screen-game');
  home?.classList.remove('active');
  home.style.display = 'none';
  game?.classList.add('active');
  game.style.display = 'block';

  const board = document.getElementById('board');
  buildBoard(board);
  fitBoard();
  startTimer();
}

// Timer function to manage the game countdown
let timerId = null;
function startTimer() {
  stopTimer();
  let time = 60;
  if (timeEl) timeEl.textContent = String(time);
  timerId = setInterval(() => {
    time = Math.max(0, time - 1);
    if (timeEl) timeEl.textContent = String(time);
    if (time <= 0) endGame();
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
}

// Game End Logic
async function endGame() {
  stopTimer();
  showEndGamePopup(score);
}

function fitBoard() {
  const wrap = document.getElementById('game-root');
  const size = Math.min(wrap.clientWidth, wrap.clientHeight) - 40;
  document.documentElement.style.setProperty('--board', `${Math.max(360, Math.min(512, size))}px`);
}

function buildBoard(boardEl) {
  // Initialize the board
  // Implement your board-building logic here
  cells = [];
  types = Array(W * W).fill(0);
  // Setup your board layout and logic for game pieces
}

// Preload assets for the game
async function preload(srcs) {
  try {
    await Promise.all(srcs.map((src) => {
      return new Promise((res) => {
        const img = new Image();
        img.src = src;
        img.onload = img.onerror = res;
      });
    }));
  } catch (err) {
    console.error('Error preloading assets:', err);
  }
}

// Start the game on initial load
window.addEventListener('load', () => showScreen('home'));
