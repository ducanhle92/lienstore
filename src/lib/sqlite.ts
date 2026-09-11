import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

/**
 * SQLite connection + schema migrations for LienStore.
 *
 * - Uses Node's built-in `node:sqlite` (Node ≥ 22.13 / 24), so the Docker image needs no native build step.
 * - The database is a single file (`LIEN_DB_PATH`, default `data/lienstore.db`) — mount `/app/data` as a volume
 *   in production to keep orders/customers across container upgrades.
 * - Schema changes are appended to `MIGRATIONS`; each entry runs once, in order, inside a transaction.
 * - On an empty database the catalogue is imported from the seed JSON (`LIEN_SEED_PATH`, default `data/seed.json`).
 */

export const DB_PATH = process.env.LIEN_DB_PATH ?? path.join(process.cwd(), "data", "lienstore.db");
export const SEED_PATH = process.env.LIEN_SEED_PATH ?? path.join(process.cwd(), "data", "seed.json");

interface Migration {
  version: number;
  name: string;
  up: string[];
}

/** Append new entries here — never edit an already-shipped one. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: [
      `CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE categories (
        slug        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image       TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE products (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        slug              TEXT NOT NULL UNIQUE,
        name              TEXT NOT NULL,
        price             INTEGER NOT NULL,
        regular_price     INTEGER,
        currency          TEXT NOT NULL DEFAULT 'VNĐ',
        sku               TEXT,
        stock             INTEGER,
        stock_status      TEXT NOT NULL DEFAULT 'instock' CHECK (stock_status IN ('instock','outofstock')),
        tags              TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
        images            TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
        thumb             TEXT NOT NULL DEFAULT '',
        short_description TEXT NOT NULL DEFAULT '',
        description       TEXT NOT NULL DEFAULT '',
        related           TEXT NOT NULL DEFAULT '[]',   -- JSON string[] of product slugs
        rating            REAL,
        review_count      INTEGER NOT NULL DEFAULT 0,
        status            TEXT NOT NULL DEFAULT 'publish' CHECK (status IN ('publish','draft')),
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`,
      `CREATE INDEX idx_products_status ON products(status)`,
      `CREATE TABLE product_categories (
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        category_slug TEXT NOT NULL,
        position      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (product_id, category_slug)
      )`,
      `CREATE INDEX idx_product_categories_slug ON product_categories(category_slug)`,
      `CREATE TABLE customers (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        salt          TEXT NOT NULL,
        first_name    TEXT NOT NULL DEFAULT '',
        last_name     TEXT NOT NULL DEFAULT '',
        phone         TEXT NOT NULL DEFAULT '',
        address       TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )`,
      `CREATE TABLE orders (
        id             TEXT PRIMARY KEY,
        number         INTEGER NOT NULL UNIQUE,
        customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
        status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','cancelled')),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('bacs','cod')),
        first_name     TEXT NOT NULL DEFAULT '',
        last_name      TEXT NOT NULL DEFAULT '',
        address        TEXT NOT NULL DEFAULT '',
        phone          TEXT NOT NULL DEFAULT '',
        email          TEXT NOT NULL DEFAULT '',
        note           TEXT NOT NULL DEFAULT '',
        subtotal       INTEGER NOT NULL,
        total          INTEGER NOT NULL,
        currency       TEXT NOT NULL DEFAULT 'VNĐ',
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      )`,
      `CREATE INDEX idx_orders_status ON orders(status)`,
      `CREATE INDEX idx_orders_customer ON orders(customer_id)`,
      `CREATE INDEX idx_orders_email ON orders(email)`,
      `CREATE TABLE order_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        slug       TEXT NOT NULL,
        name       TEXT NOT NULL,
        price      INTEGER NOT NULL,
        image      TEXT NOT NULL DEFAULT '',
        quantity   INTEGER NOT NULL CHECK (quantity > 0)
      )`,
      `CREATE INDEX idx_order_items_order ON order_items(order_id)`,
      `CREATE TABLE pages (
        slug    TEXT PRIMARY KEY,
        title   TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        date    TEXT NOT NULL
      )`,
      `CREATE TABLE posts (
        slug    TEXT PRIMARY KEY,
        title   TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        date    TEXT NOT NULL
      )`,
      `INSERT INTO settings (key, value) VALUES ('next_order_number', '1001')`,
    ],
  },
  {
    version: 2,
    name: "product-cost-price",
    up: [`ALTER TABLE products ADD COLUMN cost_price INTEGER`],
  },
  {
    version: 3,
    name: "inventory-customers-files",
    up: [
      `ALTER TABLE products ADD COLUMN supplier_url TEXT`,
      `ALTER TABLE products ADD COLUMN min_stock INTEGER`,
      `ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''`,
      `CREATE TABLE order_files (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL DEFAULT 'receipt' CHECK (kind IN ('receipt','other')),
        file_name  TEXT NOT NULL,
        path       TEXT NOT NULL UNIQUE,
        mime       TEXT NOT NULL,
        size       INTEGER NOT NULL,
        note       TEXT NOT NULL DEFAULT '',
        amount_jpy INTEGER,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_order_files_order ON order_files(order_id)`,
    ],
  },
  {
    version: 4,
    name: "shipping-methods",
    up: [
      `CREATE TABLE shipping_methods (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        extra_label TEXT NOT NULL DEFAULT '',
        currency    TEXT NOT NULL DEFAULT 'đ',
        position    INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE shipping_zones (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        method_id       INTEGER NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        fee             INTEGER NOT NULL DEFAULT 0,
        unit            TEXT NOT NULL DEFAULT '',
        free_over       INTEGER,
        extra_fee       INTEGER,
        extra_free_over INTEGER,
        areas           TEXT NOT NULL DEFAULT '',
        eta             TEXT NOT NULL DEFAULT '',
        position        INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX idx_shipping_zones_method ON shipping_zones(method_id)`,
      `INSERT INTO shipping_methods (id, name, description, extra_label, currency, position) VALUES
        (1, 'Vận chuyển Nhật Bản → Việt Nam', 'Hàng được mua tại Nhật, gom đơn hàng tuần và gửi về Việt Nam. Phí tính theo cân nặng thực tế sau khi đóng gói.', 'Hàng lỏng / bình xịt / cồng kềnh', 'đ', 1),
        (2, 'Giao hàng nội địa Việt Nam', 'Từ kho Thanh Hóa giao tới tận nhà qua đơn vị vận chuyển. Phí tính theo khu vực nhận hàng.', '', 'đ', 2)`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position) VALUES
        (1, 'Đường bay', 280000, '/kg', NULL, 50000, NULL, 'Toàn quốc', '5–7 ngày từ khi gom đủ đơn', 1),
        (1, 'Đường biển', 120000, '/kg', NULL, 30000, NULL, 'Toàn quốc', '20–30 ngày', 2),
        (2, 'Thanh Hóa', 20000, '', 500000, NULL, NULL, 'TP Thanh Hóa, Hoằng Hóa, Sầm Sơn và các huyện trong tỉnh', '1 ngày', 1),
        (2, 'Miền Bắc', 30000, '', 1000000, NULL, NULL, 'Hà Nội, Hải Phòng, Nam Định, Ninh Bình, Nghệ An, Thái Bình, Hưng Yên, Bắc Ninh, Quảng Ninh…', '1–2 ngày', 2),
        (2, 'Miền Trung', 35000, '', 1000000, NULL, NULL, 'Hà Tĩnh, Quảng Bình, Quảng Trị, Huế, Đà Nẵng, Quảng Nam, Quảng Ngãi, Bình Định, Phú Yên, Khánh Hòa, Tây Nguyên', '2–3 ngày', 3),
        (2, 'Miền Nam', 40000, '', 1000000, NULL, NULL, 'TP Hồ Chí Minh, Bình Dương, Đồng Nai, Long An, Cần Thơ và các tỉnh Đồng bằng sông Cửu Long', '3–4 ngày', 4)`,
      `INSERT INTO settings (key, value) VALUES ('shipping_notes', '["Bảng phí mang tính tham khảo; LienStore báo phí chính xác khi xác nhận đơn qua Zalo/điện thoại.","Đơn nội địa đạt mức miễn phí của khu vực sẽ được miễn phí giao hàng.","Hàng lỏng, bình xịt, hàng cồng kềnh khi gửi từ Nhật có phụ phí theo quy định hãng bay.","Thời gian giao tính từ ngày hàng rời kho; ngày lễ, thời tiết xấu có thể chậm hơn.","Kiểm tra hàng khi nhận; hàng lỗi/nhầm được đổi trả theo chính sách của cửa hàng."]')`,
    ],
  },
  {
    version: 5,
    name: "user-roles",
    up: [
      `ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'`,
      `ALTER TABLE customers ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
    ],
  },
  {
    version: 6,
    name: "user-login-id",
    up: [
      `ALTER TABLE customers ADD COLUMN username TEXT`,
      `CREATE UNIQUE INDEX idx_customers_username ON customers(username) WHERE username IS NOT NULL`,
    ],
  },
  {
    version: 7,
    name: "category-parent",
    up: [`ALTER TABLE categories ADD COLUMN parent_slug TEXT`],
  },
  {
    version: 8,
    name: "product-weight-shipping-legs",
    up: [
      `ALTER TABLE products ADD COLUMN weight_g INTEGER`,
      `ALTER TABLE products ADD COLUMN dims_cm TEXT`,
      `CREATE TABLE shipping_carriers (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT NOT NULL,
        phone    TEXT NOT NULL DEFAULT '',
        website  TEXT NOT NULL DEFAULT '',
        note     TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
      )`,
      `ALTER TABLE shipping_methods ADD COLUMN leg TEXT NOT NULL DEFAULT 'jp_vn'`,
      `ALTER TABLE shipping_methods ADD COLUMN carrier_id INTEGER`,
      `ALTER TABLE shipping_methods ADD COLUMN includes_both_ends INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE shipping_methods ADD COLUMN warehouse TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE shipping_methods ADD COLUMN home_delivery INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE shipping_methods ADD COLUMN notes TEXT NOT NULL DEFAULT ''`,
      `INSERT INTO shipping_carriers (id, name, phone, website, note, position) VALUES
        (1, 'Kiến Express', '', '', 'Gom hàng Nhật → Hà Nội: đường bay, EMS, xách tay', 1),
        (2, 'Japan Post / EMS', '', 'https://www.post.japanpost.jp', 'Bưu điện Nhật', 2),
        (3, 'Yamato (Kuroneko)', '', 'https://www.kuronekoyamato.co.jp', 'Chuyển phát nội địa Nhật', 3),
        (4, 'Viettel Post', '1900 8095', 'https://viettelpost.com.vn', 'Giao nội địa Việt Nam', 4),
        (5, 'Giao Hàng Tiết Kiệm', '1900 6092', 'https://giaohangtietkiem.vn', 'Giao nội địa Việt Nam', 5)`,
      `UPDATE shipping_methods SET leg = 'jp_vn', carrier_id = 1, includes_both_ends = 1, home_delivery = 0,
        warehouse = 'Kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34 (〒286-0221) · Kho Việt Nam: Hà Nội (giao tiếp bằng ship nội địa)',
        notes = 'Kiện dưới 5 kg phụ thu 40.000đ/kiện\nGiá trọn gói từ kho Nhật đến kho Việt Nam, chưa gồm ship nội địa hai đầu\nHàng điện tử, rượu, trang sức, vòng huyết áp có bảng phụ thu riêng'
        WHERE id = 1`,
      `UPDATE shipping_methods SET leg = 'vn_domestic', carrier_id = 4, includes_both_ends = 1, home_delivery = 1 WHERE id = 2`,
    ],
  },
  {
    version: 9,
    name: "order-delivery-shipping-fee",
    up: [
      `ALTER TABLE orders ADD COLUMN shipping_fee INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE orders ADD COLUMN shipping_label TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE orders ADD COLUMN delivery TEXT NOT NULL DEFAULT 'ship'`,
      `ALTER TABLE orders ADD COLUMN prepaid_required INTEGER NOT NULL DEFAULT 0`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('pickup_address', 'Kho LienStore – Xã Hoằng Hóa, Tỉnh Thanh Hóa (hẹn giờ trước qua Zalo 0964 839 769)')`,
    ],
  },
  {
    version: 10,
    name: "carrier-legs",
    up: [
      `ALTER TABLE shipping_carriers ADD COLUMN legs TEXT NOT NULL DEFAULT 'jp_vn'`,
      `UPDATE shipping_carriers SET legs = 'jp_vn' WHERE id = 1`,
      `UPDATE shipping_carriers SET name = 'Japan Post (郵便 / EMS)', legs = 'jp_domestic,jp_vn', note = 'Bưu điện Nhật: gửi nội địa Nhật hoặc EMS quốc tế' WHERE id = 2`,
      `UPDATE shipping_carriers SET legs = 'jp_domestic' WHERE id = 3`,
      `UPDATE shipping_carriers SET legs = 'vn_domestic' WHERE id = 4`,
      `UPDATE shipping_carriers SET legs = 'vn_domestic' WHERE id = 5`,
      `INSERT INTO shipping_carriers (name, phone, website, note, position, legs) VALUES
        ('Sagawa (佐川急便)', '', 'https://www.sagawa-exp.co.jp', 'Chuyển phát nội địa Nhật', 6, 'jp_domestic'),
        ('Tự mang tới kho Nhật', '', '', 'Khách / người mua tự mang hàng tới kho gom', 7, 'jp_domestic'),
        ('LienStore gom tại nhà', '', '', 'Gom hàng tại nhà trong bán kính 30 km, từ 20 kg trở lên', 8, 'jp_domestic'),
        ('Bưu điện Việt Nam (VNPost)', '1900 54 54 81', 'https://www.vnpost.vn', 'Giao nội địa Việt Nam', 9, 'vn_domestic'),
        ('Khách tự tới kho lấy', '', '', 'Nhận tại kho Việt Nam, không tính phí', 10, 'vn_domestic')`,
    ],
  },
  {
    version: 11,
    name: "order-legs",
    up: [
      `CREATE TABLE order_legs (
        order_id  TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        leg       TEXT NOT NULL,
        method_id INTEGER,
        zone_id   INTEGER,
        label     TEXT NOT NULL DEFAULT '',
        fee       INTEGER NOT NULL DEFAULT 0,
        tracking  TEXT NOT NULL DEFAULT '',
        note      TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (order_id, leg)
      )`,
    ],
  },
  {
    version: 12,
    name: "vouchers-and-order-discount",
    up: [
      `CREATE TABLE vouchers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        code         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind         TEXT NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent','fixed')),
        value        INTEGER NOT NULL DEFAULT 0,
        min_subtotal INTEGER NOT NULL DEFAULT 0,
        max_discount INTEGER,
        starts_at    TEXT,
        ends_at      TEXT,
        usage_limit  INTEGER,
        used_count   INTEGER NOT NULL DEFAULT 0,
        active       INTEGER NOT NULL DEFAULT 1,
        note         TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      )`,
      `ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE orders ADD COLUMN voucher_code TEXT NOT NULL DEFAULT ''`,
    ],
  },
  {
    version: 13,
    name: "order-tracking-chat-default-methods",
    up: [
      `ALTER TABLE orders ADD COLUMN ship_stage TEXT NOT NULL DEFAULT 'ordered'`,
      `CREATE TABLE order_stage_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        stage      TEXT NOT NULL,
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_stage_log_order ON order_stage_log(order_id)`,
      `CREATE TABLE order_messages (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        sender           TEXT NOT NULL CHECK (sender IN ('customer','admin')),
        sender_name      TEXT NOT NULL DEFAULT '',
        body             TEXT NOT NULL,
        read_by_customer INTEGER NOT NULL DEFAULT 0,
        read_by_admin    INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL
      )`,
      `CREATE INDEX idx_order_messages_order ON order_messages(order_id)`,
      // Default methods so every leg has something to pick from (skipped where the shop already has one with that name).
      // Japan domestic (¥, per parcel size)
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Yamato 宅急便', 'Chuyển phát nội địa Nhật theo cỡ kiện (size = dài+rộng+cao, cm).', '', '¥', 10, 'jp_domestic', 3, 0, 'Về kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34', 1, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_domestic' AND name = 'Yamato 宅急便')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '', NULL, NULL, NULL, 'Toàn Nhật Bản', '1–2 ngày', z.pos FROM shipping_methods m
        JOIN (SELECT 'Size 60 (≤2 kg)' AS name, 940 AS fee, 1 AS pos UNION ALL SELECT 'Size 80 (≤5 kg)', 1230, 2 UNION ALL SELECT 'Size 100 (≤10 kg)', 1530, 3 UNION ALL SELECT 'Size 120 (≤15 kg)', 1850, 4) z
        WHERE m.leg = 'jp_domestic' AND m.name = 'Yamato 宅急便' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Japan Post ゆうパック', 'Bưu điện Nhật, gửi tại bưu cục hoặc combini.', '', '¥', 11, 'jp_domestic', 2, 0, 'Về kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34', 1, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_domestic' AND name = 'Japan Post ゆうパック')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '', NULL, NULL, NULL, 'Toàn Nhật Bản', '1–2 ngày', z.pos FROM shipping_methods m
        JOIN (SELECT 'Size 60' AS name, 810 AS fee, 1 AS pos UNION ALL SELECT 'Size 80', 1100, 2 UNION ALL SELECT 'Size 100', 1400, 3 UNION ALL SELECT 'Size 120', 1700, 4) z
        WHERE m.leg = 'jp_domestic' AND m.name = 'Japan Post ゆうパック' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Sagawa 飛脚宅配便', 'Chuyển phát nội địa Nhật.', '', '¥', 12, 'jp_domestic', (SELECT id FROM shipping_carriers WHERE name LIKE 'Sagawa%' LIMIT 1), 0, 'Về kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34', 1, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_domestic' AND name = 'Sagawa 飛脚宅配便')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '', NULL, NULL, NULL, 'Toàn Nhật Bản', '1–2 ngày', z.pos FROM shipping_methods m
        JOIN (SELECT 'Size 60' AS name, 880 AS fee, 1 AS pos UNION ALL SELECT 'Size 80', 1210, 2 UNION ALL SELECT 'Size 100', 1500, 3) z
        WHERE m.leg = 'jp_domestic' AND m.name = 'Sagawa 飛脚宅配便' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Tự mang tới kho Nhật', 'Khách / người mua tự mang hàng tới kho gom, không tính phí.', '', '¥', 13, 'jp_domestic', (SELECT id FROM shipping_carriers WHERE name = 'Tự mang tới kho Nhật' LIMIT 1), 0, 'Kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34', 0, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_domestic' AND name = 'Tự mang tới kho Nhật')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, 'Miễn phí', 0, '', NULL, NULL, NULL, 'Kho Nhật', 'Theo lịch hẹn', 1 FROM shipping_methods m
        WHERE m.leg = 'jp_domestic' AND m.name = 'Tự mang tới kho Nhật' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'LienStore gom tại nhà', 'LienStore tới tận nhà gom hàng trong bán kính 30 km, từ 20 kg trở lên.', '', '¥', 14, 'jp_domestic', (SELECT id FROM shipping_carriers WHERE name = 'LienStore gom tại nhà' LIMIT 1), 0, '', 1, 'Áp dụng trong bán kính 30 km quanh kho Nhật, đơn từ 20 kg'
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_domestic' AND name = 'LienStore gom tại nhà')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, 'Từ 20 kg, trong 30 km', 0, '', NULL, NULL, NULL, 'Quanh kho Nhật 30 km', 'Theo lịch hẹn', 1 FROM shipping_methods m
        WHERE m.leg = 'jp_domestic' AND m.name = 'LienStore gom tại nhà' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      // Japan → Vietnam: make sure the Kiến Express table exists, and add EMS as a second option
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Vận chuyển Nhật Bản → Việt Nam', 'Gom đơn hàng tuần và gửi về Việt Nam. Phí tính theo cân nặng thực tế sau khi đóng gói.', 'Hàng lỏng / bình xịt / cồng kềnh', 'đ', 1, 'jp_vn', 1, 1, 'Kho Nhật: Chiba-ken, Tomisato-shi, Nanae 880-34 · Kho Việt Nam: Hà Nội', 0, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_vn')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '/kg', NULL, z.extra, NULL, 'Toàn quốc', z.eta, z.pos FROM shipping_methods m
        JOIN (SELECT 'Đường bay' AS name, 280000 AS fee, 50000 AS extra, '5–7 ngày từ khi gom đủ đơn' AS eta, 1 AS pos UNION ALL SELECT 'Đường biển', 120000, 30000, '20–30 ngày', 2) z
        WHERE m.leg = 'jp_vn' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Japan Post EMS', 'Gửi thẳng từ bưu điện Nhật về địa chỉ Việt Nam, 3–6 ngày, có mã theo dõi.', '', '¥', 3, 'jp_vn', 2, 0, '', 1, 'Giá EMS Japan Post cho Việt Nam (zone 2), chưa gồm thuế nhập khẩu nếu có'
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'jp_vn' AND name = 'Japan Post EMS')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '', NULL, NULL, NULL, 'Toàn Việt Nam', '3–6 ngày', z.pos FROM shipping_methods m
        JOIN (SELECT '≤ 1 kg' AS name, 3150 AS fee, 1 AS pos UNION ALL SELECT '≤ 2 kg', 4400, 2 UNION ALL SELECT '≤ 5 kg', 7500, 3 UNION ALL SELECT '≤ 10 kg', 12600, 4 UNION ALL SELECT '≤ 20 kg', 22800, 5) z
        WHERE m.leg = 'jp_vn' AND m.name = 'Japan Post EMS' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      // Vietnam domestic: VNPost as an alternative carrier; "customer picks up" kept inactive so it does not show as a
      // delivery zone at checkout (the pickup radio covers that) but the admin can still assign it to an order.
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes)
        SELECT 'Bưu điện Việt Nam (VNPost)', 'Từ kho Thanh Hóa gửi qua bưu điện, phù hợp vùng xa.', '', 'đ', 20, 'vn_domestic', (SELECT id FROM shipping_carriers WHERE name LIKE 'Bưu điện Việt Nam%' LIMIT 1), 0, 'Kho Thanh Hóa', 1, ''
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'vn_domestic' AND name = 'Bưu điện Việt Nam (VNPost)')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, z.name, z.fee, '', z.free_over, NULL, NULL, z.areas, z.eta, z.pos FROM shipping_methods m
        JOIN (SELECT 'Thanh Hóa' AS name, 22000 AS fee, 500000 AS free_over, 'Trong tỉnh Thanh Hóa' AS areas, '1–2 ngày' AS eta, 1 AS pos
              UNION ALL SELECT 'Miền Bắc', 32000, 1000000, 'Các tỉnh miền Bắc', '2–3 ngày', 2
              UNION ALL SELECT 'Miền Trung', 38000, 1000000, 'Các tỉnh miền Trung, Tây Nguyên', '3–4 ngày', 3
              UNION ALL SELECT 'Miền Nam', 45000, 1000000, 'TP HCM và các tỉnh miền Nam', '4–5 ngày', 4) z
        WHERE m.leg = 'vn_domestic' AND m.name = 'Bưu điện Việt Nam (VNPost)' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
      `INSERT INTO shipping_methods (name, description, extra_label, currency, position, leg, carrier_id, includes_both_ends, warehouse, home_delivery, notes, active)
        SELECT 'Khách tự tới kho lấy', 'Khách tới kho Thanh Hóa nhận hàng, không tính phí (dùng khi khách đổi ý sau khi đặt).', '', 'đ', 21, 'vn_domestic', (SELECT id FROM shipping_carriers WHERE name = 'Khách tự tới kho lấy' LIMIT 1), 0, 'Kho LienStore – Xã Hoằng Hóa, Tỉnh Thanh Hóa', 0, 'Tắt hiển thị cho khách: trang thanh toán đã có lựa chọn "Nhận tại kho"', 0
        WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE leg = 'vn_domestic' AND name = 'Khách tự tới kho lấy')`,
      `INSERT INTO shipping_zones (method_id, name, fee, unit, free_over, extra_fee, extra_free_over, areas, eta, position)
        SELECT m.id, 'Kho Thanh Hóa', 0, '', NULL, NULL, NULL, 'Xã Hoằng Hóa, Thanh Hóa', 'Hẹn giờ qua Zalo', 1 FROM shipping_methods m
        WHERE m.leg = 'vn_domestic' AND m.name = 'Khách tự tới kho lấy' AND NOT EXISTS (SELECT 1 FROM shipping_zones WHERE method_id = m.id)`,
    ],
  },
  {
    version: 14,
    name: "dims-confidence-shipping-pricing",
    up: [
      `ALTER TABLE products ADD COLUMN dims_confidence TEXT`,
      `ALTER TABLE products ADD COLUMN dims_source TEXT NOT NULL DEFAULT ''`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('shipping_pricing_mode', 'per_order')`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('jpy_vnd_rate', '175')`,
    ],
  },
  {
    version: 15,
    name: "japanese-content",
    up: [
      `ALTER TABLE products ADD COLUMN name_ja TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE products ADD COLUMN short_description_ja TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE products ADD COLUMN description_ja TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE categories ADD COLUMN name_ja TEXT NOT NULL DEFAULT ''`,
    ],
  },
  {
    version: 16,
    name: "drop-mobile-app-page",
    up: [`DELETE FROM pages WHERE slug = 'them-ung-dung-lien-vao-mobile'`],
  },
  {
    // Product prices now include the Japan legs; checkout only adds the Vietnam domestic fee.
    version: 17,
    name: "shipping-included-in-price",
    up: [`UPDATE settings SET value = 'included' WHERE key = 'shipping_pricing_mode'`],
  },
  {
    // Customer-facing progress goes ordered → paid → in_transit → vn_warehouse → delivering → delivered.
    version: 18,
    name: "six-ship-stages",
    up: [
      `UPDATE orders SET ship_stage = 'paid' WHERE ship_stage = 'purchased'`,
      `UPDATE orders SET ship_stage = 'in_transit' WHERE ship_stage = 'jp_warehouse'`,
      `UPDATE order_stage_log SET stage = 'paid' WHERE stage = 'purchased'`,
      `UPDATE order_stage_log SET stage = 'in_transit' WHERE stage = 'jp_warehouse'`,
    ],
  },
  {
    // Customer reviews, moderated in admin before they appear on the product page.
    version: 19,
    name: "reviews",
    up: [
      `CREATE TABLE IF NOT EXISTS reviews (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL,
        author      TEXT NOT NULL,
        rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status)`,
    ],
  },
  {
    // Weight / box size measured by the owner for the 8 products the audit flagged (overwrites wrong values).
    version: 20,
    name: "owner-dims-2026-09-11",
    up: [
      `UPDATE products SET weight_g = 290, dims_cm = '7.5x7.5x19', dims_confidence = 'low', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'binh-sua-to-nho-pigeon'`,
      `UPDATE products SET weight_g = 1700, dims_cm = '23x21x7', dims_confidence = 'medium', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'dau-goi-xa-va-sua-tamdove-nhat-ban-set-2-va-set-3'`,
      `UPDATE products SET weight_g = 70, dims_cm = '21.7x13.2x3.3', dims_confidence = 'high', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'goc-giai-dap-tra-giam-can-night-diet-tea-orihiro'`,
      `UPDATE products SET weight_g = 120, dims_cm = '6.5x6.5x7', dims_confidence = 'medium', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'hang-cao-cap-kem-duong-mat-kose-sekkisei'`,
      `UPDATE products SET weight_g = 900, dims_cm = '39x21.5x7.5', dims_confidence = 'medium', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'set-dao-inox-global-nhat-ban'`,
      `UPDATE products SET weight_g = 200, dims_cm = '14x14.6x2', dims_confidence = 'low', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'socola-tuoi-nama-nhat-ban'`,
      `UPDATE products SET weight_g = 270, dims_cm = '8x8x24', dims_confidence = 'medium', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'binh-giu-nhiet-thermos'`,
      `UPDATE products SET weight_g = 290, dims_cm = '11.43x4.83x4.83', dims_confidence = 'medium', dims_source = 'Chủ shop cung cấp 2026-09-11' WHERE slug = 'tinh-chat-estee-lauder-advanced-night-repair-50ml'`,
    ],
  },
  {
    // Back-office customer number 10001, 10002… (never shown to shoppers) and vouchers that can be given to
    // specific accounts / hidden from the home-page strip.
    version: 21,
    name: "customer-no-and-private-vouchers",
    up: [
      `ALTER TABLE customers ADD COLUMN customer_no INTEGER`,
      `UPDATE customers SET customer_no = (SELECT 10000 + COUNT(*) FROM customers c2 WHERE c2.created_at < customers.created_at OR (c2.created_at = customers.created_at AND c2.id <= customers.id))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_no ON customers(customer_no)`,
      `ALTER TABLE vouchers ADD COLUMN show_home INTEGER NOT NULL DEFAULT 1`,
      `CREATE TABLE IF NOT EXISTS voucher_customers (
        voucher_id  INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL,
        PRIMARY KEY (voucher_id, customer_id)
      )`,
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Shape of `data/seed.json` (also what `npm run db:export` writes). */
export interface SeedFile {
  products?: Array<Record<string, unknown> & { id: number; slug: string; categories?: string[] }>;
  categories?: Array<{ slug: string; name: string; description?: string; image?: string | null; parent?: string | null; nameJa?: string }>;
  customers?: Array<Record<string, unknown> & { id: string; email: string }>;
  orders?: Array<Record<string, unknown> & { id: string; number: number; items?: Array<Record<string, unknown>> }>;
  pages?: Array<{ slug: string; title: string; content: string; date: string }>;
  posts?: Array<{ slug: string; title: string; content: string; excerpt: string; date: string }>;
  meta?: { nextOrderNumber?: number; seededAt?: string; removedSlugs?: string[]; contentRev?: number; categoryMoves?: Record<string, string> };
}

