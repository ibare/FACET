import { describe, it, expect } from 'vitest';
import {
  createCatalog,
  registerInto,
  deriveUIOptions,
  validateCatalog,
} from '../src/catalog.js';
import type { Algorithm, Body, IR, Transpiler } from '../src/types.js';

function makeFixture() {
  const algorithm: Algorithm = {
    id: 'alg',
    description: 'test',
    phases: ['a', 'b'],
  };
  const irImp: IR = { id: 'alg-imp', algorithm: 'alg', paradigm: 'imperative' };
  const irFn: IR = { id: 'alg-fn', algorithm: 'alg', paradigm: 'functional' };
  const body: Body = {
    id: 'alg-bars',
    algorithm: 'alg',
    available_irs: ['alg-imp', 'alg-fn'],
    default_ir: 'alg-imp',
    controls: [],
    init: () => {
      throw new Error('not used in metadata tests');
    },
  };
  const pyImp: Transpiler = {
    id: 'py-imp',
    paradigm: 'imperative',
    target: 'python',
    targetLabel: 'Python',
    transpile: () => ({ lines: [] }),
  };
  const jsFn: Transpiler = {
    id: 'js-fn',
    paradigm: 'functional',
    target: 'javascript',
    targetLabel: 'JavaScript',
    transpile: () => ({ lines: [] }),
  };
  return { algorithm, irImp, irFn, body, pyImp, jsFn };
}

describe('deriveUIOptions', () => {
  it('derives paradigms, languages, phases, and controls from catalog matching', () => {
    const cat = createCatalog();
    const f = makeFixture();
    registerInto(cat, {
      algorithms: [f.algorithm],
      bodies: [f.body],
      irs: [f.irImp, f.irFn],
      transpilers: [f.pyImp, f.jsFn],
    });

    const options = deriveUIOptions('alg-bars', cat);
    expect(options).not.toBeNull();
    expect(options!.paradigms.map((p) => p.id).sort()).toEqual([
      'functional',
      'imperative',
    ]);
    expect(options!.languages.sort()).toEqual(['javascript', 'python']);
    expect(options!.phases).toEqual(['a', 'b']);
  });

  it('returns null for unknown body', () => {
    const cat = createCatalog();
    expect(deriveUIOptions('missing', cat)).toBeNull();
  });
});

describe('validateCatalog', () => {
  it('returns no warnings for a well-formed catalog', () => {
    const cat = createCatalog();
    const f = makeFixture();
    registerInto(cat, {
      algorithms: [f.algorithm],
      bodies: [f.body],
      irs: [f.irImp, f.irFn],
      transpilers: [f.pyImp, f.jsFn],
    });
    expect(validateCatalog(cat)).toEqual([]);
  });

  it('flags body referencing missing algorithm', () => {
    const cat = createCatalog();
    const f = makeFixture();
    registerInto(cat, { bodies: [f.body], irs: [f.irImp, f.irFn] });
    const warnings = validateCatalog(cat);
    expect(warnings.some((w) => w.includes('unknown algorithm'))).toBe(true);
  });

  it('flags default_ir not in available_irs', () => {
    const cat = createCatalog();
    const f = makeFixture();
    const brokenBody: Body = { ...f.body, default_ir: 'not-in-list' };
    registerInto(cat, {
      algorithms: [f.algorithm],
      bodies: [brokenBody],
      irs: [f.irImp, f.irFn],
    });
    const warnings = validateCatalog(cat);
    expect(warnings.some((w) => w.includes('default_ir'))).toBe(true);
  });
});
