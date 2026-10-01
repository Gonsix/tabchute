import { DATA_KEY, JOB_KEY, parseData, validateGroup, errorMessage, type OpenJob, type Request, type Response } from './model';

export interface BrowserAdapter {
  readLocal(): Promise<unknown>;
  writeLocal(value: unknown): Promise<void>;
  readJob(): Promise<OpenJob | undefined>;
  writeJob(job: OpenJob | null): Promise<void>;
  normalWindow(id: number): Promise<boolean>;
  createTab(windowId: number, url: string): Promise<number>;
  groupTabs(windowId: number, ids: number[]): Promise<number>;
  setGroup(id: number, name: string, color: string): Promise<void>;
  activate(id: number): Promise<void>;
}
export function createService(api: BrowserAdapter) {
  // One writer prevents read/modify/write races between extension pages.
  let queue: Promise<unknown> = Promise.resolve();
  let opening = false;
  let recovered: Promise<void> | undefined;
  const recover = () => recovered ??= (async () => {
    const job = await api.readJob();
    if (job?.status === 'running') {
      job.status = 'interrupted';
      job.errors.push('Opening was interrupted. Some tabs may already be open; no automatic retry was made.');
      await api.writeJob(job);
    }
  })().catch(error => { recovered = undefined; throw error; });
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  }
  async function run(job: OpenJob, sites: { url: string }[], color: string) {
    try {
      for (const site of sites) {
        try { job.createdTabIds.push(await api.createTab(job.windowId, site.url)); }
        catch (error) { job.failures.push({ url: site.url, message: errorMessage(error) }); }
        await api.writeJob(job);
      }
      if (job.createdTabIds.length) {
        try {
          const id = await api.groupTabs(job.windowId, job.createdTabIds);
          try { await api.setGroup(id, job.name, color); }
          catch (error) { job.errors.push(`Could not set group name, color or expansion: ${errorMessage(error)}`); }
        } catch (error) { job.errors.push(`Could not group the opened tabs: ${errorMessage(error)}`); }
        try { await api.activate(job.createdTabIds[0]); }
        catch (error) { job.errors.push(`Could not select the first tab: ${errorMessage(error)}`); }
      }
      job.status = 'complete';
    } catch (error) {
      job.status = 'interrupted';
      job.errors.push(`Opening stopped: ${errorMessage(error)}`);
    } finally {
      try { await api.writeJob(job); } finally { opening = false; }
    }
  }
  async function handle(request: Request): Promise<Response> {
    try {
      await recover();
      switch (request.type) {
        case 'list': return { ok: true, data: parseData(await api.readLocal()) };
        case 'status': return { ok: true, job: await api.readJob() ?? null };
        case 'dismiss': return await serial(async () => {
          if (opening) throw new Error('A group is still opening.');
          await api.writeJob(null); return { ok: true };
        });
        case 'save': return await serial(async () => {
          const group = validateGroup(request.group), data = parseData(await api.readLocal());
          const index = data.groups.findIndex(g => g.id === group.id);
          if (index < 0 && group.revision !== 0 || index >= 0 && data.groups[index].revision !== group.revision)
            throw new Error('This group changed in another tab. Reload the saved version before editing again.');
          group.revision++;
          if (index < 0) data.groups.push(group); else data.groups[index] = group;
          await api.writeLocal(data);
          return { ok: true, group };
        });
        case 'delete': return await serial(async () => {
          const data = parseData(await api.readLocal()), group = data.groups.find(g => g.id === request.id);
          if (!group || group.revision !== request.revision) throw new Error('This group changed or was deleted in another tab. Reload first.');
          data.groups = data.groups.filter(g => g.id !== request.id);
          await api.writeLocal(data); return { ok: true };
        });
        case 'open': return await serial(async () => {
          if (opening) throw new Error('A group is already opening. Please wait.');
          opening = true;
          try {
            if (!Number.isInteger(request.windowId) || !await api.normalWindow(request.windowId)) throw new Error('Open TabChute in a normal browser window.');
            const group = parseData(await api.readLocal()).groups.find(g => g.id === request.id);
            if (!group) throw new Error('This group no longer exists.');
            const job: OpenJob = { id: crypto.randomUUID(), groupId: group.id, name: group.name, windowId: request.windowId,
              status: 'running', createdTabIds: [], failures: [], errors: [], startedAt: Date.now() };
            await api.writeJob(job);
            // A closed popup must not cancel the job. Extension API calls keep the worker active.
            void run(job, group.sites, group.color).catch(console.error);
            return { ok: true, job };
          } catch (error) { opening = false; throw error; }
        });
        default: throw new Error('Unknown request.');
      }
    } catch (error) { return { ok: false, error: errorMessage(error) }; }
  }
  return { handle };
}
export const chromeAdapter: BrowserAdapter = {
  readLocal: async () => (await chrome.storage.local.get(DATA_KEY))[DATA_KEY],
  writeLocal: async value => { await chrome.storage.local.set({ [DATA_KEY]: value }); },
  readJob: async () => (await chrome.storage.session.get(JOB_KEY))[JOB_KEY] as OpenJob | undefined,
  writeJob: async job => { if (job) await chrome.storage.session.set({ [JOB_KEY]: job }); else await chrome.storage.session.remove(JOB_KEY); },
  normalWindow: async id => { const w = await chrome.windows.get(id); return w.type === 'normal' && !w.incognito; },
  createTab: async (windowId, url) => { const tab = await chrome.tabs.create({ windowId, url, active: false }); if (tab.id === undefined) throw new Error('Browser did not return a tab ID.'); return tab.id; },
  groupTabs: async (windowId, ids) => {
    // Explicitly establish order, even if the user moved tabs while they were opening.
    await chrome.tabs.move(ids, { windowId, index: -1 });
    return chrome.tabs.group({ tabIds: ids as [number, ...number[]], createProperties: { windowId } });
  },
  setGroup: async (id, title, color) => { await chrome.tabGroups.update(id, { title, color: color as chrome.tabGroups.Color, collapsed: false }); },
  activate: async id => { await chrome.tabs.update(id, { active: true }); }
};
