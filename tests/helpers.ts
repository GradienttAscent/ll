import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createApp } from '../server';

export interface ApiResponse {
  status: number;
  json: any;
}

export class Api {
  baseUrl: string;
  token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(
    path: string,
    options: { method?: string; body?: any; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    let json: any = null;
    try {
      json = await response.json();
    } catch {
      // non-JSON response
    }
    return { status: response.status, json };
  }

  async register(email: string, password: string, displayName = ''): Promise<{ token: string; user: any }> {
    const { status, json } = await this.request('/api/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
    });
    if (status !== 201) throw new Error(`register failed with ${status}: ${JSON.stringify(json)}`);
    return json;
  }

  async login(email: string, password: string) {
    const { status, json } = await this.request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (status !== 200) throw new Error(`login failed with ${status}: ${JSON.stringify(json)}`);
    return json;
  }

  async signInAs(email: string, password: string): Promise<void> {
    const { token } = await this.login(email, password);
    this.token = token;
  }

  cleartoken() {
    this.token = null;
  }
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
  clear: () => void;
  dbDir: string;
}

export async function createTestServer(): Promise<TestServer> {
  const dbDir = mkdtempSync(join(tmpdir(), 'lazylift-test-'));
  process.env.LAZYLIFT_DATA_DIR = dbDir;
  process.env.APP_PORT = '0';
  // Keep the test suite hermetic: never reach a real Gemini API even if a .env key is present.
  process.env.GEMINI_API_KEY = 'MY_GEMINI_API_KEY';
  process.env.GEMINI_MODEL = 'test-model';
  const { app } = await createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    dbDir,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    clear: () => {
      server.close();
    },
  };
}

export async function seedUser(api: Api, email: string, password = 'secret123'): Promise<Api> {
  const client = new Api(api.baseUrl);
  const { token } = await client.register(email, password);
  client.token = token;
  return client;
}

export function removeTempDir(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}