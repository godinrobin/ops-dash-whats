// FB Ads - Zapdata - Background Service Worker

const API_URL = 'https://dcjizoulbggsavizbukq.supabase.co/functions/v1/extension-auth';

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    handleDownload(message.url, message.filename)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'saveOffer') {
    handleSaveOffer(message.offerName, message.adLibraryLink)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'updateStats') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

// Save offer to Zapdata
async function handleSaveOffer(offerName, adLibraryLink) {
  try {
    const authData = await chrome.storage.local.get(['accessToken']);
    
    if (!authData.accessToken) {
      return { success: false, error: 'Você precisa fazer login primeiro' };
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_offer',
        access_token: authData.accessToken,
        offer_name: offerName,
        ad_library_link: adLibraryLink
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Erro ao salvar oferta' };
    }

    return { success: true, message: 'Oferta salva com sucesso!' };
  } catch (error) {
    console.error('Save offer error:', error);
    return { success: false, error: 'Erro de conexão' };
  }
}

// Download file
async function handleDownload(url, filename) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: objectUrl,
      filename: `FB_Ads/${filename}`,
      saveAs: false
    });

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    return true;
  } catch (fetchError) {
    console.log('Fetch failed, trying direct download:', fetchError);

    try {
      await chrome.downloads.download({
        url: url,
        filename: `FB_Ads/${filename}`,
        saveAs: false
      });
      return true;
    } catch (downloadError) {
      throw new Error('Não foi possível baixar o arquivo');
    }
  }
}

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      whatsappFilter: false,
      minAds: 0,
      autoInject: true
    });

    console.log('FB Ads - Zapdata installed successfully!');
  }
});

// Handle extension icon click when not on ads library
chrome.action.onClicked.addListener((tab) => {
  if (!tab.url?.includes('facebook.com/ads/library')) {
    chrome.tabs.create({
      url: 'https://www.facebook.com/ads/library/'
    });
  }
});
