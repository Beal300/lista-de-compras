// Isolated test server: no production database, password or network publication.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Store } from '../server/store';
import { Auth } from '../server/auth';
import { createApp } from '../server/app';

if (!process.env.TEST_DATABASE || !process.env.TEST_PASSWORD) throw new Error('Test environment required');
const store = new Store(process.env.TEST_DATABASE); new Auth(store).setPassword(process.env.TEST_PASSWORD);
const server = createServer();
server.listen(0, process.env.TEST_NETWORK_HOST ? '0.0.0.0' : '127.0.0.1', () => {
  const port = (server.address() as { port: number }).port;
  const origin = `http://${process.env.TEST_NETWORK_HOST ?? '127.0.0.1'}:${port}`;
  server.on('request', createApp(store, { origins: [origin], staticDir: resolve('dist') }));
  process.send?.({ origin });
});
process.on('message', message => {
  if (message === 'stop') { server.close(() => { store.close(); process.exit(0); }); server.closeAllConnections(); }
});
