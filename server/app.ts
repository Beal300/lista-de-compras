import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { parseCookie } from 'cookie';
import { z } from 'zod';
import { resolve } from 'node:path';
import { commandSchema } from '../src/domain/commands';
import { Auth } from './auth';
import { OperationError, type Store } from './store';

export interface ServerOptions { origins: string[]; secureCookies?: boolean; staticDir?: string; loginLimit?: number }
export function createApp(store: Store, options: ServerOptions) {
  const app = express(); const auth = new Auth(store); const origins = new Set(options.origins);
  const hosts = new Set(options.origins.map(origin => new URL(origin).host));
  const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: options.secureCookies ?? false, path: '/' };
  app.disable('x-powered-by');
  app.use(helmet({ strictTransportSecurity: options.secureCookies ? undefined : false, contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': options.secureCookies ? [] : null } } }));
  // Do not trust arbitrary Host or forwarded headers (including DNS rebinding).
  app.use((req, res, next) => {
    if (!hosts.has(req.get('host') ?? '')) { res.status(403).json({ code: 'HOST_DENIED', message: 'Endereço não autorizado no servidor.' }); return; }
    next();
  });
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    if (!['GET', 'HEAD'].includes(req.method) && (!origins.has(req.get('origin') ?? '') || req.get('x-shopping-request') !== '1' || !req.is('application/json'))) {
      res.status(403).json({ code: 'ORIGIN_DENIED', message: 'Origem da requisição não autorizada.' }); return;
    }
    next();
  });
  app.use('/api', express.json({ limit: '256kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: options.loginLimit ?? 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' } }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { password } = z.object({ password: z.string().min(1).max(256) }).strict().parse(req.body);
    if (!auth.configured()) { res.status(503).json({ code: 'SETUP_REQUIRED', message: 'Configure a senha no computador servidor usando npm run setup.' }); return; }
    const session = auth.login(password, req.ip ?? 'unknown');
    if (!session) { res.status(401).json({ code: 'INVALID_PASSWORD', message: 'Senha incorreta ou limite de tentativas atingido. Confira a senha; após várias tentativas, aguarde 15 minutos.' }); return; }
    res.cookie('shopping_session', session.token, { ...cookie, expires: new Date(session.expiresAt) }).json({ ok: true });
  });
  app.use('/api', (req, res, next) => {
    const token = parseCookie(req.headers.cookie ?? '').shopping_session;
    if (!auth.authorized(token)) { res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Entre com a senha compartilhada para continuar.' }); return; }
    next();
  });
  app.post('/api/logout', (req, res) => {
    auth.logout(parseCookie(req.headers.cookie ?? '').shopping_session);
    res.clearCookie('shopping_session', cookie).json({ ok: true });
  });
  app.get('/api/state', (req, res) => {
    const state = store.read(); const etag = `"${state.workspaceId}:${state.revision}"`;
    res.setHeader('ETag', etag);
    if (req.get('if-none-match') === etag) { res.status(304).end(); return; }
    res.json(state);
  });
  app.post('/api/commands', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(store.execute(commandSchema.parse(req.body)));
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
  if (options.staticDir) {
    app.use(express.static(options.staticDir, { dotfiles: 'deny', index: 'index.html' }));
    app.get('/', (_req, res) => res.sendFile(resolve(options.staticDir!, 'index.html')));
  }
  app.use((_req, res) => res.status(404).end());
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) { res.status(422).json({ code: 'VALIDATION', message: 'Dados inválidos. Confira nome, categoria e quantidades inteiras entre 1 e 9999.' }); return; }
    if (error instanceof OperationError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    const status = (error as { status?: number })?.status;
    if (status === 400 || status === 413) { res.status(status).json({ code: 'INVALID_BODY', message: 'Requisição inválida ou muito grande.' }); return; }
    if (error instanceof Error && ['Produto indisponível no catálogo.', 'Somente a lista ativa pode ser alterada.', 'Produto não encontrado.'].includes(error.message)) {
      res.status(422).json({ code: 'INVALID_OPERATION', message: error.message }); return;
    }
    console.error('Falha na API:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ code: 'PERSISTENCE_ERROR', message: 'Não foi possível confirmar a operação. Tente verificar novamente; não crie outra operação até confirmar o resultado.' });
  });
  return app;
}
