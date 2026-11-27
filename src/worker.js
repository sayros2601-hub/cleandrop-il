const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Courier-Pin, X-Webhook-Secret'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS
    }
  });
}

function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = 'CD-';
  for (let i = 0; i < bytes.length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function getSettingsMap(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const row of results || []) {
    map[row.key] = row.value;
  }
  return map;
}

async function verifyCourierPin(request, db) {
  const pin = (request.headers.get('X-Courier-Pin') || '').trim();
  if (!pin) return false;
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('courier_pin').first();
  const expected = row ? row.value : '1234';
  return pin === expected;
}

function sanitizeText(val, maxLen = 200) {
  return String(val ?? '').trim().slice(0, maxLen);
}

function getIsraelDateParts(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const ilDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
  return {
    day: ilDate,
    month: ilDate.slice(0, 7)
  };
}

async function sendTelegramAlert(settings, order) {
  const token = (settings.tg_bot_token || '').trim();
  const chatId = (settings.tg_chat_id || '').trim();
  if (!token || !chatId) return;

  const fullAddr = `${order.street}, ${order.city}`;
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(fullAddr)}&navigate=yes`;
  const text = [
    `🛵 CleanDrop — Новый заказ ${order.id}`,
    `👤 ${order.client_name} (${order.phone})`,
    `📍 ${order.street}, ${order.city}`,
    `🏢 Этаж: ${order.floor || '-'} | Кв: ${order.apartment || '-'} | Домофон: ${order.intercom || '-'}`,
    `🛍️ Тариф: ${order.tariff} | 💵 ${order.price_nis} ₪ (${order.payment_method})`,
    order.notes ? `📝 ${order.notes}` : '',
    `🗺️ Waze: ${wazeUrl}`
  ].filter(Boolean).join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) {
    // Non-blocking notification failure
  }
}

function buildGatewayCheckoutUrl(settings, order, originUrl) {
  const provider = (settings.card_gateway_provider || 'none').trim();
  const linkTemplate = (settings.card_payment_link || '').trim();
  const terminalId = (settings.merchant_terminal_id || '').trim();

  if (linkTemplate) {
    const hasPlaceholders =
      linkTemplate.includes('{amount}') ||
      linkTemplate.includes('{order_id}') ||
      linkTemplate.includes('{phone}') ||
      linkTemplate.includes('{name}');

    if (hasPlaceholders) {
      const filled = linkTemplate
        .replaceAll('{amount}', encodeURIComponent(String(order.price_nis)))
        .replaceAll('{order_id}', encodeURIComponent(order.id))
        .replaceAll('{phone}', encodeURIComponent(order.phone))
        .replaceAll('{name}', encodeURIComponent(order.client_name));
      return { mode: 'redirect', provider, checkout_url: filled };
    }
    return { mode: 'redirect', provider, checkout_url: linkTemplate };
  }

  if (provider === 'tranzila' && terminalId) {
    const cleanTerminal = encodeURIComponent(terminalId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const notifyUrl = encodeURIComponent(`${originUrl}/api/payments/webhook`);
    const url = `https://direct.tranzila.com/${cleanTerminal}/iframenew.php?sum=${order.price_nis}&currency=1&order_id=${encodeURIComponent(order.id)}&contact=${encodeURIComponent(order.client_name)}&phone=${encodeURIComponent(order.phone)}&notify_url_address=${notifyUrl}`;
    return { mode: 'redirect', provider: 'tranzila', checkout_url: url };
  }

  return { mode: 'pending_merchant', provider, checkout_url: '' };
}

