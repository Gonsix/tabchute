export const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type Color = typeof COLORS[number];
export type Site = { id: string; url: string; label?: string };
export type GroupTemplate = { id: string; name: string; color: Color; sites: Site[]; revision: number };
export type StoredData = { schemaVersion: 1; groups: GroupTemplate[] };
export const DATA_KEY = 'tabchuteData';
export const JOB_KEY = 'tabchuteJob';

export function normalizeUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a full URL starting with https:// or http://.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only https:// and http:// URLs are supported.');
  return url.href;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved data.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid text value.');
  return value;
}
export function validateGroup(value: unknown): GroupTemplate {
  const g = record(value);
  const id = text(g.id), name = text(g.name).trim();
  if (!id || !name) throw new Error('Give your group a name.');
  if (!COLORS.includes(g.color as Color)) throw new Error('Choose a valid group color.');
  if (!Number.isSafeInteger(g.revision) || (g.revision as number) < 0) throw new Error('Invalid group revision.');
  if (!Array.isArray(g.sites) || !g.sites.length) throw new Error('Add at least one site.');
  const sites = g.sites.map(value => {
    const s = record(value), id = text(s.id);
    if (!id) throw new Error('Invalid site ID.');
    const label = s.label === undefined ? '' : text(s.label).trim();
    return { id, url: normalizeUrl(text(s.url)), ...(label ? { label } : {}) };
  });
  if (new Set(sites.map(s => s.id)).size !== sites.length) throw new Error('Duplicate site ID.');
  return { id, name, color: g.color as Color, sites, revision: g.revision as number };
}
export function parseData(value: unknown): StoredData {
  if (value === undefined) return { schemaVersion: 1, groups: [] };
  const data = record(value);
  if (data.schemaVersion !== 1) throw new Error('Unsupported saved data version. Your data has not been changed.');
  if (!Array.isArray(data.groups)) throw new Error('Invalid saved data. Your data has not been changed.');
  const groups = data.groups.map(validateGroup);
  if (new Set(groups.map(g => g.id)).size !== groups.length) throw new Error('Duplicate group ID in saved data.');
  return { schemaVersion: 1, groups };
}
export type OpenJob = {
  id: string; groupId: string; name: string; windowId: number;
  status: 'running' | 'complete' | 'interrupted';
  createdTabIds: number[]; failures: { url: string; message: string }[];
  errors: string[]; startedAt: number;
};
export type Request =
  | { type: 'list' }
  | { type: 'save'; group: GroupTemplate }
  | { type: 'delete'; id: string; revision: number }
  | { type: 'open'; id: string; windowId: number }
  | { type: 'status' }
  | { type: 'dismiss' };
export type Response = { ok: true; data?: StoredData; group?: GroupTemplate; job?: OpenJob | null } | { ok: false; error: string };
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
