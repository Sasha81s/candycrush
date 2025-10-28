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
    console.log("Transaction hash:", hash);
    return hash;
  } catch (err) {
    console.error("Transaction failed:", err);
    throw new Error("Transaction failed");
  }
}

/* ======================= Game Control and Transaction Handling ======================= */
let isTransactionPending = false; // Tracks if the transaction is in progress

function showEndGamePopup(score) {
  // Display the score in the popup
  document.getElementById('final-score').textContent = score;

  // Show the popup modal
  const popup = document.getElementById('end-game-popup');
  popup.style.display = 'flex';  // Ensure it's visible

  // Disable game controls until the transaction is confirmed
  disableGameControls();

  // Reset Play Again button listener in case of a previous failed attempt
  const playAgainButton = document.getElementById('play-again-btn');
  
  // Remove existing event listener to prevent multiple bindings
  playAgainButton.removeEventListener('click', playAgainListener); 
  
  // Add fresh event listener
  playAgainButton.addEventListener('click', playAgainListener);  

  // Play Again button functionality (trigger transaction first)
  function playAgainListener() {
    if (isTransactionPending) return;  // Prevent further actions if transaction is in progress

    // Mark transaction as pending
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

async function endGame() {
  stopTimer();
  showEndGamePopup(score);
}

/* ======================= Assets Preload ======================= */
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

// Share button functionality (sync-safe)
const shareBtn = document.getElementById('share-btn');

shareBtn.onclick = async () => {
  const shareText = `I just scored ${score} points in Candy Crush Mini!`;
  const shareUrl = 'https://farcaster.xyz/miniapps/C6_Zeg_0a7CL/candycrush';

  try {
    // Attempt to copy the content to clipboard first
    await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
    showCustomModal('Link copied to clipboard! You can now share it anywhere.');
  } catch (err) {
    console.error('Clipboard copy failed', err);
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
