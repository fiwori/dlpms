// Usage: npm run backup   (FR-28). Writes a plain SQL dump into backend/backups/
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing from .env');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = path.join(dir, `dlpms-${stamp}.sql`);

const windowsPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe';
const command = fs.existsSync(windowsPath) ? windowsPath : 'pg_dump';

const child = spawn(
  command,
  [
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username),
    '-F', 'p',
    '-f', file,
    url.pathname.slice(1),
  ],
  { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, stdio: 'inherit' }
);

child.on('error', (err) => {
  console.error('Could not run pg_dump:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code === 0) {
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`Backup saved: ${file} (${kb} KB)`);
  } else {
    console.error(`pg_dump failed with exit code ${code}`);
    process.exit(code || 1);
  }
});
