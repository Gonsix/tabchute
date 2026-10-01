import { COLORS, normalizeUrl, errorMessage, type GroupTemplate, type Site } from './model';
import { send, element, button, favicon } from './ui';
const form = document.querySelector<HTMLFormElement>('#form')!;
const fields = document.querySelector<HTMLFieldSetElement>('#fields')!;
const name = document.querySelector<HTMLInputElement>('#name')!;
const sites = document.querySelector<HTMLDivElement>('#sites')!;
const colors = document.querySelector<HTMLDivElement>('#colors')!;
const error = document.querySelector<HTMLDivElement>('#error')!;
const success = document.querySelector<HTMLDivElement>('#success')!;
const remove = document.querySelector<HTMLButtonElement>('#delete')!;
const blankSite = (): Site => ({ id: crypto.randomUUID(), url: '' });
let group: GroupTemplate = { id: crypto.randomUUID(), name: '', color: 'blue', revision: 0, sites: [blankSite()] };
let dirty = false, dragging: string | undefined;
function changed() { dirty = true; success.hidden = true; }
function showError(e: unknown) { error.textContent = errorMessage(e); error.hidden = false; }
function renderColors() {
  colors.replaceChildren();
  COLORS.forEach((color, index) => {
    const swatch = button('', `swatch color-${color}`, () => { group.color = color; changed(); renderColors(); (colors.children[index] as HTMLElement)?.focus(); });
    swatch.setAttribute('role', 'radio'); swatch.setAttribute('aria-label', color[0].toUpperCase() + color.slice(1));
    swatch.setAttribute('aria-checked', String(group.color === color)); swatch.title = color;
    swatch.tabIndex = group.color === color ? 0 : -1;
    swatch.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const next = (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + COLORS.length) % COLORS.length;
      group.color = COLORS[next]; changed(); renderColors(); (colors.children[next] as HTMLElement).focus();
    });
    colors.append(swatch);
  });
}
function move(id: string, next: number) {
  const index = group.sites.findIndex(s => s.id === id);
  if (index < 0 || next < 0 || next >= group.sites.length || index === next) return;
  const [site] = group.sites.splice(index, 1); group.sites.splice(next, 0, site); changed(); renderSites();
  document.getElementById(`url-${id}`)?.focus();
}
function renderSites() {
  sites.replaceChildren();
  if (!group.sites.length) sites.append(element('div', 'empty', 'Add a site to get started.'));
  group.sites.forEach((site, index) => {
    const card = element('article', 'site-card'), rail = element('div', 'site-rail');
    const drag = element('span', 'drag-handle', '⠿'); drag.draggable = true; drag.title = 'Drag to reorder'; drag.setAttribute('aria-hidden', 'true');
    drag.addEventListener('dragstart', event => { if (fields.disabled) { event.preventDefault(); return; } dragging = site.id; event.dataTransfer?.setData('text/plain', site.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
    drag.addEventListener('dragend', () => { dragging = undefined; sites.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over')); });
    card.addEventListener('dragover', event => { if (dragging && dragging !== site.id) { event.preventDefault(); card.classList.add('drag-over'); } });
    card.addEventListener('dragleave', event => { if (!card.contains(event.relatedTarget as Node)) card.classList.remove('drag-over'); });
    card.addEventListener('drop', event => { event.preventDefault(); if (dragging && !fields.disabled) move(dragging, index); dragging = undefined; });
    let icon = favicon(site.url); rail.append(drag, icon);
    const body = element('div', 'site-fields');
    const urlField = element('label', 'field url-field', 'Site URL');
    const urlInput = element('input'); urlInput.id = `url-${site.id}`; urlInput.type = 'url'; urlInput.placeholder = 'https://example.com'; urlInput.value = site.url; urlInput.required = true; urlInput.autocomplete = 'off';
    const validation = element('span', 'field-error'); validation.id = `error-${site.id}`; urlInput.setAttribute('aria-describedby', validation.id);
    urlInput.addEventListener('input', () => { site.url = urlInput.value; changed(); urlInput.removeAttribute('aria-invalid'); validation.textContent = ''; });
    urlInput.addEventListener('blur', () => {
      try { const normalized = normalizeUrl(site.url); site.url = normalized; urlInput.value = normalized; const next = favicon(normalized); icon.replaceWith(next); icon = next; labelInput.placeholder = new URL(normalized).hostname; }
      catch (e) { validation.textContent = errorMessage(e); urlInput.setAttribute('aria-invalid', 'true'); }
    });
    urlField.append(urlInput, validation);
    const labelField = element('label', 'field', 'Display name (optional)');
    const labelInput = element('input'); labelInput.value = site.label ?? ''; labelInput.placeholder = 'e.g. Library'; try { labelInput.placeholder = new URL(site.url).hostname; } catch { /* Placeholder for a new site. */ } labelInput.addEventListener('input', () => { site.label = labelInput.value; changed(); }); labelField.append(labelInput);
    const controls = element('div', 'site-controls'), order = element('div');
    const up = button('↑', 'ghost', () => move(site.id, index - 1)); up.disabled = index === 0; up.setAttribute('aria-label', `Move site ${index + 1} up`);
    const down = button('↓', 'ghost', () => move(site.id, index + 1)); down.disabled = index === group.sites.length - 1; down.setAttribute('aria-label', `Move site ${index + 1} down`);
    order.append(element('span', 'muted', `${index + 1}`), up, down);
    const del = button('Remove', 'ghost danger', () => { group.sites = group.sites.filter(s => s.id !== site.id); changed(); renderSites(); }); del.setAttribute('aria-label', `Remove site ${index + 1}`);
    controls.append(order, del); body.append(urlField, labelField, controls); card.append(rail, body); sites.append(card);
  });
}
function render() {
  name.value = group.name; renderColors(); renderSites(); remove.hidden = group.revision === 0;
  document.querySelector('#title')!.textContent = group.revision ? 'Edit group' : 'New group';
  document.title = `${group.revision ? group.name : 'New group'} · TabChute`;
}
name.addEventListener('input', () => { group.name = name.value; changed(); name.removeAttribute('aria-invalid'); document.querySelector('#name-error')!.textContent = ''; });
name.setAttribute('aria-describedby', 'name-error');
document.querySelector('#add')!.addEventListener('click', () => { const site = blankSite(); group.sites.push(site); changed(); renderSites(); document.getElementById(`url-${site.id}`)?.focus(); });
form.addEventListener('submit', event => { event.preventDefault(); void (async () => {
  error.hidden = true; success.hidden = true;
  let firstInvalid: HTMLElement | undefined;
  if (!group.name.trim()) { document.querySelector('#name-error')!.textContent = 'Give your group a name.'; name.setAttribute('aria-invalid', 'true'); firstInvalid = name; }
  for (const site of group.sites) {
    try { normalizeUrl(site.url); } catch (e) {
      const input = document.getElementById(`url-${site.id}`)!; input.setAttribute('aria-invalid', 'true'); document.getElementById(`error-${site.id}`)!.textContent = errorMessage(e); firstInvalid ??= input;
    }
  }
  if (firstInvalid) { firstInvalid.focus(); return; }
  if (!group.sites.length) { showError('Add at least one site.'); return; }
  fields.disabled = true;
  try { const response = await send({ type: 'save', group }); group = response.group!; dirty = false; history.replaceState(null, '', `?id=${encodeURIComponent(group.id)}`); render(); success.textContent = 'Group saved. Ready to open from TabChute.'; success.hidden = false; }
  catch (e) { showError(e); }
  finally { fields.disabled = false; }
})(); });
remove.addEventListener('click', () => { if (!confirm(`Delete “${group.name}”? Your open browser tabs will stay as they are.`)) return; void (async () => {
  fields.disabled = true;
  try { await send({ type: 'delete', id: group.id, revision: group.revision }); dirty = false; window.close(); success.textContent = 'Group deleted. You can close this tab.'; success.hidden = false; }
  catch (e) { showError(e); fields.disabled = false; }
})(); });
document.querySelector('#cancel')!.addEventListener('click', () => { if (dirty && !confirm('Discard your unsaved changes?')) return; dirty = false; window.close(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
void (async () => {
  try {
    // Verify storage even for new groups, so corrupt data cannot silently be replaced.
    const { data } = await send({ type: 'list' });
    const id = new URL(location.href).searchParams.get('id');
    if (id) { const saved = data!.groups.find(g => g.id === id); if (!saved) throw new Error('This group no longer exists. Open TabChute to create a new one.'); group = saved; }
    render(); fields.disabled = false;
  } catch (e) { showError(e); }
})();
