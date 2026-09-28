// sequelize-cli config — mirrors the same connection logic as db.config.js
// (DATABASE_URL takes precedence over discrete DB_* vars) so migrations run
// against the exact same database the app itself connects to. Which database
// that is comes from the env file config/loadEnv.js picks: backend/.env on
// the VPS (production), backend/.env.development locally. All three blocks
// resolve the same way; the env file, not sequelize's NODE_ENV block, decides.
require('./loadEnv'); // same env-file rule as the app (backend/.env vs .env.development)

const sslOptions = process.env.DB_SSL === 'true'
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {};

const base = process.env.DATABASE_URL
    ? {
        use_env_variable: 'DATABASE_URL',
        dialect: 'mysql',
        dialectOptions: sslOptions,
        logging: false,
    }
    : {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        dialectOptions: sslOptions,
        logging: false,
    };

module.exports = {
    development: base,
    test: base,
    production: base,
};
