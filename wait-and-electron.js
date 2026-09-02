import http from 'http';
import { spawn } from 'child_process';

const PORT = 5176;
const URL = `http://localhost:${PORT}`;

function checkServer() {
  http.get(URL, () => {
    console.log(`[Dev] Vite Dev Server is alive at ${URL}. Spawning Electron...`);
    const electron = spawn('npx', ['electron', '.'], {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });
    electron.on('close', (code) => {
      process.exit(code || 0);
    });
  }).on('error', () => {
    setTimeout(checkServer, 300);
  });
}

checkServer();
