/**
 * sequence-number 의 장면.
 *
 * 바탕  ranges — 조각마다 바이트 범위 (initial 이 알고리즘과 같은 segmentRanges 로 세운다)
 * 자취  arrived · acks — 닿은 조각과 그때 돌려보낸 확인 번호 (걸음마다 하나씩 쌓인다)
 *       ack · held — 지금 확인 번호와 빈자리 뒤에 쥐고 있는 조각
 * 이번  step — 이번에 닿은 조각, 닿기 전 확인 번호, 닿기 전에 쥐고 있던 조각(계기값)
 *
 * 확인 번호는 장면이 셈하지 않는다 — arrive 이벤트가 실어 온 값을 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { segmentRanges, type SegmentRange } from './algorithm.js';

export type SequenceNumberStep = {
  seg: number;
  before: number;
  /** 닿기 전에 쥐고 있던 조각. 확인 번호가 넘어갈 때 무엇을 넘었는지 그리는 계기값 */
  wasHeld: number[];
};

export type SequenceNumberScene = {
  ranges: SegmentRange[];
  arrived: number[];
  acks: number[];
  ack: number;
  held: number[];
  step: SequenceNumberStep | null;
};

function readNumbers(v: unknown, field: string): number[] {
  if (!Array.isArray(v)) throw new Error(`sequence-number 장면: ${field} 가 배열이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'number') throw new Error(`sequence-number 장면: ${field} 에 수가 아닌 값`);
    return x;
  });
}

export const sequenceNumberScene: ScenePlan<SequenceNumberScene> = {
  initial(initialData: unknown): SequenceNumberScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const ranges = segmentRanges(d['firstByte'], d['lengths']);
    return {
      ranges,
      arrived: [],
      acks: [],
      ack: ranges[0]!.from,
      held: [],
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent): SequenceNumberScene {
    if (event.type !== 'arrive') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('sequence-number 장면: arrive 에 payload 가 없다');
    }
    const rec = p as Record<string, unknown>;
    const seg = rec['seg'];
    const before = rec['before'];
    const ack = rec['ack'];
    if (typeof seg !== 'number' || typeof before !== 'number' || typeof ack !== 'number') {
      throw new Error('sequence-number 장면: arrive 의 seg · before · ack 가 수가 아니다');
    }
    const held = readNumbers(rec['held'], 'held');
    return {
      ranges: scene.ranges.map((r) => ({ ...r })),
      arrived: [...scene.arrived, seg],
      acks: [...scene.acks, ack],
      ack,
      held,
      step: { seg, before, wasHeld: [...scene.held] },
    };
  },
};
