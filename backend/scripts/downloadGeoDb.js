// One-off ops script (see CLAUDE.md §17 — this project's "run manually via
// `node backend/<file>.js`" convention). Downloads MaxMind's GeoLite2 City
// database and saves it to MAXMIND_DB_PATH for
// utils/analytics/geolocation.util.js's local, offline IP lookups.
//
// MaxMind publishes GeoLite2 updates weekly — re-run this periodically (a
// system cron / scheduled task calling `npm run geo:update` from backend/)
// to keep enrichment current. Requires MAXMIND_LICENSE_KEY in backend/.env
// (Account -> Manage License Keys on maxmind.com; no account ID needed for
// this download endpoint, only for the optional web-service fallback).
//
// Usage: node backend/scripts/downloadGeoDb.js  (or `npm run geo:update`)

require('../config/loadEnv');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const tar = require('tar');

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const EDITION_ID = process.env.MAXMIND_EDITION_ID || 'GeoLite2-City';
const DB_PATH = process.env.MAXMIND_DB_PATH
    ? path.resolve(__dirname, '..', process.env.MAXMIND_DB_PATH)
    : path.join(__dirname, '..', 'data', 'GeoLite2-City.mmdb');

if (!LICENSE_KEY) {
    console.error('MAXMIND_LICENSE_KEY is not set in backend/.env — get a free license key from your MaxMind account (Account -> Manage License Keys).');
    process.exit(1);
}

const DOWNLOAD_URL = `https://download.maxmind.com/app/geoip_download?edition_id=${encodeURIComponent(EDITION_ID)}&license_key=${encodeURIComponent(LICENSE_KEY)}&suffix=tar.gz`;

// MaxMind's download endpoint 302s to a signed CDN URL — follow redirects
// manually since we need the final response's status/body on failure, not
// just whatever a library's own redirect-following would give us.
function download(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
                res.resume();
                return resolve(download(res.headers.location, redirectsLeft - 1));
            }
            if (res.statusCode !== 200) {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => reject(new Error(`MaxMind download failed: HTTP ${res.statusCode} ${body.slice(0, 300)}`)));
                return;
            }
            resolve(res);
        }).on('error', reject);
    });
}

async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geolite2-'));
    const tarPath = path.join(tmpDir, 'db.tar.gz');

    console.log(`Downloading ${EDITION_ID}...`);
    const responseStream = await download(DOWNLOAD_URL);
    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(tarPath);
        responseStream.pipe(file);
        file.on('finish', resolve);
        file.on('error', reject);
    });

    console.log('Extracting...');
    await tar.x({ file: tarPath, cwd: tmpDir });

    const extractedDir = fs.readdirSync(tmpDir).find((name) =>
        name.startsWith(EDITION_ID) && fs.statSync(path.join(tmpDir, name)).isDirectory());
    if (!extractedDir) throw new Error('Could not find extracted GeoLite2 directory in the downloaded archive');

    const mmdbFile = fs.readdirSync(path.join(tmpDir, extractedDir)).find((name) => name.endsWith('.mmdb'));
    if (!mmdbFile) throw new Error('No .mmdb file found in the downloaded archive');

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    // Copy next to the target, then rename over it — rename is atomic on the
    // same filesystem, so the running backend's file watcher (see
    // geolocation.util.js's watchForUpdates) never reads a half-written file.
    const stagingPath = `${DB_PATH}.tmp`;
    fs.copyFileSync(path.join(tmpDir, extractedDir, mmdbFile), stagingPath);
    fs.renameSync(stagingPath, DB_PATH);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log(`Saved to ${DB_PATH}`);
}

main().catch((err) => {
    console.error('Failed to download GeoLite2 database:', err.message);
    process.exit(1);
});
