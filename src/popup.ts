import { DATA_KEY, JOB_KEY, errorMessage, type OpenJob } from './model';
import { send, element, button } from './ui';
const groups = document.querySelector<HTMLDivElement>('#groups')!;
const error = document.querySelector<HTMLDivElement>('#error')!;
const jobPanel = document.querySelector<HTMLElement>('#job')!;
let busy = false;
let openingButtons: HTMLButtonElement[] = [];
const showError = (message: string) => { error.textContent = message; error.hidden = false; };
async function edit(id?: string) {
  try { await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') + (id ? `?id=${encodeURIComponent(id)}` : '') }); window.close(); }
  catch (e) { showError(errorMessage(e)); }
}
function renderJob(job: OpenJob | null) {
  busy = job?.status === 'running';
  openingButtons.forEach(b => b.disabled = busy);
  jobPanel.replaceChildren(); jobPanel.hidden = !job;
  if (!job) return;
  const problems = job.failures.length || job.errors.length || job.status === 'interrupted';
  jobPanel.classList.toggle('error', Boolean(problems));
  const summary = job.status === 'running' ? `Opening ${job.name}…` : job.status === 'interrupted' ? `Opening ${job.name} was interrupted.` : `${job.createdTabIds.length} ${job.createdTabIds.length === 1 ? 'site' : 'sites'} opened from ${job.name}.`;
  jobPanel.append(element('strong', '', summary));
  if (problems) {
    const list = element('ul');
    job.failures.forEach(f => list.append(element('li', '', `${f.url}: ${f.message}`)));
    job.errors.forEach(e => list.append(element('li', '', e)));
    jobPanel.append(list);
  }
  if (!busy) jobPanel.append(button('Dismiss', 'ghost', () => { void send({ type: 'dismiss' }).then(() => renderJob(null)).catch(e => showError(errorMessage(e))); }));
}
async function load() {
  try {
    const { data } = await send({ type: 'list' });
    groups.replaceChildren(); openingButtons = [];
    document.querySelector('#count')!.textContent = String(data!.groups.length);
    if (!data!.groups.length) {
      const empty = element('div', 'empty');
      empty.append(element('h3', '', 'A home for your go-to sites'), element('p', 'muted', 'Create a group for research, work, or whatever comes next.'));
      groups.append(empty);
    }
    for (const group of data!.groups) {
      const card = element('article', 'group-card'), info = element('div', 'group-info');
      info.append(element('span', `dot color-${group.color}`), element('h3', 'group-name', group.name));
      const bottom = element('div', 'card-bottom'), actions = element('div', 'card-actions');
      const open = button('Open', 'primary', () => { void (async () => {
        error.hidden = true; busy = true; openingButtons.forEach(b => b.disabled = true);
        try {
          const w = await chrome.windows.getCurrent();
          if (w.id === undefined || w.type !== 'normal' || w.incognito) throw new Error('Open TabChute in a normal browser window.');
          const response = await send({ type: 'open', id: group.id, windowId: w.id });
          if (response.job) renderJob(response.job);
          // The job may already have finished while the acknowledgement was delivered.
          renderJob((await send({ type: 'status' })).job ?? null);
        } catch (e) { busy = false; openingButtons.forEach(b => b.disabled = false); showError(errorMessage(e)); }
      })(); });
      open.disabled = busy; open.setAttribute('aria-label', `Open ${group.name}`); openingButtons.push(open);
      const editButton = button('Edit', 'secondary', () => { void edit(group.id); }); editButton.setAttribute('aria-label', `Edit ${group.name}`);
      actions.append(open, editButton);
      bottom.append(element('span', 'muted', `${group.sites.length} ${group.sites.length === 1 ? 'site' : 'sites'}`), actions);
      card.append(info, bottom); groups.append(card);
    }
  } catch (e) { groups.replaceChildren(); showError(errorMessage(e)); }
}
document.querySelector('#new')!.addEventListener('click', () => { void edit(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[DATA_KEY]) void load();
  if (area === 'session' && changes[JOB_KEY]) renderJob((changes[JOB_KEY].newValue as OpenJob | undefined) ?? null);
});
void (async () => { try { renderJob((await send({ type: 'status' })).job ?? null); } catch (e) { showError(errorMessage(e)); } await load(); })();
