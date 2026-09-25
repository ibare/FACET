/**
 * 메모리 누수의 장면.
 *
 * 바탕 — 코드 줄(들여쓰기 · 글자). initialData 에서 베낀다.
 * 자취 — 이름 칸 · 덩이 · 빈 자리 목록 · 새 땅 끝 · 주소를 잃은 덩이. 알고리즘이 셈한 모습을 그대로 잇는다.
 * 이번 걸음 — 밟은 줄 · 앞 줄 · 무엇이 일어났는가(종류와 인자).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneVal = { k: 'empty' } | { k: 'null' } | { k: 'num'; n: number };

export interface SceneLine {
  indent: number;
  text: string;
}

export interface SceneCell {
  name: string;
  value: SceneVal;
  ptr: boolean;
}

export interface SceneBlock {
  addr: number;
  cells: SceneVal[];
  out: boolean;
}

export type SceneStepKind = 'declare' | 'assign' | 'iter' | 'exit' | 'alloc' | 'store' | 'free';

interface SceneStepBase {
  line: number;
  from: number | null;
  name: string | null;
  was: SceneVal | null;
  value: SceneVal | null;
}

/** 주소가 주인공인 걸음(빌림 · 넣기 · 돌려줌)은 주소를 반드시 가진다. */
export type SceneStep =
  | (SceneStepBase & { kind: 'declare' | 'assign' | 'iter' | 'exit' })
  | (SceneStepBase & { kind: 'alloc' | 'store' | 'free'; addr: number });

export interface MemoryLeakScene {
  lines: SceneLine[];
  cells: SceneCell[];
  blocks: SceneBlock[];
  free: number[];
  newEnd: number | null;
  lost: number[];
  step: SceneStep | null;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readVal(x: unknown): SceneVal | null {
  if (!isObj(x)) return null;
  if (x.k === 'empty') return { k: 'empty' };
  if (x.k === 'null') return { k: 'null' };
  if (x.k === 'num' && typeof x.n === 'number') return { k: 'num', n: x.n };
  return null;
}

function readNums(x: unknown): number[] {
  return Array.isArray(x) ? x.filter((v): v is number => typeof v === 'number') : [];
}

function readCells(x: unknown): SceneCell[] {
  if (!Array.isArray(x)) return [];
  const out: SceneCell[] = [];
  for (const c of x) {
    if (!isObj(c) || typeof c.name !== 'string') continue;
    out.push({ name: c.name, value: readVal(c.value) ?? { k: 'empty' }, ptr: c.ptr === true });
  }
  return out;
}

function readBlocks(x: unknown): SceneBlock[] {
  if (!Array.isArray(x)) return [];
  const out: SceneBlock[] = [];
  for (const b of x) {
    if (!isObj(b) || typeof b.addr !== 'number' || !Array.isArray(b.cells)) continue;
    out.push({
      addr: b.addr,
      cells: b.cells.map((v) => readVal(v) ?? { k: 'empty' }),
      out: b.out === true,
    });
  }
  return out;
}

const KINDS: readonly SceneStepKind[] = ['declare', 'assign', 'iter', 'exit', 'alloc', 'store', 'free'];

function readKind(x: unknown): SceneStepKind | null {
  return KINDS.find((k) => k === x) ?? null;
}

function readMachine(scene: MemoryLeakScene, p: Record<string, unknown>): MemoryLeakScene {
  return {
    lines: scene.lines,
    cells: readCells(p.cells),
    blocks: readBlocks(p.blocks),
    free: readNums(p.free),
    newEnd: typeof p.newEnd === 'number' ? p.newEnd : null,
    lost: readNums(p.lost),
    step: null,
  };
}

export const memoryLeakScene: ScenePlan<MemoryLeakScene> = {
  initial(initialData: unknown): MemoryLeakScene {
    const lines: SceneLine[] = [];
    if (isObj(initialData) && Array.isArray(initialData.lines)) {
      for (const l of initialData.lines) {
        if (isObj(l) && typeof l.indent === 'number' && typeof l.text === 'string') {
          lines.push({ indent: l.indent, text: l.text });
        }
      }
    }
    return { lines, cells: [], blocks: [], free: [], newEnd: null, lost: [], step: null };
  },

  reduce(scene: MemoryLeakScene, event: FacetRuntimeEvent): MemoryLeakScene {
    const p = event.payload;
    if (!isObj(p)) return scene;
    if (event.type === 'start') return readMachine(scene, p);
    if (event.type === 'step') {
      const kind = readKind(p.kind);
      if (kind === null || typeof p.line !== 'number') return scene;
      const base: SceneStepBase = {
        line: p.line,
        from: typeof p.from === 'number' ? p.from : null,
        name: typeof p.name === 'string' ? p.name : null,
        was: readVal(p.was),
        value: readVal(p.value),
      };
      let step: SceneStep;
      if (kind === 'alloc' || kind === 'store' || kind === 'free') {
        if (typeof p.addr !== 'number') throw new Error(`memory-leak 장면: ${kind} 걸음에 주소가 없다`);
        step = { ...base, kind, addr: p.addr };
      } else {
        step = { ...base, kind };
      }
      return { ...readMachine(scene, p), step };
    }
    return scene;
  },
};