type SqliteModule = typeof import("node:sqlite");

function loadSqlite(): SqliteModule {
  // `process.getBuiltinModule` bypasses the bundler so Next.js never tries to resolve `node:sqlite` itself.
  const mod = process.getBuiltinModule("node:sqlite") as SqliteModule | undefined;
  if (!mod) throw new Error("node:sqlite is not available — LienStore requires Node.js 22.13+ (Node 24 recommended).");
  return mod;
}

const globalRef = globalThis as unknown as { __lienDb?: DatabaseSync };

function open(): DatabaseSync {
  const { DatabaseSync } = loadSqlite();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");
  migrate(db);
  seedIfEmpty(db);
  syncSeed(db);
  return db;
}

/** Process-wide connection (kept on globalThis so Next.js dev HMR does not leak handles). */
export function getDb(): DatabaseSync {
  if (!globalRef.__lienDb) globalRef.__lienDb = open();
  return globalRef.__lienDb;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    withTransaction(db, () => {
      for (const sql of m.up) db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
    });
    console.info(`[db] applied migration ${m.version} (${m.name})`);
  }
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DatabaseSync, key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function seedIfEmpty(db: DatabaseSync) {
  if (getSetting(db, "seeded_at")) return;
  if (!fs.existsSync(SEED_PATH)) {
    console.warn(`[db] empty database and no seed file at ${SEED_PATH} — starting with an empty catalogue`);
    setSetting(db, "seeded_at", new Date().toISOString());
    return;
  }
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as SeedFile;
  importSeed(db, seed);
  setSetting(db, "seed_version", seedVersion(seed));
  console.info(`[db] seeded ${seed.products?.length ?? 0} products, ${seed.categories?.length ?? 0} categories from ${SEED_PATH}`);
}

