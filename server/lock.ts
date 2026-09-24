import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

// A process lock prevents restore/password setup from racing the daily server.
export function acquireLock(filename: string) {
  if (existsSync(filename)) {
    const pid = Number(readFileSync(filename, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Arquivo de bloqueio inválido. Verifique se o servidor está parado antes de removê-lo.');
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
    if (alive) throw new Error('O servidor já está em execução. Encerre-o antes desta operação.');
    unlinkSync(filename);
  }
  writeFileSync(filename, String(process.pid), { flag: 'wx', mode: 0o600 });
  return () => { if (existsSync(filename) && readFileSync(filename, 'utf8') === String(process.pid)) unlinkSync(filename); };
}
