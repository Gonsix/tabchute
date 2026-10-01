import { createService, chromeAdapter } from './service';
import type { Request } from './model';
const service = createService(chromeAdapter);
chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  void service.handle(request).then(sendResponse);
  return true;
});
