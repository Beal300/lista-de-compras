import { stateSchema, type AppState } from '../domain/models';
import type { Command } from '../domain/commands';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export class HttpRepository {
  private etag = '';
  private async request(url: string, init?: RequestInit) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok && response.status !== 304) {
        const error = await response.json().catch(() => ({}));
        throw new ApiError(response.status, error.code ?? 'HTTP_ERROR', error.message ?? 'Não foi possível acessar o servidor.');
      }
      return response;
    } finally { clearTimeout(timer); }
  }
  async load(): Promise<AppState | null> {
    const response = await this.request('/api/state', { headers: this.etag ? { 'If-None-Match': this.etag } : {} });
    if (response.status === 304) return null;
    const state = stateSchema.parse(await response.json()); this.etag = response.headers.get('etag') ?? '';
    return state;
  }
  private post(url: string, body: unknown) {
    return this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopping-Request': '1' }, body: JSON.stringify(body) });
  }
  async execute(command: Command) {
    const response = await this.post('/api/commands', command);
    const result = await response.json(); this.etag = '';
    return stateSchema.parse(result.state);
  }
  async login(password: string) { await this.post('/api/login', { password }); this.etag = ''; }
  async logout() { await this.post('/api/logout', {}); this.etag = ''; }
}
