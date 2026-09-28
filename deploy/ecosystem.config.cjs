// PM2 process definition for the PRODUCTION backend on the VPS.
//
//   pm2 start /var/www/clickbuzz/deploy/ecosystem.config.cjs
//   pm2 save
//
// exec_mode MUST stay 'fork' with a single instance: backend/server.js runs
// its own Node cluster (a primary that does the DB sync/seed, the reminder
// cron + RabbitMQ worker and the analytics rollup cron, then forks
// WEB_CONCURRENCY HTTP workers). PM2 cluster mode / `-i N` would make every
// process a cluster *worker*, so that primary-only work would never run.
//
// Secrets are NOT set here — server.js loads backend/.env via dotenv, which
// resolves relative to the working directory, hence `cwd`.
module.exports = {
    apps: [
        {
            name: 'clickbuzz-backend',
            cwd: '/var/www/clickbuzz/backend',
            script: 'server.js',
            exec_mode: 'fork',
            instances: 1,
            autorestart: true,
            max_restarts: 20,
            min_uptime: '30s',
            restart_delay: 5000,
            // server.js's primary kills its workers on SIGINT/SIGTERM.
            kill_timeout: 10000,
            max_memory_restart: '1500M',
            time: true,
            env: {
                // Both explicit here (never taken from backend/.env): together they make
                // config/loadEnv.js load backend/.env — the production file.
                NODE_ENV: 'production',
                ENV_FILE: '.env',
                // Nginx is the only public entry point.
                BIND_HOST: '127.0.0.1',
                PORT: 5000,
                WEB_CONCURRENCY: 6,
                // Never sync({ alter: true }) in production — see server.js.
                DB_SYNC_MODE: 'safe',
            },
        },
    ],
};
