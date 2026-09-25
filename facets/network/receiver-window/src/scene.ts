/**
 * receiver-window 의 장면 — 이벤트를 잇기만 한다. 창 · 버퍼 사용량은 알고리즘이 셈해 싣는다.
 *
 * 바탕: 버퍼 칸 수 · 조각 수 · 크기 (initialData 에서 베낀다)
 * 자취: 보내는 쪽이 아는 창 · 버퍼에 든 조각(오래된 것 먼저) · 앱이 읽은 합 · 다음에 보낼 조각
 * 이번 걸음: step — 운동이 출발할 자리를 계기값(`before`)으로 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ReceiverWindowBase = {
  bufferBytes: number;
  segmentBytes: number;
  totalBytes: number;
  /** 버퍼 칸 수 = 버퍼 크기 / 조각 크기 */
  slots: number;
  /** 보낼 조각 수 = 전체 / 조각 크기 */
  segments: number;
};

export type ReceiverWindowStep =
  | { kind: 'send'; round: number; window: number; first: number; count: number; firstByte: number; lastByte: number }
  | { kind: 'stall'; round: number; window: number; seg: number }
  | { kind: 'read'; round: number; read: number; window: number; taken: number[]; before: number[] };

export type ReceiverWindowScene = {
  base: ReceiverWindowBase;
  /** 보내는 쪽이 마지막으로 받은 창 (바이트) */
  window: number;
  /** 받은 창을 아직 쓰지 않았다 — 보내는 쪽에 창의 테가 서 있다 */
  windowFresh: boolean;
  /** 다음에 보낼 조각 순번 */
  nextSeg: number;
  /** 버퍼에 든 조각 순번 — 오래된 것 먼저 */
  buffer: number[];
  /** 버퍼에 든 바이트 */
  used: number;
  /** 앱이 지금까지 읽은 바이트 */
  readTotal: number;
  done: boolean;
  step: ReceiverWindowStep | null;
};

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`receiver-window 장면: ${key} 가 수가 아니다`);
  }
  return v;
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`receiver-window 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const receiverWindowScene: ScenePlan<ReceiverWindowScene> = {
  initial(initialData: unknown): ReceiverWindowScene {
    const d = record(initialData, 'initialData');
    const bufferBytes = num(d, 'bufferBytes');
    const segmentBytes = num(d, 'segmentBytes');
    const totalBytes = num(d, 'totalBytes');
    const initialWindow = num(d, 'initialWindow');
    if (!(segmentBytes > 0)) throw new Error('receiver-window 장면: 조각 크기는 0 보다 커야 한다');
    return {
      base: {
        bufferBytes,
        segmentBytes,
        totalBytes,
        slots: Math.floor(bufferBytes / segmentBytes),
        segments: Math.floor(totalBytes / segmentBytes),
      },
      window: initialWindow,
      windowFresh: true,
      nextSeg: 0,
      buffer: [],
      used: 0,
      readTotal: 0,
      done: false,
      step: null,
    };
  },

  reduce(scene: ReceiverWindowScene, event: FacetRuntimeEvent): ReceiverWindowScene {
    if (event.type === 'send') {
      const p = record(event.payload, 'send payload');
      const first = num(p, 'first');
      const count = num(p, 'count');
      const added: number[] = [];
      for (let i = 0; i < count; i += 1) added.push(first + i);
      return {
        ...scene,
        window: num(p, 'window'),
        windowFresh: false,
        nextSeg: first + count,
        buffer: [...scene.buffer, ...added],
        used: num(p, 'used'),
        done: p['done'] === true,
        step: {
          kind: 'send',
          round: num(p, 'round'),
          window: num(p, 'window'),
          first,
          count,
          firstByte: num(p, 'firstByte'),
          lastByte: num(p, 'lastByte'),
        },
      };
    }
    if (event.type === 'stall') {
      const p = record(event.payload, 'stall payload');
      return {
        ...scene,
        window: num(p, 'window'),
        windowFresh: false,
        used: num(p, 'used'),
        buffer: [...scene.buffer],
        step: { kind: 'stall', round: num(p, 'round'), window: num(p, 'window'), seg: scene.nextSeg },
      };
    }
    if (event.type === 'read') {
      const p = record(event.payload, 'read payload');
      const segments = num(p, 'segments');
      if (segments > scene.buffer.length) {
        throw new Error('receiver-window 장면: 버퍼에 든 것보다 많이 읽는다');
      }
      const read = num(p, 'read');
      const window = num(p, 'window');
      return {
        ...scene,
        window,
        windowFresh: true,
        buffer: scene.buffer.slice(segments),
        used: num(p, 'used'),
        readTotal: scene.readTotal + read,
        step: {
          kind: 'read',
          round: num(p, 'round'),
          read,
          window,
          taken: scene.buffer.slice(0, segments),
          before: [...scene.buffer],
        },
      };
    }
    return scene;
  },
};
