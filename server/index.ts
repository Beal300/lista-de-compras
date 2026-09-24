import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { Store } from './store';
import { Auth } from './auth';
import { config } from './config';
import { createApp } from './app';
import { acquireLock } from './lock';

const options = config();
mkdirSync(dirname(options.database), { recursive: true });
const release = acquireLock(`${options.database}.lock`);
try {
  if (!existsSync(options.database)) throw new Error('Execute npm run setup antes de iniciar.');
  const store = new Store(options.database);
  if (!new Auth(store).configured()) { store.close(); throw new Error('Configure a senha com npm run setup antes de iniciar.'); }
  const server = createApp(store, options).listen(options.port, options.host, () => {
    console.log('Lista de Compras compartilhada. Endereços permitidos:');
    options.origins.forEach(origin => console.log(`  ${origin}`));
    console.log('Use Ctrl+C para encerrar. Mantenha o computador ligado e conectado à rede.');
  });
  server.on('error', error => { store.close(); release(); console.error(error.message); process.exitCode = 1; });
  const stop = () => { server.close(() => { store.close(); release(); process.exit(0); }); server.closeIdleConnections(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch (error) { release(); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
