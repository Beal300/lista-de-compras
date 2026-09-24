import Database from 'better-sqlite3';
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stateSchema } from '../src/domain/models';

export function validateBackup(filename: string) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' || db.pragma('user_version', { simple: true }) !== 1) throw new Error('Backup inválido ou incompatível.');
    const row = db.prepare('SELECT revision, payload FROM app_state WHERE id=1').get() as { revision: number; payload: string };
    const state = stateSchema.parse(JSON.parse(row.payload));
    if (state.revision !== row.revision) throw new Error('Revisão do backup inconsistente.');
    const settings = db.prepare("SELECT value FROM settings WHERE key='password'").get() as { value: string } | undefined;
    if (!settings) throw new Error('Backup sem configuração de acesso.');
    const password = JSON.parse(settings.value);
    if (!/^[a-f0-9]{32}$/.test(password.salt) || !/^[a-f0-9]{128}$/.test(password.verifier)) throw new Error('Verificador de senha inválido.');
    db.prepare('SELECT id, fingerprint, revision FROM operations LIMIT 1').all();
    db.prepare('SELECT token_hash FROM sessions LIMIT 1').all();
    return state;
  } finally { db.close(); }
}
export async function backupDatabase(database: string, destination: string) {
  if (existsSync(destination)) throw new Error('O destino do backup já existe; escolha outro nome.');
  mkdirSync(dirname(destination), { recursive: true });
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
    // A portable snapshot must not depend on WAL/SHM sidecars when copied.
    const snapshot = new Database(destination);
    try { snapshot.pragma('journal_mode = DELETE'); } finally { snapshot.close(); }
    validateBackup(destination);
  } finally { db.close(); }
}
// Caller holds the exclusive process lock. Never called by a remote HTTP route.
export async function restoreDatabase(source: string, database: string, backups: string, confirmed: boolean) {
  if (!confirmed) throw new Error('Restauração exige confirmação explícita.');
  if (resolve(source) === resolve(database)) throw new Error('Origem e destino devem ser diferentes.');
  validateBackup(source);
  mkdirSync(dirname(database), { recursive: true }); mkdirSync(backups, { recursive: true });
  const suffix = randomUUID(); const staging = `${database}.restore-${suffix}`;
  await backupDatabase(source, staging);
  const restored = new Database(staging);
  try { restored.exec('DELETE FROM sessions; DELETE FROM login_attempts;'); restored.pragma('journal_mode = DELETE'); } finally { restored.close(); }
  let previousBackup: string | undefined;
  if (existsSync(database)) {
    previousBackup = resolve(backups, `antes-restauracao-${suffix}.sqlite`);
    await backupDatabase(database, previousBackup);
    const current = new Database(database);
    try { current.pragma('wal_checkpoint(TRUNCATE)'); current.pragma('journal_mode = DELETE'); } finally { current.close(); }
  }
  const previous = `${database}.previous-${suffix}`;
  if (existsSync(database)) renameSync(database, previous);
  try { renameSync(staging, database); }
  catch (error) { if (existsSync(previous)) renameSync(previous, database); throw error; }
  if (existsSync(previous)) unlinkSync(previous);
  return previousBackup;
}
