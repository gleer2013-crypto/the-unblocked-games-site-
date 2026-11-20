import './style.css';

const STORAGE_FAVORITES_KEY = 'arcadedeck_favorites';
const STORAGE_CUSTOM_GAMES_KEY = 'arcadedeck_custom_games';

const state = {
  baseGames: [],
  customGames: [],
  favorites: new Set(),
  activeCategory: 'All',
  searchQuery: '',
  activeGameId: null,
  proxyOpen: false,
  proxyHistory: [],
  wideMode: false,
};

const els = {
  heroSection: document.getElementById('hero-section'),
  heroPlayBtn: document.getElementById('hero-play-btn'),
  heroProxyBtn: document.getElementById('hero-proxy-btn'),
  heroFeaturedCard: document.getElementById('hero-featured-card'),
  heroFeaturedImg: document.getElementById('hero-featured-img'),
  heroFeaturedTitle: document.getElementById('hero-featured-title'),
  heroFeaturedMeta: document.getElementById('hero-featured-meta'),

  proxySection: document.getElementById('proxy-section'),
  proxyCloseBtn: document.getElementById('proxy-close-btn'),
  proxyForm: document.getElementById('proxy-form'),
  proxyInput: document.getElementById('proxy-input'),
  proxyBackBtn: document.getElementById('proxy-back-btn'),
  proxyReloadBtn: document.getElementById('proxy-reload-btn'),
  proxyEmptyState: document.getElementById('proxy-empty-state'),
  proxyIframe: document.getElementById('proxy-iframe'),
  openProxyNavBtn: document.getElementById('open-proxy-nav-btn'),
  footerProxyBtn: document.getElementById('footer-proxy-btn'),

  playerSection: document.getElementById('player-section'),
  playerContainer: document.getElementById('player-container'),
  playerBackBtn: document.getElementById('player-back-btn'),
  playerTitle: document.getElementById('player-title'),
  playerMeta: document.getElementById('player-meta'),
  playerFavoriteBtn: document.getElementById('player-favorite-btn'),
  playerReloadBtn: document.getElementById('player-reload-btn'),
  playerTheaterBtn: document.getElementById('player-theater-btn'),
  playerFullscreenBtn: document.getElementById('player-fullscreen-btn'),
  iframeStage: document.getElementById('iframe-stage'),
  playerDescription: document.getElementById('player-description'),
  playerControls: document.getElementById('player-controls'),

  catalogSection: document.getElementById('catalog-section'),
  catalogCount: document.getElementById('catalog-count'),
  catalogStatus: document.getElementById('catalog-status'),
  gamesGrid: document.getElementById('games-grid'),
  searchInput: document.getElementById('search-input'),
  categoryTabs: document.getElementById('category-tabs'),

  randomGameBtn: document.getElementById('random-game-btn'),
  brandHomeLink: document.getElementById('brand-home-link'),
  footerJsonBtn: document.getElementById('footer-json-btn'),

  jsonModal: document.getElementById('json-modal'),
  closeJsonModalBtn: document.getElementById('close-json-modal-btn'),
  addGameForm: document.getElementById('add-game-form'),
  customTitle: document.getElementById('custom-title'),
  customCategory: document.getElementById('custom-category'),
  customControls: document.getElementById('custom-controls'),
  customDescription: document.getElementById('custom-description'),
  customIframe: document.getElementById('custom-iframe'),
  addGameFeedback: document.getElementById('add-game-feedback'),
  jsonPreview: document.getElementById('json-preview'),
  copyJsonBtn: document.getElementById('copy-json-btn'),
  downloadJsonBtn: document.getElementById('download-json-btn'),
};

function loadLocalState() {
  try {
    const savedFavs = JSON.parse(localStorage.getItem(STORAGE_FAVORITES_KEY) || '[]');
    if (Array.isArray(savedFavs)) {
      state.favorites = new Set(savedFavs);
    }
  } catch {
    state.favorites = new Set();
  }

  try {
    const savedCustom = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_GAMES_KEY) || '[]');
    if (Array.isArray(savedCustom)) {
      state.customGames = savedCustom;
    }
  } catch {
    state.customGames = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch {}
}