async function createPayPlusSession(settings, order, originUrl) {
  const apiKey = (settings.merchant_api_key || '').trim();
  const pageUid = (settings.merchant_terminal_id || '').trim();
  if (!apiKey || !pageUid) return null;

  const [keyPart, secretPart] = apiKey.includes(':') ? apiKey.split(':') : [apiKey, settings.merchant_webhook_secret || ''];
  if (!keyPart || !secretPart) return null;

  try {
    const resp = await fetch('https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': JSON.stringify({ api_key: keyPart, secret_key: secretPart })
      },
      body: JSON.stringify({
        payment_page_uid: pageUid,
        charge_method: 1,
        amount: order.price_nis,
        currency_code: 'ILS',
        sendEmailApproval: false,
        more_info: order.id,
        refURL_callback: `${originUrl}/api/payments/webhook`,
        customer: {
          customer_name: order.client_name,
          phone: order.phone
        }
      })
    });
    if (!resp.ok) return null;
    const payload = await resp.json();
    const link = payload?.data?.payment_page_link;
    if (link) {
      return { mode: 'redirect', provider: 'payplus', checkout_url: link };
    }
  } catch (e) {
    return null;
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const db = env.DB;

    try {
      if (pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse({ ok: true, service: 'CleanDrop IL', timestamp: new Date().toISOString() });
      }

      if (pathname === '/api/public-config' && request.method === 'GET') {
        const s = await getSettingsMap(db);
        const provider = s.card_gateway_provider || 'none';
        const cardReady = Boolean((s.card_payment_link || '').trim() || (provider !== 'none' && (s.merchant_terminal_id || '').trim()));
        return jsonResponse({
          bit_phone: s.bit_phone || '050-000-0000',
          paybox_link: s.paybox_link || '',
          courier_whatsapp: s.courier_whatsapp || '972500000000',
          default_city: s.default_city || 'תל אביב',
          business_name: s.business_name || 'CleanDrop IL',
          osek_id: s.osek_id || '',
          card_gateway_provider: provider,
          card_enabled: cardReady,
          prices: {
            small: Number(s.price_small || 10),
            large: Number(s.price_large || 15),
            cardboard: Number(s.price_cardboard || 20),
            standalone: Number(s.price_standalone || 25),
            pass10: Number(s.price_pass10 || 160)
          }
        });
      }

      if (pathname === '/api/courier/verify' && request.method === 'POST') {
        const ok = await verifyCourierPin(request, db);
        if (!ok) return jsonResponse({ error: 'Invalid PIN' }, 401);
        return jsonResponse({ ok: true });
      }

      if (pathname === '/api/orders' && request.method === 'POST') {
        const body = await request.json();
        const clientName = sanitizeText(body.client_name, 80);
        const phone = sanitizeText(body.phone, 30);
        const city = sanitizeText(body.city, 60);
        const street = sanitizeText(body.street, 120);
        const tariff = sanitizeText(body.tariff, 30);
        const allowedTariffs = new Set(['small', 'large', 'cardboard', 'standalone', 'pass10']);

        if (!clientName || !phone || !city || !street || !allowedTariffs.has(tariff)) {
          return jsonResponse({ error: 'Missing or invalid required fields' }, 400);
        }

        const settings = await getSettingsMap(db);
        const baseMap = {
          small: Number(settings.price_small || 10),
          large: Number(settings.price_large || 15),
          cardboard: Number(settings.price_cardboard || 20),
          standalone: Number(settings.price_standalone || 25),
          pass10: Number(settings.price_pass10 || 160)
        };

        const rawAddons = Array.isArray(body.addons) ? body.addons : [];
        const allowedAddons = new Set(['extra_bag', 'no_elevator', 'heavy_litter']);
        const addons = rawAddons.filter((a) => allowedAddons.has(String(a)));

        const isCourierQuick = Boolean(body.quick_done) && (await verifyCourierPin(request, db));
        const customPrice = isCourierQuick && Number(body.price_nis) > 0 ? Number(body.price_nis) : null;
        const computedPrice = customPrice ?? (baseMap[tariff] + addons.length * 5);

        const lang = ['he', 'ar', 'ru'].includes(body.lang) ? body.lang : 'he';
        const handover = body.handover_mode === 'hand' ? 'hand' : 'door_5min';
        const paymentMethod = ['cash', 'card', 'bit', 'paybox'].includes(body.payment_method)
          ? body.payment_method
          : 'cash';
        const pickupSlot = sanitizeText(body.pickup_slot || 'now', 40);
        const nowIso = new Date().toISOString();
        const id = generateOrderId();
        const clientToken = crypto.randomUUID();
        const status = isCourierQuick ? 'done' : 'pending';
        const isPaid = isCourierQuick && body.is_paid ? 1 : 0;

        await db.prepare(
          `INSERT INTO orders (
            id, client_token, lang, client_name, phone, city, street, floor, apartment,
            intercom, notes, tariff, addons, handover_mode, pickup_slot, payment_method,
            payment_provider, payment_ref, price_nis, is_paid, status, proof_photo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          clientToken,
          lang,
          clientName,
          phone,
          city,
          street,
          sanitizeText(body.floor, 15),
          sanitizeText(body.apartment, 15),
          sanitizeText(body.intercom, 30),
          sanitizeText(body.notes, 250),
          tariff,
          JSON.stringify(addons),
          handover,
          pickupSlot,
          paymentMethod,
          paymentMethod === 'card' ? (settings.card_gateway_provider || 'none') : '',
          '',
          computedPrice,
          isPaid,
          status,
          '',
          nowIso,
          nowIso
        ).run();

        const created = await db.prepare(
          `SELECT id, client_token, lang, client_name, phone, city, street, floor, apartment,
                  intercom, notes, tariff, addons, handover_mode, pickup_slot, payment_method,
                  payment_provider, price_nis, is_paid, status, created_at, updated_at
           FROM orders WHERE id = ?`
        ).bind(id).first();

        if (!isCourierQuick) {
          ctx.waitUntil(sendTelegramAlert(settings, created));
        }

        return jsonResponse({ id, client_token: clientToken, order: created }, 201);
      }

      if (pathname === '/api/orders' && request.method === 'GET') {
        if (!(await verifyCourierPin(request, db))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const statusFilter = searchParams.get('status') || 'all';
        let query = `
          SELECT id, lang, client_name, phone, city, street, floor, apartment, intercom, notes,
                 tariff, addons, handover_mode, pickup_slot, payment_method, payment_provider,
                 payment_ref, price_nis, is_paid, status,
                 CASE WHEN length(proof_photo) > 0 THEN 1 ELSE 0 END AS has_photo,
                 created_at, updated_at
          FROM orders
        `;
        if (statusFilter === 'active') {
          query += ` WHERE status IN ('pending', 'on_the_way', 'picked_up')`;
        } else if (statusFilter === 'done') {
          query += ` WHERE status IN ('done', 'cancelled')`;
        }
        query += ` ORDER BY created_at DESC LIMIT 100`;

        const { results } = await db.prepare(query).all();
        return jsonResponse({ orders: results || [] });
      }

      const photoMatch = pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/photo$/);
      if (photoMatch && request.method === 'GET') {
        const orderId = photoMatch[1];
        const token = searchParams.get('token') || '';
        const isCourier = await verifyCourierPin(request, db);
        const row = await db.prepare('SELECT client_token, proof_photo FROM orders WHERE id = ?').bind(orderId).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        if (!isCourier && (!token || token !== row.client_token)) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        return jsonResponse({ proof_photo: row.proof_photo || '' });
      }

      const orderMatch = pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)$/);
      if (orderMatch) {
        const orderId = orderMatch[1];

        if (request.method === 'GET') {
          const token = searchParams.get('token') || '';
          const isCourier = await verifyCourierPin(request, db);
          const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
          if (!row) return jsonResponse({ error: 'Order not found' }, 404);
          if (!isCourier && (!token || token !== row.client_token)) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
          }
          const safeOrder = { ...row };
          if (!isCourier) delete safeOrder.client_token;
          return jsonResponse({ order: safeOrder });
        }

        if (request.method === 'PATCH') {
          if (!(await verifyCourierPin(request, db))) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
          }
          const existing = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
          if (!existing) return jsonResponse({ error: 'Order not found' }, 404);

          const body = await request.json();
          const allowedStatuses = new Set(['pending', 'on_the_way', 'picked_up', 'done', 'cancelled']);
          const nextStatus = body.status !== undefined ? String(body.status) : existing.status;
          if (!allowedStatuses.has(nextStatus)) {
            return jsonResponse({ error: 'Invalid status' }, 400);
          }

          const nextPaid = body.is_paid !== undefined ? (body.is_paid ? 1 : 0) : existing.is_paid;
          let nextPhoto = existing.proof_photo;
          if (body.proof_photo !== undefined) {
            const p = String(body.proof_photo || '');
            if (p.length > 0 && (!p.startsWith('data:image/') || p.length > 220000)) {
              return jsonResponse({ error: 'Invalid or oversized proof photo (max ~150KB)' }, 400);
            }
            nextPhoto = p;
          }

          const nowIso = new Date().toISOString();
          await db.prepare(
            'UPDATE orders SET status = ?, is_paid = ?, proof_photo = ?, updated_at = ? WHERE id = ?'
          ).bind(nextStatus, nextPaid, nextPhoto, nowIso, orderId).run();

          const updated = await db.prepare(
            `SELECT id, lang, client_name, phone, city, street, floor, apartment, intercom, notes,
                    tariff, addons, handover_mode, pickup_slot, payment_method, payment_provider,
                    payment_ref, price_nis, is_paid, status,
                    CASE WHEN length(proof_photo) > 0 THEN 1 ELSE 0 END AS has_photo,
                    created_at, updated_at
             FROM orders WHERE id = ?`
          ).bind(orderId).first();
          return jsonResponse({ order: updated });
        }

        if (request.method === 'DELETE') {
          if (!(await verifyCourierPin(request, db))) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
          }
          const res = await db.prepare('DELETE FROM orders WHERE id = ?').bind(orderId).run();
          if (!res.meta || res.meta.changes === 0) {
            return jsonResponse({ error: 'Order not found' }, 404);
          }
          return jsonResponse({ ok: true, deleted: orderId });
        }
      }

      if (pathname === '/api/payments/create-session' && request.method === 'POST') {
        const body = await request.json();
        const orderId = sanitizeText(body.order_id, 40);
        const token = sanitizeText(body.client_token, 80);
        if (!orderId || !token) return jsonResponse({ error: 'Missing order_id or client_token' }, 400);

        const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        if (!order || order.client_token !== token) {
          return jsonResponse({ error: 'Unauthorized or order not found' }, 401);
        }

        const settings = await getSettingsMap(db);
        if ((settings.card_gateway_provider || '') === 'payplus' && !(settings.card_payment_link || '').trim()) {
          const pp = await createPayPlusSession(settings, order, url.origin);
          if (pp) return jsonResponse({ ok: true, amount_nis: order.price_nis, ...pp });
        }

        const session = buildGatewayCheckoutUrl(settings, order, url.origin);
        return jsonResponse({ ok: true, amount_nis: order.price_nis, ...session });
      }

      if (pathname === '/api/payments/webhook' && request.method === 'POST') {
        const settings = await getSettingsMap(db);
        const expectedSecret = (settings.merchant_webhook_secret || '').trim();
        const suppliedSecret = (
          request.headers.get('X-Webhook-Secret') ||
          searchParams.get('secret') ||
          ''
        ).trim();

        if (!expectedSecret || suppliedSecret !== expectedSecret) {
          return jsonResponse({ error: 'Webhook secret missing or invalid' }, 401);
        }

        const contentType = request.headers.get('Content-Type') || '';
        let payload = {};
        if (contentType.includes('application/json')) {
          payload = await request.json();
        } else {
          const form = await request.formData();
          for (const [k, v] of form.entries()) payload[k] = v;
        }

        const orderId = sanitizeText(
          payload.order_id || payload.more_info || payload.ReturnValue || payload.custom1 || payload.orderId || '',
          40
        );
        if (!orderId) return jsonResponse({ error: 'Missing order_id in webhook' }, 400);

        const txRef = sanitizeText(
          payload.transaction_uid || payload.ConfirmationCode || payload.asmachta || payload.tx_id || 'gateway_ok',
          80
        );
        const approved =
          payload.paid === true ||
          payload.status === 'approved' ||
          payload.status_code === '000' ||
          payload.Response === '000' ||
          payload.responseCode === 0;

        if (!approved) {
          return jsonResponse({ ok: false, message: 'Payment not approved' });
        }

        const nowIso = new Date().toISOString();
        await db.prepare(
          'UPDATE orders SET is_paid = 1, payment_ref = ?, updated_at = ? WHERE id = ?'
        ).bind(txRef, nowIso, orderId).run();

        return jsonResponse({ ok: true, order_id: orderId, paid: true });
      }

      if (pathname === '/api/stats' && request.method === 'GET') {
        if (!(await verifyCourierPin(request, db))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const { day: todayIl, month: monthIl } = getIsraelDateParts();
        const { results } = await db.prepare(
          'SELECT price_nis, is_paid, status, created_at FROM orders WHERE status != ? ORDER BY created_at DESC LIMIT 500'
        ).bind('cancelled').all();

        let todayRevenue = 0;
        let todayCount = 0;
        let activeCount = 0;
        let monthRevenue = 0;
        let paidTotal = 0;
        let unpaidTotal = 0;

        for (const r of results || []) {
          const parts = getIsraelDateParts(r.created_at);
          const price = Number(r.price_nis || 0);
          if (['pending', 'on_the_way', 'picked_up'].includes(r.status)) {
            activeCount++;
          }
          if (parts.day === todayIl) {
            todayRevenue += price;
            todayCount++;
          }
          if (parts.month === monthIl) {
            monthRevenue += price;
          }
          if (r.is_paid) {
            paidTotal += price;
          } else {
            unpaidTotal += price;
          }
        }

        return jsonResponse({
          today_il: todayIl,
          today_revenue: todayRevenue,
          today_count: todayCount,
          active_count: activeCount,
          month_revenue: monthRevenue,
          paid_total: paidTotal,
          unpaid_total: unpaidTotal
        });
      }

      if (pathname === '/api/settings' && request.method === 'GET') {
        if (!(await verifyCourierPin(request, db))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const s = await getSettingsMap(db);
        return jsonResponse({ settings: s });
      }

      if (pathname === '/api/settings' && request.method === 'PUT') {
        if (!(await verifyCourierPin(request, db))) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        const body = await request.json();
        const editableKeys = [
          'courier_pin',
          'bit_phone',
          'paybox_link',
          'courier_whatsapp',
          'default_city',
          'business_name',
          'osek_id',
          'card_gateway_provider',
          'card_payment_link',
          'merchant_terminal_id',
          'merchant_api_key',
          'merchant_webhook_secret',
          'tg_bot_token',
          'tg_chat_id',
          'price_small',
          'price_large',
          'price_cardboard',
          'price_standalone',
          'price_pass10'
        ];

        for (const key of editableKeys) {
          if (body[key] !== undefined) {
            const val = sanitizeText(body[key], 300);
            if (key === 'courier_pin' && val.length < 4) {
              return jsonResponse({ error: 'PIN must be at least 4 characters' }, 400);
            }
            await db.prepare(
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
            ).bind(key, val).run();
          }
        }
        const updated = await getSettingsMap(db);
        return jsonResponse({ ok: true, settings: updated });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: 'Server error', detail: err?.message || String(err) }, 500);
    }
  }
};
