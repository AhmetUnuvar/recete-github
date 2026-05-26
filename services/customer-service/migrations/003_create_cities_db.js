/** Türkiye illeri — cities_db bos ise eklenir. */
const TURKEY_CITIES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bartın",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Düzce",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Iğdır",
  "Isparta",
  "İstanbul",
  "İzmir",
  "Kahramanmaraş",
  "Karabük",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kırıkkale",
  "Kırklareli",
  "Kırşehir",
  "Kilis",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Şanlıurfa",
  "Şırnak",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Uşak",
  "Van",
  "Yalova",
  "Yozgat",
  "Zonguldak"
];

module.exports = {
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS cities_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_name VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_db_city_name_alive
      ON cities_db (LOWER(city_name))
      WHERE deleted_at IS NULL
    `);

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM cities_db WHERE deleted_at IS NULL`
    );
    const existing = countResult.rows[0]?.cnt ?? 0;
    if (existing > 0) {
      return;
    }

    for (const cityName of TURKEY_CITIES) {
      await db.query(
        `INSERT INTO cities_db (city_name)
         SELECT $1::varchar
         WHERE NOT EXISTS (
           SELECT 1 FROM cities_db
           WHERE deleted_at IS NULL AND LOWER(city_name) = LOWER($1::varchar)
         )`,
        [cityName]
      );
    }
  }
};
