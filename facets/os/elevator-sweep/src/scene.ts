/**
 * elevator-sweep 의 장면.
 *
 * - 바탕: 실린더 수 · 줄의 칸 수(처음 줄 + 새로 올 요청)
 * - 자취: 지금까지 온 요청(온 차례) · 받은 차례 · 팔의 자리 · 방향 · 돌아선 횟수
 * - 이번 걸음: `step`
 *
 * 걸음 0 은 `initialData` 에서 세운다. 앞/뒤 판정 · 다음 요청 고르기는 알고리즘이 하고
 * 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ElevatorRequest = { id: number; cyl: number };

export type ElevatorStep =
  | { kind: 'start' }
  | { kind: 'serve'; id: number; cyl: number; from: number; order: number }
  | { kind: 'arrive'; items: { id: number; ahead: boolean }[] }
  | { kind: 'turn'; at: number; was: 1 | -1 };

export type ElevatorSweepScene = {
  cylinders: number;
  slots: number;
  arrived: ElevatorRequest[];
  /** 받은 요청의 id, 받은 차례대로 */
  served: number[];
  arm: number;
  dir: 1 | -1;
  turns: number;
  step: ElevatorStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`elevatorSweepScene: ${what} 가 수가 아니다`);
  return v;
}

function direction(v: unknown, what: string): 1 | -1 {
  if (v === 1 || v === -1) return v;
  throw new Error(`elevatorSweepScene: ${what} 는 1 또는 -1 이어야 한다`);
}

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`elevatorSweepScene: ${what} 가 배열이 아니다`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`elevatorSweepScene: ${event.type} 에 payload 가 없다`);
  return event.payload;
}

export const elevatorSweepScene: ScenePlan<ElevatorSweepScene> = {
  initial(initialData: unknown): ElevatorSweepScene {
    if (!isRecord(initialData)) throw new Error('elevatorSweepScene: initialData 가 없다');
    const queue = numList(initialData.queue, 'queue');
    const arrivals = initialData.arrivals;
    if (!Array.isArray(arrivals)) throw new Error('elevatorSweepScene: arrivals 가 배열이 아니다');
    let later = 0;
    for (const a of arrivals) {
      if (!isRecord(a)) throw new Error('elevatorSweepScene: arrivals 의 항목이 객체가 아니다');
      later += numList(a.requests, 'arrivals.requests').length;
    }
    return {
      cylinders: num(initialData.cylinders, 'cylinders'),
      slots: queue.length + later,
      arrived: queue.map((cyl, id) => ({ id, cyl })),
      served: [],
      arm: num(initialData.start, 'start'),
      dir: direction(initialData.direction, 'direction'),
      turns: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ElevatorSweepScene, event: FacetRuntimeEvent): ElevatorSweepScene {
    switch (event.type) {
      case 'serve': {
        const p = payloadOf(event);
        const id = num(p.id, 'serve.id');
        const cyl = num(p.cyl, 'serve.cyl');
        return {
          ...scene,
          served: [...scene.served, id],
          arm: cyl,
          step: { kind: 'serve', id, cyl, from: num(p.from, 'serve.from'), order: num(p.order, 'serve.order') },
        };
      }
      case 'arrive': {
        const p = payloadOf(event);
        if (!Array.isArray(p.requests)) throw new Error('elevatorSweepScene: arrive.requests 가 배열이 아니다');
        const reqs = p.requests.map((r: unknown) => {
          if (!isRecord(r) || typeof r.ahead !== 'boolean') {
            throw new Error('elevatorSweepScene: arrive 의 요청 모양이 틀렸다');
          }
          return { id: num(r.id, 'arrive.id'), cyl: num(r.cyl, 'arrive.cyl'), ahead: r.ahead };
        });
        return {
          ...scene,
          arrived: [...scene.arrived, ...reqs.map((r) => ({ id: r.id, cyl: r.cyl }))],
          step: { kind: 'arrive', items: reqs.map((r) => ({ id: r.id, ahead: r.ahead })) },
        };
      }
      case 'turn': {
        const p = payloadOf(event);
        return {
          ...scene,
          dir: direction(p.dir, 'turn.dir'),
          turns: scene.turns + 1,
          step: { kind: 'turn', at: num(p.at, 'turn.at'), was: scene.dir },
        };
      }
      default:
        return scene;
    }
  },
};
