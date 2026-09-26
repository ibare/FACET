import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { BranchId } from './algorithm.js';

/** 그어진 길 하나 — 실행이 from 줄에서 to 줄로 건너갔다 */
export type Walked = { from: number; to: number };

export type Taken = { line: number; branch: BranchId };

export type Missing = { line: number; branch: BranchId; to: number };

export type LinesCoveredBranchNotStep =
  | { kind: 'start' }
  | { kind: 'line'; line: number; from: number; branch: BranchId | null }
  | {
      kind: 'end';
      lines: number;
      linesOf: number;
      linesPct: number;
      branches: number;
      branchesOf: number;
      branchesPct: number;
      returned: string;
      missing: Missing[];
    };

export type LinesCoveredBranchNotScene = {
  // 바탕
  code: string[];
  test: string;
  // 자취
  stepped: number[];
  walked: Walked[];
  taken: Taken[];
  // 이번 걸음
  step: LinesCoveredBranchNotStep;
};

function isBranch(v: unknown): v is BranchId {
  return v === 'true' || v === 'false';
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const linesCoveredBranchNotScene: ScenePlan<LinesCoveredBranchNotScene> = {
  initial(initialData: unknown): LinesCoveredBranchNotScene {
    const d = record(initialData, 'initialData');
    const code = d.code;
    if (!Array.isArray(code) || !code.every((l): l is string => typeof l === 'string')) {
      throw new Error('initialData.code 가 글자 목록이 아니다');
    }
    if (typeof d.test !== 'string') throw new Error('initialData.test 가 글자가 아니다');
    return { code: [...code], test: d.test, stepped: [], walked: [], taken: [], step: { kind: 'start' } };
  },

  reduce(scene: LinesCoveredBranchNotScene, event: FacetRuntimeEvent): LinesCoveredBranchNotScene {
    if (event.type === 'line') {
      const p = record(event.payload, 'payload');
      const line = num(p, 'line');
      const from = num(p, 'from');
      const branch = p.branch === null ? null : isBranch(p.branch) ? p.branch : undefined;
      if (branch === undefined) throw new Error('payload.branch 가 갈래가 아니다');
      return {
        ...scene,
        stepped: scene.stepped.includes(line) ? [...scene.stepped] : [...scene.stepped, line],
        walked: [...scene.walked, { from, to: line }],
        taken: branch === null ? [...scene.taken] : [...scene.taken, { line, branch }],
        step: { kind: 'line', line, from, branch },
      };
    }
    if (event.type === 'end') {
      const p = record(event.payload, 'payload');
      const rawMissing = p.missing;
      if (!Array.isArray(rawMissing)) throw new Error('payload.missing 이 목록이 아니다');
      const missing: Missing[] = rawMissing.map((m: unknown) => {
        const r = record(m, 'payload.missing[]');
        if (!isBranch(r.branch)) throw new Error('payload.missing[].branch 가 갈래가 아니다');
        return { line: num(r, 'line'), branch: r.branch, to: num(r, 'to') };
      });
      if (typeof p.returned !== 'string') throw new Error('payload.returned 가 글자가 아니다');
      return {
        ...scene,
        stepped: [...scene.stepped],
        walked: [...scene.walked],
        taken: [...scene.taken],
        step: {
          kind: 'end',
          lines: num(p, 'lines'),
          linesOf: num(p, 'linesOf'),
          linesPct: num(p, 'linesPct'),
          branches: num(p, 'branches'),
          branchesOf: num(p, 'branchesOf'),
          branchesPct: num(p, 'branchesPct'),
          returned: p.returned,
          missing,
        },
      };
    }
    throw new Error(`모르는 이벤트 — ${event.type}`);
  },
};
