import { describe, it, expect } from 'vitest';
import { FacetExtension } from '../src/index.js';

describe('FacetExtension', () => {
  it('has name "facet"', () => {
    expect(FacetExtension.name).toBe('facet');
  });

  it('declares inline atom group via config', () => {
    const cfg = (FacetExtension as unknown as { config: Record<string, unknown> }).config;
    expect(cfg.group).toBe('inline');
    expect(cfg.inline).toBe(true);
    expect(cfg.atom).toBe(true);
  });

  it('provides default options: lenses circuit+code, catalog null', () => {
    const cfg = (FacetExtension as unknown as {
      config: { addOptions?: () => { catalog: unknown; lenses: string[] } };
    }).config;
    const opts = cfg.addOptions?.();
    expect(opts?.catalog).toBeNull();
    expect(opts?.lenses).toEqual(['circuit', 'code']);
  });
});
