/**
 * LFU 캐시 projector — `init` 은 무대의 판 머리로, `request` 는 무대의 걸음으로, `phase` 는 코드 패널로.
 * payload 는 `typeof` 로 좁혀 읽고, 모자라면 무엇이 모자란지 담아 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { LfuCacheStage, LfuStageInit, LfuStageSlot, LfuStageStep } from './lfu-cache-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function obj(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`lfuCacheProjector: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function int(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`lfuCacheProjector: ${k} 가 정수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`lfuCacheProjector: ${k} 가 문자열이 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`lfuCacheProjector: ${k} 가 참거짓이 아니다`);
  return v;
}

export function readInit(payload: unknown): LfuStageInit & { motionMs: number } {
  const o = obj(payload, 'init payload');
  const reqs = o.requests;
  if (!Array.isArray(reqs) || !reqs.every((r) => typeof r === 'string')) {
    throw new Error('lfuCacheProjector: requests 가 문자열 목록이 아니다');
  }
  const countMax = int(o, 'countMax');
  if (countMax <= 0) throw new Error('lfuCacheProjector: countMax 가 0 이하다');
  return {
    window: int(o, 'window'),
    requests: reqs as string[],
    lateFrom: int(o, 'lateFrom'),
    capacity: int(o, 'capacity'),
    countMax,
    hotKey: str(o, 'hotKey'),
    motionMs: int(o, 'motionMs'),
  };
}

function readSlot(x: unknown): LfuStageSlot {
  const o = obj(x, 'slot');
  const key = o.key;
  if (key !== null && typeof key !== 'string') throw new Error('lfuCacheProjector: slot.key 가 문자열도 null 도 아니다');
  return { key, count: int(o, 'count'), last: int(o, 'last'), old: bool(o, 'old') };
}

export function readStep(payload: unknown): LfuStageStep {
  const o = obj(payload, 'request payload');
  const kind = o.kind;
  if (kind !== 'hit' && kind !== 'fill' && kind !== 'evict') {
    throw new Error(`lfuCacheProjector: 모르는 kind ${String(kind)}`);
  }
  const victim = o.victim;
  if (victim !== null && typeof victim !== 'string') throw new Error('lfuCacheProjector: victim 이 문자열도 null 도 아니다');
  const slots = o.slots;
  if (!Array.isArray(slots)) throw new Error('lfuCacheProjector: slots 가 목록이 아니다');
  return {
    step: int(o, 'step'),
    key: str(o, 'key'),
    kind,
    slot: int(o, 'slot'),
    victim,
    tie: bool(o, 'tie'),
    windowStart: int(o, 'windowStart'),
    hotOut: bool(o, 'hotOut'),
    slots: slots.map(readSlot),
  };
}

export const lfuCacheProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LfuCacheStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const need = (): LfuCacheStage => {
    if (stage === undefined) throw new Error('lfuCacheProjector: stage 블록이 없다');
    return stage;
  };

  return {
    onReset() {
      stage?.reset();
      code?.highlightPhase(null);
      motionMs = null;
    },
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const o = obj(event.payload, 'phase payload');
          code?.highlightPhase(str(o, 'phase'));
          return;
        }
        case 'init': {
          const d = readInit(event.payload);
          motionMs = d.motionMs;
          code?.highlightPhase(null);
          need().setup(d);
          return;
        }
        case 'request': {
          if (motionMs === null) throw new Error('lfuCacheProjector: init 전에 request 가 왔다');
          const speed = runtime?.getSpeed() ?? 1;
          need().step(readStep(event.payload), motionMs / (speed > 0 ? speed : 1));
          return;
        }
        default:
          throw new Error(`lfuCacheProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onDestroy() {
      motionMs = null;
    },
  };
};
