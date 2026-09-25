/**
 * 수동 해제의 장면 — 이벤트만 잇는다. 할당기의 셈은 알고리즘이 했다.
 *
 * 바탕(init 이 한 번 정한다): 줄 글자 · 들여쓰기 · 이름 · 새 땅의 시작 · 칸 폭을 정할 span
 * 자취(걸음이 쌓는다): 이름 칸의 값 · 빌려 나간 덩이(빌린 이름과 함께) · 빈 자리 목록 · 새 땅 끝
 * 이번 걸음(step): 무엇이 일어났는가와 그 운동의 계기값
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type MfBlock = { addr: number; size: number; owner: string };
export type MfChip = { addr: number; size: number };

export type ManualFreeStep =
  | { kind: 'start' }
  | { kind: 'plain' }
  | { kind: 'fresh'; addr: number; size: number; before: number }
  | { kind: 'reuse'; addr: number; size: number; was: number }
  | { kind: 'free'; addr: number; size: number; name: string };

export type ManualFreeScene = {
  lines: string[];
  indents: number[];
  names: string[];
  base: number;
  span: number;
  /** names 와 같은 차례. null 은 아직 값이 없는(비어 있는) 칸 */
  vals: (number | null)[];
  /** 빌려 나간 덩이, 주소 차례 */
  blocks: MfBlock[];
  /** 빈 자리 목록, 앞이 가장 최근 */
  list: MfChip[];
  /** 새 땅 끝 */
  end: number;
  /** 밟은 줄, 아직 없으면 -1 */
  line: number;
  step: ManualFreeStep;
};

function empty(): ManualFreeScene {
  return {
    lines: [],
    indents: [],
    names: [],
    base: 0,
    span: 0,
    vals: [],
    blocks: [],
    list: [],
    end: 0,
    line: -1,
    step: { kind: 'start' },
  };
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str) : [];
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map(num) : [];
}

function reduceInit(p: Record<string, unknown>): ManualFreeScene {
  const names = strs(p['names']);
  const base = num(p['base']);
  return {
    ...empty(),
    lines: strs(p['lines']),
    indents: nums(p['indents']),
    names,
    base,
    span: num(p['span']),
    vals: names.map(() => null),
    end: base,
  };
}

function reduceLine(scene: ManualFreeScene, p: Record<string, unknown>): ManualFreeScene {
  let vals = scene.vals;
  let blocks = scene.blocks;
  let list = scene.list;
  let end = scene.end;
  let step: ManualFreeStep = { kind: 'plain' };

  const set = rec(p['set']);
  const setName = set ? str(set['name']) : '';
  if (set) {
    const at = scene.names.indexOf(setName);
    const value = num(set['value']);
    vals = scene.vals.map((v, i) => (i === at ? value : v));
  }

  const alloc = rec(p['alloc']);
  if (alloc) {
    const addr = num(alloc['addr']);
    const size = num(alloc['size']);
    const block: MfBlock = { addr, size, owner: setName };
    blocks = [...scene.blocks.filter((b) => b.addr !== addr), block].sort((a, b) => a.addr - b.addr);
    if (alloc['from'] === 'reuse') {
      const was = scene.list.findIndex((c) => c.addr === addr);
      list = scene.list.filter((_, i) => i !== was);
      step = { kind: 'reuse', addr, size, was };
    } else {
      step = { kind: 'fresh', addr, size, before: scene.end };
    }
    end = num(alloc['end']);
  }

  const free = rec(p['free']);
  if (free) {
    const addr = num(free['addr']);
    const size = num(free['size']);
    blocks = blocks.filter((b) => b.addr !== addr);
    list = [{ addr, size }, ...list];
    step = { kind: 'free', addr, size, name: str(free['name']) };
  }

  return { ...scene, vals, blocks, list, end, line: num(p['line']), step };
}

export const manualFreeScene: ScenePlan<ManualFreeScene> = {
  initial: () => empty(),
  reduce(scene: ManualFreeScene, event: FacetRuntimeEvent): ManualFreeScene {
    const p = rec(event.payload);
    if (!p) return scene;
    if (event.type === 'init') return reduceInit(p);
    if (event.type === 'line') return reduceLine(scene, p);
    return scene;
  },
};
