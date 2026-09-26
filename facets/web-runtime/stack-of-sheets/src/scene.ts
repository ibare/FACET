/**
 * stack-of-sheets 의 장면 — 이벤트를 잇기만 한다. 셈(칠하기 동작 수 · 가려짐)은 알고리즘이 한다.
 *
 * 바탕: layers · covers (initialData 에서 베낀다. 걸음 0 이 곧 이것이다)
 * 자취: painted(칠한 층) · total(칠하기 동작 누적) · stack(합성에 얹힌 차례) · covered(일부 가려진 요소)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { PaintOpName, SheetCover, SheetLayer, SheetOp } from './algorithm.js';

export type SheetsStep =
  | { kind: 'start' }
  | { kind: 'paint'; layer: string; ops: number }
  | { kind: 'compose'; layer: string; covered: string[] };

export type StackOfSheetsScene = {
  layers: SheetLayer[];
  covers: SheetCover[];
  painted: string[];
  total: number;
  stack: string[];
  covered: string[];
  step: SheetsStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

function readOp(v: unknown): SheetOp | null {
  if (!isRecord(v)) return null;
  const { el, op } = v;
  if (typeof el !== 'string') return null;
  if (op !== 'fillRect' && op !== 'drawText') return null;
  const name: PaintOpName = op;
  return { el, op: name };
}

function readLayers(v: unknown): SheetLayer[] {
  if (!Array.isArray(v)) return [];
  const out: SheetLayer[] = [];
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    const { id, z, ops } = raw;
    if (typeof id !== 'string' || typeof z !== 'number' || !Array.isArray(ops)) continue;
    const list: SheetOp[] = [];
    for (const o of ops) {
      const op = readOp(o);
      if (op) list.push(op);
    }
    out.push({ id, z, ops: list });
  }
  return out;
}

function readCovers(v: unknown): SheetCover[] {
  if (!Array.isArray(v)) return [];
  const out: SheetCover[] = [];
  for (const raw of v) {
    if (!isRecord(raw) || typeof raw.top !== 'string') continue;
    out.push({ top: raw.top, under: strings(raw.under) });
  }
  return out;
}

export const stackOfSheetsScene: ScenePlan<StackOfSheetsScene> = {
  initial(initialData: unknown): StackOfSheetsScene {
    const d = isRecord(initialData) ? initialData : {};
    return {
      layers: readLayers(d.layers),
      covers: readCovers(d.covers),
      painted: [],
      total: 0,
      stack: [],
      covered: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: StackOfSheetsScene, event: FacetRuntimeEvent): StackOfSheetsScene {
    const p = isRecord(event.payload) ? event.payload : {};
    if (event.type === 'paint') {
      const { layer, ops, total } = p;
      if (typeof layer !== 'string' || typeof ops !== 'number' || typeof total !== 'number') return scene;
      return {
        ...scene,
        painted: [...scene.painted, layer],
        total,
        step: { kind: 'paint', layer, ops },
      };
    }
    if (event.type === 'compose') {
      const { layer } = p;
      if (typeof layer !== 'string') return scene;
      const covered = strings(p.covered);
      return {
        ...scene,
        stack: [...scene.stack, layer],
        covered: [...scene.covered, ...covered],
        step: { kind: 'compose', layer, covered },
      };
    }
    return scene;
  },
};
