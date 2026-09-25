/**
 * encapsulation-boundary 장면.
 *
 * 바탕(프로그램 글자)은 stage 가 initialData 에서 읽는다 — 장면에는 없다.
 * 자취는 판정을 마친 자리들, 이번 걸음은 방금 판정한 줄 또는 판정 걸음이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Mode, Reach, Vis } from './algorithm.js';

export type CheckedLine = {
  line: number;
  inside: boolean;
  cls: string | null;
  reaches: Reach[];
};

export type EncapsulationBoundaryStep =
  | { kind: 'check'; line: number }
  | { kind: 'verdict'; reached: number; refused: number };

export type EncapsulationBoundaryScene = {
  /** 자취 — 판정을 마친 줄들, 글자 차례 */
  checked: CheckedLine[];
  /** 판정 걸음에 이르렀으면 그 셈 */
  verdict: { reached: number; refused: number } | null;
  /** 이번 걸음 */
  step: EncapsulationBoundaryStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readMode(v: unknown): Mode | null {
  return v === 'r' || v === 'w' || v === 'call' ? v : null;
}

function readVis(v: unknown): Vis | null {
  return v === 'public' || v === 'private' ? v : null;
}

function readReach(v: unknown): Reach | null {
  if (!isRecord(v)) return null;
  const mode = readMode(v.mode);
  const vis = readVis(v.vis);
  if (
    typeof v.member !== 'string' ||
    mode === null ||
    vis === null ||
    typeof v.ok !== 'boolean' ||
    typeof v.col !== 'number' ||
    typeof v.len !== 'number' ||
    typeof v.decl !== 'number'
  ) {
    return null;
  }
  return { member: v.member, mode, vis, ok: v.ok, col: v.col, len: v.len, decl: v.decl };
}

function readChecked(v: unknown): CheckedLine | null {
  if (!isRecord(v)) return null;
  if (typeof v.line !== 'number' || typeof v.inside !== 'boolean' || !Array.isArray(v.reaches)) return null;
  const cls = typeof v.cls === 'string' ? v.cls : null;
  const reaches: Reach[] = [];
  for (const r of v.reaches) {
    const reach = readReach(r);
    if (reach) reaches.push(reach);
  }
  return { line: v.line, inside: v.inside, cls, reaches };
}

export const encapsulationBoundaryScene: ScenePlan<EncapsulationBoundaryScene> = {
  initial(): EncapsulationBoundaryScene {
    return { checked: [], verdict: null, step: null };
  },
  reduce(scene, event: FacetRuntimeEvent): EncapsulationBoundaryScene {
    if (event.type === 'check') {
      const c = readChecked(event.payload);
      if (!c) return scene;
      return { checked: [...scene.checked, c], verdict: scene.verdict, step: { kind: 'check', line: c.line } };
    }
    if (event.type === 'verdict') {
      const p = event.payload;
      if (!isRecord(p) || typeof p.reached !== 'number' || typeof p.refused !== 'number') return scene;
      const v = { reached: p.reached, refused: p.refused };
      return { checked: scene.checked, verdict: v, step: { kind: 'verdict', ...v } };
    }
    return scene;
  },
};
