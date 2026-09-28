// Loads exactly ONE backend env file (never both, never a fallback merge):
//
//   1. ENV_FILE is set in the process environment  -> that file
//      (deliberate override, e.g. ENV_FILE=.env to use production values locally)
//   2. NODE_ENV=production in the process environment -> .env
//      (set explicitly by PM2 via deploy/ecosystem.config.cjs — never read from .env itself)
//   3. anything else (local development)             -> .env.development
//      If it's missing, startup stops with an error instead of falling back to
//      the production .env.
//
// Paths are resolved from the backend/ folder, not the current working
// directory, so every entry point (server, migrations, scripts) picks the same
// file. Required once at the top of each entry point; later requires are no-ops.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const BACKEND_DIR = path.resolve(__dirname, '..');

function selectEnvFile() {
    if (process.env.ENV_FILE) {
        return { file: path.resolve(BACKEND_DIR, process.env.ENV_FILE), reason: 'ENV_FILE override' };
    }
    if (process.env.NODE_ENV === 'production') {
        return { file: path.join(BACKEND_DIR, '.env'), reason: 'NODE_ENV=production' };
    }
    return { file: path.join(BACKEND_DIR, '.env.development'), reason: 'local development' };
}

if (!process.env.LOADED_ENV_FILE) {
    const { file, reason } = selectEnvFile();
    if (!fs.existsSync(file)) {
        console.error(
            `[env] ${path.basename(file)} not found (${reason}). ` +
            'Local development needs backend/.env.development; production must run with NODE_ENV=production ' +
            '(PM2: deploy/ecosystem.config.cjs). Refusing to fall back to another env file.'
        );
        process.exit(1);
    }
    dotenv.config({ path: file, quiet: true });
    // Name only (never values) — also tells forked cluster workers the choice is made.
    process.env.LOADED_ENV_FILE = path.basename(file);
}

module.exports = { loadedEnvFile: process.env.LOADED_ENV_FILE };
