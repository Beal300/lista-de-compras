import { networkInterfaces } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';

export function config() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  const ips = Object.values(networkInterfaces()).flat().filter(i => i?.family === 'IPv4' && !i.internal).map(i => i!.address);
  const origins = (process.env.ALLOWED_ORIGINS ?? [`http://localhost:${port}`, `http://127.0.0.1:${port}`, ...ips.map(ip => `http://${ip}:${port}`)].join(',')).split(',').map(s => s.trim());
  for (const origin of origins) if (new URL(origin).origin !== origin) throw new Error('ALLOWED_ORIGINS deve conter origens completas, sem caminhos ou barra final.');
  const database = resolve(process.env.DATA_DIR ?? 'data', 'shopping.sqlite');
  const backups = resolve(process.env.BACKUP_DIR ?? 'backups'); const staticDir = resolve('dist');
  for (const privatePath of [database, backups]) {
    const path = relative(staticDir, privatePath);
    if (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('Banco e backups devem ficar fora da pasta pública dist.');
    }
  }
  return { port, host: process.env.HOST ?? '0.0.0.0', origins, secureCookies: process.env.COOKIE_SECURE === 'true', database, backups, staticDir };
}
