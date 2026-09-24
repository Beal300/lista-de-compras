import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from './store';
import { Auth } from './auth';
import { config } from './config';
import { acquireLock } from './lock';
import { backupDatabase, restoreDatabase, validateBackup } from './backup';

async function secret(label: string) {
  if (!process.stdin.isTTY) throw new Error('Execute a configuração em um terminal interativo. Não passe a senha na linha de comando.');
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write(label);
  try { return await reader.question(''); } finally { reader.close(); process.stdout.write('\n'); }
}
const options = config(); const command = process.argv[2];
try {
  if (command === 'backup') {
    const filename = resolve(options.backups, `compras-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    await backupDatabase(options.database, filename);
    console.log(`Backup consistente criado: ${filename}`);
  } else if (command === 'setup' || command === 'password') {
    mkdirSync(dirname(options.database), { recursive: true }); const release = acquireLock(`${options.database}.lock`);
    try {
      const store = new Store(options.database);
      try {
        const auth = new Auth(store);
        if (command === 'setup' && auth.configured()) { console.log('O servidor já está configurado. Nenhum dado foi alterado.'); }
        else {
          const password = await secret('Senha compartilhada (mínimo 12 caracteres; entrada oculta): ');
          const repeat = await secret('Repita a senha: ');
          if (password !== repeat) throw new Error('As senhas não coincidem.');
          auth.setPassword(password, command === 'password');
          console.log('Senha configurada. Catálogo e compras preservados. Execute npm start.');
        }
      } finally { store.close(); }
    } finally { release(); }
  } else if (command === 'restore') {
    const source = process.argv[3]; if (!source) throw new Error('Use npm run restore -- caminho-do-backup.sqlite');
    validateBackup(resolve(source));
    if (!process.stdin.isTTY) throw new Error('A restauração exige confirmação em terminal interativo.');
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try { answer = await reader.question('Encerre o servidor. A restauração substituirá a base atual (será feito backup antes). Digite RESTAURAR para confirmar: '); } finally { reader.close(); }
    if (answer !== 'RESTAURAR') throw new Error('Restauração cancelada.');
    mkdirSync(dirname(options.database), { recursive: true }); const release = acquireLock(`${options.database}.lock`);
    try {
      const previous = await restoreDatabase(resolve(source), options.database, options.backups, true);
      console.log('Backup restaurado. Entre novamente com a senha do backup.');
      if (previous) console.log(`Base anterior preservada em: ${previous}`);
    } finally { release(); }
  } else throw new Error('Comandos disponíveis: setup, password, backup, restore.');
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
