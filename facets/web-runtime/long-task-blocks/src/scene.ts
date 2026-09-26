/**
 * long-task-blocks 장면 — 태스크 줄이 길어지고 다시 줄어드는 자취만 쥔다.
 *
 * 좌표 · 문안 · DOM 은 없다. 이번 걸음은 종류와 인자만 담는다 (`step`).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { LongTaskBlocksFacetData } from './algorithm.js';

export type LongTaskBlocksClick = {
  /** 클릭 식별자 (`click1` 등). 사람이 읽는 이름이 아니다. */
  id: string;
  /** 도착 순서 (1부터). 표시 이름 `label.click` 이 이 수를 쓴다. */
  no: number;
  arrivalMs: number;
};

export type LongTaskBlocksProcessed = {
  id: string;
  waitMs: number;
};

export type LongTaskBlocksStep =
  | { kind: 'init' }
  | { kind: 'longStart'; durationMs: number }
  | { kind: 'arrive'; id: string }
  | { kind: 'longEnd' }
  | { kind: 'process'; id: string; waitMs: number };

export type LongTaskBlocksScene = {
  /** initialData 에서 한 번 정해지고 다시 바뀌지 않는다. */
  base: {
    longId: string;
    longDurationMs: number;
    /** 도착 순서로 정렬. `no` 가 도착 순서다. */
    clicks: LongTaskBlocksClick[];
  };
  /** 걸음이 쌓아 온 자취. */
  trace: {
    longRunning: boolean;
    /** 아직 처리되지 않은 클릭 id — 도착 순서(태스크 줄 순서). */
    queueIds: string[];
    /** 처리된 클릭 — 처리된 순서. */
    processed: LongTaskBlocksProcessed[];
  };
  /** 이번 걸음이 무엇이었는지. */
  step: LongTaskBlocksStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readInitialData(initialData: unknown): LongTaskBlocksFacetData {
  if (!isRecord(initialData)) {
    throw new Error('long-task-blocks: initialData 가 없다');
  }
  const { long, clicks, handlerMs, stepMs } = initialData;
  if (!isRecord(long) || typeof long.id !== 'string' || typeof long.durationMs !== 'number') {
    throw new Error('long-task-blocks: initialData.long 모양이 다르다');
  }
  if (!Array.isArray(clicks)) {
    throw new Error('long-task-blocks: initialData.clicks 가 배열이 아니다');
  }
  const parsedClicks: { id: string; arrivalMs: number }[] = [];
  for (const c of clicks) {
    if (!isRecord(c) || typeof c.id !== 'string' || typeof c.arrivalMs !== 'number') {
      throw new Error('long-task-blocks: initialData.clicks 원소 모양이 다르다');
    }
    parsedClicks.push({ id: c.id, arrivalMs: c.arrivalMs });
  }
  if (typeof handlerMs !== 'number') throw new Error('long-task-blocks: initialData.handlerMs 가 없다');
  if (typeof stepMs !== 'number') throw new Error('long-task-blocks: initialData.stepMs 가 없다');
  return {
    type: 'long-task-blocks',
    stepMs,
    long: { id: long.id, durationMs: long.durationMs },
    clicks: parsedClicks,
    handlerMs,
  };
}

export const longTaskBlocksScene: ScenePlan<LongTaskBlocksScene> = {
  initial(initialData: unknown): LongTaskBlocksScene {
    const data = readInitialData(initialData);
    const clicks: LongTaskBlocksClick[] = [...data.clicks]
      .sort((a, b) => a.arrivalMs - b.arrivalMs)
      .map((c, i) => ({ id: c.id, no: i + 1, arrivalMs: c.arrivalMs }));
    return {
      base: { longId: data.long.id, longDurationMs: data.long.durationMs, clicks },
      trace: { longRunning: false, queueIds: [], processed: [] },
      step: { kind: 'init' },
    };
  },

  reduce(scene: LongTaskBlocksScene, event: FacetRuntimeEvent): LongTaskBlocksScene {
    const { payload } = event;
    switch (event.type) {
      case 'longStart': {
        if (!isRecord(payload) || typeof payload.durationMs !== 'number') {
          throw new Error('long-task-blocks: longStart payload 모양이 다르다');
        }
        return {
          ...scene,
          trace: { ...scene.trace, longRunning: true },
          step: { kind: 'longStart', durationMs: payload.durationMs },
        };
      }
      case 'arrive': {
        if (!isRecord(payload) || typeof payload.id !== 'string') {
          throw new Error('long-task-blocks: arrive payload 모양이 다르다');
        }
        return {
          ...scene,
          trace: { ...scene.trace, queueIds: [...scene.trace.queueIds, payload.id] },
          step: { kind: 'arrive', id: payload.id },
        };
      }
      case 'longEnd': {
        return {
          ...scene,
          trace: { ...scene.trace, longRunning: false },
          step: { kind: 'longEnd' },
        };
      }
      case 'process': {
        if (!isRecord(payload) || typeof payload.id !== 'string' || typeof payload.waitMs !== 'number') {
          throw new Error('long-task-blocks: process payload 모양이 다르다');
        }
        const queueIds = scene.trace.queueIds.filter((id) => id !== payload.id);
        const processed = [...scene.trace.processed, { id: payload.id, waitMs: payload.waitMs }];
        return {
          ...scene,
          trace: { ...scene.trace, queueIds, processed },
          step: { kind: 'process', id: payload.id, waitMs: payload.waitMs },
        };
      }
      default:
        throw new Error(`long-task-blocks: 모르는 이벤트 ${event.type}`);
    }
  },
};
