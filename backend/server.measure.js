// TEMPORARY — read-only entrypoint used solely for local testing/measurement.
// Deliberately skips sequelize.sync({ alter: true }) and seeding so it can
// never write to or alter the configured (self-hosted VPS) database — only serves
// existing data via the normal GET routes. Delete after use.
require('./config/loadEnv');
const app = require('./app');
const { sequelize } = require('./config/db.config');

const PORT = process.env.PORT || 5000;

sequelize.authenticate()
    .then(() => {
        console.log('[measure] DB connection OK (read-only, no sync, no seed).');
        app.listen(PORT, () => {
            console.log(`[measure] Server is running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('[measure] Unable to connect to the database:', err);
        process.exit(1);
    });
