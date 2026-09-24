import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../domain/models';
import type { Action, Command } from '../domain/commands';
import { createId } from '../domain/id';
import { ApiError, HttpRepository } from '../persistence/httpRepository';

export function useSharedState() {
  const repo = useRef(new HttpRepository()); const current = useRef<AppState | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<'Conectado' | 'Reconectando' | 'Sem conexão'>('Reconectando');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<Command | null>(null); const writing = useRef(false); const reading = useRef(false); const failures = useRef(0);
  const apply = useCallback((next: AppState) => {
    if (!current.current || next.workspaceId !== current.current.workspaceId || next.revision >= current.current.revision) {
      current.current = next; setState(next);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current || writing.current) return;
    reading.current = true;
    try {
      const next = await repo.current.load(); if (next) apply(next);
      setAuthenticated(true); setConnection('Conectado'); failures.current = 0;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setAuthenticated(false); current.current = null; setState(null); }
      else { failures.current++; setConnection(failures.current > 1 ? 'Sem conexão' : 'Reconectando'); }
    } finally { reading.current = false; setLoading(false); }
  }, [apply]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 2000);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume); window.addEventListener('focus', resume); window.addEventListener('online', resume);
    const offline = () => setConnection('Sem conexão'); window.addEventListener('offline', offline);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', offline); };
  }, [refresh]);
  async function login(password: string) {
    setBusy(true);
    try { await repo.current.login(password); setError(''); await refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Servidor indisponível. Verifique a conexão.'); }
    finally { setBusy(false); }
  }
  async function sendPending() {
    if (!pending.current || writing.current) return false;
    writing.current = true; setBusy(true);
    try {
      const next = await repo.current.execute(pending.current); apply(next); pending.current = null;
      setUncertain(false); setError(''); setConnection('Conectado'); return true;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null; setUncertain(false); setError(e.message);
        if (e.status === 401) { setAuthenticated(false); current.current = null; setState(null); }
      } else {
        setUncertain(true); setConnection('Reconectando');
        setError('Não foi possível confirmar se a alteração foi salva. Use “Verificar operação pendente” para repetir com segurança, sem duplicar os efeitos.');
      }
      return false;
    } finally { writing.current = false; setBusy(false); void refresh(); }
  }
  async function send(action: Action, expectedRevision?: number) {
    if (pending.current || writing.current || !current.current || !authenticated || connection !== 'Conectado') {
      setError('Aguarde a conexão e a confirmação da operação anterior antes de alterar os dados.'); return false;
    }
    pending.current = { operationId: createId(), expectedRevision: expectedRevision ?? current.current.revision, action };
    return sendPending();
  }
  async function logout() {
    if (pending.current) { setError('Confirme a operação pendente antes de sair.'); return; }
    try { await repo.current.logout(); setAuthenticated(false); setState(null); current.current = null; setError(''); }
    catch { setError('Não foi possível encerrar a sessão. Verifique a conexão.'); }
  }
  return { state, loading, authenticated, connection, error, setError, busy, uncertain, pendingType: pending.current?.action.type, login, logout, send, retry: sendPending, refresh };
}