function saveCustomGames() {
  try {
    localStorage.setItem(STORAGE_CUSTOM_GAMES_KEY, JSON.stringify(state.customGames));
  } catch {}
}

function getAllGames() {
  return [...state.baseGames, ...state.customGames];
}

function isSafeIframeSrc(src) {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildIframeElement(iframeHtml, fallbackTitle) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(iframeHtml || ''), 'text/html');
  const parsedIframe = doc.querySelector('iframe');
  if (!parsedIframe) return null;

  const src = parsedIframe.getAttribute('src') || '';
  if (!isSafeIframeSrc(src)) return null;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = parsedIframe.getAttribute('title') || fallbackTitle || 'Game';
  iframe.loading = parsedIframe.getAttribute('loading') || 'eager';
  iframe.referrerPolicy = 'no-referrer';
  iframe.setAttribute('tabindex', '0');

  if (parsedIframe.hasAttribute('allowfullscreen')) {
    iframe.allowFullscreen = true;
  }
  const allowAttr = parsedIframe.getAttribute('allow');
  iframe.setAttribute(
    'allow',
    allowAttr || 'autoplay; fullscreen; gamepad; pointer-lock; keyboard-map'
  );

  return iframe;
}

function normalizeIframeInput(rawInput, title) {
  const trimmed = rawInput.trim();
  if (trimmed.toLowerCase().includes('<iframe')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const el = doc.querySelector('iframe');
    if (!el) return null;
    const src = el.getAttribute('src') || '';
    if (!isSafeIframeSrc(src)) return null;
    const safeTitle = (el.getAttribute('title') || title).replace(/"/g, '&quot;');
    const safeSrc = src.replace(/"/g, '&quot;');
    return `<iframe src="${safeSrc}" title="${safeTitle}" loading="lazy" allowfullscreen></iframe>`;
  }

  if (isSafeIframeSrc(trimmed)) {
    const safeTitle = title.replace(/"/g, '&quot;');
    const safeSrc = trimmed.replace(/"/g, '&quot;');
    return `<iframe src="${safeSrc}" title="${safeTitle}" loading="lazy" allowfullscreen></iframe>`;
  }

  return null;
}

function renderFeaturedHero() {
  const games = getAllGames();
  if (!games.length) return;
  const featured = games.find((g) => g.featured) || games[0];

  els.heroFeaturedTitle.textContent = featured.title;
  els.heroFeaturedMeta.textContent = `${featured.category} · ${featured.controls}`;
  els.heroPlayBtn.textContent = `Play ${featured.title}`;

  if (featured.thumbnail) {
    els.heroFeaturedImg.src = featured.thumbnail;
    els.heroFeaturedImg.alt = `${featured.title} preview artwork`;
    els.heroFeaturedImg.classList.remove('hidden');
  } else {
    els.heroFeaturedImg.classList.add('hidden');
  }

  els.heroFeaturedImg.onerror = () => {
    els.heroFeaturedImg.classList.add('hidden');
  };

  const launchFeatured = () => launchGame(featured.id);
  els.heroPlayBtn.onclick = launchFeatured;
  els.heroFeaturedCard.onclick = launchFeatured;
  els.heroFeaturedCard.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      launchFeatured();
    }
  };
}

function updateCategoryTabsUI() {
  const buttons = els.categoryTabs.querySelectorAll('.filter-tab');
  buttons.forEach((btn) => {
    const cat = btn.getAttribute('data-category');
    const isActive = cat === state.activeCategory;
    if (isActive) {
      btn.className =
        'filter-tab rounded-md bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-[#111318] transition-colors whitespace-nowrap shrink-0 cursor-pointer';
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.className =
        'filter-tab rounded-md px-3 py-1.5 text-xs font-medium text-[#9CA3AF] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer';
      btn.setAttribute('aria-selected', 'false');
    }
  });
}

function getFilteredGames() {
  const query = state.searchQuery.trim().toLowerCase();
  return getAllGames().filter((game) => {
    const matchesCategory =
      state.activeCategory === 'All' ||
      (state.activeCategory === 'Favorites'
        ? state.favorites.has(game.id)
        : game.category === state.activeCategory);

    if (!matchesCategory) return false;
    if (!query) return true;

    return (
      game.title.toLowerCase().includes(query) ||
      game.category.toLowerCase().includes(query) ||
      (game.description || '').toLowerCase().includes(query)
    );
  });
}

function createFallbackArt(title) {
  const wrapper = document.createElement('div');
  wrapper.className =
    'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#232836] to-[#151821] px-4 text-center';
  wrapper.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="text-[#9CA3AF]" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="4"></rect>
      <path d="M6 12h4M8 10v4"></path>
      <circle cx="15.5" cy="11" r="1"></circle>
      <circle cx="17.5" cy="13" r="1"></circle>
    </svg>
    <span class="font-display text-sm font-semibold text-[#D1D5DB]"></span>
  `;
  wrapper.querySelector('span').textContent = title;
  return wrapper;
}

function renderCatalog() {
  updateCategoryTabsUI();
  const filtered = getFilteredGames();
  const total = getAllGames().length;

  els.catalogCount.textContent = `${filtered.length} of ${total} ${total === 1 ? 'game' : 'games'} shown`;
  els.gamesGrid.innerHTML = '';

  if (filtered.length === 0) {
    els.catalogStatus.classList.remove('hidden');
    els.catalogStatus.innerHTML = `
      <p class="text-base font-medium text-white">No matching games found</p>
      <p class="mt-1 text-sm text-[#9CA3AF]">Try clearing your search or switching category filters.</p>
      <button type="button" id="reset-filters-btn" class="mt-4 rounded-lg border border-white/15 bg-[#191C24] px-4 py-2 text-xs font-medium text-white hover:border-white/30 cursor-pointer">
        Reset Filters
      </button>
    `;
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.activeCategory = 'All';
        state.searchQuery = '';
        els.searchInput.value = '';
        renderCatalog();
      });
    }
    return;
  }

  els.catalogStatus.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  filtered.forEach((game) => {
    const isFav = state.favorites.has(game.id);
    const isPlaying = state.activeGameId === game.id;

    const card = document.createElement('article');
    card.className = `group flex flex-col overflow-hidden rounded-xl border transition-colors ${
      isPlaying
        ? 'border-[#F97316] bg-[#1D212B]'
        : 'border-white/10 bg-[#191C24] hover:border-white/25'
    }`;

    const mediaBox = document.createElement('div');
    mediaBox.className = 'relative aspect-[4/3] w-full overflow-hidden bg-[#14171F] cursor-pointer';
    mediaBox.appendChild(createFallbackArt(game.title));

    if (game.thumbnail) {
      const img = document.createElement('img');
      img.src = game.thumbnail;
      img.alt = `${game.title} thumbnail`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.className =
        'relative z-10 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]';
      img.onerror = () => img.remove();
      mediaBox.appendChild(img);
    }

    mediaBox.addEventListener('click', () => launchGame(game.id));

    const body = document.createElement('div');
    body.className = 'flex flex-1 flex-col p-5';

    const titleEl = document.createElement('h3');
    titleEl.className = 'font-display text-lg font-bold text-white leading-snug';
    titleEl.textContent = game.title;

    const metaEl = document.createElement('div');
    metaEl.className = 'mt-1 flex items-center gap-2 text-xs text-[#9CA3AF]';
    const catSpan = document.createElement('span');
    catSpan.textContent = game.category;
    const dotSpan = document.createElement('span');
    dotSpan.setAttribute('aria-hidden', 'true');
    dotSpan.textContent = '·';
    const ctrlSpan = document.createElement('span');
    ctrlSpan.className = 'truncate';
    ctrlSpan.textContent = game.controls || 'Keyboard / Mouse';
    metaEl.appendChild(catSpan);
    metaEl.appendChild(dotSpan);
    metaEl.appendChild(ctrlSpan);

    const descEl = document.createElement('p');
    descEl.className = 'mt-3 flex-1 text-sm leading-relaxed text-[#D1D5DB]';
    descEl.textContent = game.description || 'Playable browser game loaded via iframe.';

    const actions = document.createElement('div');
    actions.className = 'mt-5 flex items-center justify-between gap-2 pt-3 border-t border-white/10';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className =
      'inline-flex flex-1 items-center justify-center rounded-lg bg-[#F97316] px-4 py-2 text-sm font-semibold text-[#111318] transition-colors hover:bg-[#FB923C] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
    playBtn.textContent = isPlaying ? 'Playing Now' : 'Play Game';
    playBtn.addEventListener('click', () => launchGame(game.id));

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.setAttribute('aria-label', isFav ? `Remove ${game.title} from favorites` : `Save ${game.title} to favorites`);
    favBtn.className = `inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] ${
      isFav
        ? 'border-[#F97316]/60 bg-[#F97316]/15 text-[#FDBA74]'
        : 'border-white/15 bg-[#14171F] text-[#9CA3AF] hover:text-white'
    }`;
    favBtn.textContent = isFav ? 'Saved' : 'Save';
    favBtn.addEventListener('click', () => toggleFavorite(game.id));

    actions.appendChild(playBtn);
    actions.appendChild(favBtn);

    if (game.isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', `Remove custom game ${game.title}`);
      removeBtn.className =
        'inline-flex items-center justify-center rounded-lg border border-white/15 bg-[#14171F] px-3 py-2 text-xs font-medium text-[#FCA5A5] hover:border-red-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeCustomGame(game.id));
      actions.appendChild(removeBtn);
    }

    body.appendChild(titleEl);
    body.appendChild(metaEl);
    body.appendChild(descEl);
    body.appendChild(actions);

    card.appendChild(mediaBox);
    card.appendChild(body);
    fragment.appendChild(card);
  });

  els.gamesGrid.appendChild(fragment);
}

function updatePlayerFavoriteBtn() {
  if (!state.activeGameId) return;
  const isFav = state.favorites.has(state.activeGameId);
  els.playerFavoriteBtn.textContent = isFav ? 'Saved' : 'Save Favorite';
  if (isFav) {
    els.playerFavoriteBtn.classList.add('border-[#F97316]/60', 'text-[#FDBA74]');
  } else {
    els.playerFavoriteBtn.classList.remove('border-[#F97316]/60', 'text-[#FDBA74]');
  }
}

function mountActiveIframe(game) {
  els.iframeStage.innerHTML = '';
  const iframe = buildIframeElement(game.iframe, game.title);

  if (!iframe) {
    els.iframeStage.innerHTML = `
      <div class="flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <p class="font-display text-lg font-bold text-white">Invalid Iframe Configuration</p>
        <p class="mt-2 max-w-md text-sm text-[#9CA3AF]">
          This game's iframe entry in games.json could not be loaded safely.
        </p>
      </div>
    `;
    return;
  }

  iframe.addEventListener('load', () => {
    try {
      iframe.focus();
    } catch {}
  });

  els.iframeStage.appendChild(iframe);
}

function launchGame(gameId) {
  const game = getAllGames().find((g) => g.id === gameId);
  if (!game) return;

  state.proxyOpen = false;
  els.proxySection.classList.add('hidden');

  state.activeGameId = game.id;
  els.heroSection.classList.add('hidden');
  els.playerSection.classList.remove('hidden');

  els.playerTitle.textContent = game.title;
  els.playerMeta.textContent = `${game.category} · ${game.controls || 'Keyboard / Mouse'}`;
  els.playerDescription.textContent = game.description || '';
  els.playerControls.textContent = game.controls || 'Keyboard / Mouse';

  updatePlayerFavoriteBtn();
  mountActiveIframe(game);
  renderCatalog();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closePlayer() {
  state.activeGameId = null;
  els.iframeStage.innerHTML = '';
  els.playerSection.classList.add('hidden');
  if (!state.proxyOpen) {
    els.heroSection.classList.remove('hidden');
  }
  renderCatalog();
}

/* ---- Web Proxy Logic ---- */
function openProxy() {
  state.activeGameId = null;
  els.iframeStage.innerHTML = '';
  els.playerSection.classList.add('hidden');
  els.heroSection.classList.add('hidden');
  state.proxyOpen = true;
  els.proxySection.classList.remove('hidden');
  renderCatalog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  els.proxyInput.focus();
}

function closeProxy() {
  state.proxyOpen = false;
  els.proxySection.classList.add('hidden');
  if (!state.activeGameId) {
    els.heroSection.classList.remove('hidden');
  }
}

function resolveProxyDestination(rawInput) {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Check if input looks like a URL or domain name
  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const looksLikeDomain = !/\s/.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed);

  if (hasProtocol || looksLikeDomain) {
    const fullUrl = hasProtocol ? trimmed : `https://${trimmed}`;
    return {
      display: fullUrl,
      frameSrc: `/api/proxy?url=${encodeURIComponent(fullUrl)}`,
    };
  }

  return {
    display: trimmed,
    frameSrc: `/api/search-page?q=${encodeURIComponent(trimmed)}`,
  };
}

