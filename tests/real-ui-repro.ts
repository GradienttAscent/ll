import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createApp } from '../server';
import { closeDatabase } from '../db';

const BUNDLE = 'C:/Users/tpshi/AppData/Local/Temp/opencode/ll-realapp/app.js';

const dbDir = mkdtempSync(join(tmpdir(), 'lazylift-realui-'));
process.env.LAZYLIFT_DATA_DIR = dbDir;
process.env.APP_PORT = '0';
const { app } = await createApp();
const httpServer: Server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
const bundleSource = readFileSync(BUNDLE, 'utf8');
const nodeCrypto = globalThis.crypto;

const netlog: string[] = [];
const consoleLog: string[] = [];
let step = 'startup';

type Page = {
  window: any;
  document: any;
  close: () => void;
  text: () => string;
  waitFor: (label: string, predicate: () => boolean, timeoutMs?: number) => Promise<void>;
  click: (label: string | RegExp, root?: any) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  submit: (root?: any) => Promise<void>;
  network: () => string[];
  errors: () => string[];
};

/**
 * Boots the real bundle (src/main.tsx, built verbatim) inside a browser-like DOM pointed at the
 * real Express server. `window.fetch` only supplies the transport a browser would provide - it
 * NEVER touches headers or bodies, so authentication comes solely from src/api.ts's wrapper.
 */
async function openPage(seedToken?: string): Promise<Page> {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  for (const level of ['error', 'warn'] as const) {
    virtualConsole.on(level, (...args: any[]) => {
      const line = `[console.${level}] ${args.map((a) => (a && a.stack) || String(a)).join(' ')}`;
      consoleLog.push(`${step}: ${line}`);
      if (level === 'error') errors.push(line);
    });
  }
  virtualConsole.on('jsdomError', (error: any) => {
    const line = `[jsdomError] ${error?.message ?? error}`;
    consoleLog.push(`${step}: ${line}`);
    errors.push(line);
  });

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${baseUrl}/`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window as any;

  // Browser primitives jsdom does not implement.
  win.Headers = globalThis.Headers;
  win.Request = globalThis.Request;
  win.Response = globalThis.Response;
  win.AbortController = globalThis.AbortController;
  win.AbortSignal = globalThis.AbortSignal;
  Object.defineProperty(win, 'crypto', { value: nodeCrypto, configurable: true, writable: true });
  win.scrollTo = () => {};
  win.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  win.fetch = async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : String(input.url ?? input), baseUrl);
    const method = init.method ?? 'GET';
    const pairs: [string, string][] = [];
    const headers = init.headers;
    if (headers) {
      if (Array.isArray(headers)) for (const [k, v] of headers) pairs.push([String(k), String(v)]);
      else if (typeof headers.forEach === 'function') headers.forEach((v: string, k: string) => pairs.push([k, v]));
      else for (const [k, v] of Object.entries(headers)) pairs.push([k, String(v)]);
    }
    const auth = pairs.find(([k]) => k.toLowerCase() === 'authorization');
    const requestBody = typeof init.body === 'string' ? init.body : init.body ? '[non-string body]' : '';
    netlog.push(`--> ${method} ${url.pathname}${url.search} auth=${auth ? auth[1].slice(0, 18) + '…' : 'NONE'} body=${requestBody.slice(0, 220)}`);
    const response = await fetch(url, { ...init, headers: pairs as any });
    const text = await response.clone().text();
    netlog.push(`<-- ${method} ${url.pathname}${url.search} ${response.status} ${text.slice(0, 260)}`);
    return response;
  };

  win.addEventListener('unhandledrejection', (event: any) => {
    const reason = event?.reason;
    const line = `[unhandledrejection] ${reason?.stack || reason}`;
    consoleLog.push(`${step}: ${line}`);
    errors.push(line);
  });

  const script = win.document.createElement('script');
  script.textContent = bundleSource;
  win.document.body.appendChild(script);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const page: Page = {
    window: win,
    document: win.document,
    close: () => dom.window.close(),
    text: () => win.document.body.textContent ?? '',
    network: () => netlog,
    errors: () => errors,
    waitFor: async (label, predicate, timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(50);
      }
      throw new Error(`timed out waiting for ${label}\n--- visible text ---\n${(win.document.body.textContent ?? '').replace(/\s+/g, ' ').slice(0, 700)}`);
    },
    click: async (label, root) => {
      const scope = root ?? win.document;
      const nodes = [...scope.querySelectorAll('button, a, [role="button"]')];
      const target = nodes.find((node: any) => {
        const text = (node.textContent ?? '').trim();
        return typeof label === 'string' ? text === label : label.test(text);
      });
      if (!target) {
        const visible = nodes.map((n: any) => (n.textContent ?? '').trim()).filter(Boolean);
        throw new Error(`no clickable element matching ${label}. Visible buttons: ${JSON.stringify(visible.slice(0, 30))}`);
      }
      target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(120);
    },
    fill: async (selector, value) => {
      const field = win.document.querySelector(selector);
      if (!field) throw new Error(`no field ${selector}`);
      const proto =
        field.tagName === 'TEXTAREA'
          ? win.HTMLTextAreaElement.prototype
          : field.tagName === 'SELECT'
            ? win.HTMLSelectElement.prototype
            : win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
      field.dispatchEvent(new win.Event('input', { bubbles: true }));
      field.dispatchEvent(new win.Event('change', { bubbles: true }));
      await sleep(40);
    },
    submit: async (root) => {
      const scope = root ?? win.document;
      const form = scope.querySelector('form');
      if (!form) throw new Error('no form to submit');
      const event = new win.Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
      await sleep(120);
      return event.defaultPrevented;
    },
  };

  if (seedToken) win.localStorage.setItem('lazylift_session_token', seedToken);
  await sleep(400);
  return page;
}

// ---- create the account the way a real user would, then drive the real login form ----
const email = 'real-ui-user@lazylift.app';
const password = 'secret123';
const registered = await (await fetch(`${baseUrl}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, displayName: 'Real UI User' }),
})).json() as any;

