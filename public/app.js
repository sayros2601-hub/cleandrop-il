(function () {
  'use strict';

  const { TRANSLATIONS, getStoredLang, applyLangToDom, fmt } = window.CleanDropI18n;
  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const fileInputEl = document.getElementById('proofFileInput');

  const state = {
    lang: getStoredLang(),
    mode: 'client', // 'client' | 'tracker' | 'courier'
    courierTab: 'orders', // 'orders' | 'stats' | 'qr' | 'settings'
    courierFilter: 'active',
    courierPin: sessionStorage.getItem('cleandrop_pin') || '',
    showPinModal: false,
    showQuickDoorModal: false,
    editingAddress: false,
    submitting: false,
    deferredInstallPrompt: null,
    isIos: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    config: {
      bit_phone: '050-000-0000',
      paybox_link: '',
      courier_whatsapp: '972500000000',
      default_city: 'תל אביב',
      business_name: 'CleanDrop IL',
      card_gateway_provider: 'none',
      card_enabled: false,
      prices: { small: 10, large: 15, cardboard: 20, standalone: 25, pass10: 160 }
    },
    form: {
      tariff: 'small',
      addons: [],
      handover_mode: 'door_5min',
      pickup_slot: 'now',
      payment_method: 'cash',
      client_name: '',
      phone: '',
      city: '',
      street: '',
      floor: '',
      apartment: '',
      intercom: '',
      notes: ''
    },
    activeOrder: null,
    activeClientToken: '',
    cardSession: null,
    history: [],
    courierOrders: [],
    courierStats: null,
    courierSettings: null,
    pendingPhotoOrderId: null,
    lastPendingIds: new Set()
  };

  let pollTimer = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  }

  function loadLocalData() {
    try {
      const prof = JSON.parse(localStorage.getItem('cleandrop_profile') || 'null');
      if (prof && prof.street) {
        Object.assign(state.form, {
          client_name: prof.client_name || '',
          phone: prof.phone || '',
          city: prof.city || '',
          street: prof.street || '',
          floor: prof.floor || '',
          apartment: prof.apartment || '',
          intercom: prof.intercom || '',
          notes: prof.notes || ''
        });
      }
      const hist = JSON.parse(localStorage.getItem('cleandrop_history') || '[]');
      if (Array.isArray(hist)) state.history = hist.slice(0, 6);
    } catch (e) {}
  }

  function saveProfileLocally() {
    try {
      localStorage.setItem(
        'cleandrop_profile',
        JSON.stringify({
          client_name: state.form.client_name,
          phone: state.form.phone,
          city: state.form.city,
          street: state.form.street,
          floor: state.form.floor,
          apartment: state.form.apartment,
          intercom: state.form.intercom,
          notes: state.form.notes
        })
      );
    } catch (e) {}
  }

  function saveOrderToHistory(id, token, order) {
    const entry = {
      id,
      client_token: token,
      street: order.street,
      city: order.city,
      price_nis: order.price_nis,
      created_at: order.created_at
    };
    state.history = [entry, ...state.history.filter((x) => x.id !== id)].slice(0, 6);
    try {
      localStorage.setItem('cleandrop_history', JSON.stringify(state.history));
    } catch (e) {}
  }

  function hasSavedAddress() {
    return Boolean(state.form.client_name.trim() && state.form.phone.trim() && state.form.street.trim());
  }

  function computeFormPrice() {
    const base = Number(state.config.prices[state.form.tariff] ?? 10);
    return base + state.form.addons.length * 5;
  }

  function normalizeWhatsappNumber(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('05') && digits.length === 10) {
      digits = '972' + digits.slice(1);
    } else if (digits.startsWith('0') && digits.length >= 9) {
      digits = '972' + digits.slice(1);
    }
    return digits;
  }

  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (state.courierPin) headers['X-Courier-Pin'] = state.courierPin;
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchPublicConfig() {
    try {
      const cfg = await apiFetch('/api/public-config');
      state.config = cfg;
      if (!state.form.city) state.form.city = cfg.default_city || 'תל אביב';
      render();
    } catch (e) {}
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (state.mode === 'tracker' && state.activeOrder) {
        refreshActiveOrder(true);
      } else if (state.mode === 'courier' && state.courierPin && state.courierTab === 'orders') {
        loadCourierOrders(true);
      }
    }, 8000);
  }

  async function refreshActiveOrder(silent = false) {
    if (!state.activeOrder || !state.activeClientToken) return;
    try {
      const data = await apiFetch(
        `/api/orders/${encodeURIComponent(state.activeOrder.id)}?token=${encodeURIComponent(state.activeClientToken)}`
      );
      state.activeOrder = data.order;
      render();
    } catch (e) {
      if (!silent) showToast(e.message);
    }
  }

  async function loadCourierOrders(silent = false) {
    if (!state.courierPin) return;
    try {
      const data = await apiFetch(`/api/orders?status=${encodeURIComponent(state.courierFilter)}`);
      const nextOrders = data.orders || [];
      const currentPending = new Set(nextOrders.filter((o) => o.status === 'pending').map((o) => o.id));
      if (silent && state.lastPendingIds.size > 0) {
        for (const id of currentPending) {
          if (!state.lastPendingIds.has(id)) {
            playChime();
            showToast(`🛵 ${id}`);
            break;
          }
        }
      }
      state.lastPendingIds = currentPending;
      state.courierOrders = nextOrders;
      render();
    } catch (e) {
      if (e.status === 401) {
        state.courierPin = '';
        sessionStorage.removeItem('cleandrop_pin');
        state.showPinModal = true;
        render();
      } else if (!silent) {
        showToast(e.message);
      }
    }
  }

  async function loadCourierStats() {
    try {
      state.courierStats = await apiFetch('/api/stats');
      render();
    } catch (e) {
      showToast(e.message);
    }
  }

  async function loadCourierSettings() {
    try {
      const data = await apiFetch('/api/settings');
      state.courierSettings = data.settings;
      render();
    } catch (e) {
      showToast(e.message);
    }
  }

  async function submitOrder() {
    const t = TRANSLATIONS[state.lang];
    const f = state.form;
    if (!f.client_name.trim() || !f.phone.trim() || !f.city.trim() || !f.street.trim()) {
      state.editingAddress = true;
      render();
      showToast(t.validationErr);
      return;
    }

    state.submitting = true;
    render();
    try {
      saveProfileLocally();
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          lang: state.lang,
          client_name: f.client_name,
          phone: f.phone,
          city: f.city,
          street: f.street,
          floor: f.floor,
          apartment: f.apartment,
          intercom: f.intercom,
          notes: f.notes,
          tariff: f.tariff,
          addons: f.addons,
          handover_mode: f.handover_mode,
          pickup_slot: f.pickup_slot,
          payment_method: f.payment_method
        })
      });

      state.activeOrder = res.order;
      state.activeClientToken = res.client_token;
      state.cardSession = null;
      saveOrderToHistory(res.id, res.client_token, res.order);

      if (f.payment_method === 'card') {
        try {
          state.cardSession = await apiFetch('/api/payments/create-session', {
            method: 'POST',
            body: JSON.stringify({ order_id: res.id, client_token: res.client_token })
          });
        } catch (e) {}
      }

      state.mode = 'tracker';
      startPolling();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showToast(e.message);
    } finally {
      state.submitting = false;
      render();
    }
  }

  async function openHistoryOrder(id, token) {
    try {
      const data = await apiFetch(`/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
      state.activeOrder = data.order;
      state.activeClientToken = token;
      state.cardSession = null;
      state.mode = 'tracker';
      startPolling();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      showToast(e.message);
    }
  }

  function compressImageToDataUrl(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  fileInputEl.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const orderId = state.pendingPhotoOrderId;
    fileInputEl.value = '';
    if (!file || !orderId) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 800, 0.72);
      await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done', proof_photo: dataUrl })
      });
      showToast('📸 ✓');
      await loadCourierOrders();
    } catch (err) {
      showToast(err.message);
    } finally {
      state.pendingPhotoOrderId = null;
    }
  });

  function renderHeader(t) {
    const langs = [
      { id: 'he', label: 'עב' },
      { id: 'ar', label: 'عر' },
      { id: 'ru', label: 'РУ' }
    ];
    return `
      <header class="topbar">
        <div class="brand">
          <img src="/images/app-icon-raw.png" alt="CleanDrop" class="brand-icon" />
          <div style="min-width:0">
            <div class="brand-title">${escapeHtml(state.config.business_name || 'CleanDrop IL')}</div>
            <div class="brand-sub">${escapeHtml(t.brandTagline)}</div>
          </div>
        </div>
        <div class="topbar-actions">
          <div class="lang-switch">
            ${langs
              .map(
                (l) =>
                  `<button class="lang-btn ${state.lang === l.id ? 'active' : ''}" data-lang="${l.id}">${l.label}</button>`
              )
              .join('')}
          </div>
          <button class="courier-toggle ${state.mode === 'courier' ? 'active' : ''}" data-action="toggle-courier">
            🛵 <span>${escapeHtml(state.mode === 'courier' ? t.backToClient : t.courierBtn)}</span>
          </button>
        </div>
      </header>
    `;
  }

  function renderInstallPrompt(t) {
    if (state.isStandalone) return '';
    if (state.deferredInstallPrompt) {
      return `
        <div class="install-banner">
          <span>📲 ${escapeHtml(t.installPrompt)}</span>
          <button class="btn-install" data-action="install-pwa">${escapeHtml(t.installBtn)}</button>
        </div>
      `;
    }
    if (state.isIos) {
      return `
        <div class="install-banner">
          <span>🍏 ${escapeHtml(t.installIosTip)}</span>
        </div>
      `;
    }
    return '';
  }

  function renderClientView(t) {
    const prices = state.config.prices;
    const tariffDefs = [
      { id: 'small', img: '/images/card-bag-small.png', price: prices.small, popular: true },
      { id: 'large', img: '/images/card-bag-large.png', price: prices.large },
      { id: 'cardboard', emoji: '📦', price: prices.cardboard },
      { id: 'standalone', emoji: '🛵', price: prices.standalone },
      { id: 'pass10', emoji: '🎟️', price: prices.pass10 }
    ];
    const addonKeys = ['extra_bag', 'no_elevator', 'heavy_litter'];
    const total = computeFormPrice();
    const savedReady = hasSavedAddress() && !state.editingAddress;

    return `
      <main class="main-content">
        <section class="hero-card">
          <div class="hero-img-wrap">
            <img src="/images/hero-banner.png" alt="CleanDrop Tel Aviv" />
            <div class="hero-badge">${escapeHtml(t.heroBadge)}</div>
          </div>
          <div class="hero-body">
            <h1>${escapeHtml(t.heroTitle)}</h1>
            <p>${escapeHtml(t.heroSubtitle)}</p>
          </div>
        </section>

        ${renderInstallPrompt(t)}

        <section class="card">
          <h2 class="sec-title">${escapeHtml(t.secTariff)}</h2>
          <div class="tariff-list">
            ${tariffDefs
              .map((item) => {
                const info = t.tariffs[item.id];
                const selected = state.form.tariff === item.id;
                return `
                  <button type="button" class="tariff-card ${selected ? 'selected' : ''}" data-tariff="${item.id}">
                    ${
                      item.img
                        ? `<img src="${item.img}" alt="${escapeHtml(info.title)}" class="tariff-thumb" />`
                        : `<div class="tariff-thumb">${item.emoji}</div>`
                    }
                    <div class="tariff-info">
                      <div class="tariff-title">${escapeHtml(info.title)}</div>
                      <div class="tariff-desc">${escapeHtml(info.desc)}</div>
                      <span class="tariff-tag">${escapeHtml(item.popular ? t.popularBadge : info.tag)}</span>
                    </div>
                    <div class="tariff-price">${item.price} ₪</div>
                  </button>
                `;
              })
              .join('')}
          </div>

          <div class="addons-wrap">
            <div class="addons-label">${escapeHtml(t.addonsTitle)}</div>
            <div class="chip-row">
              ${addonKeys
                .map((k) => {
                  const active = state.form.addons.includes(k);
                  return `<button type="button" class="chip-btn ${active ? 'active' : ''}" data-addon="${k}">${escapeHtml(t.addons[k])}</button>`;
                })
                .join('')}
            </div>
          </div>
        </section>

        <section class="card">
          <h2 class="sec-title">${escapeHtml(t.secAddress)}</h2>
          ${
            savedReady
              ? `
                <div class="saved-addr-box">
                  <div>
                    <div class="saved-addr-meta">📍 ${escapeHtml(state.form.street)}, ${escapeHtml(state.form.city)}</div>
                    <div class="saved-addr-sub">
                      ${escapeHtml(state.form.client_name)} • ${escapeHtml(state.form.phone)}
                      ${state.form.floor ? ` • ${escapeHtml(t.floorShort)} ${escapeHtml(state.form.floor)}` : ''}
                      ${state.form.apartment ? `, ${escapeHtml(t.aptShort)} ${escapeHtml(state.form.apartment)}` : ''}
                      ${state.form.intercom ? ` • 🔑 ${escapeHtml(t.intercomShort)}: <strong>${escapeHtml(state.form.intercom)}</strong>` : ''}
                    </div>
                  </div>
                  <button type="button" class="btn-link" data-action="edit-address">${escapeHtml(t.editAddress)}</button>
                </div>
              `
              : `
                <div class="form-grid">
                  <div class="field">
                    <label>${escapeHtml(t.fields.client_name)} *</label>
                    <input data-field="client_name" value="${escapeHtml(state.form.client_name)}" placeholder="${escapeHtml(t.fields.client_name_ph)}" />
                  </div>
                  <div class="field">
                    <label>${escapeHtml(t.fields.phone)} *</label>
                    <input data-field="phone" type="tel" value="${escapeHtml(state.form.phone)}" placeholder="${escapeHtml(t.fields.phone_ph)}" />
                  </div>
                  <div class="field">
                    <label>${escapeHtml(t.fields.city)} *</label>
                    <input data-field="city" value="${escapeHtml(state.form.city)}" placeholder="${escapeHtml(t.fields.city_ph)}" />
                  </div>
                  <div class="field">
                    <label>${escapeHtml(t.fields.street)} *</label>
                    <input data-field="street" value="${escapeHtml(state.form.street)}" placeholder="${escapeHtml(t.fields.street_ph)}" />
                  </div>
                  <div class="field">
                    <label>${escapeHtml(t.fields.floor)}</label>
                    <input data-field="floor" value="${escapeHtml(state.form.floor)}" placeholder="${escapeHtml(t.fields.floor_ph)}" />
                  </div>
                  <div class="field">
                    <label>${escapeHtml(t.fields.apartment)}</label>
                    <input data-field="apartment" value="${escapeHtml(state.form.apartment)}" placeholder="${escapeHtml(t.fields.apartment_ph)}" />
                  </div>
                  <div class="field field-full intercom-highlight">
                    <label>🔑 ${escapeHtml(t.fields.intercom)}</label>
                    <input data-field="intercom" value="${escapeHtml(state.form.intercom)}" placeholder="${escapeHtml(t.fields.intercom_ph)}" />
                  </div>
                  <div class="field field-full">
                    <label>${escapeHtml(t.fields.notes)}</label>
                    <input data-field="notes" value="${escapeHtml(state.form.notes)}" placeholder="${escapeHtml(t.fields.notes_ph)}" />
                  </div>
                  ${
                    hasSavedAddress()
                      ? `<div class="field-full"><button type="button" class="btn-secondary" data-action="done-edit-address">${escapeHtml(t.saveAddressPreview)}</button></div>`
                      : ''
                  }
                </div>
              `
          }
        </section>

        <section class="card">
          <h2 class="sec-title">${escapeHtml(t.secHandover)}</h2>
          <div class="option-stack">
            ${['door_5min', 'hand']
              .map((m) => {
                const info = t.handoverModes[m];
                return `
                  <button type="button" class="option-card ${state.form.handover_mode === m ? 'selected' : ''}" data-handover="${m}">
                    <div class="option-card-title">${m === 'door_5min' ? '🚪 ' : '🤝 '}${escapeHtml(info.title)}</div>
                    <div class="option-card-desc">${escapeHtml(info.desc)}</div>
                  </button>
                `;
              })
              .join('')}
          </div>

          <div class="chip-row" style="margin-top:12px;">
            ${['now', 'evening', 'custom']
              .map(
                (slot) =>
                  `<button type="button" class="chip-btn ${state.form.pickup_slot === slot ? 'active' : ''}" data-slot="${slot}">${escapeHtml(t.slots[slot])}</button>`
              )
              .join('')}
          </div>
        </section>

        <section class="card">
          <h2 class="sec-title">${escapeHtml(t.secPayment)}</h2>
          <div class="pay-grid">
            <button type="button" class="pay-card ${state.form.payment_method === 'cash' ? 'selected' : ''}" data-pay="cash">
              <div class="pay-head"><span>💵 ${escapeHtml(t.payments.cash.title)}</span></div>
              <div class="pay-sub">${escapeHtml(t.payments.cash.sub)}</div>
            </button>
            <button type="button" class="pay-card ${state.form.payment_method === 'card' ? 'selected' : ''}" data-pay="card">
              <div class="pay-head">
                <span>💳 ${escapeHtml(t.payments.card.title)}</span>
                <span class="card-badges">
                  <span class="badge-visa">VISA</span>
                  <span class="badge-mc"><i></i><i></i></span>
                </span>
              </div>
              <div class="pay-sub">${escapeHtml(t.payments.card.sub)}</div>
            </button>
            <button type="button" class="pay-card ${state.form.payment_method === 'bit' ? 'selected' : ''}" data-pay="bit">
              <div class="pay-head"><span>⚡ ${escapeHtml(t.payments.bit.title)}</span></div>
              <div class="pay-sub">${escapeHtml(t.payments.bit.sub)}</div>
            </button>
            <button type="button" class="pay-card ${state.form.payment_method === 'paybox' ? 'selected' : ''}" data-pay="paybox">
              <div class="pay-head"><span>🟦 ${escapeHtml(t.payments.paybox.title)}</span></div>
              <div class="pay-sub">${escapeHtml(t.payments.paybox.sub)}</div>
            </button>
          </div>

          ${
            state.form.payment_method === 'card'
              ? `<div class="notice-box notice-info">${escapeHtml(
                  state.config.card_enabled ? t.cardGatewayReadyMsg : t.cardGatewayPendingMsg
                )}</div>`
              : ''
          }

          <div class="notice-box notice-warn">⚠️ ${escapeHtml(t.municipalNotice)}</div>
        </section>

        ${
          state.history.length > 0
            ? `
              <section class="card">
                <h2 class="sec-title">${escapeHtml(t.recentOrdersTitle)}</h2>
                <div class="option-stack">
                  ${state.history
                    .map(
                      (h) => `
                        <button type="button" class="option-card" data-open-order="${escapeHtml(h.id)}" data-open-token="${escapeHtml(h.client_token)}">
                          <div class="order-head">
                            <strong>${escapeHtml(h.id)} — ${escapeHtml(h.street)}</strong>
                            <span class="order-price-pill">${escapeHtml(h.price_nis)} ₪</span>
                          </div>
                        </button>
                      `
                    )
                    .join('')}
                </div>
              </section>
            `
            : ''
        }
      </main>

      <div class="sticky-cta-bar">
        <div class="sticky-cta-inner">
          <button type="button" class="btn-primary" data-action="submit-order" ${state.submitting ? 'disabled' : ''}>
            ${escapeHtml(state.submitting ? t.submitting : fmt(t.submitOrderBtn, { price: total }))}
          </button>
        </div>
      </div>
    `;
  }

  function renderTrackerView(t) {
    const o = state.activeOrder;
    if (!o) return '';
    const tr = t.tracker;
    const stepOrder = ['pending', 'on_the_way', 'picked_up', 'done'];
    const currentIdx = stepOrder.indexOf(o.status);

    const waPhone = normalizeWhatsappNumber(state.config.courier_whatsapp);
    const waText = encodeURIComponent(fmt(t.waClientToCourier, { id: o.id, street: o.street }));

    let paymentBlock = '';
    if (!o.is_paid) {
      if (o.payment_method === 'card') {
        const checkoutUrl = state.cardSession?.checkout_url;
        paymentBlock = checkoutUrl
          ? `<a href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noopener" class="btn-primary" style="text-decoration:none;margin-top:10px;">💳 ${escapeHtml(fmt(tr.payCardBtn, { price: o.price_nis }))}</a>`
          : `<div class="notice-box notice-info">${escapeHtml(tr.payCardWaitMsg)}</div>`;
      } else if (o.payment_method === 'bit') {
        paymentBlock = `
          <div class="notice-box notice-info" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div>${escapeHtml(tr.bitInstructions)} <strong dir="ltr">${escapeHtml(state.config.bit_phone)}</strong> (${escapeHtml(o.price_nis)} ₪)</div>
            <button type="button" class="btn-link" data-copy="${escapeHtml(state.config.bit_phone)}">${escapeHtml(tr.copyBtn)}</button>
          </div>
        `;
      } else if (o.payment_method === 'paybox' && state.config.paybox_link) {
        paymentBlock = `<a href="${escapeHtml(state.config.paybox_link)}" target="_blank" rel="noopener" class="btn-primary" style="text-decoration:none;margin-top:10px;">🟦 ${escapeHtml(tr.payboxOpen)} (${escapeHtml(o.price_nis)} ₪)</a>`;
      } else if (o.payment_method === 'cash') {
        paymentBlock = `<div class="notice-box notice-info">💵 ${escapeHtml(fmt(tr.cashInstructions, { price: o.price_nis }))}</div>`;
      }
    }

    return `
      <main class="main-content">
        <section class="card">
          <div class="order-head">
            <div>
              <div style="font-size:0.8rem;color:var(--muted);">${escapeHtml(tr.orderNum)} <strong>${escapeHtml(o.id)}</strong></div>
              <h2 style="margin:2px 0 0;font-size:1.15rem;">${escapeHtml(tr.title)}</h2>
            </div>
            <div style="text-align:end;">
              <div class="order-price-pill">${escapeHtml(o.price_nis)} ₪</div>
              <div style="margin-top:4px;">
                <span class="badge ${o.is_paid ? 'badge-paid' : 'badge-unpaid'}">${escapeHtml(o.is_paid ? tr.paidBadge : tr.unpaidBadge)}</span>
              </div>
            </div>
          </div>

          ${
            o.status === 'cancelled'
              ? `<div class="notice-box notice-warn">${escapeHtml(tr.cancelled)}</div>`
              : `
                <div class="status-steps">
                  ${stepOrder
                    .map((s, idx) => {
                      let cls = 'step-pill';
                      if (idx < currentIdx || (s === 'done' && o.status === 'done')) cls += ' done';
                      else if (idx === currentIdx) cls += ' current';
                      return `<div class="${cls}">${escapeHtml(tr.steps[s])}</div>`;
                    })
                    .join('')}
                </div>
              `
          }

          <div class="saved-addr-box" style="margin-top:8px;">
            <div>
              <div class="saved-addr-meta">📍 ${escapeHtml(o.street)}, ${escapeHtml(o.city)}</div>
              <div class="saved-addr-sub">
                ${escapeHtml(o.client_name)} • ${escapeHtml(t.tariffs[o.tariff]?.title || o.tariff)}
                ${o.intercom ? ` • 🔑 ${escapeHtml(o.intercom)}` : ''}
              </div>
            </div>
          </div>

          ${paymentBlock}

          ${
            o.proof_photo
              ? `
                <div style="margin-top:14px;">
                  <strong>📸 ${escapeHtml(tr.proofTitle)}</strong>
                  <img src="${escapeHtml(o.proof_photo)}" alt="Proof at bin" class="proof-img" />
                </div>
              `
              : ''
          }

          <div class="action-grid" style="margin-top:14px;">
            <a class="action-btn wa" href="https://wa.me/${escapeHtml(waPhone)}?text=${waText}" target="_blank" rel="noopener">💬 ${escapeHtml(tr.whatsappCourier)}</a>
            <button type="button" class="action-btn" data-action="refresh-tracker">🔄 Обновить / רענן</button>
          </div>

          <button type="button" class="btn-secondary" style="width:100%;margin-top:12px;" data-action="new-order">+ ${escapeHtml(tr.newOrderBtn)}</button>
        </section>
      </main>
    `;
  }

  function renderCourierOrdersTab(t) {
    const c = t.courier;
    const filtered = state.courierOrders;

    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button type="button" class="btn-primary" data-action="open-quick-door">${escapeHtml(c.quickDoorBtn)}</button>

        <div class="chip-row">
          ${[
            { id: 'active', label: c.filterActive },
            { id: 'done', label: c.filterDone },
            { id: 'all', label: c.filterAll }
          ]
            .map(
              (f) =>
                `<button type="button" class="chip-btn ${state.courierFilter === f.id ? 'active' : ''}" data-cfilter="${f.id}">${escapeHtml(f.label)}</button>`
            )
            .join('')}
        </div>

        ${
          filtered.length === 0
            ? `<div class="card" style="text-align:center;color:var(--muted);">${escapeHtml(c.emptyOrders)}</div>`
            : filtered
                .map((o) => {
                  const fullAddress = `${o.street}, ${o.city}`;
                  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(fullAddress)}&navigate=yes`;
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
                  const clientDict = TRANSLATIONS[o.lang] || TRANSLATIONS.he;
                  const waNum = normalizeWhatsappNumber(o.phone);
                  const waBody = encodeURIComponent(
                    fmt(clientDict.wa5minTemplate, { name: o.client_name, street: o.street })
                  );
                  const waUrl = `https://wa.me/${waNum}?text=${waBody}`;

                  return `
                    <article class="order-card">
                      <div class="order-head">
                        <div>
                          <strong>${escapeHtml(o.id)}</strong>
                          <span style="font-size:0.76rem;color:var(--muted);margin-inline-start:6px;">${escapeHtml(o.lang.toUpperCase())} • ${escapeHtml(o.payment_method.toUpperCase())}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;">
                          <button type="button" class="badge ${o.is_paid ? 'badge-paid' : 'badge-unpaid'}" data-toggle-paid="${escapeHtml(o.id)}" data-paid-val="${o.is_paid ? '1' : '0'}">
                            ${escapeHtml(o.is_paid ? c.paidDone : c.markPaid)}
                          </button>
                          <span class="order-price-pill">${escapeHtml(o.price_nis)} ₪</span>
                        </div>
                      </div>

                      <div>
                        <div style="font-weight:700;font-size:1rem;">📍 ${escapeHtml(o.street)}, ${escapeHtml(o.city)}</div>
                        <div style="font-size:0.84rem;color:var(--muted);margin-top:2px;">
                          👤 ${escapeHtml(o.client_name)} • ${escapeHtml(o.phone)}
                          ${o.floor ? ` • ${escapeHtml(t.floorShort)} ${escapeHtml(o.floor)}` : ''}
                          ${o.apartment ? `, ${escapeHtml(t.aptShort)} ${escapeHtml(o.apartment)}` : ''}
                        </div>
                      </div>

                      ${o.intercom ? `<div class="intercom-box">🔑 ${escapeHtml(t.intercomShort)}: ${escapeHtml(o.intercom)}</div>` : ''}
                      ${o.notes ? `<div style="font-size:0.82rem;background:var(--warn-bg);padding:6px 10px;border-radius:8px;">📝 ${escapeHtml(o.notes)}</div>` : ''}

                      <div class="action-grid">
                        <a class="action-btn waze" href="${escapeHtml(wazeUrl)}" target="_blank" rel="noopener">🧭 ${escapeHtml(c.wazeBtn)}</a>
                        <a class="action-btn" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">🗺️ ${escapeHtml(c.mapsBtn)}</a>
                        <a class="action-btn wa" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener">💬 ${escapeHtml(c.wa5minBtn)}</a>
                        <a class="action-btn" href="tel:${escapeHtml(o.phone)}">📞 ${escapeHtml(c.callBtn)}</a>
                      </div>

                      ${
                        o.status !== 'done'
                          ? `
                            <div class="action-grid">
                              <button type="button" class="action-btn" data-set-status="on_the_way" data-oid="${escapeHtml(o.id)}">${escapeHtml(c.btnOnTheWay)}</button>
                              <button type="button" class="action-btn" data-set-status="picked_up" data-oid="${escapeHtml(o.id)}">${escapeHtml(c.btnPickedUp)}</button>
                              <button type="button" class="action-btn photo field-full" data-photo-done="${escapeHtml(o.id)}">${escapeHtml(c.btnPhotoDone)}</button>
                              <button type="button" class="action-btn" data-set-status="done" data-oid="${escapeHtml(o.id)}">${escapeHtml(c.btnMarkDoneNoPhoto)}</button>
                              <button type="button" class="action-btn" style="color:var(--danger);" data-delete-order="${escapeHtml(o.id)}">🗑 ${escapeHtml(c.deleteBtn)}</button>
                            </div>
                          `
                          : `
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                              <span class="badge badge-paid">${escapeHtml(t.tracker.steps.done)} ${o.has_photo ? '📸' : ''}</span>
                              <button type="button" class="btn-link" style="color:var(--danger);" data-delete-order="${escapeHtml(o.id)}">${escapeHtml(c.deleteBtn)}</button>
                            </div>
                          `
                      }
                    </article>
                  `;
                })
                .join('')
        }
      </div>
    `;
  }

  function renderCourierStatsTab(t) {
    const c = t.courier;
    const s = state.courierStats || { today_revenue: 0, today_count: 0, active_count: 0, month_revenue: 0, paid_total: 0, unpaid_total: 0 };
    return `
      <div class="stats-grid">
        <div class="stat-tile">
          <div class="stat-val">${escapeHtml(s.today_revenue)} ₪</div>
          <div class="stat-lbl">${escapeHtml(c.statsTodayRev)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-val">${escapeHtml(s.today_count)}</div>
          <div class="stat-lbl">${escapeHtml(c.statsTodayCount)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-val">${escapeHtml(s.month_revenue)} ₪</div>
          <div class="stat-lbl">${escapeHtml(c.statsMonthRev)}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-val">${escapeHtml(s.active_count)}</div>
          <div class="stat-lbl">${escapeHtml(c.statsActiveNow)}</div>
        </div>
        <div class="stat-tile field-full">
          <div class="stat-val">${escapeHtml(s.paid_total)} ₪ / <span style="color:var(--warn)">${escapeHtml(s.unpaid_total)} ₪</span></div>
          <div class="stat-lbl">${escapeHtml(c.statsPaidVsUnpaid)}</div>
        </div>
      </div>
    `;
  }

  function renderCourierQrTab(t) {
    const c = t.courier;
    const shareUrl = window.location.origin;
    let qrSvg = '';
    try {
      qrSvg = window.CleanDropQR.renderSVG(shareUrl, 210);
    } catch (e) {
      qrSvg = `<div style="padding:16px;">${escapeHtml(shareUrl)}</div>`;
    }

    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="qr-flyer">
          <img src="/images/app-icon-raw.png" alt="CleanDrop" style="width:64px;height:64px;border-radius:16px;" />
          <h2 style="margin:0;color:var(--primary-dark);">${escapeHtml(state.config.business_name || 'CleanDrop IL')}</h2>
          <div style="font-size:0.95rem;font-weight:700;">השליח כבר פה? תן לו להוריד גם את הזבל!</div>
          <div style="font-size:0.95rem;font-weight:700;">المندوب عندك؟ خلّيه ينزّل الزبالة بطريقه!</div>
          <div style="font-size:0.9rem;color:var(--muted);">Вынесем бытовой мусор от двери от 10 ₪ • Bit / Cash / Card</div>
          <div class="qr-box">${qrSvg}</div>
          <div style="font-size:0.84rem;font-weight:700;color:var(--primary);direction:ltr;">${escapeHtml(shareUrl)}</div>
          <div style="font-size:0.78rem;color:var(--muted);">${escapeHtml(c.qrSub)}</div>
        </div>

        <div class="action-grid no-print">
          <button type="button" class="btn-primary" onclick="window.print()">🖨️ ${escapeHtml(c.qrPrintBtn)}</button>
          <button type="button" class="btn-secondary" data-copy="${escapeHtml(shareUrl)}">🔗 ${escapeHtml(c.qrCopyLink)}</button>
        </div>
      </div>
    `;
  }

  function renderCourierSettingsTab(t) {
    const c = t.courier;
    const s = state.courierSettings || {};
    const webhookUrl = `${window.location.origin}/api/payments/webhook?secret=${encodeURIComponent(s.merchant_webhook_secret || '<SET_SECRET>')}`;

    return `
      <form id="settingsForm" class="card" style="display:flex;flex-direction:column;gap:12px;">
        <h2 class="sec-title">${escapeHtml(c.settingsTitle)}</h2>

        <div class="form-grid">
          <div class="field">
            <label>Business Name</label>
            <input name="business_name" value="${escapeHtml(s.business_name || 'CleanDrop IL')}" />
          </div>
          <div class="field">
            <label>PIN курьера</label>
            <input name="courier_pin" value="${escapeHtml(s.courier_pin || '1234')}" />
          </div>
          <div class="field">
            <label>Телефон Bit</label>
            <input name="bit_phone" value="${escapeHtml(s.bit_phone || '')}" />
          </div>
          <div class="field">
            <label>WhatsApp (формат 9725...)</label>
            <input name="courier_whatsapp" value="${escapeHtml(s.courier_whatsapp || '')}" />
          </div>
          <div class="field field-full">
            <label>PayBox Link (опционально)</label>
            <input name="paybox_link" value="${escapeHtml(s.paybox_link || '')}" placeholder="https://payboxapp.page.link/..." />
          </div>
          <div class="field">
            <label>Город по умолчанию</label>
            <input name="default_city" value="${escapeHtml(s.default_city || 'תל אביב')}" />
          </div>
          <div class="field">
            <label>מספר עוסק (Osek ID, опц.)</label>
            <input name="osek_id" value="${escapeHtml(s.osek_id || '')}" />
          </div>
        </div>

        <h3 style="margin:6px 0 0;font-size:0.95rem;color:var(--primary-dark);">Цены (₪)</h3>
        <div class="form-grid">
          <div class="field"><label>35л (small)</label><input name="price_small" type="number" value="${escapeHtml(s.price_small || 10)}" /></div>
          <div class="field"><label>70л (large)</label><input name="price_large" type="number" value="${escapeHtml(s.price_large || 15)}" /></div>
          <div class="field"><label>Картон</label><input name="price_cardboard" type="number" value="${escapeHtml(s.price_cardboard || 20)}" /></div>
          <div class="field"><label>Отдельный</label><input name="price_standalone" type="number" value="${escapeHtml(s.price_standalone || 25)}" /></div>
          <div class="field field-full"><label>Абонемент 10 выносов</label><input name="price_pass10" type="number" value="${escapeHtml(s.price_pass10 || 160)}" /></div>
        </div>

        <div class="notice-box notice-info">
          <strong>💳 ${escapeHtml(c.gatewayGuideTitle)}</strong><br/>
          ${escapeHtml(c.gatewayGuideDesc)}
        </div>

        <div class="form-grid">
          <div class="field field-full">
            <label>Провайдер эквайринга (Visa / Mastercard)</label>
            <select name="card_gateway_provider">
              ${[
                { id: 'none', label: 'Пока не подключён (показывать счёт/ссылку вручную)' },
                { id: 'grow', label: 'Grow (Meshulam / משולם)' },
                { id: 'payplus', label: 'PayPlus (פייפלוס)' },
                { id: 'tranzila', label: 'Tranzila (טרנזילה)' },
                { id: 'cardcom', label: 'Cardcom (קארדקום)' },
                { id: 'custom_link', label: 'Другая платёжная ссылка (Morning / Sumit / Stripe)' }
              ]
                .map(
                  (p) =>
                    `<option value="${p.id}" ${(s.card_gateway_provider || 'none') === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field field-full">
            <label>Платёжная ссылка / Checkout URL (можно с {amount} и {order_id})</label>
            <input name="card_payment_link" value="${escapeHtml(s.card_payment_link || '')}" placeholder="https://pay.grow.link/... или https://..." />
          </div>
          <div class="field">
            <label>Terminal / Page UID</label>
            <input name="merchant_terminal_id" value="${escapeHtml(s.merchant_terminal_id || '')}" placeholder="Терминал / Page UID" />
          </div>
          <div class="field">
            <label>API Key (формат key:secret для PayPlus)</label>
            <input name="merchant_api_key" type="password" value="${escapeHtml(s.merchant_api_key || '')}" placeholder="Секретный ключ" />
          </div>
          <div class="field field-full">
            <label>Webhook Secret (защита автоотметки «Оплачено»)</label>
            <input name="merchant_webhook_secret" value="${escapeHtml(s.merchant_webhook_secret || '')}" placeholder="Придумайте секретное слово" />
            <div style="font-size:0.72rem;color:var(--muted);margin-top:4px;word-break:break-all;">Webhook URL: <code>${escapeHtml(webhookUrl)}</code></div>
          </div>
        </div>

        <h3 style="margin:6px 0 0;font-size:0.95rem;color:var(--primary-dark);">Telegram уведомления о заказах (опционально)</h3>
        <div class="form-grid">
          <div class="field"><label>Bot Token</label><input name="tg_bot_token" value="${escapeHtml(s.tg_bot_token || '')}" /></div>
          <div class="field"><label>Chat ID</label><input name="tg_chat_id" value="${escapeHtml(s.tg_chat_id || '')}" /></div>
        </div>

        <button type="submit" class="btn-primary">${escapeHtml(c.saveSettingsBtn)}</button>
        <button type="button" class="btn-secondary" data-action="courier-logout">${escapeHtml(c.logoutBtn)}</button>
      </form>
    `;
  }

  function renderCourierView(t) {
    const c = t.courier;
    let body = '';
    if (state.courierTab === 'orders') body = renderCourierOrdersTab(t);
    else if (state.courierTab === 'stats') body = renderCourierStatsTab(t);
    else if (state.courierTab === 'qr') body = renderCourierQrTab(t);
    else if (state.courierTab === 'settings') body = renderCourierSettingsTab(t);

    return `
      <main class="main-content">
        <div class="subtabs">
          <button type="button" class="subtab-btn ${state.courierTab === 'orders' ? 'active' : ''}" data-ctab="orders">${escapeHtml(c.tabs.orders)}</button>
          <button type="button" class="subtab-btn ${state.courierTab === 'stats' ? 'active' : ''}" data-ctab="stats">${escapeHtml(c.tabs.stats)}</button>
          <button type="button" class="subtab-btn ${state.courierTab === 'qr' ? 'active' : ''}" data-ctab="qr">${escapeHtml(c.tabs.qr)}</button>
          <button type="button" class="subtab-btn ${state.courierTab === 'settings' ? 'active' : ''}" data-ctab="settings">${escapeHtml(c.tabs.settings)}</button>
        </div>
        ${body}
      </main>
    `;
  }

  function renderModals(t) {
    const c = t.courier;
    let html = '';
    if (state.showPinModal) {
      html += `
        <div class="modal-backdrop">
          <form id="pinForm" class="modal-card">
            <h3 style="margin:0 0 6px;">🛵 ${escapeHtml(c.loginTitle)}</h3>
            <p style="margin:0 0 12px;font-size:0.84rem;color:var(--muted);">${escapeHtml(c.loginSub)}</p>
            <div class="field" style="margin-bottom:12px;">
              <input id="pinInput" type="password" inputmode="numeric" autofocus placeholder="${escapeHtml(c.pinPlaceholder)}" />
            </div>
            <div class="action-grid">
              <button type="button" class="btn-secondary" data-action="close-pin">${escapeHtml(t.backToClient)}</button>
              <button type="submit" class="btn-primary" style="padding:10px;">${escapeHtml(c.loginBtn)}</button>
            </div>
          </form>
        </div>
      `;
    }
    if (state.showQuickDoorModal) {
      html += `
        <div class="modal-backdrop">
          <form id="quickDoorForm" class="modal-card" style="display:flex;flex-direction:column;gap:10px;">
            <h3 style="margin:0;">${escapeHtml(c.quickDoorTitle)}</h3>
            <div class="field"><label>${escapeHtml(t.fields.street)}</label><input name="street" required placeholder="${escapeHtml(t.fields.street_ph)}" /></div>
            <div class="form-grid">
              <div class="field"><label>${escapeHtml(t.fields.client_name)}</label><input name="client_name" value="Заказ с доставки" /></div>
              <div class="field"><label>Цена (₪)</label><input name="price_nis" type="number" value="${escapeHtml(state.config.prices.small || 10)}" /></div>
            </div>
            <div class="field">
              <label>${escapeHtml(t.secPayment)}</label>
              <select name="payment_method">
                <option value="cash">${escapeHtml(t.payments.cash.title)}</option>
                <option value="bit">${escapeHtml(t.payments.bit.title)}</option>
                <option value="card">${escapeHtml(t.payments.card.title)}</option>
                <option value="paybox">${escapeHtml(t.payments.paybox.title)}</option>
              </select>
            </div>
            <div class="action-grid" style="margin-top:4px;">
              <button type="button" class="btn-secondary" data-action="close-quick-door">Отмена</button>
              <button type="submit" class="btn-primary" style="padding:10px;">${escapeHtml(c.quickSaveBtn)}</button>
            </div>
          </form>
        </div>
      `;
    }
    return html;
  }

  function render() {
    const t = applyLangToDom(state.lang);
    let body = '';
    if (state.mode === 'courier') body = renderCourierView(t);
    else if (state.mode === 'tracker' && state.activeOrder) body = renderTrackerView(t);
    else body = renderClientView(t);

    appEl.innerHTML = renderHeader(t) + body + renderModals(t);
    bindDomEvents();
  }

  function bindDomEvents() {
    appEl.querySelectorAll('[data-lang]').forEach((el) => {
      el.addEventListener('click', () => {
        state.lang = el.dataset.lang;
        render();
      });
    });

    appEl.querySelectorAll('[data-tariff]').forEach((el) => {
      el.addEventListener('click', () => {
        state.form.tariff = el.dataset.tariff;
        render();
      });
    });

    appEl.querySelectorAll('[data-addon]').forEach((el) => {
      el.addEventListener('click', () => {
        const k = el.dataset.addon;
        const idx = state.form.addons.indexOf(k);
        if (idx >= 0) state.form.addons.splice(idx, 1);
        else state.form.addons.push(k);
        render();
      });
    });

    appEl.querySelectorAll('[data-handover]').forEach((el) => {
      el.addEventListener('click', () => {
        state.form.handover_mode = el.dataset.handover;
        render();
      });
    });

    appEl.querySelectorAll('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        state.form.pickup_slot = el.dataset.slot;
        render();
      });
    });

    appEl.querySelectorAll('[data-pay]').forEach((el) => {
      el.addEventListener('click', () => {
        state.form.payment_method = el.dataset.pay;
        render();
      });
    });

    appEl.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        state.form[el.dataset.field] = el.value;
      });
    });

    appEl.querySelectorAll('[data-open-order]').forEach((el) => {
      el.addEventListener('click', () => openHistoryOrder(el.dataset.openOrder, el.dataset.openToken));
    });

    appEl.querySelectorAll('[data-copy]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(el.dataset.copy);
          showToast(TRANSLATIONS[state.lang].tracker.copied);
        } catch (e) {}
      });
    });

    appEl.querySelectorAll('[data-ctab]').forEach((el) => {
      el.addEventListener('click', () => {
        state.courierTab = el.dataset.ctab;
        if (state.courierTab === 'orders') loadCourierOrders();
        else if (state.courierTab === 'stats') loadCourierStats();
        else if (state.courierTab === 'settings') loadCourierSettings();
        render();
      });
    });

    appEl.querySelectorAll('[data-cfilter]').forEach((el) => {
      el.addEventListener('click', () => {
        state.courierFilter = el.dataset.cfilter;
        loadCourierOrders();
      });
    });

    appEl.querySelectorAll('[data-toggle-paid]').forEach((el) => {
      el.addEventListener('click', async () => {
        const oid = el.dataset.togglePaid;
        const cur = el.dataset.paidVal === '1';
        try {
          await apiFetch(`/api/orders/${encodeURIComponent(oid)}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_paid: cur ? 0 : 1 })
          });
          await loadCourierOrders();
        } catch (e) {
          showToast(e.message);
        }
      });
    });

    appEl.querySelectorAll('[data-set-status]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/orders/${encodeURIComponent(el.dataset.oid)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: el.dataset.setStatus })
          });
          await loadCourierOrders();
        } catch (e) {
          showToast(e.message);
        }
      });
    });

    appEl.querySelectorAll('[data-photo-done]').forEach((el) => {
      el.addEventListener('click', () => {
        state.pendingPhotoOrderId = el.dataset.photoDone;
        fileInputEl.click();
      });
    });

    appEl.querySelectorAll('[data-delete-order]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/orders/${encodeURIComponent(el.dataset.deleteOrder)}`, { method: 'DELETE' });
          await loadCourierOrders();
        } catch (e) {
          showToast(e.message);
        }
      });
    });

    const act = (name, fn) => {
      const btn = appEl.querySelector(`[data-action="${name}"]`);
      if (btn) btn.addEventListener('click', fn);
    };

    act('submit-order', submitOrder);
    act('edit-address', () => {
      state.editingAddress = true;
      render();
    });
    act('done-edit-address', () => {
      saveProfileLocally();
      state.editingAddress = false;
      render();
    });
    act('new-order', () => {
      state.mode = 'client';
      state.activeOrder = null;
      render();
    });
    act('refresh-tracker', () => refreshActiveOrder(false));
    act('install-pwa', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      render();
    });
    act('toggle-courier', () => {
      if (state.mode === 'courier') {
        state.mode = 'client';
        render();
        return;
      }
      if (state.courierPin) {
        state.mode = 'courier';
        loadCourierOrders();
        startPolling();
        render();
      } else {
        state.showPinModal = true;
        render();
      }
    });
    act('close-pin', () => {
      state.showPinModal = false;
      render();
    });
    act('open-quick-door', () => {
      state.showQuickDoorModal = true;
      render();
    });
    act('close-quick-door', () => {
      state.showQuickDoorModal = false;
      render();
    });
    act('courier-logout', () => {
      state.courierPin = '';
      sessionStorage.removeItem('cleandrop_pin');
      state.mode = 'client';
      render();
    });

    const pinForm = document.getElementById('pinForm');
    if (pinForm) {
      pinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = document.getElementById('pinInput').value.trim();
        try {
          state.courierPin = pin;
          await apiFetch('/api/courier/verify', { method: 'POST' });
          sessionStorage.setItem('cleandrop_pin', pin);
          state.showPinModal = false;
          state.mode = 'courier';
          state.courierTab = 'orders';
          startPolling();
          await loadCourierOrders();
        } catch (err) {
          state.courierPin = '';
          showToast(TRANSLATIONS[state.lang].courier.wrongPin);
        }
      });
    }

    const quickForm = document.getElementById('quickDoorForm');
    if (quickForm) {
      quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(quickForm);
        try {
          await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
              lang: state.lang,
              client_name: fd.get('client_name') || 'У двери',
              phone: '-',
              city: state.config.default_city || 'תל אביב',
              street: fd.get('street'),
              tariff: 'small',
              price_nis: Number(fd.get('price_nis') || 10),
              payment_method: fd.get('payment_method'),
              is_paid: true,
              quick_done: true
            })
          });
          state.showQuickDoorModal = false;
          await loadCourierOrders();
          showToast('✓');
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(settingsForm);
        const payload = {};
        for (const [k, v] of fd.entries()) payload[k] = String(v);
        try {
          const res = await apiFetch('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          state.courierSettings = res.settings;
          if (payload.courier_pin) {
            state.courierPin = payload.courier_pin;
            sessionStorage.setItem('cleandrop_pin', payload.courier_pin);
          }
          await fetchPublicConfig();
          showToast(TRANSLATIONS[state.lang].courier.settingsSaved);
        } catch (err) {
          showToast(err.message);
        }
      });
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    render();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  }

  loadLocalData();
  render();
  fetchPublicConfig();
})();
