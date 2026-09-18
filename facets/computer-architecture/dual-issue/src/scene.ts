/**
 * 한 박자에 둘 — 장면.
 *
 * 바탕   instrs            init 이 한 번 정한다
 * 자취   queue · placed · gate · beats · done
 * 이번   step              stage 가 무엇을 흘릴지 고르는 데 쓴다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type DualIssueSceneInstr = { op: string; dest: string; srcs: string[] };

/** 문 앞 두 자리의 견줌. next 가 null 이면 둘째 자리가 비었다 */
export type DualIssueGate = { head: number; next: number | null; hits: number[] };

/** 들어간 명령어 — beat 번째 박자의 seat 번째 자리 (0 · 1) */
export type DualIssuePlaced = { id: number; beat: number; seat: number };

export type DualIssueStep =
  | { kind: 'init' }
  | { kind: 'pair' }
  /** shift — 줄에 남은 것이 몇 칸 앞으로 당겨졌는가 */
  | { kind: 'issue'; beat: number; ids: number[]; shift: number }
  | { kind: 'done' };

export type DualIssueScene = {
  instrs: DualIssueSceneInstr[];
  /** 아직 안 낸 것, 줄 선 순서대로 */
  queue: number[];
  placed: DualIssuePlaced[];
  gate: DualIssueGate | null;
  beats: number;
  done: { beats: number; serial: number } | null;
  step: DualIssueStep | null;
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function readInstrs(v: unknown): DualIssueSceneInstr[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      op: typeof o.op === 'string' ? o.op : '',
      dest: typeof o.dest === 'string' ? o.dest : '',
      srcs: Array.isArray(o.srcs) ? o.srcs.filter((s): s is string => typeof s === 'string') : [],
    };
  });
}

export const dualIssueScene: ScenePlan<DualIssueScene> = {
  initial(): DualIssueScene {
    return { instrs: [], queue: [], placed: [], gate: null, beats: 0, done: null, step: null };
  },

  reduce(scene: DualIssueScene, event: FacetRuntimeEvent): DualIssueScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        const instrs = readInstrs(p.instrs);
        return {
          instrs,
          queue: instrs.map((_, i) => i),
          placed: [],
          gate: null,
          beats: 0,
          done: null,
          step: { kind: 'init' },
        };
      }
      case 'pair': {
        const next = typeof p.next === 'number' ? p.next : null;
        return {
          ...scene,
          gate: { head: num(p.head), next, hits: nums(p.hits) },
          step: { kind: 'pair' },
        };
      }
      case 'issue': {
        const beat = num(p.beat);
        const ids = nums(p.ids);
        const placed = [
          ...scene.placed.map((x) => ({ ...x })),
          ...ids.map((id, seat) => ({ id, beat, seat })),
        ];
        return {
          ...scene,
          queue: scene.queue.filter((q) => !ids.includes(q)),
          placed,
          gate: null,
          beats: beat,
          step: { kind: 'issue', beat, ids: [...ids], shift: ids.length },
        };
      }
      case 'done':
        return {
          ...scene,
          done: { beats: num(p.beats), serial: num(p.serial) },
          step: { kind: 'done' },
        };
      default:
        return scene;
    }
  },
};
