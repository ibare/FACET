/**
 * eventually-agrees 장면 — 이벤트를 잇기만 한다. 셈(이긴 쪽 · 서로 다른 값 · 든 사본 수)은 알고리즘이 싣는다.
 *
 * 바탕: key · 사본 차례 · 판(도장) 목록 — initialData 에서.
 * 자취: 사본마다 지금 든 (값, 도장) · 서로 다른 값 목록.
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowEventuallyAgrees, versionStamps, type Version } from './algorithm.js';

export type Held = { value: number; stamp: number };

export type EventuallyAgreesStep =
  | { kind: 'write'; at: string; value: number; stamp: number; was: Held; last: boolean }
  | {
      kind: 'gossip';
      a: string;
      b: string;
      winner: string;
      loser: string;
      value: number;
      stamp: number;
      loserWas: Held;
      settling: boolean;
      holders: number;
    };

export type EventuallyAgreesScene = {
  key: string;
  order: string[];
  stamps: number[];
  /** 데이터에 나오는 주고받기 짝 — 바탕의 선 */
  pairs: [string, string][];
  held: Record<string, Held>;
  distinct: Version[] | null;
  step: EventuallyAgreesStep | null;
};

function rec(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`eventually-agrees scene: ${path} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function num(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`eventually-agrees scene: ${path} 가 수가 아니다`);
  return x;
}

function str(x: unknown, path: string): string {
  if (typeof x !== 'string') throw new Error(`eventually-agrees scene: ${path} 가 문자열이 아니다`);
  return x;
}

function bool(x: unknown, path: string): boolean {
  if (typeof x !== 'boolean') throw new Error(`eventually-agrees scene: ${path} 가 참거짓이 아니다`);
  return x;
}

function heldOf(x: unknown, path: string): Held {
  const r = rec(x, path);
  return { value: num(r.value, `${path}.value`), stamp: num(r.stamp, `${path}.stamp`) };
}

function distinctOf(x: unknown, path: string, stamps: number[]): Version[] {
  if (!Array.isArray(x)) throw new Error(`eventually-agrees scene: ${path} 가 배열이 아니다`);
  return x.map((v: unknown, i: number) => {
    const r = rec(v, `${path}[${i}]`);
    const stamp = num(r.stamp, `${path}[${i}].stamp`);
    if (!stamps.includes(stamp)) throw new Error(`eventually-agrees scene: ${path}[${i}].stamp 판이 바탕에 없다 (${stamp})`);
    return { value: num(r.value, `${path}[${i}].value`), stamp, holders: num(r.holders, `${path}[${i}].holders`) };
  });
}

function mustHold(scene: EventuallyAgreesScene, id: string, path: string): Held {
  const h = scene.held[id];
  if (!h) throw new Error(`eventually-agrees scene: ${path} 사본이 바탕에 없다 (${id})`);
  return h;
}

export const eventuallyAgreesScene: ScenePlan<EventuallyAgreesScene> = {
  initial(initialData: unknown): EventuallyAgreesScene {
    const data = narrowEventuallyAgrees(initialData);
    const held: Record<string, Held> = {};
    for (const r of data.replicas) held[r.id] = { value: r.value, stamp: r.stamp };
    const pairs: [string, string][] = [];
    for (const h of data.happenings) {
      if (h.kind !== 'gossip') continue;
      if (pairs.some(([x, y]) => (x === h.a && y === h.b) || (x === h.b && y === h.a))) continue;
      pairs.push([h.a, h.b]);
    }
    return {
      key: data.key,
      order: data.replicas.map((r) => r.id),
      stamps: versionStamps(data),
      pairs,
      held,
      distinct: null,
      step: null,
    };
  },

  reduce(scene: EventuallyAgreesScene, event: FacetRuntimeEvent): EventuallyAgreesScene {
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init':
        return { ...scene, held: { ...scene.held }, distinct: distinctOf(p.distinct, 'init.payload.distinct', scene.stamps), step: null };
      case 'write': {
        const at = str(p.at, 'write.payload.at');
        const now = mustHold(scene, at, 'write.payload.at');
        const was = heldOf(p.was, 'write.payload.was');
        if (was.value !== now.value || was.stamp !== now.stamp) {
          throw new Error(`eventually-agrees scene: write.payload.was 가 ${at} 의 지금 값과 다르다`);
        }
        const value = num(p.value, 'write.payload.value');
        const stamp = num(p.stamp, 'write.payload.stamp');
        return {
          ...scene,
          held: { ...scene.held, [at]: { value, stamp } },
          distinct: distinctOf(p.distinct, 'write.payload.distinct', scene.stamps),
          step: { kind: 'write', at, value, stamp, was, last: bool(p.last, 'write.payload.last') },
        };
      }
      case 'gossip': {
        const a = str(p.a, 'gossip.payload.a');
        const b = str(p.b, 'gossip.payload.b');
        const winner = str(p.winner, 'gossip.payload.winner');
        const loser = str(p.loser, 'gossip.payload.loser');
        if (!((winner === a && loser === b) || (winner === b && loser === a))) {
          throw new Error('eventually-agrees scene: gossip.payload.winner · loser 가 a · b 짝이 아니다');
        }
        const win = mustHold(scene, winner, 'gossip.payload.winner');
        const lose = mustHold(scene, loser, 'gossip.payload.loser');
        const value = num(p.value, 'gossip.payload.value');
        const stamp = num(p.stamp, 'gossip.payload.stamp');
        if (win.value !== value || win.stamp !== stamp) throw new Error(`eventually-agrees scene: gossip.payload.value 가 ${winner} 의 지금 값과 다르다`);
        const loserWas = heldOf(p.loserWas, 'gossip.payload.loserWas');
        if (loserWas.value !== lose.value || loserWas.stamp !== lose.stamp) {
          throw new Error(`eventually-agrees scene: gossip.payload.loserWas 가 ${loser} 의 지금 값과 다르다`);
        }
        return {
          ...scene,
          held: { ...scene.held, [loser]: { value, stamp } },
          distinct: distinctOf(p.distinct, 'gossip.payload.distinct', scene.stamps),
          step: {
            kind: 'gossip',
            a,
            b,
            winner,
            loser,
            value,
            stamp,
            loserWas,
            settling: bool(p.settling, 'gossip.payload.settling'),
            holders: num(p.holders, 'gossip.payload.holders'),
          },
        };
      }
      default:
        throw new Error(`eventually-agrees scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
