import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { CoalesceUpdatesFacetData } from './algorithm.js';

export type CoalesceUpdatesWriteName = 'left' | 'top';

/** 바탕(init 이 한 번 정함) + 자취(걸음이 쌓음) + 이번 걸음(step). */
export type CoalesceUpdatesStep =
  | {
      kind: 'write';
      name: CoalesceUpdatesWriteName;
      value: number;
      overwritten: boolean;
      previousValue: number | null;
      alreadyScheduled: boolean;
      lineIndex: number;
    }
  | {
      kind: 'flush';
      from: { left: number; top: number };
      to: { left: number; top: number };
    };

export interface CoalesceUpdatesScene {
  /** pseudo-notation 처리기 몸 넉 줄 (바탕, 자료). */
  code: string[];
  /** 실제로 그려진 화면의 상태 (그리기가 일어나야만 바뀐다). */
  screen: { left: number; top: number };
  /** 모아 두는 자리 — 아직 화면에 들어가지 않은 쓰기. */
  pending: { left: number | null; top: number | null };
  /** 그리기가 걸려 있는지 (0 또는 1). */
  scheduled: number;
  writeCount: number;
  renderCount: number;
  /** 자취 — 모아 두는 자리에 들어왔다가 한 번도 그려지지 못하고 덮인 값. */
  neverDrawn: Array<{ name: CoalesceUpdatesWriteName; value: number }>;
  step: CoalesceUpdatesStep | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const coalesceUpdatesScene: ScenePlan<CoalesceUpdatesScene> = {
  initial(initialData: unknown): CoalesceUpdatesScene {
    if (!isRecord(initialData)) throw new Error('coalesce-updates: initialData 없음');
    const data = initialData as unknown as CoalesceUpdatesFacetData;
    return {
      code: [...data.code],
      screen: { left: data.initial.left, top: data.initial.top },
      pending: { left: null, top: null },
      scheduled: 0,
      writeCount: 0,
      renderCount: 0,
      neverDrawn: [],
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent): CoalesceUpdatesScene {
    if (event.type === 'write') {
      const payload = event.payload;
      if (!isRecord(payload)) throw new Error('coalesce-updates: write payload 없음');
      const { name, value, overwritten, previousValue, alreadyScheduled } = payload;
      if (name !== 'left' && name !== 'top') {
        throw new Error(`coalesce-updates: 모르는 이름 ${String(name)}`);
      }
      if (typeof value !== 'number') throw new Error('coalesce-updates: value 없음');
      if (typeof overwritten !== 'boolean') {
        throw new Error('coalesce-updates: overwritten 없음');
      }
      if (previousValue !== null && typeof previousValue !== 'number') {
        throw new Error('coalesce-updates: previousValue 없음');
      }
      if (typeof alreadyScheduled !== 'boolean') {
        throw new Error('coalesce-updates: alreadyScheduled 없음');
      }
      const writeName: CoalesceUpdatesWriteName = name;
      const lineIndex = scene.writeCount + 1;
      const neverDrawn: Array<{ name: CoalesceUpdatesWriteName; value: number }> =
        overwritten && previousValue !== null
          ? [...scene.neverDrawn, { name: writeName, value: previousValue }]
          : scene.neverDrawn;
      return {
        ...scene,
        pending: { ...scene.pending, [name]: value },
        scheduled: 1,
        writeCount: scene.writeCount + 1,
        neverDrawn,
        step: { kind: 'write', name, value, overwritten, previousValue, alreadyScheduled, lineIndex },
      };
    }

    if (event.type === 'flush') {
      const from = { left: scene.screen.left, top: scene.screen.top };
      const to = {
        left: scene.pending.left ?? scene.screen.left,
        top: scene.pending.top ?? scene.screen.top,
      };
      return {
        ...scene,
        screen: to,
        pending: { left: null, top: null },
        scheduled: 0,
        renderCount: scene.renderCount + 1,
        step: { kind: 'flush', from, to },
      };
    }

    throw new Error(`coalesce-updates: 모르는 이벤트 ${event.type}`);
  },
};
