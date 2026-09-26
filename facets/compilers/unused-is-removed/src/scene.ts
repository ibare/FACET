import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 줄 글자 조각. `ref` 는 let 이름을 가리키는 자리, `def` 는 그 이름을 세우는 자리. */
export type SceneSeg = { s: string; ref?: string; def?: boolean };
export type SceneLine = { n: number; indent: number; segs: SceneSeg[]; kind: 'function' | 'let' | 'return'; name: string | null };
export type SceneEdge = { from: number; to: number; name: string };
export type SceneUse = { name: string; n: number };

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'drop'; round: number; gone: number[]; was: number[]; before: SceneUse[] }
  | { kind: 'stop'; round: number };

export type UnusedIsRemovedScene = {
  /** 바탕 — init 이 한 번 정한다 */
  lines: SceneLine[];
  edges: SceneEdge[];
  names: string[];
  lines0: number;
  ops0: number;
  /** 자취 — 걸음이 쌓는다 */
  alive: number[];
  removed: number[];
  uses: SceneUse[];
  linesNow: number;
  opsNow: number;
  /** 이번 걸음 */
  step: SceneStep;
};

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`unused-is-removed scene: ${what} is not a number`);
  return v;
}

function nums(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`unused-is-removed scene: ${what} is not a list`);
  return v.map((x) => num(x, what));
}

function usesOf(v: unknown): SceneUse[] {
  if (!Array.isArray(v)) throw new Error('unused-is-removed scene: uses is not a list');
  return v.map((u) => {
    const o = rec(u);
    if (!o || typeof o.name !== 'string') throw new Error('unused-is-removed scene: use has no name');
    return { name: o.name, n: num(o.n, 'use count') };
  });
}

function segsOf(v: unknown): SceneSeg[] {
  if (!Array.isArray(v)) throw new Error('unused-is-removed scene: segs is not a list');
  return v.map((g) => {
    const o = rec(g);
    if (!o || typeof o.s !== 'string') throw new Error('unused-is-removed scene: seg has no text');
    const seg: SceneSeg = { s: o.s };
    if (typeof o.ref === 'string') seg.ref = o.ref;
    if (o.def === true) seg.def = true;
    return seg;
  });
}

/** initialData 의 줄 목록에서 첫 장면의 줄을 베낀다. 줄 목록이 없으면 빈 목록, 모르는 줄 모양은 던진다. */
function linesFrom(initialData: unknown): SceneLine[] {
  const d = rec(initialData);
  if (!d || !Array.isArray(d.lines)) return [];
  const out: SceneLine[] = [];
  d.lines.forEach((raw: unknown, i) => {
    const o = rec(raw);
    const st = o ? rec(o.stmt) : null;
    if (!o || !st || typeof o.text !== 'string' || typeof o.indent !== 'number')
      throw new Error(`unused-is-removed scene: L${i + 1}: line shape is not { indent, text, stmt }`);
    const k = st.k;
    if (k !== 'function' && k !== 'let' && k !== 'return')
      throw new Error(`unused-is-removed scene: L${i + 1}: unsupported statement kind ${String(k)}`);
    if (k === 'let' && typeof st.name !== 'string')
      throw new Error(`unused-is-removed scene: L${i + 1}: let has no name`);
    out.push({
      n: i + 1,
      indent: o.indent,
      segs: [{ s: o.text }],
      kind: k,
      name: k === 'let' && typeof st.name === 'string' ? st.name : null,
    });
  });
  return out;
}

export const unusedIsRemovedScene: ScenePlan<UnusedIsRemovedScene> = {
  initial(initialData: unknown): UnusedIsRemovedScene {
    const lines = linesFrom(initialData);
    return {
      lines,
      edges: [],
      names: [],
      lines0: 0,
      ops0: 0,
      alive: lines.map((l) => l.n),
      removed: [],
      uses: [],
      linesNow: 0,
      opsNow: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: UnusedIsRemovedScene, event: FacetRuntimeEvent): UnusedIsRemovedScene {
    const p = rec(event.payload);
    if (!p) return scene;
    if (event.type === 'init') {
      if (!Array.isArray(p.lines) || !Array.isArray(p.edges) || !Array.isArray(p.names))
        throw new Error('unused-is-removed scene: init payload is incomplete');
      const segsByLine = new Map<number, SceneSeg[]>();
      for (const raw of p.lines) {
        const o = rec(raw);
        if (!o) throw new Error('unused-is-removed scene: init line is not an object');
        segsByLine.set(num(o.n, 'line number'), segsOf(o.segs));
      }
      const lines = scene.lines.map((l) => {
        const segs = segsByLine.get(l.n);
        if (!segs) throw new Error(`unused-is-removed scene: no segs for L${l.n}`);
        return { ...l, segs };
      });
      const edges = p.edges.map((raw: unknown) => {
        const o = rec(raw);
        if (!o || typeof o.name !== 'string') throw new Error('unused-is-removed scene: edge has no name');
        return { from: num(o.from, 'edge from'), to: num(o.to, 'edge to'), name: o.name };
      });
      const names = p.names.map((x: unknown) => {
        if (typeof x !== 'string') throw new Error('unused-is-removed scene: name is not a string');
        return x;
      });
      const lines0 = num(p.lines0, 'lines0');
      const ops0 = num(p.ops0, 'ops0');
      return {
        ...scene,
        lines,
        edges,
        names,
        lines0,
        ops0,
        alive: lines.map((l) => l.n),
        removed: [],
        uses: usesOf(p.uses),
        linesNow: lines0,
        opsNow: ops0,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'drop') {
      const gone = nums(p.gone, 'gone');
      return {
        ...scene,
        alive: scene.alive.filter((n) => !gone.includes(n)),
        removed: [...scene.removed, ...gone],
        uses: usesOf(p.after),
        linesNow: num(p.lines, 'lines'),
        opsNow: num(p.ops, 'ops'),
        step: { kind: 'drop', round: num(p.round, 'round'), gone, was: [...scene.alive], before: usesOf(p.uses) },
      };
    }
    if (event.type === 'stop') {
      return { ...scene, uses: usesOf(p.uses), step: { kind: 'stop', round: num(p.round, 'round') } };
    }
    return scene;
  },
};
