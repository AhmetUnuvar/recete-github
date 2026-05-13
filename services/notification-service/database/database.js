const { Pool } = require("pg");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL });

/** Sabit ID: ana sayfa karşılama bildirimi (seed / UPSERT). */
const HOME_WELCOME_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000001";

const HOME_WELCOME_TITLE = "Ana sayfaya hoş geldiniz";

const HOME_WELCOME_MESSAGE = `Burada günlük, haftalık, aylık ve yıllık kazanç özetlerinizi tek bakışta görebilirsiniz.

Bu özetler; stok işlemlerinizi, sabit gelir/giderlerinizi ve kayıtlı tüm işlemlerinizi esas alır.

Öne çıkan içerikler:
- Stok alımlarınızın etkisi
- Sattığınız ürünlerden elde ettiğiniz karlar
- Sabit gelir ve gider kalemleri
- Ek olarak girdiğiniz gelir ve gider işlemleri`;

const HOME_WELCOME_TARGET_PAGE = "ana sayfa";

const seedHomeWelcomeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [HOME_WELCOME_NOTIFICATION_ID, HOME_WELCOME_TITLE, HOME_WELCOME_MESSAGE, HOME_WELCOME_TARGET_PAGE]
  );
  console.log("[notification-service][seed] Ana sayfa bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: urun ekle sayfasi bilgilendirme (seed / UPSERT). */
const ADD_PRODUCT_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000002";

const ADD_PRODUCT_NOTICE_TITLE = "Urun ekle";

const ADD_PRODUCT_NOTICE_MESSAGE = `Bu sayfada ürünlerinizi ekleyebilirsiniz.

Ürün üretirken kullandığınız malzemeleri malzeme ekle butonuna basarak stoğunuzdan ekleyebilirsiniz. Ürünün kaç saatte üretildiğini tahmini bir şekilde yazarsanız sabit giderlere eklediğiniz giderlerinizden sizin yerinize hesaplar.`;

const ADD_PRODUCT_NOTICE_TARGET_PAGE = "urun ekle";

const seedAddProductNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [ADD_PRODUCT_NOTICE_NOTIFICATION_ID, ADD_PRODUCT_NOTICE_TITLE, ADD_PRODUCT_NOTICE_MESSAGE, ADD_PRODUCT_NOTICE_TARGET_PAGE]
  );
  console.log("[notification-service][seed] Urun ekle sayfasi bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: musteriler sayfasi bilgilendirme (seed / UPSERT). */
const CUSTOMERS_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000003";

const CUSTOMERS_NOTICE_TITLE = "Müşteriler";

const CUSTOMERS_NOTICE_MESSAGE = `Müşteriler sayfasında eklediğiniz müşteriler görüntülenir. Bir müşteriye tıklayarak ilgili siparişten ne kadar kâr veya zarar ettiğinizi görebilirsiniz. Ayrıca müşteriye özel gelir ve gider ekleyebilirsiniz.

Müşteri detay sayfasında bulunan "Reçeteyi Tamamla" butonunu kullanarak siparişi tamamlayabilirsiniz.

Sayfadaki "İndir" butonu sayesinde müşteriye ait ticari bilgileri indirip başkalarıyla paylaşabilirsiniz.`;

const CUSTOMERS_NOTICE_TARGET_PAGE = "musteriler";

const seedCustomersNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [CUSTOMERS_NOTICE_NOTIFICATION_ID, CUSTOMERS_NOTICE_TITLE, CUSTOMERS_NOTICE_MESSAGE, CUSTOMERS_NOTICE_TARGET_PAGE]
  );
  console.log("[notification-service][seed] Musteriler sayfasi bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: sabit gelir/gider ekle sayfasi bilgilendirme (seed / UPSERT). */
const FIXED_INCOME_EXPENSE_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000004";

const FIXED_INCOME_EXPENSE_NOTICE_TITLE = "Sabit gelir / gider";

const FIXED_INCOME_EXPENSE_NOTICE_MESSAGE = `Stok gelir/gider ekleme sayfasında kira, maaş, yemek, yol ve benzeri sabit giderlerinizi ekleyebilirsiniz. Eklediğiniz sabit giderler aylık olarak hesaplanır ve ürünlerinizin üretim sürelerine göre maliyet hesabına otomatik olarak dahil edilir.

Eklediğiniz gelir ve gider kayıtları her ay düzenli olarak hesabınıza işlenir.`;

const FIXED_INCOME_EXPENSE_NOTICE_TARGET_PAGE = "sabit gelir gider";

const seedFixedIncomeExpenseNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [
      FIXED_INCOME_EXPENSE_NOTICE_NOTIFICATION_ID,
      FIXED_INCOME_EXPENSE_NOTICE_TITLE,
      FIXED_INCOME_EXPENSE_NOTICE_MESSAGE,
      FIXED_INCOME_EXPENSE_NOTICE_TARGET_PAGE
    ]
  );
  console.log("[notification-service][seed] Sabit gelir/gider sayfasi bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: sabit gelir giderlerim listesi bilgilendirme (seed / UPSERT). */
const FIXED_MY_LIST_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000005";

const FIXED_MY_LIST_NOTICE_TITLE = "Sabit gelir giderlerim";

const FIXED_MY_LIST_NOTICE_MESSAGE =
  "Bu sayfada eklediğiniz sabit gelir ve giderleri görüntüleyebilir, düzenleyebilir veya silebilirsiniz.";

const FIXED_MY_LIST_NOTICE_TARGET_PAGE = "sabit gelir giderlerim";

const seedFixedMyListNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [
      FIXED_MY_LIST_NOTICE_NOTIFICATION_ID,
      FIXED_MY_LIST_NOTICE_TITLE,
      FIXED_MY_LIST_NOTICE_MESSAGE,
      FIXED_MY_LIST_NOTICE_TARGET_PAGE
    ]
  );
  console.log("[notification-service][seed] Sabit gelir giderlerim bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: stok ekle sayfasi bilgilendirme (seed / UPSERT). */
const STOCK_ADD_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000006";

const STOCK_ADD_NOTICE_TITLE = "Stok ekle";

const STOCK_ADD_NOTICE_MESSAGE = `Stok ekleme sayfasında satın aldığınız stokları sisteme ekleyebilirsiniz. Eklediğiniz stoklar "Stoklarım" sayfasında görüntülenecektir.`;

const STOCK_ADD_NOTICE_TARGET_PAGE = "stok ekle";

const seedStockAddNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [STOCK_ADD_NOTICE_NOTIFICATION_ID, STOCK_ADD_NOTICE_TITLE, STOCK_ADD_NOTICE_MESSAGE, STOCK_ADD_NOTICE_TARGET_PAGE]
  );
  console.log("[notification-service][seed] Stok ekle sayfasi bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: stoklarim listesi bilgilendirme (seed / UPSERT). */
const MY_STOCKS_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000007";

const MY_STOCKS_NOTICE_TITLE = "Stoklarım";

const MY_STOCKS_NOTICE_MESSAGE = `"Stoklarım" sayfasında, stok ekleme sayfasında eklediğiniz stoklar görüntülenir. İndir butonunu kullanarak stok bilgilerinizi indirebilir ve diğer kişilerle paylaşabilirsiniz.

Ayrıca stoklarınızı düzenleyebilir veya silebilirsiniz.`;

const MY_STOCKS_NOTICE_TARGET_PAGE = "stoklarim";

const seedMyStocksNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [MY_STOCKS_NOTICE_NOTIFICATION_ID, MY_STOCKS_NOTICE_TITLE, MY_STOCKS_NOTICE_MESSAGE, MY_STOCKS_NOTICE_TARGET_PAGE]
  );
  console.log("[notification-service][seed] Stoklarim sayfasi bildirimi notification_db de hazir (id sabit).");
};

