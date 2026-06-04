// Cross-platform: kill whatever process is listening on the given TCP port.
import { execSync } from 'node:child_process';

const port = Number(process.argv[2]);
if (!Number.isFinite(port)) {
  console.error('usage: node kill-port.mjs <port>');
  process.exit(2);
}

const isWin = process.platform === 'win32';

try {
  if (isWin) {
    const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      const m = line.match(/\s+TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (m && Number(m[1]) === port) pids.add(m[2]);
    }
    if (pids.size === 0) {
      console.log(`[kill-port] nothing listening on :${port}`);
      process.exit(0);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[kill-port] killed PID ${pid} on :${port}`);
      } catch (e) {
        console.warn(`[kill-port] failed to kill PID ${pid}: ${e.message}`);
      }
    }
  } else {
    const pids = execSync(`lsof -t -i:${port}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (!pids.length) {
      console.log(`[kill-port] nothing listening on :${port}`);
      process.exit(0);
    }
    for (const pid of pids) {
      execSync(`kill -9 ${pid}`);
      console.log(`[kill-port] killed PID ${pid} on :${port}`);
    }
  }
} catch (err) {
  console.error(`[kill-port] error: ${err.message}`);
  process.exit(1);
}
