// Popup Script for FB Ads - Zapdata

const API_URL = 'https://dcjizoulbggsavizbukq.supabase.co/functions/v1/extension-auth';

document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is logged in
  const authData = await chrome.storage.local.get(['accessToken', 'userEmail']);
  
  if (authData.accessToken) {
    // Verify token is still valid
    const isValid = await verifyToken(authData.accessToken);
    if (isValid) {
      showMainContent(authData.userEmail);
    } else {
      // Token expired, clear and show login
      await chrome.storage.local.remove(['accessToken', 'userEmail']);
      showLoginSection();
    }
  } else {
    showLoginSection();
  }

  // Login form handler
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  
  // Logout handler
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
});

async function verifyToken(token) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_token', access_token: token })
    });
    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginSpinner = document.getElementById('loginSpinner');
  const errorDiv = document.getElementById('loginError');
  
  // Show loading state
  loginBtn.disabled = true;
  loginBtnText.style.display = 'none';
  loginSpinner.style.display = 'inline-block';
  errorDiv.textContent = '';
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao fazer login');
    }
    
    // Save auth data
    await chrome.storage.local.set({
      accessToken: data.access_token,
      userEmail: data.email
    });
    
    // Notify content script about login
    notifyContentScript({ action: 'userLoggedIn', email: data.email });
    
    showMainContent(data.email);
    
  } catch (error) {
    errorDiv.textContent = error.message;
  } finally {
    loginBtn.disabled = false;
    loginBtnText.style.display = 'inline';
    loginSpinner.style.display = 'none';
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['accessToken', 'userEmail']);
  notifyContentScript({ action: 'userLoggedOut' });
  showLoginSection();
}

function showLoginSection() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'none';
}

async function showMainContent(email) {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainContent').style.display = 'flex';
  document.getElementById('userEmail').textContent = email || 'Usuário';

  // Check if we're on the Facebook Ads Library page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnAdsLibrary = tab?.url?.includes('facebook.com/ads/library');

  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  if (isOnAdsLibrary) {
    statusDot.classList.add('active');
    statusText.textContent = 'Conectado à Biblioteca de Anúncios';

    // Get stats from content script
    chrome.tabs.sendMessage(tab.id, { action: 'getStats' }, (response) => {
      if (response) {
        document.getElementById('totalAds').textContent = response.total || 0;
        document.getElementById('whatsappAds').textContent = response.whatsapp || 0;
        document.getElementById('selectedAds').textContent = response.selected || 0;
      }
    });
  } else {
    statusDot.classList.add('inactive');
    statusText.textContent = 'Acesse a Biblioteca de Anúncios do Facebook';
  }

  // Event Listeners
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.reload(tab.id);
    }
  });
}

async function sendToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('facebook.com/ads/library')) {
    chrome.tabs.sendMessage(tab.id, message);
  }
}

async function notifyContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('facebook.com/ads/library')) {
    chrome.tabs.sendMessage(tab.id, message);
  }
}

// Listen for stats updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    document.getElementById('totalAds').textContent = message.total || 0;
    document.getElementById('whatsappAds').textContent = message.whatsapp || 0;
    document.getElementById('selectedAds').textContent = message.selected || 0;
  }
});