const navButtonVisible = (target: Page) =>
  [...target.document.querySelectorAll('button')].some((node: any) => node.textContent.trim() === 'Study Room');

step = 'login screen';
let page = await openPage();
try {
  await page.waitFor('login form', () => /Log in/.test(page.text()));
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  const prevented = await page.submit();
  netlog.push(`[login form] defaultPrevented=${prevented}`);
  await page.waitFor('app shell with Study Room nav button', () => navButtonVisible(page));

  step = 'open Study Room tab';
  await page.click('Study Room');
  await page.waitFor('room list', () => /Create room/.test(page.text()));

  step = 'open create form';
  await page.click('Create room');
  await page.waitFor('create form fields', () => !!page.document.querySelector('#room-name'));
  netlog.push(`[create form] submit button label = ${JSON.stringify(page.document.querySelector('button[type="submit"]')?.textContent)}`);
  netlog.push(`[create form] #room-name.checkValidity() = ${(page.document.querySelector('#room-name') as any).checkValidity()}`);

  step = 'fill every field';
  await page.fill('#room-name', 'DSP Endsem');
  await page.fill('#room-subject', 'DSP');
  await page.fill('#room-topic', 'Fourier Transform');
  await page.fill('#room-description', 'Real UI verification room');
  await page.fill('#room-visibility', 'PUBLIC');
  await page.fill('#room-max', '15');
  netlog.push(`[form state] ${JSON.stringify({
    name: (page.document.querySelector('#room-name') as any).value,
    subject: (page.document.querySelector('#room-subject') as any).value,
    topic: (page.document.querySelector('#room-topic') as any).value,
    description: (page.document.querySelector('#room-description') as any).value,
    visibility: (page.document.querySelector('#room-visibility') as any).value,
    maxParticipants: (page.document.querySelector('#room-max') as any).value,
  })}`);

  step = 'submit create form (real button click, native validation active)';
  const form = page.document.querySelector('#room-name')!.closest('form')!;
  netlog.push(`[native validation] form.checkValidity() = ${(form as any).checkValidity()}`);
  for (const field of ['#room-name', '#room-subject', '#room-topic', '#room-description', '#room-visibility', '#room-max']) {
    const node: any = page.document.querySelector(field);
    netlog.push(`[native validation] ${field} value=${JSON.stringify(node.value)} checkValidity=${node.checkValidity()} validationMessage=${JSON.stringify(node.validationMessage)}`);
  }
  const submitButton = page.document.querySelector('button[type="submit"]')!;
  submitButton.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 1500));
} finally {
  console.log('===== NETWORK (real bundle, real server) =====');
  for (const line of netlog) console.log(line);
  console.log('\n===== CONSOLE =====');
  for (const line of consoleLog) console.log(line);
  console.log('\n===== PAGE TEXT AFTER SUBMIT =====');
  console.log(page.text().replace(/\s+/g, ' ').slice(0, 900));
}

const roomExists = await (await fetch(`${baseUrl}/api/study-rooms`, {
  headers: { Authorization: `Bearer ${registered.token}` },
})).json() as any;
console.log('\n===== SERVER TRUTH =====');
console.log(JSON.stringify(roomExists, null, 2).slice(0, 900));

page.close();
httpServer.closeAllConnections();
httpServer.close();
closeDatabase();
rmSync(dbDir, { recursive: true, force: true });
