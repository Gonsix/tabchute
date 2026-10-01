import type { Request, Response } from './model';
export async function send(request: Request): Promise<Extract<Response, { ok: true }>> {
  const response: Response = await chrome.runtime.sendMessage(request);
  if (!response?.ok) throw new Error(response && !response.ok ? response.error : 'The extension did not respond. Please try again.');
  return response;
}
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function button(text: string, className: string, action: () => void): HTMLButtonElement {
  const node = element('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node;
}
export function favicon(url: string): HTMLImageElement {
  const img = element('img', 'favicon'); img.alt = ''; img.width = 24; img.height = 24;
  const fallback = chrome.runtime.getURL('site.svg');
  img.src = fallback;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return img;
    const endpoint = new URL(chrome.runtime.getURL('_favicon/'));
    endpoint.searchParams.set('pageUrl', parsed.href); endpoint.searchParams.set('size', '32');
    img.src = endpoint.href;
    img.addEventListener('error', () => { img.src = fallback; }, { once: true });
  } catch { /* An incomplete URL uses the generic icon. */ }
  return img;
}