/** Sabit ID: urun recetelerim listesi bilgilendirme (seed / UPSERT). */
const MY_PRODUCTS_RECIPES_NOTICE_NOTIFICATION_ID = "c0ffee00-b00b-4000-8000-000000000008";

const MY_PRODUCTS_RECIPES_NOTICE_TITLE = "Ürün reçetelerim";

const MY_PRODUCTS_RECIPES_NOTICE_MESSAGE = `Bu sayfada, ürün reçetesi ekleme sayfasında oluşturduğunuz ürün reçeteleri görüntülenir.

Reçetenin yanında bulunan "Üret" butonuna bastığınızda, ilgili ürün üretilir ve reçetede kullanılan malzemeler otomatik olarak stoktan düşülür.`;

const MY_PRODUCTS_RECIPES_NOTICE_TARGET_PAGE = "urun recetelerim";

const seedMyProductsRecipesNoticeNotification = async (pool) => {
  await pool.query(
    `INSERT INTO notification_db (id, title, message, target_page, is_active)
     VALUES ($1::uuid, $2, $3, $4, TRUE)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       target_page = EXCLUDED.target_page,
       is_active = TRUE,
       updated_at = NOW(),
       deleted_at = NULL`,
    [
      MY_PRODUCTS_RECIPES_NOTICE_NOTIFICATION_ID,
      MY_PRODUCTS_RECIPES_NOTICE_TITLE,
      MY_PRODUCTS_RECIPES_NOTICE_MESSAGE,
      MY_PRODUCTS_RECIPES_NOTICE_TARGET_PAGE
    ]
  );
  console.log("[notification-service][seed] Urun recetelerim bildirimi notification_db de hazir (id sabit).");
};

