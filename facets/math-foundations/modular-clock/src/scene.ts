/**
 * modular-clock 장면.
 *
 * 바탕 — 법 · 더하는 수 · 더하는 횟수 (initialData 에서 베낀다), 감을 바퀴 끝 laps (init 이 정한다)
 * 자취 — 지나온 수마다 { n, q, r, crossed }. 첫 칸은 처음 수
 * 이번 걸음 — 처음인가, 더한 걸음인가 (더하기 전 수와 자리를 계기값으로 싣는다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowModularClockData } from './algorithm';

export type ModularClockMark = {
  n: number;
  q: number;
  r: number;
  /** 이 수에 오면서 자리가 0 을 지났는가. 처음 수는 거짓 */
  crossed: boolean;
};

export type ModularClockStep =
  | { kind: 'none' }
  | { kind: 'start' }
  | { kind: 'add'; from: number; fromR: number; passes: ModularClockPass[] };

/** 한 걸음에 머리가 지나는 수 하나 — 끝이 그 걸음의 수다 */
export type ModularClockPass = { n: number; q: number; r: number };

export type ModularClockScene = {
  modulus: number;
  add: number;
  /** 더하는 횟수 — 자취가 채울 칸 수는 times + 1 */
  times: number;
  /** 마지막 수의 몫. init 전에는 null */
  laps: number | null;
  trail: ModularClockMark[];
  step: ModularClockStep;
};

function field(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`modular-clock scene: ${type}.payload.${key} 가 음이 아닌 정수가 아니다 (${String(v)})`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`modular-clock scene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

export const modularClockScene: ScenePlan<ModularClockScene> = {
  initial(initialData: unknown): ModularClockScene {
    const data = narrowModularClockData(initialData);
    return { modulus: data.modulus, add: data.add, times: data.times, laps: null, trail: [], step: { kind: 'none' } };
  },

  reduce(scene: ModularClockScene, event: FacetRuntimeEvent): ModularClockScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const modulus = field(p, 'modulus', 'init');
        const add = field(p, 'add', 'init');
        if (modulus !== scene.modulus || add !== scene.add) {
          throw new Error(
            `modular-clock scene: init 의 법 · 더하는 수 (${modulus}, ${add}) 가 바탕 (${scene.modulus}, ${scene.add}) 과 다르다`,
          );
        }
        const n = field(p, 'n', 'init');
        const q = field(p, 'q', 'init');
        const r = field(p, 'r', 'init');
        if (n !== modulus * q + r || r >= modulus) {
          throw new Error(`modular-clock scene: init 의 ${n} = ${modulus} × ${q} + ${r} 가 성립하지 않는다`);
        }
        return {
          ...scene,
          laps: field(p, 'laps', 'init'),
          trail: [{ n, q, r, crossed: false }],
          step: { kind: 'start' },
        };
      }
      case 'add': {
        const last = scene.trail[scene.trail.length - 1];
        if (scene.laps === null || last === undefined) {
          throw new Error('modular-clock scene: init 전에 add 가 왔다');
        }
        const p = payloadOf(event);
        const from = field(p, 'from', 'add');
        const fromR = field(p, 'fromR', 'add');
        const n = field(p, 'n', 'add');
        const q = field(p, 'q', 'add');
        const r = field(p, 'r', 'add');
        const crossed = p.crossed;
        if (typeof crossed !== 'boolean') {
          throw new Error(`modular-clock scene: add.payload.crossed 가 참거짓이 아니다 (${String(crossed)})`);
        }
        if (from !== last.n || fromR !== last.r) {
          throw new Error(
            `modular-clock scene: add.payload.from (${from}, 자리 ${fromR}) 가 지금 수 (${last.n}, 자리 ${last.r}) 와 다르다`,
          );
        }
        if (n !== from + scene.add || n !== scene.modulus * q + r || r >= scene.modulus) {
          throw new Error(`modular-clock scene: add 의 ${n} = ${scene.modulus} × ${q} + ${r} 가 성립하지 않는다`);
        }
        if (crossed !== (q === last.q + 1) || (q !== last.q && q !== last.q + 1)) {
          throw new Error(
            `modular-clock scene: add.payload.crossed (${String(crossed)}) 가 바퀴 ${last.q} → ${q} 와 맞지 않는다`,
          );
        }
        const rawPasses = p.passes;
        if (!Array.isArray(rawPasses) || rawPasses.length !== n - from) {
          throw new Error(`modular-clock scene: add.payload.passes 가 ${n - from} 칸짜리 배열이 아니다`);
        }
        const passes: ModularClockPass[] = rawPasses.map((raw: unknown, i) => {
          if (typeof raw !== 'object' || raw === null) {
            throw new Error(`modular-clock scene: add.payload.passes[${i}] 가 객체가 아니다`);
          }
          const entry = raw as Record<string, unknown>;
          const pn = field(entry, 'n', `add.passes[${i}]`);
          const pq = field(entry, 'q', `add.passes[${i}]`);
          const pr = field(entry, 'r', `add.passes[${i}]`);
          if (pn !== from + i + 1 || pn !== scene.modulus * pq + pr || pr >= scene.modulus) {
            throw new Error(
              `modular-clock scene: add.payload.passes[${i}] (${pn} = ${scene.modulus} × ${pq} + ${pr}) 가 이어지지 않거나 성립하지 않는다`,
            );
          }
          return { n: pn, q: pq, r: pr };
        });
        const end = passes[passes.length - 1];
        if (end === undefined || end.n !== n || end.q !== q || end.r !== r) {
          throw new Error(`modular-clock scene: add.payload.passes 의 끝이 ${n} = ${scene.modulus} × ${q} + ${r} 가 아니다`);
        }
        if (scene.trail.length > scene.times) {
          throw new Error(`modular-clock scene: add 가 ${scene.times} 번을 넘었다`);
        }
        if (q > scene.laps) {
          throw new Error(`modular-clock scene: add 의 바퀴 ${q} 가 바탕의 끝 ${scene.laps} 을 넘는다`);
        }
        return {
          ...scene,
          trail: [...scene.trail, { n, q, r, crossed }],
          step: { kind: 'add', from, fromR, passes },
        };
      }
      default:
        throw new Error(`modular-clock scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
