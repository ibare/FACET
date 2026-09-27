/**
 * clt-bell 장면.
 *
 * - 바탕: 주사위 눈 · 칸 수 · n 수열 · 평균의 수 (initialData), 가장 높은 칸 (silent init)
 * - 자취: 지금 무리 (`crowd`) — 걸음마다 통째로 갈아 끼운다
 * - 이번 걸음: `step` — 무리가 어디서 몰려왔는지(`from`, 앞 무리)를 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { binCountOf, narrowCltBellData, type CrowdPayload } from './algorithm.js';

export type Crowd = {
  n: number;
  counts: number[];
  mean: number;
  sd: number;
  peak: number;
};

export type CltBellStep =
  | { kind: 'start' }
  /** from 이 null 이면 첫 무리 — 바닥에서 솟는다 */
  | { kind: 'crowd'; from: Crowd | null };

export type CltBellScene = {
  faces: number;
  binCount: number;
  ns: number[];
  perN: number;
  /** 모든 걸음을 통틀어 가장 높은 칸의 개수. init 전에는 null */
  peakMax: number | null;
  crowd: Crowd | null;
  step: CltBellStep;
};

function copyCrowd(c: Crowd): Crowd {
  return { n: c.n, counts: [...c.counts], mean: c.mean, sd: c.sd, peak: c.peak };
}

function readNumber(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`clt-bell scene: ${type}.payload.${key} 가 수가 아니다`);
  return v;
}

function narrowCrowd(payload: unknown, scene: CltBellScene): CrowdPayload {
  if (typeof payload !== 'object' || payload === null) throw new Error('clt-bell scene: crowd.payload 가 객체가 아니다');
  const p = payload as Record<string, unknown>;
  const n = readNumber(p, 'n', 'crowd');
  const mean = readNumber(p, 'mean', 'crowd');
  const sd = readNumber(p, 'sd', 'crowd');
  const peak = readNumber(p, 'peak', 'crowd');
  const raw = p.counts;
  if (!Array.isArray(raw)) throw new Error('clt-bell scene: crowd.payload.counts 가 배열이 아니다');
  if (raw.length !== scene.binCount) {
    throw new Error(`clt-bell scene: crowd.payload.counts 길이 ${raw.length} 가 칸 수 ${scene.binCount} 와 다르다`);
  }
  const counts: number[] = [];
  let total = 0;
  raw.forEach((c, j) => {
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) throw new Error(`clt-bell scene: crowd.payload.counts[${j}] 가 개수가 아니다`);
    counts.push(c);
    total += c;
  });
  if (total !== scene.perN) throw new Error(`clt-bell scene: crowd.payload.counts 합 ${total} 가 ${scene.perN} 이 아니다`);
  const at = scene.crowd === null ? 0 : scene.ns.indexOf(scene.crowd.n) + 1;
  if (scene.ns[at] !== n) throw new Error(`clt-bell scene: crowd.payload.n ${n} 이 수열의 다음 값 ${String(scene.ns[at])} 이 아니다`);
  if (!Number.isInteger(peak) || peak < 0 || peak >= scene.binCount) throw new Error(`clt-bell scene: crowd.payload.peak ${peak} 가 칸 밖이다`);
  if (scene.peakMax === null) throw new Error('clt-bell scene: init 전에 crowd 가 왔다');
  if ((counts[peak] as number) > scene.peakMax) throw new Error('clt-bell scene: crowd 의 가장 높은 칸이 peakMax 를 넘는다');
  return { n, counts, mean, sd, peak };
}

export const cltBellScene: ScenePlan<CltBellScene> = {
  initial(initialData: unknown): CltBellScene {
    const d = narrowCltBellData(initialData);
    return {
      faces: d.faces,
      binCount: binCountOf(d.faces),
      ns: [...d.ns],
      perN: d.perN,
      peakMax: null,
      crowd: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: CltBellScene, event: FacetRuntimeEvent): CltBellScene {
    switch (event.type) {
      case 'init': {
        const p = event.payload;
        if (typeof p !== 'object' || p === null) throw new Error('clt-bell scene: init.payload 가 객체가 아니다');
        const peakMax = readNumber(p as Record<string, unknown>, 'peakMax', 'init');
        if (!Number.isInteger(peakMax) || peakMax <= 0) throw new Error('clt-bell scene: init.payload.peakMax 는 양의 정수');
        return { ...scene, ns: [...scene.ns], peakMax, crowd: scene.crowd === null ? null : copyCrowd(scene.crowd) };
      }
      case 'crowd': {
        const c = narrowCrowd(event.payload, scene);
        return {
          ...scene,
          ns: [...scene.ns],
          crowd: c,
          step: { kind: 'crowd', from: scene.crowd === null ? null : copyCrowd(scene.crowd) },
        };
      }
      default:
        throw new Error(`clt-bell scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
