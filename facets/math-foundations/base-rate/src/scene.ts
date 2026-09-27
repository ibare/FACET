/**
 * 기저율 장면.
 *
 * 바탕 — 무리 둘의 식별자 · 기저율 · 사람 수 (initialData), 병 / 병 없음과 더미 축척(init).
 * 자취 — 걸음이 채우는 수: 참 양성 · 놓침 → 거짓 양성 · 음성 → 양성 모두 → 양성 가운데 병의 몫.
 * 이번 걸음 — `phase` (−1 은 init 전, 0..4 는 대조의 걸음).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowBaseRateData } from './algorithm.js';

export interface BaseRateGroupScene {
  id: string;
  ratePct: number;
  people: number;
  sick: number | null;
  healthy: number | null;
  tp: number | null;
  fn: number | null;
  fp: number | null;
  tn: number | null;
  pos: number | null;
  sharePct: number | null;
}

export type BaseRatePhase = -1 | 0 | 1 | 2 | 3 | 4;

export interface BaseRateScene {
  groups: BaseRateGroupScene[];
  /** 더미 하나가 가장 클 때의 사람 수 — 두 무리가 같은 축척으로 쌓이게 한다 */
  pileMax: number | null;
  phase: BaseRatePhase;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(rec: Record<string, unknown>, key: string, path: string): number {
  const v = rec[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`baseRateScene: ${path}.${key} 가 수가 아니다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** payload.groups 를 장면의 무리 차례와 맞춰 읽는다. */
function readGroups(
  scene: BaseRateScene,
  event: FacetRuntimeEvent,
): Array<Record<string, unknown>> {
  const payload = event.payload;
  if (!isRecord(payload) || !Array.isArray(payload.groups)) {
    throw new Error(`baseRateScene: ${event.type}.payload.groups 가 배열이 아니다`);
  }
  const list: unknown[] = payload.groups;
  if (list.length !== scene.groups.length) {
    throw new Error(`baseRateScene: ${event.type}.payload.groups 의 길이가 무리 수와 다르다`);
  }
  return list.map((g, i) => {
    if (!isRecord(g)) throw new Error(`baseRateScene: ${event.type}.payload.groups[${i}] 가 객체가 아니다`);
    if (g.id !== scene.groups[i]!.id) {
      throw new Error(
        `baseRateScene: ${event.type}.payload.groups[${i}].id 가 ${String(g.id)} — 장면은 ${scene.groups[i]!.id}`,
      );
    }
    return g;
  });
}

function expectPhase(scene: BaseRateScene, want: BaseRatePhase, type: string): void {
  if (scene.phase !== want) {
    throw new Error(`baseRateScene: ${type} 는 걸음 ${want} 뒤에 온다 — 지금 걸음 ${scene.phase}`);
  }
}

function need(v: number | null, path: string): number {
  if (v === null) throw new Error(`baseRateScene: ${path} 가 아직 없다`);
  return v;
}

export const baseRateScene: ScenePlan<BaseRateScene> = {
  initial(initialData: unknown): BaseRateScene {
    const data = narrowBaseRateData(initialData);
    return {
      groups: data.groups.map((g) => ({
        id: g.id,
        ratePct: g.ratePct,
        people: data.people,
        sick: null,
        healthy: null,
        tp: null,
        fn: null,
        fp: null,
        tn: null,
        pos: null,
        sharePct: null,
      })),
      pileMax: null,
      phase: -1,
    };
  },

  reduce(scene: BaseRateScene, event: FacetRuntimeEvent): BaseRateScene {
    switch (event.type) {
      case 'init': {
        const list = readGroups(scene, event);
        const payload = event.payload;
        if (!isRecord(payload)) throw new Error('baseRateScene: init.payload 가 객체가 아니다');
        const pileMax = num(payload, 'pileMax', 'init.payload');
        return {
          groups: scene.groups.map((g, i) => {
            const p = list[i]!;
            const path = `init.payload.groups[${i}]`;
            const sick = num(p, 'sick', path);
            const healthy = num(p, 'healthy', path);
            if (num(p, 'people', path) !== g.people || sick + healthy !== g.people) {
              throw new Error(`baseRateScene: ${path} 의 병 + 병 없음이 사람 수 ${g.people} 와 다르다`);
            }
            if (num(p, 'ratePct', path) !== g.ratePct) {
              throw new Error(`baseRateScene: ${path}.ratePct 가 initialData 와 다르다`);
            }
            return {
              ...g,
              sick,
              healthy,
              tp: null,
              fn: null,
              fp: null,
              tn: null,
              pos: null,
              sharePct: null,
            };
          }),
          pileMax,
          phase: 0,
        };
      }
      case 'test-sick': {
        expectPhase(scene, 0, event.type);
        const list = readGroups(scene, event);
        return {
          ...scene,
          groups: scene.groups.map((g, i) => {
            const path = `test-sick.payload.groups[${i}]`;
            const tp = num(list[i]!, 'tp', path);
            const fn = num(list[i]!, 'fn', path);
            if (tp + fn !== need(g.sick, `${g.id}.sick`)) {
              throw new Error(`baseRateScene: ${path} 의 참 양성 + 놓침이 병 ${String(g.sick)} 과 다르다`);
            }
            return { ...g, tp, fn };
          }),
          phase: 1,
        };
      }
      case 'test-healthy': {
        expectPhase(scene, 1, event.type);
        const list = readGroups(scene, event);
        return {
          ...scene,
          groups: scene.groups.map((g, i) => {
            const path = `test-healthy.payload.groups[${i}]`;
            const fp = num(list[i]!, 'fp', path);
            const tn = num(list[i]!, 'tn', path);
            if (fp + tn !== need(g.healthy, `${g.id}.healthy`)) {
              throw new Error(`baseRateScene: ${path} 의 거짓 양성 + 음성이 병 없음 ${String(g.healthy)} 과 다르다`);
            }
            return { ...g, fp, tn };
          }),
          phase: 2,
        };
      }
      case 'pool': {
        expectPhase(scene, 2, event.type);
        const list = readGroups(scene, event);
        return {
          ...scene,
          groups: scene.groups.map((g, i) => {
            const path = `pool.payload.groups[${i}]`;
            const pos = num(list[i]!, 'pos', path);
            if (pos !== need(g.tp, `${g.id}.tp`) + need(g.fp, `${g.id}.fp`)) {
              throw new Error(`baseRateScene: ${path}.pos 가 참 양성 + 거짓 양성과 다르다`);
            }
            return { ...g, pos };
          }),
          phase: 3,
        };
      }
      case 'share': {
        expectPhase(scene, 3, event.type);
        const list = readGroups(scene, event);
        return {
          ...scene,
          groups: scene.groups.map((g, i) => ({
            ...g,
            sharePct: num(list[i]!, 'sharePct', `share.payload.groups[${i}]`),
          })),
          phase: 4,
        };
      }
      default:
        throw new Error(`baseRateScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