function navigateProxy(rawInput, pushHistory = true) {
  const dest = resolveProxyDestination(rawInput);
  if (!dest) return;

  if (pushHistory) {
    state.proxyHistory.push(dest.frameSrc);
  }
  els.proxyInput.value = dest.display;
  els.proxyEmptyState.classList.add('hidden');
  els.proxyIframe.classList.remove('hidden');
  els.proxyIframe.src = dest.frameSrc;
  els.proxyBackBtn.disabled = state.proxyHistory.length <= 1;
}

function toggleFavorite(gameId) {
  if (state.favorites.has(gameId)) {
    state.favorites.delete(gameId);
  } else {
    state.favorites.add(gameId);
  }
  saveFavorites();
  updatePlayerFavoriteBtn();
  renderCatalog();
}

function removeCustomGame(gameId) {
  state.customGames = state.customGames.filter((g) => g.id !== gameId);
  saveCustomGames();
  if (state.activeGameId === gameId) {
    closePlayer();
  } else {
    renderCatalog();
  }
  renderJsonPreview();
}

function renderJsonPreview() {
  const cleanPayload = getAllGames().map(({ isCustom, ...rest }) => rest);
  els.jsonPreview.textContent = JSON.stringify(cleanPayload, null, 2);
}

function openJsonModal() {
  renderJsonPreview();
  els.addGameFeedback.textContent = '';
  els.jsonModal.classList.remove('hidden');
  els.jsonModal.classList.add('flex');
}