const logNotificationDbState = async (pool) => {
  const before = await pool.query("SELECT to_regclass('public.notification_db') IS NOT NULL AS exists");
  const existedBefore = before.rows[0]?.exists === true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_db (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      target_page VARCHAR(200),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_notification_db_active ON notification_db(is_active) WHERE deleted_at IS NULL"
  );

  if (existedBefore) {
    console.log("[notification-service][database] notification_db zaten mevcut, baglandi.");
  } else {
    console.log("[notification-service][database] notification_db tablosu olusturuldu.");
  }
};

const logUserNotificationsState = async (pool) => {
  const before = await pool.query("SELECT to_regclass('public.user_notifications') IS NOT NULL AS exists");
  const existedBefore = before.rows[0]?.exists === true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      notifications_id UUID NOT NULL REFERENCES notification_db(id) ON DELETE CASCADE,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      dismissed_at TIMESTAMPTZ NULL,
      CONSTRAINT user_notifications_user_notice_unique UNIQUE (user_id, notifications_id)
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_user_notifications_notice ON user_notifications(notifications_id)"
  );

  if (existedBefore) {
    console.log("[notification-service][database] user_notifications zaten mevcut, baglandi.");
  } else {
    console.log("[notification-service][database] user_notifications tablosu olusturuldu.");
  }
};

const initNotificationDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[notification-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    await logNotificationDbState(pool);
    await logUserNotificationsState(pool);

    await seedHomeWelcomeNotification(pool);
    await seedAddProductNoticeNotification(pool);
    await seedCustomersNoticeNotification(pool);
    await seedFixedIncomeExpenseNoticeNotification(pool);
    await seedFixedMyListNoticeNotification(pool);
    await seedStockAddNoticeNotification(pool);
    await seedMyStocksNoticeNotification(pool);
    await seedMyProductsRecipesNoticeNotification(pool);

    console.log("[notification-service][database] Tablo durumu kontrolu tamamlandi.");
  } catch (error) {
    console.error("[notification-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initNotificationDatabase
};
