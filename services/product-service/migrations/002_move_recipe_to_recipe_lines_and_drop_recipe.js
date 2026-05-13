module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE product_db DROP COLUMN IF EXISTS recipe`);
    await db.query(`DROP TABLE IF EXISTS product_recipe_line_db`);
    await db.query(`DROP TABLE IF EXISTS product_service_migrations`);
  }
};
