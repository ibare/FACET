/**
 * 준비된 것부터 — 장면.
 *
 * 바탕: 명령어 목록 (글자 · 지연 · 걸리는 원천). init 이 한 번 정한다.
 * 자취: 명령어마다 시작 · 끝 · 커밋 사이클과 지금 사이클. 걸음이 쌓는다.
 * 이번 걸음: 어느 사이클에 누가 시작하고 끝나고 커밋했는가.
 *
 * 명령어가 어디에 서 있는지(대기창 · 실행 중 · 줄 · 커밋됨)는 자취와 사이클에서
 * 파생된다. 장면에는 자리를 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ReadyFirstSceneInstr = {
  id: string;
  asm: string;
  lat: number;
  dep: { reg: string; from: number } | null;
};

export type ReadyFirstStep =
  | { kind: 'init' }
  | {
      kind: 'cycle';
      cycle: number;
      started: number[];
      finished: number[];
      committed: number[];
    };

export type ReadyFirstScene = {
  instrs: ReadyFirstSceneInstr[];
  start: (number | null)[];
  end: (number | null)[];
  commit: (number | null)[];
  /** 지금 사이클. 0 은 사이클 1 이 돌기 전 */
  cycle: number;
  step: ReadyFirstStep | null;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function readInstrs(v: unknown): ReadyFirstSceneInstr[] {
  if (!Array.isArray(v)) return [];
  const out: ReadyFirstSceneInstr[] = [];
  for (const raw of v) {
    if (!isObj(raw)) continue;
    const d = raw.dep;
    const dep =
      isObj(d) && typeof d.reg === 'string' && typeof d.from === 'number'
        ? { reg: d.reg, from: d.from }
        : null;
    out.push({
      id: String(raw.id ?? ''),
      asm: String(raw.asm ?? ''),
      lat: typeof raw.lat === 'number' ? raw.lat : 1,
      dep,
    });
  }
  return out;
}

export const readyFirstScene: ScenePlan<ReadyFirstScene> = {
  initial(): ReadyFirstScene {
    return { instrs: [], start: [], end: [], commit: [], cycle: 0, step: null };
  },

  reduce(scene: ReadyFirstScene, event: FacetRuntimeEvent): ReadyFirstScene {
    const p = isObj(event.payload) ? event.payload : {};
    if (event.type === 'init') {
      const instrs = readInstrs(p.instrs);
      return {
        instrs,
        start: instrs.map(() => null),
        end: instrs.map(() => null),
        commit: instrs.map(() => null),
        cycle: 0,
        step: { kind: 'init' },
      };
    }
    if (event.type === 'cycle') {
      const cycle = typeof p.cycle === 'number' ? p.cycle : scene.cycle + 1;
      const started = nums(p.started);
      const finished = nums(p.finished);
      const committed = nums(p.committed);
      const start = scene.start.slice();
      const end = scene.end.slice();
      const commit = scene.commit.slice();
      for (const i of started) start[i] = cycle;
      for (const i of finished) end[i] = cycle;
      for (const i of committed) commit[i] = cycle;
      return {
        instrs: scene.instrs,
        start,
        end,
        commit,
        cycle,
        step: { kind: 'cycle', cycle, started, finished, committed },
      };
    }
    return scene;
  },
};
