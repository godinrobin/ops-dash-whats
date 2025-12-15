// FB Ads - Zapdata - Content Script

(function() {
  'use strict';

  // State
  let state = {
    whatsappFilter: false,
    minAds: 0,
    autoInject: true,
    selectedAds: new Set(),
    processedAds: new WeakSet(),
    visibleAdsLimit: 50,
    stats: {
      total: 0,
      whatsapp: 0,
      selected: 0
    },
    isLoggedIn: false,
    userEmail: null
  };

  // Performance control flags
  let isInjecting = false;
  let debounceTimer = null;
  let lastInjectionTime = 0;
  let continuousInterval = null;
  const DEBOUNCE_DELAY = 500;
  const THROTTLE_DELAY = 800;
  const MAX_CARDS_PER_BATCH = 200;
  const ADS_PER_LOAD = 30;
  const CONTINUOUS_CHECK_INTERVAL = 2000;

  // WhatsApp Detection patterns
  const WHATSAPP_PATTERNS = {
    ctaStrict: [
      'enviar mensagem no whatsapp',
      'falar no whatsapp',
      'chamar no whatsapp',
      'contato whatsapp',
      'whatsapp',
      'fale pelo whatsapp',
      'chame no whatsapp'
    ],
    textStrict: [
      'whatsapp',
      'whats app',
      'wpp:',
      'zap:',
      'pelo zap',
      'no zap',
      'chama no zap'
    ],
    urlPatterns: [
      /wa\.me\//i,
      /api\.whatsapp\.com/i,
      /wa\.link\//i,
      /whatsapp\.com\/send/i,
      /l\.wl\.co\//i
    ],
    phoneWithContext: /(?:whatsapp|wpp|zap|whats)[\s:]*\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/i
  };

  // Initialize
  async function init() {
    console.log('🚀 FB Ads - Zapdata initialized');

    try {
      const settings = await chrome.storage.local.get(['whatsappFilter', 'minAds', 'accessToken', 'userEmail']);
      state.whatsappFilter = settings.whatsappFilter || false;
      state.minAds = settings.minAds || 0;
      state.autoInject = true;
      state.isLoggedIn = !!settings.accessToken;
      state.userEmail = settings.userEmail || null;
    } catch (e) {
      console.log('Could not load settings, using defaults');
    }

    createFilterBar();
    createLoadMoreButton();
    observeAds();

    scheduleInjection(500);
    scheduleInjection(1500);
    scheduleInjection(3000);

    startContinuousMonitoring();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Continuous monitoring for dynamically loaded cards
  function startContinuousMonitoring() {
    if (continuousInterval) clearInterval(continuousInterval);

    continuousInterval = setInterval(() => {
      const unprocessedCount = countUnprocessedCards();
      if (unprocessedCount > 0) {
        console.log(`🔄 Found ${unprocessedCount} unprocessed cards, injecting...`);
        forceInjectButtons();
      }
    }, CONTINUOUS_CHECK_INTERVAL);
  }

  // Count cards without our buttons
  function countUnprocessedCards() {
    let count = 0;
    const detailButtons = document.querySelectorAll('span, a');

    for (const el of detailButtons) {
      const text = el.textContent?.trim().toLowerCase() || '';
      if (text === 'ver detalhes do anúncio' || text === 'ver resumo') {
        const card = findCardContainer(el);
        if (card && !card.querySelector('.fad-actions-container') && card.dataset.fadProcessed !== 'true') {
          count++;
        }
      }
    }
    return count;
  }

  // Cleanup duplicate buttons
  function cleanupDuplicateButtons() {
    const allCards = document.querySelectorAll('[data-fad-processed="true"]');
    let cleanedCount = 0;

    allCards.forEach(card => {
      const buttons = card.querySelectorAll('.fad-actions-container');
      if (buttons.length > 1) {
        for (let i = 1; i < buttons.length; i++) {
          buttons[i].remove();
          cleanedCount++;
        }
      }
    });

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} duplicate button containers`);
    }
  }

  // Scroll handler
  let scrollTimeout = null;
  function onScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      cleanupDuplicateButtons();
      scheduleInjection(300);
    }, 150);
  }

  // Force injection without throttle
  function forceInjectButtons() {
    isInjecting = false;
    lastInjectionTime = 0;
    safeInjectButtons();
  }

  // Schedule injection with debounce
  function scheduleInjection(delay = DEBOUNCE_DELAY) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      requestIdleCallback ? requestIdleCallback(safeInjectButtons) : setTimeout(safeInjectButtons, 100);
    }, delay);
  }

  // Safe wrapper for injection with throttle
  function safeInjectButtons() {
    const now = Date.now();

    if (isInjecting || (now - lastInjectionTime) < THROTTLE_DELAY) {
      console.log('⏳ Injection throttled');
      return;
    }

    isInjecting = true;
    lastInjectionTime = now;

    try {
      injectButtons();
    } catch (error) {
      console.error('❌ Injection error:', error);
    } finally {
      isInjecting = false;
    }
  }

  // Create Filter Bar
  function createFilterBar() {
    if (document.querySelector('.fad-filter-bar')) return;

    const filterBar = document.createElement('div');
    filterBar.className = 'fad-filter-bar';
    filterBar.innerHTML = `
      <div class="fad-filter-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span class="fad-filter-label">Apenas WhatsApp</span>
        <label class="fad-toggle">
          <input type="checkbox" id="fadWhatsappToggle" ${state.whatsappFilter ? 'checked' : ''}>
          <span class="fad-toggle-slider"></span>
        </label>
      </div>

      <div class="fad-separator"></div>

      <div class="fad-filter-item">
        <span class="fad-filter-label">Mínimo de anúncios:</span>
        <input type="number" class="fad-number-input" id="fadMinAds" min="0" value="${state.minAds}">
      </div>

      <div class="fad-separator"></div>

      <div class="fad-stats">
        <div class="fad-stat">
          <span class="fad-stat-value" id="fadStatTotal">0</span>
          <span class="fad-stat-label">Total</span>
        </div>
        <div class="fad-stat">
          <span class="fad-stat-value" id="fadStatWhatsapp">0</span>
          <span class="fad-stat-label">WhatsApp</span>
        </div>
        <div class="fad-stat">
          <span class="fad-stat-value" id="fadStatSelected">0</span>
          <span class="fad-stat-label">Selecionados</span>
        </div>
      </div>

      <div class="fad-separator"></div>

      <button class="fad-btn-download-all" id="fadDownloadAll" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Baixar Selecionados (<span id="fadSelectedCount">0</span>)
      </button>
    `;

    document.body.appendChild(filterBar);

    document.getElementById('fadWhatsappToggle').addEventListener('change', (e) => {
      state.whatsappFilter = e.target.checked;
      chrome.storage.local.set({ whatsappFilter: state.whatsappFilter });
      applyFilters();
    });

    document.getElementById('fadMinAds').addEventListener('change', (e) => {
      state.minAds = parseInt(e.target.value) || 0;
      chrome.storage.local.set({ minAds: state.minAds });
      applyFilters();
    });

    document.getElementById('fadDownloadAll').addEventListener('click', downloadSelected);
  }

  // Observe for new ads
  function observeAds() {
    let mutationCount = 0;
    const MAX_MUTATIONS_PER_SECOND = 10;
    let mutationResetTimer = null;

    const observer = new MutationObserver((mutations) => {
      mutationCount++;
      if (mutationCount > MAX_MUTATIONS_PER_SECOND) {
        return;
      }

      if (!mutationResetTimer) {
        mutationResetTimer = setTimeout(() => {
          mutationCount = 0;
          mutationResetTimer = null;
        }, 1000);
      }

      let hasNewContent = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && node.offsetHeight > 100) {
              hasNewContent = true;
              break;
            }
          }
        }
        if (hasNewContent) break;
      }

      if (hasNewContent) {
        scheduleInjection();
      }
    });

    const mainContent = document.querySelector('[role="main"]') || document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
  }

  // Find ad cards
  function findAdCards() {
    const adContainers = new Set();
    let cardsFound = 0;

    const detailButtons = document.querySelectorAll('a[href*="ad_detail"], span');

    for (const el of detailButtons) {
      if (cardsFound >= MAX_CARDS_PER_BATCH) break;

      const text = el.textContent?.trim().toLowerCase() || '';
      if (text === 'ver detalhes do anúncio' ||
          text === 'see ad details' ||
          text === 'ver resumo' ||
          text === 'see summary') {

        const card = findCardContainer(el);
        if (card && !adContainers.has(card)) {
          adContainers.add(card);
          cardsFound++;
        }
      }
    }

    const sponsoredElements = document.querySelectorAll('span');
    for (const el of sponsoredElements) {
      if (cardsFound >= MAX_CARDS_PER_BATCH) break;

      const text = el.textContent?.trim().toLowerCase() || '';
      if (text === 'patrocinado' || text === 'sponsored') {
        const card = findCardContainer(el);
        if (card && !adContainers.has(card)) {
          adContainers.add(card);
          cardsFound++;
        }
      }
    }

    console.log(`📊 Found ${adContainers.size} ad cards`);
    return [...adContainers];
  }

  // Find parent card container
  function findCardContainer(element) {
    let parent = element.parentElement;
    for (let i = 0; i < 12 && parent; i++) {
      if (parent.offsetWidth > 250 && parent.offsetHeight > 300) {
        const hasMedia = parent.querySelector('img, video');
        const hasText = parent.textContent && parent.textContent.length > 50;
        if (hasMedia && hasText && !parent.closest('.fad-actions-container')) {
          return parent;
        }
      }
      parent = parent.parentElement;
    }
    return null;
  }

  // Get number of active ads from card
  function getActiveAdsCount(card) {
    const text = card.textContent || '';

    const ptMatch = text.match(/(\d+)\s*anúncios?\s*usam/i);
    if (ptMatch) return parseInt(ptMatch[1]) || 1;

    const enMatch = text.match(/(\d+)\s*ads?\s*use/i);
    if (enMatch) return parseInt(enMatch[1]) || 1;

    return 1;
  }

  // Get ad library link from card - extracts the specific ad ID
  function getAdLibraryLink(card) {
    const cardText = card.textContent || '';
    
    // Method 1: Look for "Copiar link do anúncio" button/link in dropdown
    const copyLinkElements = card.querySelectorAll('a[href*="facebook.com/ads/library"], a[role="link"], div[role="button"]');
    for (const el of copyLinkElements) {
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes('copiar link') || text.includes('copy link')) {
        // Try to get href
        if (el.href && el.href.includes('id=')) {
          const urlIdMatch = el.href.match(/[?&]id=(\d{10,20})/);
          if (urlIdMatch && urlIdMatch[1]) {
            console.log('📌 Found ad ID via copy link button:', urlIdMatch[1]);
            return `https://www.facebook.com/ads/library/?id=${urlIdMatch[1]}`;
          }
        }
      }
    }
    
    // Method 2: Look for "Identificação da biblioteca:" text and extract the ID
    const patterns = [
      /Identifica[çc][ãa]o\s*da\s*biblioteca[:\s]*(\d{10,20})/i,
      /Library\s*ID[:\s]*(\d{10,20})/i,
    ];
    
    for (const pattern of patterns) {
      const match = cardText.match(pattern);
      if (match && match[1]) {
        console.log('📌 Found ad ID via text pattern:', match[1]);
        return `https://www.facebook.com/ads/library/?id=${match[1]}`;
      }
    }
    
    // Method 3: Look for links with ad ID in href
    const allLinks = card.querySelectorAll('a[href*="id="]');
    for (const link of allLinks) {
      const href = link.href || '';
      const urlIdMatch = href.match(/[?&]id=(\d{10,20})/);
      if (urlIdMatch && urlIdMatch[1]) {
        console.log('📌 Found ad ID via link href:', urlIdMatch[1]);
        return `https://www.facebook.com/ads/library/?id=${urlIdMatch[1]}`;
      }
    }
    
    // Method 4: Look for any long number sequence that could be an ad ID (15-20 digits)
    // Match the ID shown next to "Identificação da biblioteca:"
    const longNumberMatch = cardText.match(/biblioteca[:\s]*(\d{13,20})/i);
    if (longNumberMatch && longNumberMatch[1]) {
      console.log('📌 Found ad ID via biblioteca number:', longNumberMatch[1]);
      return `https://www.facebook.com/ads/library/?id=${longNumberMatch[1]}`;
    }
    
    // Method 5: Extract any 16-digit number (typical FB ad IDs)
    const allNumbers = cardText.match(/\b(\d{16})\b/g);
    if (allNumbers && allNumbers.length > 0) {
      // Use the first 16-digit number found (likely the ad ID)
      console.log('📌 Found potential ad ID via 16-digit number:', allNumbers[0]);
      return `https://www.facebook.com/ads/library/?id=${allNumbers[0]}`;
    }
    
    // Fallback - log warning and use page URL
    console.warn('⚠️ Could not extract ad ID from card. Card text sample:', cardText.substring(0, 300));
    return window.location.href;
  }

  // Inject buttons into ad cards
  function injectButtons() {
    const startTime = performance.now();
    const adCards = findAdCards();
    let totalCount = 0;
    let whatsappCount = 0;
    let processedCount = 0;

    cleanupDuplicateButtons();

    for (const card of adCards) {
      if (card.dataset.fadProcessed === 'true' || card.querySelector('.fad-actions-container')) {
        const isWhatsapp = card.dataset.fadWhatsapp === 'true';
        if (isWhatsapp) whatsappCount++;
        totalCount++;
        continue;
      }

      card.dataset.fadProcessed = 'true';
      state.processedAds.add(card);
      totalCount++;
      processedCount++;

      const cardId = `fad-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isWhatsapp = isWhatsAppAd(card);
      const activeAdsCount = getActiveAdsCount(card);

      if (isWhatsapp) {
        whatsappCount++;
        card.classList.add('fad-whatsapp-highlight');
      }

      card.dataset.fadId = cardId;
      card.dataset.fadWhatsapp = isWhatsapp.toString();
      card.dataset.fadAdsCount = activeAdsCount.toString();

      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'fad-actions-container';
      actionsContainer.innerHTML = `
        <button class="fad-btn fad-btn-download" data-card-id="${cardId}" title="Baixar mídia">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          Baixar
        </button>
        <button class="fad-btn fad-btn-save" data-card-id="${cardId}" title="Salvar no Zapdata">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
          Salvar Oferta
        </button>
        <div class="fad-checkbox-container">
          <input type="checkbox" class="fad-checkbox" id="${cardId}" data-card-id="${cardId}">
          <label class="fad-checkbox-label" for="${cardId}">Sel.</label>
        </div>
        ${isWhatsapp ? `
          <span class="fad-whatsapp-badge" title="Anúncio relacionado ao WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </span>
        ` : ''}
      `;

      // Event listeners
      const downloadBtn = actionsContainer.querySelector('.fad-btn-download');
      const saveBtn = actionsContainer.querySelector('.fad-btn-save');
      const checkbox = actionsContainer.querySelector('.fad-checkbox');

      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        downloadAd(card, downloadBtn);
      });

      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSaveOfferModal(card);
      });

      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelection(cardId, e.target.checked);
      });

      card.style.position = 'relative';
      card.appendChild(actionsContainer);
    }

    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(`✅ Processed ${processedCount} new cards in ${elapsed}ms`);

    state.stats.total = totalCount;
    state.stats.whatsapp = whatsappCount;
    updateStats();
    applyFilters();
  }

  // Show save offer modal
  function showSaveOfferModal(card) {
    // Check if user is logged in
    chrome.storage.local.get(['accessToken'], async (data) => {
      if (!data.accessToken) {
        showToast('Faça login na extensão primeiro!', 'error');
        return;
      }

      // Remove existing modal if any
      const existingModal = document.querySelector('.fad-modal-overlay');
      if (existingModal) existingModal.remove();

      const adLibraryLink = getAdLibraryLink(card);

      const modalOverlay = document.createElement('div');
      modalOverlay.className = 'fad-modal-overlay';
      modalOverlay.innerHTML = `
        <div class="fad-modal">
          <div class="fad-modal-header">
            <h3>Salvar Oferta no Zapdata</h3>
            <button class="fad-modal-close" id="fadModalClose">&times;</button>
          </div>
          <div class="fad-modal-body">
            <div class="fad-modal-input-group">
              <label for="fadOfferName">Nome da Oferta</label>
              <input type="text" id="fadOfferName" placeholder="Ex: Curso de Marketing Digital" maxlength="100">
            </div>
            <div class="fad-modal-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>A oferta será salva no seu Track Ofertas</span>
            </div>
          </div>
          <div class="fad-modal-footer">
            <button class="fad-modal-btn fad-modal-btn-cancel" id="fadModalCancel">Cancelar</button>
            <button class="fad-modal-btn fad-modal-btn-save" id="fadModalSave">
              <span id="fadSaveBtnText">Salvar</span>
              <span id="fadSaveSpinner" class="fad-spinner" style="display: none;"></span>
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modalOverlay);

      // Focus on input
      setTimeout(() => {
        document.getElementById('fadOfferName').focus();
      }, 100);

      // Event listeners
      document.getElementById('fadModalClose').addEventListener('click', () => modalOverlay.remove());
      document.getElementById('fadModalCancel').addEventListener('click', () => modalOverlay.remove());
      
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) modalOverlay.remove();
      });

      document.getElementById('fadModalSave').addEventListener('click', async () => {
        const offerName = document.getElementById('fadOfferName').value.trim();
        
        if (!offerName) {
          showToast('Digite o nome da oferta', 'error');
          return;
        }

        const saveBtn = document.getElementById('fadModalSave');
        const saveBtnText = document.getElementById('fadSaveBtnText');
        const saveSpinner = document.getElementById('fadSaveSpinner');

        saveBtn.disabled = true;
        saveBtnText.style.display = 'none';
        saveSpinner.style.display = 'inline-block';

        try {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              action: 'saveOffer',
              offerName: offerName,
              adLibraryLink: adLibraryLink
            }, resolve);
          });

          if (response.success) {
            showToast('Oferta salva com sucesso!', 'success');
            modalOverlay.remove();
          } else {
            showToast(response.error || 'Erro ao salvar', 'error');
          }
        } catch (error) {
          showToast('Erro de conexão', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtnText.style.display = 'inline';
          saveSpinner.style.display = 'none';
        }
      });

      // Enter key to save
      document.getElementById('fadOfferName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('fadModalSave').click();
        }
      });
    });
  }

  // Check if ad is WhatsApp related
  function isWhatsAppAd(card) {
    const text = (card.textContent || '').toLowerCase();

    for (const keyword of WHATSAPP_PATTERNS.textStrict) {
      if (text.includes(keyword)) {
        return true;
      }
    }

    const links = card.querySelectorAll('a[href]');
    for (const link of links) {
      const href = (link.href || '').toLowerCase();
      for (const pattern of WHATSAPP_PATTERNS.urlPatterns) {
        if (pattern.test(href)) {
          return true;
        }
      }
    }

    if (WHATSAPP_PATTERNS.phoneWithContext.test(text)) {
      return true;
    }

    const buttons = card.querySelectorAll('a, button, [role="button"]');
    for (const btn of buttons) {
      const btnText = (btn.textContent || '').toLowerCase().trim();
      for (const ctaPattern of WHATSAPP_PATTERNS.ctaStrict) {
        if (btnText.includes(ctaPattern)) {
          return true;
        }
      }
    }

    return false;
  }

  // Download ad media
  async function downloadAd(card, button) {
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span class="fad-spinner"></span>';
    button.disabled = true;

    try {
      const video = card.querySelector('video');
      if (video) {
        const source = video.querySelector('source');
        const videoUrl = source?.src || video.src;
        if (videoUrl && !videoUrl.startsWith('blob:')) {
          await downloadFile(videoUrl, 'video');
          showSuccess(button, originalHTML);
          return;
        }
      }

      const images = [...card.querySelectorAll('img')];
      const validImages = images.filter(img => {
        const src = img.src || '';
        return (src.includes('scontent') || src.includes('fbcdn')) &&
               img.naturalWidth > 100 && img.naturalHeight > 100;
      });

      validImages.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

      if (validImages.length > 0) {
        await downloadFile(validImages[0].src, 'image');
        showSuccess(button, originalHTML);
        return;
      }

      const elementsWithBg = card.querySelectorAll('[style*="background"]');
      for (const el of elementsWithBg) {
        const style = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
        const match = style.match(/url\(["']?([^"')]+)["']?\)/);
        if (match && match[1] && (match[1].includes('scontent') || match[1].includes('fbcdn'))) {
          await downloadFile(match[1], 'image');
          showSuccess(button, originalHTML);
          return;
        }
      }

      throw new Error('Mídia não encontrada');
    } catch (error) {
      console.error('Download error:', error);
      button.innerHTML = originalHTML;
      button.disabled = false;
      showToast('Erro: ' + error.message, 'error');
    }
  }

  // Download file helper
  function downloadFile(url, type) {
    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const extension = type === 'video' ? 'mp4' : 'jpg';

      chrome.runtime.sendMessage({
        action: 'download',
        url: url,
        filename: `fb_ad_${timestamp}.${extension}`
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Falha no download'));
        }
      });
    });
  }

  // Show success state on button
  function showSuccess(button, originalHTML) {
    button.classList.add('fad-btn-success');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      OK!
    `;
    button.disabled = false;

    setTimeout(() => {
      button.classList.remove('fad-btn-success');
      button.innerHTML = originalHTML;
    }, 2000);
  }

  // Toggle selection
  function toggleSelection(cardId, isSelected) {
    if (isSelected) {
      state.selectedAds.add(cardId);
    } else {
      state.selectedAds.delete(cardId);
    }

    state.stats.selected = state.selectedAds.size;
    updateStats();

    const downloadAllBtn = document.getElementById('fadDownloadAll');
    const selectedCountSpan = document.getElementById('fadSelectedCount');

    if (downloadAllBtn) {
      downloadAllBtn.disabled = state.selectedAds.size === 0;
    }
    if (selectedCountSpan) {
      selectedCountSpan.textContent = state.selectedAds.size;
    }
  }

  // Download selected ads
  async function downloadSelected() {
    const button = document.getElementById('fadDownloadAll');
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span class="fad-spinner"></span> Baixando...';
    button.disabled = true;

    let downloaded = 0;
    const total = state.selectedAds.size;

    for (const cardId of state.selectedAds) {
      const card = document.querySelector(`[data-fad-id="${cardId}"]`);

      if (card) {
        const downloadBtn = card.querySelector('.fad-btn-download');
        if (downloadBtn) {
          await downloadAd(card, downloadBtn);
          downloaded++;
          button.innerHTML = `<span class="fad-spinner"></span> ${downloaded}/${total}`;
        }
      }
    }

    button.innerHTML = originalHTML;
    button.disabled = state.selectedAds.size === 0;
    showToast(`${downloaded} arquivo(s) baixado(s)!`, 'success');
  }

  // Apply filters
  function applyFilters() {
    const adCards = document.querySelectorAll('[data-fad-id]');
    let visibleCount = 0;
    let whatsappVisibleCount = 0;
    let shownCount = 0;
    let totalWithButtons = 0;

    adCards.forEach(card => {
      const hasButtons = card.querySelector('.fad-actions-container');

      if (!hasButtons) {
        // Card without buttons - just skip, don't hide
        return;
      }

      totalWithButtons++;
      let shouldShow = true;
      const isWhatsapp = card.dataset.fadWhatsapp === 'true';
      const adsCount = parseInt(card.dataset.fadAdsCount) || 1;

      if (state.whatsappFilter && !isWhatsapp) {
        shouldShow = false;
      }

      if (state.minAds > 0 && adsCount < state.minAds) {
        shouldShow = false;
      }

      if (shouldShow) {
        visibleCount++;
        if (isWhatsapp) whatsappVisibleCount++;

        if (shownCount < state.visibleAdsLimit) {
          // Show card - only reset display and visibility, keep position for buttons
          card.style.display = '';
          card.style.visibility = '';
          card.style.opacity = '';
          card.style.pointerEvents = '';
          card.style.position = 'relative';
          card.classList.remove('fad-hidden');
          shownCount++;
        } else {
          // Hide excess cards
          card.style.display = 'none';
          card.classList.add('fad-hidden');
        }
      } else {
        // Hide filtered-out cards
        card.style.display = 'none';
        card.classList.add('fad-hidden');
      }
    });

    const totalStat = document.getElementById('fadStatTotal');
    if (totalStat) {
      totalStat.textContent = shownCount;
    }

    state.stats.total = totalWithButtons;
    state.stats.whatsapp = whatsappVisibleCount;
    updateStats();

    updateLoadMoreButton(visibleCount, shownCount);
  }

  // Create Load More button
  function createLoadMoreButton() {
    if (document.querySelector('.fad-load-more-container')) return;

    const container = document.createElement('div');
    container.className = 'fad-load-more-container';
    container.innerHTML = `
      <button class="fad-btn-load-more" id="fadLoadMore">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        Carregar Mais Anúncios
      </button>
      <span class="fad-load-more-info" id="fadLoadMoreInfo"></span>
    `;
    document.body.appendChild(container);

    document.getElementById('fadLoadMore').addEventListener('click', loadMoreAds);
  }

  // Load more ads
  function loadMoreAds() {
    state.visibleAdsLimit += ADS_PER_LOAD;
    applyFilters();

    const visibleCards = document.querySelectorAll('[data-fad-id]:not(.fad-hidden)');
    if (visibleCards.length > 0) {
      const lastCard = visibleCards[visibleCards.length - 1];
      lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Update load more button
  function updateLoadMoreButton(totalAvailable, currentShown) {
    const container = document.querySelector('.fad-load-more-container');
    const button = document.getElementById('fadLoadMore');
    const info = document.getElementById('fadLoadMoreInfo');

    if (!container || !button || !info) return;

    const remaining = totalAvailable - currentShown;

    if (remaining > 0) {
      container.style.display = 'flex';
      info.textContent = `Mostrando ${currentShown} de ${totalAvailable} anúncios`;
      button.style.opacity = '1';
      button.style.pointerEvents = 'auto';
    } else {
      container.style.display = 'flex';
      info.textContent = `Mostrando todos os ${currentShown} anúncios`;
      button.style.opacity = '0.5';
      button.style.pointerEvents = 'none';
    }
  }

  // Update stats display
  function updateStats() {
    const elements = {
      total: document.getElementById('fadStatTotal'),
      whatsapp: document.getElementById('fadStatWhatsapp'),
      selected: document.getElementById('fadStatSelected')
    };

    if (elements.total) elements.total.textContent = state.stats.total;
    if (elements.whatsapp) elements.whatsapp.textContent = state.stats.whatsapp;
    if (elements.selected) elements.selected.textContent = state.stats.selected;

    try {
      chrome.runtime.sendMessage({
        action: 'updateStats',
        total: state.stats.total,
        whatsapp: state.stats.whatsapp,
        selected: state.stats.selected
      });
    } catch (e) {}
  }

  // Show toast notification
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.fad-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `fad-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'getStats':
          sendResponse({
            total: state.stats.total,
            whatsapp: state.stats.whatsapp,
            selected: state.stats.selected
          });
          break;
        case 'updateFilter':
          if (message.filter === 'whatsapp') {
            state.whatsappFilter = message.value;
            const toggle = document.getElementById('fadWhatsappToggle');
            if (toggle) toggle.checked = message.value;
          } else if (message.filter === 'minAds') {
            state.minAds = message.value;
            const input = document.getElementById('fadMinAds');
            if (input) input.value = message.value;
          }
          applyFilters();
          break;
        case 'selectAll':
          document.querySelectorAll('.fad-checkbox').forEach(cb => {
            cb.checked = true;
            toggleSelection(cb.dataset.cardId, true);
          });
          break;
        case 'userLoggedIn':
          state.isLoggedIn = true;
          state.userEmail = message.email;
          showToast('Login realizado!', 'success');
          break;
        case 'userLoggedOut':
          state.isLoggedIn = false;
          state.userEmail = null;
          showToast('Logout realizado', 'info');
          break;
        case 'forceInject':
          forceInjectButtons();
          sendResponse({ success: true });
          break;
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
    return true;
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
