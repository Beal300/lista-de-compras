import { afterEach, expect, it, vi } from 'vitest';
import { config } from './config';

afterEach(() => vi.unstubAllEnvs());
it('não permite banco ou backups dentro dos arquivos públicos', () => {
  vi.stubEnv('DATA_DIR', 'dist/private'); expect(config).toThrow('fora da pasta pública');
  vi.stubEnv('DATA_DIR', 'data'); vi.stubEnv('BACKUP_DIR', 'dist'); expect(config).toThrow('fora da pasta pública');
  vi.stubEnv('BACKUP_DIR', 'backups'); expect(config().database).toContain('shopping.sqlite');
});
