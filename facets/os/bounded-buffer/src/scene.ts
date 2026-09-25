/**
 * bounded-buffer 장면 — 이벤트를 잇기만 한다. 넣기 · 꺼내기 · 막힘의 셈은 알고리즘이 한다.
 *
 * 바탕: capacity · producer · consumer · turns (initialData 에서 베낀다)
 * 자취: buffer(앞부터) · hand(넣는 쪽 손의 번호) · taken(꺼낸 차례) · blocked(막힌 차례 자리)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type BoundedBufferStep =
  | { kind: 'start' }
  | { kind: 'put'; turn: number; item: number }
  | { kind: 'putBlocked'; turn: number; item: number }
  | { kind: 'take'; turn: number; item: number }
  | { kind: 'takeBlocked'; turn: number };

export type BoundedBufferScene = {
  capacity: number;
  producer: string;
  consumer: string;
  turns: readonly string[];
  buffer: readonly number[];
  hand: number;
  taken: readonly number[];
  /** 막힌 차례 자리 (0 부터) */
  blocked: readonly number[];
  step: BoundedBufferStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readInt(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`bounded-buffer 장면: ${where} 의 ${key} 가 정수가 아니다`);
  }
  return v;
}

function readString(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== 'string') {
    throw new Error(`bounded-buffer 장면: ${where} 의 ${key} 가 글자가 아니다`);
  }
  return v;
}

function readIntList(obj: Record<string, unknown>, key: string, where: string): number[] {
  const v = obj[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isInteger(x))) {
    throw new Error(`bounded-buffer 장면: ${where} 의 ${key} 가 정수 목록이 아니다`);
  }
  return v.map((x) => Number(x));
}

/** 알려진 이벤트의 payload 가 객체가 아니면 던진다 — 깨진 이벤트를 삼키지 않는다 */
function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!isRecord(p)) throw new Error(`bounded-buffer 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return p;
}

export const boundedBufferScene: ScenePlan<BoundedBufferScene> = {
  initial(initialData: unknown): BoundedBufferScene {
    if (!isRecord(initialData)) throw new Error('bounded-buffer 장면: initialData 가 없다');
    const turnsRaw = initialData['turns'];
    if (!Array.isArray(turnsRaw) || !turnsRaw.every((x) => typeof x === 'string')) {
      throw new Error('bounded-buffer 장면: turns 가 글자 목록이 아니다');
    }
    return {
      capacity: readInt(initialData, 'capacity', 'initialData'),
      producer: readString(initialData, 'producer', 'initialData'),
      consumer: readString(initialData, 'consumer', 'initialData'),
      turns: turnsRaw.map((x) => String(x)),
      buffer: [],
      hand: readInt(initialData, 'firstItem', 'initialData'),
      taken: [],
      blocked: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: BoundedBufferScene, event: FacetRuntimeEvent): BoundedBufferScene {
    switch (event.type) {
      case 'put': {
        const p = payloadOf(event);
        const turn = readInt(p, 'turn', 'put');
        const item = readInt(p, 'item', 'put');
        return {
          ...scene,
          buffer: readIntList(p, 'buffer', 'put'),
          hand: readInt(p, 'hand', 'put'),
          step: { kind: 'put', turn, item },
        };
      }
      case 'putBlocked': {
        const p = payloadOf(event);
        const turn = readInt(p, 'turn', 'putBlocked');
        const item = readInt(p, 'item', 'putBlocked');
        return {
          ...scene,
          buffer: readIntList(p, 'buffer', 'putBlocked'),
          blocked: [...scene.blocked, turn],
          step: { kind: 'putBlocked', turn, item },
        };
      }
      case 'take': {
        const p = payloadOf(event);
        const turn = readInt(p, 'turn', 'take');
        const item = readInt(p, 'item', 'take');
        return {
          ...scene,
          buffer: readIntList(p, 'buffer', 'take'),
          taken: [...scene.taken, item],
          step: { kind: 'take', turn, item },
        };
      }
      case 'takeBlocked': {
        const p = payloadOf(event);
        const turn = readInt(p, 'turn', 'takeBlocked');
        return {
          ...scene,
          buffer: readIntList(p, 'buffer', 'takeBlocked'),
          blocked: [...scene.blocked, turn],
          step: { kind: 'takeBlocked', turn },
        };
      }
      default:
        return scene;
    }
  },
};
