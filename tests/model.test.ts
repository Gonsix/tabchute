import { describe, test, expect } from 'bun:test';
import { normalizeUrl, parseData, validateGroup } from '../src/model';
const group = () => ({ id: 'g', name: ' Research ', color: 'blue', revision: 0, sites: [{ id: 's', label: ' Library ', url: ' https://example.com ' }] });
describe('template validation', () => {
  test('normalizes URLs and trims names without losing IDs', () => {
    expect(validateGroup(group())).toEqual({ id: 'g', name: 'Research', color: 'blue', revision: 0, sites: [{ id: 's', label: 'Library', url: 'https://example.com/' }] });
  });
  test('rejects missing scheme and dangerous schemes', () => {
    for (const url of ['example.com', '//example.com', 'javascript:alert(1)', 'file:///tmp/x', 'chrome://settings', 'https://']) expect(() => normalizeUrl(url)).toThrow();
  });
  test('rejects empty names, no sites, invalid color and duplicate IDs', () => {
    expect(() => validateGroup({ ...group(), name: ' ' })).toThrow();
    expect(() => validateGroup({ ...group(), sites: [] })).toThrow();
    expect(() => validateGroup({ ...group(), color: 'black' })).toThrow();
    expect(() => validateGroup({ ...group(), sites: [...group().sites, ...group().sites] })).toThrow();
  });
  test('allows duplicate URLs and keeps order', () => {
    const g = validateGroup({ ...group(), sites: [...group().sites, { id: 's2', url: 'https://example.com' }] });
    expect(g.sites.map(s => s.id)).toEqual(['s', 's2']);
  });
  test('initializes only absent data; unknown or corrupt data fails', () => {
    expect(parseData(undefined)).toEqual({ schemaVersion: 1, groups: [] });
    for (const value of [null, {}, { schemaVersion: 2, groups: [] }, { schemaVersion: 1, groups: 'bad' }]) expect(() => parseData(value)).toThrow();
  });
});