function closeJsonModal() {
  els.jsonModal.classList.add('hidden');
  els.jsonModal.classList.remove('flex');
}

function wireEvents() {
  els.searchInput.addEventListener('input', (event) => {
    state.searchQuery = event.target.value;
    renderCatalog();
  });

  els.categoryTabs.addEventListener('click', (event) => {
    const btn = event.target.closest('.filter-tab');
    if (!btn) return;
    state.activeCategory = btn.getAttribute('data-category') || 'All';
    renderCatalog();
  });

  document.querySelectorAll('[data-nav-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.getAttribute('data-nav-filter') || 'All';
      renderCatalog();
      els.catalogSection.scrollIntoView({ behavior: 'smooth' });
    });
  });

  els.brandHomeLink.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.activeGameId) closePlayer();
    if (state.proxyOpen) closeProxy();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  els.randomGameBtn.addEventListener('click', () => {
    const games = getAllGames();
    if (!games.length) return;
    const pool = games.length > 1 ? games.filter((g) => g.id !== state.activeGameId) : games;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    launchGame(pick.id);
  });

  els.playerBackBtn.addEventListener('click', closePlayer);
  els.playerFavoriteBtn.addEventListener('click', () => {
    if (state.activeGameId) toggleFavorite(state.activeGameId);
  });
  els.playerReloadBtn.addEventListener('click', () => {
    const game = getAllGames().find((g) => g.id === state.activeGameId);
    if (game) mountActiveIframe(game);
  });

  els.playerTheaterBtn.addEventListener('click', () => {
    state.wideMode = !state.wideMode;
    if (state.wideMode) {
      els.playerContainer.classList.remove('max-w-[1200px]');
      els.playerContainer.classList.add('max-w-[1440px]');
      els.playerTheaterBtn.textContent = 'Standard View';
    } else {
      els.playerContainer.classList.remove('max-w-[1440px]');
      els.playerContainer.classList.add('max-w-[1200px]');
      els.playerTheaterBtn.textContent = 'Wide View';
    }
  });

  els.playerFullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (els.iframeStage.requestFullscreen) {
      els.iframeStage.requestFullscreen().catch(() => {});
    }
  });

  // Proxy events
  els.openProxyNavBtn.addEventListener('click', openProxy);
  els.heroProxyBtn.addEventListener('click', openProxy);
  els.footerProxyBtn.addEventListener('click', openProxy);
  els.proxyCloseBtn.addEventListener('click', closeProxy);

  els.proxyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    navigateProxy(els.proxyInput.value, true);
  });

  document.querySelectorAll('[data-proxy-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-proxy-quick');
      if (url) navigateProxy(url, true);
    });
  });

  els.proxyBackBtn.addEventListener('click', () => {
    if (state.proxyHistory.length > 1) {
      state.proxyHistory.pop();
      const prevSrc = state.proxyHistory[state.proxyHistory.length - 1];
      els.proxyIframe.src = prevSrc;
      els.proxyBackBtn.disabled = state.proxyHistory.length <= 1;
    }
  });

  els.proxyReloadBtn.addEventListener('click', () => {
    if (els.proxyIframe.src) {
      els.proxyIframe.src = els.proxyIframe.src;
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ARCADE_PROXY_NAV' && event.data.url) {
      els.proxyInput.value = event.data.url;
    }
  });

  // JSON Modal events
  els.footerJsonBtn.addEventListener('click', openJsonModal);
  els.closeJsonModalBtn.addEventListener('click', closeJsonModal);

  els.jsonModal.addEventListener('click', (event) => {
    if (event.target === els.jsonModal) closeJsonModal();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.jsonModal.classList.contains('hidden')) {
      closeJsonModal();
    }
  });

  els.addGameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = els.customTitle.value.trim();
    const category = els.customCategory.value;
    const controls = els.customControls.value.trim() || 'Keyboard / Mouse';
    const description =
      els.customDescription.value.trim() || 'Custom iframe game added to the local catalog.';
    const iframeInput = els.customIframe.value.trim();

    if (!title || !iframeInput) return;

    const normalizedIframe = normalizeIframeInput(iframeInput, title);
    if (!normalizedIframe) {
      els.addGameFeedback.textContent =
        'Enter a valid <iframe> tag or a relative (/...) or https:// URL.';
      els.addGameFeedback.className = 'mt-1.5 text-xs text-[#FCA5A5]';
      return;
    }

    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'custom-game';

    const newGame = {
      id: `${slug}-${Date.now().toString(36)}`,
      title,
      category,
      description,
      controls,
      thumbnail: '',
      featured: false,
      iframe: normalizedIframe,
      isCustom: true,
    };

    state.customGames.push(newGame);
    saveCustomGames();
    renderCatalog();
    renderJsonPreview();

    els.addGameForm.reset();
    els.addGameFeedback.textContent = `Added "${title}" as an iframe entry.`;
    els.addGameFeedback.className = 'mt-1.5 text-xs text-[#6EE7B7]';
  });

  els.copyJsonBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.jsonPreview.textContent || '');
      els.copyJsonBtn.textContent = 'Copied';
      setTimeout(() => {
        els.copyJsonBtn.textContent = 'Copy JSON';
      }, 1500);
    } catch {
      els.copyJsonBtn.textContent = 'Copy Failed';
      setTimeout(() => {
        els.copyJsonBtn.textContent = 'Copy JSON';
      }, 1500);
    }
  });

  els.downloadJsonBtn.addEventListener('click', () => {
    const content = els.jsonPreview.textContent || '[]';
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'games.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

async function init() {
  loadLocalState();
  wireEvents();
  els.proxyBackBtn.disabled = true;

  try {
    const response = await fetch('/games.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid games.json format');
    }
    state.baseGames = data;
    renderFeaturedHero();
    renderCatalog();
  } catch (err) {
    els.catalogCount.textContent = 'Failed to load games.json';
    els.catalogStatus.classList.remove('hidden');
    els.catalogStatus.innerHTML = `
      <p class="text-base font-medium text-white">Could not load games.json</p>
      <p class="mt-1 text-sm text-[#9CA3AF]">${err instanceof Error ? err.message : 'Unknown error'}</p>
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
