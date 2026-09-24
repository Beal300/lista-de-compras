import { useState } from 'react';
import { STORAGE_KEY } from '../persistence/repository';

export function LocalBackup() {
  const [message, setMessage] = useState('');
  function exportLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) { setMessage('Não há dados antigos neste endereço. Abra o endereço e navegador usados anteriormente para exportá-los.'); return; }
      // Preserve even malformed legacy data verbatim for manual recovery.
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'compras-locais-anteriores.json'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Arquivo exportado. Os dados locais continuam intactos.');
    } catch { setMessage('Não foi possível acessar os dados locais neste navegador.'); }
  }
  return <div className="local-backup"><button className="text-button" onClick={exportLocal}>Exportar dados locais antigos (JSON)</button>{message && <p role="status">{message}</p>}</div>;
}
