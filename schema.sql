CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('courier_pin', '1234'),
  ('bit_phone', '050-000-0000'),
  ('paybox_link', ''),
  ('courier_whatsapp', '972500000000'),
  ('default_city', 'תל אביב'),
  ('business_name', 'CleanDrop IL'),
  ('osek_id', ''),
  ('card_gateway_provider', 'none'),
  ('card_payment_link', ''),
  ('merchant_terminal_id', ''),
  ('merchant_api_key', ''),
  ('merchant_webhook_secret', ''),
  ('tg_bot_token', ''),
  ('tg_chat_id', ''),
  ('price_small', '10'),
  ('price_large', '15'),
  ('price_cardboard', '20'),
  ('price_standalone', '25'),
  ('price_pass10', '160');

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  client_token TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'he',
  client_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  street TEXT NOT NULL,
  floor TEXT DEFAULT '',
  apartment TEXT DEFAULT '',
  intercom TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tariff TEXT NOT NULL,
  addons TEXT DEFAULT '[]',
  handover_mode TEXT NOT NULL DEFAULT 'door_5min',
  pickup_slot TEXT NOT NULL DEFAULT 'now',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_provider TEXT DEFAULT '',
  payment_ref TEXT DEFAULT '',
  price_nis INTEGER NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  proof_photo TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
