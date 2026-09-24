import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store } from './store';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export class Auth {
  constructor(private store: Store) {}
  configured() { return Boolean(this.store.db.prepare("SELECT 1 FROM settings WHERE key='password'").get()); }
  setPassword(password: string, replace = false) {
    if (password.length < 12 || password.length > 256) throw new Error('Use uma senha compartilhada de 12 a 256 caracteres.');
    const salt = randomBytes(16).toString('hex');
    const verifier = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString('hex');
    this.store.db.transaction(() => {
      if (this.configured() && !replace) throw new Error('Senha já configurada. Use o comando password para alterá-la.');
      this.store.db.prepare("INSERT OR REPLACE INTO settings VALUES ('password', ?)").run(JSON.stringify({ salt, verifier }));
      this.store.db.exec('DELETE FROM sessions; DELETE FROM login_attempts;');
    }).immediate();
  }
  login(password: string, client: string): { token: string; expiresAt: number } | null {
    const now = Date.now();
    return this.store.db.transaction(() => {
      this.store.db.prepare('DELETE FROM login_attempts WHERE expires_at<=?').run(now);
      const attempts = this.store.db.prepare('SELECT attempts FROM login_attempts WHERE client=?').get(client) as { attempts: number } | undefined;
      if ((attempts?.attempts ?? 0) >= 10) return null;
      this.store.db.prepare('INSERT INTO login_attempts VALUES (?, 1, ?) ON CONFLICT(client) DO UPDATE SET attempts=attempts+1').run(client, now + 15 * 60 * 1000);
      const row = this.store.db.prepare("SELECT value FROM settings WHERE key='password'").get() as { value: string } | undefined;
      if (!row) return null;
      const { salt, verifier } = JSON.parse(row.value) as { salt: string; verifier: string };
      const actual = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
      const expected = Buffer.from(verifier, 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      this.store.db.prepare('DELETE FROM login_attempts WHERE client=?').run(client);
      this.store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      const token = randomBytes(32).toString('hex'); const expiresAt = now + SESSION_MS;
      this.store.db.prepare('INSERT INTO sessions VALUES (?, ?)').run(hash(token), expiresAt);
      return { token, expiresAt };
    }).immediate();
  }
  authorized(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
    return Boolean(this.store.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now()));
  }
  logout(token?: string) { if (token) this.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); }
}