function seedVersion(seed: SeedFile): string {
  return seed.meta?.seededAt ?? "";
}

/**
 * Keep an already-seeded database in step with a newer seed file shipped in a new image.
 *  - default ("add"):   insert categories/products/pages/posts that do not exist yet (matched by slug); never touches
 *                       rows the admin may have edited, and never touches orders/customers.
 *  - LIEN_SEED_SYNC=update:    upsert every row present in the seed (matched by slug) — seed values win over admin edits
 *                              for those rows; rows only in the DB are kept. Use when Excel/seed is the source of truth.
 *  - LIEN_SEED_SYNC=update: seed rows replace existing ones, EXCEPT products edited on this server after the seed's
 *    updatedAt (last write wins) — admin edits in prod survive a release; removes meta.removedSlugs.
 *  - LIEN_SEED_SYNC=overwrite: replace the whole catalogue (products, categories, pages, posts) with the seed.
 *  - LIEN_SEED_SYNC=off:       never sync.
 * Runs once per seed version (meta.seededAt), so it costs nothing on normal restarts.
 */
function syncSeed(db: DatabaseSync) {
  const mode = (process.env.LIEN_SEED_SYNC ?? "add").toLowerCase();
  if (mode === "off" || !fs.existsSync(SEED_PATH)) return;
  let seed: SeedFile;
  try {
    seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as SeedFile;
  } catch (e) {
    console.warn(`[db] cannot read seed at ${SEED_PATH}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  // Offline-authored product copy travels with its own revision and is refreshed even when the seed version itself
  // (meta.seededAt) has not changed — a content-only release does not re-export the seed.
  withTransaction(db, () => syncContent(db, seed));
  const version = seedVersion(seed);
  if (!version || getSetting(db, "seed_version") === version) return;
  const before = {
    products: count(db, "products"),
    categories: count(db, "categories"),
    pages: count(db, "pages"),
    posts: count(db, "posts"),
  };
  if (mode === "overwrite") {
    withTransaction(db, () => {
      db.exec("DELETE FROM product_categories; DELETE FROM products; DELETE FROM categories; DELETE FROM pages; DELETE FROM posts;");
      importCatalogue(db, seed, "INSERT OR REPLACE");
      setSetting(db, "seed_version", version);
    });
  } else if (mode === "update") {
    withTransaction(db, () => {
      importCatalogue(db, seed, "INSERT OR REPLACE");
      removeListed(db, seed);
      setSetting(db, "seed_version", version);
    });
  } else {
    withTransaction(db, () => {
      importCatalogue(db, seed, "INSERT OR IGNORE");
      removeListed(db, seed);
      setSetting(db, "seed_version", version);
    });
  }
  console.info(
    `[db] seed sync (${mode}) → products ${before.products}→${count(db, "products")}, categories ${before.categories}→${count(db, "categories")}, pages ${before.pages}→${count(db, "pages")}, posts ${before.posts}→${count(db, "posts")}`,
  );
}

/** Delete products the seed marks as removed (duplicates merged away). Order lines keep their snapshot, so this is safe. */
/**
 * Product copy (Vietnamese + Japanese names and descriptions) is authored offline from the makers' pages and shipped in
 * the seed. When the seed carries a newer meta.contentRev, that copy replaces the server copy for every seed product —
 * even ones edited in admin after the export (last-write-wins would otherwise keep the old text). Prices, stock,
 * images and categories are not touched.
 */
function syncContent(db: DatabaseSync, seed: SeedFile) {
  const rev = seed.meta?.contentRev;
  if (!rev || getSetting(db, "seed_content_rev") === String(rev)) return;
  const upd = db.prepare(
    "UPDATE products SET short_description = ?, description = ?, name_ja = ?, short_description_ja = ?, description_ja = ? WHERE slug = ?",
  );
  // pictures found while sourcing the copy: only fill in where this server still has none
  const pic = db.prepare("UPDATE products SET images = ?, thumb = ? WHERE slug = ? AND (images IS NULL OR images = '' OR images = '[]')");
  let n = 0;
  let pics = 0;
  for (const p of seed.products ?? []) {
    const r = upd.run(str(p.shortDescription), str(p.description), str(p.nameJa), str(p.shortDescriptionJa), str(p.descriptionJa), p.slug);
    n += Number(r.changes);
    if (Array.isArray(p.images) && p.images.length) pics += Number(pic.run(arr(p.images), str(p.thumb), p.slug).changes);
  }
  setSetting(db, "seed_content_rev", String(rev));
  console.info(`[db] seed content rev ${rev}: refreshed the copy of ${n} product(s)${pics ? `, added pictures to ${pics}` : ""}`);
}

/**
 * meta.categoryMoves {old: new}: the catalogue tree was compacted offline. Product links (including those of products
 * edited or created on this server) move to the new category and the old category row disappears.
 */
function moveCategories(db: DatabaseSync, seed: SeedFile) {
  const moves = seed.meta?.categoryMoves ?? {};
  const entries = Object.entries(moves).filter(([a, b]) => a && b && a !== b);
  if (entries.length === 0) return;
  const dup = db.prepare("DELETE FROM product_categories WHERE category_slug = ? AND product_id IN (SELECT product_id FROM product_categories WHERE category_slug = ?)");
  const mv = db.prepare("UPDATE product_categories SET category_slug = ? WHERE category_slug = ?");
  const reparent = db.prepare("UPDATE categories SET parent_slug = ? WHERE parent_slug = ?");
  const del = db.prepare("DELETE FROM categories WHERE slug = ?");
  let links = 0;
  let removed = 0;
  for (const [from, to] of entries) {
    dup.run(from, to);
    links += Number(mv.run(to, from).changes);
    reparent.run(to, from);
    removed += Number(del.run(from).changes);
  }
  if (links || removed) console.info(`[db] category moves: ${links} product link(s) moved, ${removed} old category row(s) removed`);
}

function removeListed(db: DatabaseSync, seed: SeedFile) {
  moveCategories(db, seed);
  const slugs = (seed.meta?.removedSlugs ?? []).filter((s) => typeof s === "string" && s);
  if (slugs.length === 0) return;
  const del = db.prepare("DELETE FROM products WHERE slug = ?");
  let n = 0;
  for (const slug of slugs) n += Number(del.run(slug).changes);
  if (n) console.info(`[db] seed sync removed ${n} product(s) listed in meta.removedSlugs`);
}

function count(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number | null = null): number | null => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v : []);

type InsertVerb = "INSERT OR REPLACE" | "INSERT OR IGNORE";

/** Categories, products (+ their category links), pages and posts from a seed file. */
function importCatalogue(db: DatabaseSync, seed: SeedFile, verb: InsertVerb) {
  {
    const insCat = db.prepare(`${verb} INTO categories (slug, name, description, image, sort_order, parent_slug, name_ja) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    (seed.categories ?? []).forEach((c, i) => insCat.run(c.slug, c.name, c.description ?? "", c.image ?? null, i, c.parent ?? null, c.nameJa ?? ""));

    const insProd = db.prepare(`${verb} INTO products
      (id, slug, name, price, regular_price, cost_price, supplier_url, min_stock, currency, sku, stock, stock_status, tags, images, thumb, short_description, description,
       related, rating, review_count, status, created_at, updated_at, weight_g, dims_cm, dims_confidence, dims_source, name_ja, short_description_ja, description_ja)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insPC = db.prepare("INSERT OR REPLACE INTO product_categories (product_id, category_slug, position) VALUES (?, ?, ?)");
    const exists = db.prepare("SELECT id, updated_at FROM products WHERE slug = ?");
    const byId = db.prepare("SELECT slug FROM products WHERE id = ?");
    const backfillJa = db.prepare("UPDATE products SET name_ja = CASE WHEN name_ja = '' THEN ? ELSE name_ja END, short_description_ja = CASE WHEN short_description_ja = '' THEN ? ELSE short_description_ja END, description_ja = CASE WHEN description_ja = '' THEN ? ELSE description_ja END WHERE id = ?");
    const backfillDims = db.prepare("UPDATE products SET weight_g = COALESCE(weight_g, ?), dims_cm = COALESCE(dims_cm, ?), dims_confidence = COALESCE(dims_confidence, ?), dims_source = CASE WHEN dims_source = '' THEN ? ELSE dims_source END WHERE id = ?");
    let nextId = (db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM products").get() as { m: number }).m;
    for (const p of seed.products ?? []) if (typeof p.id === "number" && p.id > nextId) nextId = p.id;
    const now = new Date().toISOString();
    let keptNewer = 0;
    let reassigned = 0;
    for (const p of seed.products ?? []) {
      // Products created directly on this server (admin) take the next free id — the same number the dev machine may
      // have given a different new product. Never let the seed row overwrite them: give the seed row a fresh id.
      let id = p.id;
      const clash = byId.get(p.id) as { slug: string } | undefined;
      if (clash && clash.slug !== p.slug) {
        id = ++nextId;
        reassigned++;
      }
      // In "add" mode skip products already present (by slug) so admin edits and their category links survive.
      if (verb === "INSERT OR IGNORE" && exists.get(p.slug)) continue;
      // In "update" mode: last write wins. A product edited on this server (admin) AFTER the seed row was last
      // touched (Excel import / admin on the dev machine → db:export) keeps the server version; otherwise the seed
      // row replaces the old row (and its category links) under the same id.
      if (verb === "INSERT OR REPLACE") {
        const old = exists.get(p.slug) as { id: number; updated_at: string } | undefined;
        if (old && typeof p.updatedAt === "string" && old.updated_at > p.updatedAt) {
          keptNewer++;
          // Logistics data (weight / dimensions) is harvested offline and merged into the seed without touching
          // updatedAt, so still fill it in where this server has none — never overwrite an admin-entered value.
          const w = num(p.weightG);
          const d = typeof p.dimsCm === "string" && p.dimsCm ? p.dimsCm : null;
          const conf = p.dimsConfidence === "high" || p.dimsConfidence === "medium" || p.dimsConfidence === "low" ? p.dimsConfidence : null;
          if (w !== null || d !== null) backfillDims.run(w, d, conf, str(p.dimsSource), old.id);
          backfillJa.run(str(p.nameJa), str(p.shortDescriptionJa), str(p.descriptionJa), old.id);
          continue;
        }
        if (old && old.id !== id) db.prepare("DELETE FROM products WHERE id = ?").run(old.id);
        db.prepare("DELETE FROM product_categories WHERE product_id = ?").run(id);
      }
      insProd.run(
        id,
        p.slug,
        str(p.name),
        num(p.price, 0),
        num(p.regularPrice),
        num(p.costPrice),
        typeof p.supplierUrl === "string" && p.supplierUrl ? p.supplierUrl : null,
        num(p.minStock),
        str(p.currency, "VNĐ"),
        typeof p.sku === "string" ? p.sku : null,
        num(p.stock),
        p.stockStatus === "outofstock" ? "outofstock" : "instock",
        arr(p.tags),
        arr(p.images),
        str(p.thumb),
        str(p.shortDescription),
        str(p.description),
        arr(p.related),
        num(p.rating),
        num(p.reviewCount, 0),
        p.status === "draft" ? "draft" : "publish",
        str(p.createdAt, now),
        str(p.updatedAt, now),
        num(p.weightG),
        typeof p.dimsCm === "string" && p.dimsCm ? p.dimsCm : null,
        p.dimsConfidence === "high" || p.dimsConfidence === "medium" || p.dimsConfidence === "low" ? p.dimsConfidence : null,
        str(p.dimsSource),
        str(p.nameJa),
        str(p.shortDescriptionJa),
        str(p.descriptionJa),
      );
      (p.categories ?? []).forEach((slug, i) => insPC.run(id, slug, i));
    }
    if (keptNewer) console.info(`[db] seed sync kept ${keptNewer} product(s) edited on this server after the seed was exported`);
    if (reassigned) console.info(`[db] seed sync gave ${reassigned} new product(s) a fresh id because the seed id belonged to a product created on this server`);

    const insPage = db.prepare(`${verb} INTO pages (slug, title, content, date) VALUES (?, ?, ?, ?)`);
    for (const p of seed.pages ?? []) insPage.run(p.slug, p.title, p.content, p.date);
    const insPost = db.prepare(`${verb} INTO posts (slug, title, content, excerpt, date) VALUES (?, ?, ?, ?, ?)`);
    for (const p of seed.posts ?? []) insPost.run(p.slug, p.title, p.content, p.excerpt, p.date);
  }
}

/** Import a seed/export file into an (assumed empty) database. */
export function importSeed(db: DatabaseSync, seed: SeedFile) {
  withTransaction(db, () => {
    importCatalogue(db, seed, "INSERT OR REPLACE");
    const now = new Date().toISOString();

    const insCust = db.prepare(`INSERT OR REPLACE INTO customers
      (id, email, password_hash, salt, first_name, last_name, phone, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const c of seed.customers ?? []) {
      insCust.run(c.id, c.email, str(c.passwordHash), str(c.salt), str(c.firstName), str(c.lastName), str(c.phone), str(c.address), str(c.createdAt, now), str(c.updatedAt, now));
    }

    const insOrder = db.prepare(`INSERT OR REPLACE INTO orders
      (id, number, customer_id, status, payment_method, first_name, last_name, address, phone, email, note, subtotal, total, currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, slug, name, price, image, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const o of seed.orders ?? []) {
      const cust = (o.customer ?? {}) as Record<string, unknown>;
      insOrder.run(
        o.id,
        o.number,
        typeof o.customerId === "string" ? o.customerId : null,
        str(o.status, "pending"),
        str(o.paymentMethod, "cod"),
        str(cust.firstName),
        str(cust.lastName),
        str(cust.address),
        str(cust.phone),
        str(cust.email),
        str(cust.note),
        num(o.subtotal, 0),
        num(o.total, 0),
        str(o.currency, "VNĐ"),
        str(o.createdAt, now),
        str(o.updatedAt, now),
      );
      for (const it of o.items ?? []) {
        insItem.run(o.id, num(it.productId, 0), str(it.slug), str(it.name), num(it.price, 0), str(it.image), Math.max(1, num(it.quantity, 1) ?? 1));
      }
    }

    const maxOrder = (db.prepare("SELECT COALESCE(MAX(number), 1000) AS n FROM orders").get() as { n: number }).n;
    setSetting(db, "next_order_number", String(Math.max(seed.meta?.nextOrderNumber ?? 1001, maxOrder + 1)));
    setSetting(db, "seeded_at", now);
  });
}

/** Version info for /api/health. */
export function getSchemaInfo(db: DatabaseSync) {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  return { schemaVersion: row.v ?? 0, latest: SCHEMA_VERSION, path: DB_PATH };
}
