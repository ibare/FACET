import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneBlockState = 'old' | 'new';
export type SceneRecord = { kind: 'begin' | 'block' | 'end'; tx: number; block: string | null };
export type SceneHome = { block: string; tx: number; state: SceneBlockState };
export type SceneVerdict = { tx: number; keep: boolean; blocks: string[] };

export type ReplayStep =
  | { kind: 'scan'; tx: number; keep: boolean; from: number; to: number }
  | { kind: 'replay'; block: string; rec: number; before: SceneBlockState; after: SceneBlockState }
  | { kind: 'clear' };

export type ReplayAfterCrashScene = {
  /** 바탕 — init 이 한 번 정한다. 비운 뒤에도 남긴다 (비우는 운동이 이 자리에서 출발한다) */
  journal: SceneRecord[];
  /** 자취 — 제자리의 지금 상태 */
  homes: SceneHome[];
  /** 자취 — 훑은 묶음의 판정 */
  verdicts: SceneVerdict[];
  /** 자취 — 다시 쓴 블록, 쓴 차례로 */
  rewritten: string[];
  /** 자취 — 저널을 비웠는가 */
  cleared: boolean;
  step: ReplayStep | null;
};

function obj(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error('payload 가 객체가 아니다');
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`payload.${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`payload.${k} 가 글자가 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`payload.${k} 가 참거짓이 아니다`);
  return v;
}
function blockState(v: string): SceneBlockState {
  if (v === 'old' || v === 'new') return v;
  throw new Error(`모르는 블록 상태 ${v}`);
}
function recordKind(v: string): SceneRecord['kind'] {
  if (v === 'begin' || v === 'block' || v === 'end') return v;
  throw new Error(`모르는 저널 기록 ${v}`);
}
function list(o: Record<string, unknown>, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`payload.${k} 가 배열이 아니다`);
  return v;
}

export const replayAfterCrashScene: ScenePlan<ReplayAfterCrashScene> = {
  initial(): ReplayAfterCrashScene {
    return { journal: [], homes: [], verdicts: [], rewritten: [], cleared: false, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent): ReplayAfterCrashScene {
    switch (event.type) {
      case 'init': {
        const p = obj(event.payload);
        const journal = list(p, 'journal').map((x) => {
          const r = obj(x);
          const b = r.block;
          if (b !== null && typeof b !== 'string') throw new Error('저널 기록의 block 이 글자가 아니다');
          return { kind: recordKind(str(r, 'kind')), tx: num(r, 'tx'), block: b };
        });
        const homes = list(p, 'homes').map((x) => {
          const h = obj(x);
          return { block: str(h, 'block'), tx: num(h, 'tx'), state: blockState(str(h, 'state')) };
        });
        return { journal, homes, verdicts: [], rewritten: [], cleared: false, step: null };
      }
      case 'scan': {
        const p = obj(event.payload);
        const tx = num(p, 'tx');
        const keep = bool(p, 'keep');
        const blocks = list(p, 'blocks').map((b) => {
          if (typeof b !== 'string') throw new Error('payload.blocks 에 글자가 아닌 것');
          return b;
        });
        return {
          ...scene,
          verdicts: [...scene.verdicts, { tx, keep, blocks }],
          step: { kind: 'scan', tx, keep, from: num(p, 'from'), to: num(p, 'to') },
        };
      }
      case 'replay': {
        const p = obj(event.payload);
        const block = str(p, 'block');
        const before = blockState(str(p, 'before'));
        const after = blockState(str(p, 'after'));
        if (!scene.homes.some((h) => h.block === block)) throw new Error(`없는 제자리 블록 ${block}`);
        return {
          ...scene,
          homes: scene.homes.map((h) => (h.block === block ? { ...h, state: after } : h)),
          rewritten: [...scene.rewritten, block],
          step: { kind: 'replay', block, rec: num(p, 'rec'), before, after },
        };
      }
      case 'clear':
        return { ...scene, cleared: true, step: { kind: 'clear' } };
      default:
        return scene;
    }
  },
};
