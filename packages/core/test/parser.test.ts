import { describe, it, expect } from 'vitest';
import { parseFacetExpr, findFacetExprs } from '../src/parser.js';

describe('parseFacetExpr', () => {
  it('parses a container + body pair', () => {
    const result = parseFacetExpr('{facet:loop facet:bubbleSort}');
    expect(result).not.toBeNull();
    expect(result!.container).toEqual({ ns: 'facet', name: 'loop' });
    expect(result!.bodies).toEqual([{ ns: 'facet', name: 'bubbleSort' }]);
    expect(result!.raw).toBe('{facet:loop facet:bubbleSort}');
  });

  it('parses a single-identifier expression (container only)', () => {
    const result = parseFacetExpr('{facet:loop}');
    expect(result).not.toBeNull();
    expect(result!.container).toEqual({ ns: 'facet', name: 'loop' });
    expect(result!.bodies).toEqual([]);
  });

  it('parses multi-body expressions (composition ready)', () => {
    const result = parseFacetExpr('{facet:loop facet:bubbleSort facet:tally}');
    expect(result).not.toBeNull();
    expect(result!.bodies.map((b) => b.name)).toEqual(['bubbleSort', 'tally']);
  });

  it('tolerates multiple spaces between identifiers', () => {
    const result = parseFacetExpr('{facet:loop   facet:bubbleSort}');
    expect(result).not.toBeNull();
    expect(result!.bodies[0].name).toBe('bubbleSort');
  });

  it('accepts kebab and underscore names', () => {
    const result = parseFacetExpr('{facet:loop facet:bubble-sort_v2}');
    expect(result).not.toBeNull();
    expect(result!.bodies[0].name).toBe('bubble-sort_v2');
  });

  it('returns null for missing facet prefix', () => {
    expect(parseFacetExpr('{loop bubbleSort}')).toBeNull();
    expect(parseFacetExpr('{other:loop}')).toBeNull();
  });

  it('returns null for malformed expressions', () => {
    expect(parseFacetExpr('{facet:loop')).toBeNull();
    expect(parseFacetExpr('facet:loop}')).toBeNull();
    expect(parseFacetExpr('{facet:}')).toBeNull();
    expect(parseFacetExpr('{}')).toBeNull();
    expect(parseFacetExpr('')).toBeNull();
  });

  it('returns null when embedded inside larger text (single-expr matcher is strict)', () => {
    expect(parseFacetExpr('text {facet:loop facet:bubbleSort} tail')).toBeNull();
  });
});

describe('findFacetExprs', () => {
  it('finds a single embedded expression with positions', () => {
    const text = 'before {facet:loop facet:bubbleSort} after';
    const matches = findFacetExprs(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].expr.container.name).toBe('loop');
    expect(matches[0].expr.bodies[0].name).toBe('bubbleSort');
    expect(text.slice(matches[0].start, matches[0].end)).toBe(
      '{facet:loop facet:bubbleSort}',
    );
  });

  it('finds multiple expressions across the document', () => {
    const text = 'A {facet:loop facet:a} B {facet:loop facet:b}';
    const matches = findFacetExprs(text);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.expr.bodies[0].name)).toEqual(['a', 'b']);
  });

  it('ignores malformed patterns that look similar', () => {
    const text = '{facet:} {other:loop} {facet:loop facet:ok}';
    const matches = findFacetExprs(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].expr.bodies[0].name).toBe('ok');
  });

  it('returns empty array when no matches', () => {
    expect(findFacetExprs('plain markdown text')).toEqual([]);
  });
});
