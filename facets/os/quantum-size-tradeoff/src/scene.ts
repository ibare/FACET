/**
 * quantum-size-tradeoff 장면.
 *
 * 바탕 — 일감 목록(식별자 · 도착 · 길이) · 두 몫 · 띠의 칸 수(init)
 * 자취 — 쪽마다 틱별로 돈 것(주인 · 바뀜 · 첫 응답), 끝의 합계
 * 이번 걸음 — 시작 · 한 틱 · 끝
 *
 * 누가 오를지는 알고리즘이 셈했다. 장면은 이벤트만 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneProc = { id: string; arrival: number; burst: number };

export type SceneSlot = { pid: string | null; switched: boolean; from: string | null; response: number | null };

export type SceneTotals = { switches: number; respSum: number; count: number };

export type QuantumSizeTradeoffScene = {
  procs: SceneProc[];
  quanta: number[];
  /** 띠의 칸 수. init 전이면 0 */
  ticks: number;
  /** 쪽마다(quanta 차례) 틱별로 돈 것 */
  sides: SceneSlot[][];
  /** 끝났을 때 쪽마다의 합계. 끝나기 전이면 null */
  totals: SceneTotals[] | null;
  step: { kind: 'start' } | { kind: 'tick'; tick: number } | { kind: 'end' };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readProcs(v: unknown): SceneProc[] {
  if (!Array.isArray(v)) throw new Error('quantumSizeTradeoffScene: procs 가 배열이 아니다');
  return v.map((p) => {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.arrival !== 'number' || typeof p.burst !== 'number') {
      throw new Error('quantumSizeTradeoffScene: 프로세스 모양이 틀렸다');
    }
    return { id: p.id, arrival: p.arrival, burst: p.burst };
  });
}

function readQuanta(v: unknown): number[] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((q) => typeof q === 'number')) {
    throw new Error('quantumSizeTradeoffScene: 몫은 수 둘이어야 한다');
  }
  return v.map((q) => Number(q));
}

function readSlot(v: unknown): SceneSlot {
  if (!isRecord(v)) throw new Error('quantumSizeTradeoffScene: tick 의 runs 항목이 객체가 아니다');
  const { pid, switched, from, response } = v;
  if (!(pid === null || typeof pid === 'string')) throw new Error('quantumSizeTradeoffScene: pid 모양이 틀렸다');
  if (typeof switched !== 'boolean') throw new Error('quantumSizeTradeoffScene: switched 가 참거짓이 아니다');
  if (!(from === null || typeof from === 'string')) throw new Error('quantumSizeTradeoffScene: from 모양이 틀렸다');
  if (!(response === null || typeof response === 'number')) {
    throw new Error('quantumSizeTradeoffScene: response 모양이 틀렸다');
  }
  return { pid, switched, from, response };
}

function readTotals(v: unknown): SceneTotals {
  if (!isRecord(v)) throw new Error('quantumSizeTradeoffScene: done 의 sides 항목이 객체가 아니다');
  const { switches, respSum, count } = v;
  if (typeof switches !== 'number' || typeof respSum !== 'number' || typeof count !== 'number') {
    throw new Error('quantumSizeTradeoffScene: done 합계 모양이 틀렸다');
  }
  return { switches, respSum, count };
}

export const quantumSizeTradeoffScene: ScenePlan<QuantumSizeTradeoffScene> = {
  initial(initialData: unknown): QuantumSizeTradeoffScene {
    // 러너 밖에서 자료 없이 불려도 빈 장면을 준다 (자료가 있으면 모양은 엄격히 본다)
    if (initialData === undefined || initialData === null) {
      return { procs: [], quanta: [], ticks: 0, sides: [], totals: null, step: { kind: 'start' } };
    }
    if (!isRecord(initialData)) throw new Error('quantumSizeTradeoffScene: initialData 가 객체가 아니다');
    const quanta = readQuanta(initialData.quanta);
    return {
      procs: readProcs(initialData.procs),
      quanta,
      ticks: 0,
      sides: quanta.map(() => []),
      totals: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: QuantumSizeTradeoffScene, event: FacetRuntimeEvent): QuantumSizeTradeoffScene {
    const payload = event.payload;
    switch (event.type) {
      case 'init': {
        if (!isRecord(payload) || typeof payload.ticks !== 'number') {
          throw new Error('quantumSizeTradeoffScene: init 의 ticks 가 없다');
        }
        return { ...scene, ticks: payload.ticks, step: { kind: 'start' } };
      }
      case 'tick': {
        if (!isRecord(payload) || typeof payload.tick !== 'number' || !Array.isArray(payload.runs)) {
          throw new Error('quantumSizeTradeoffScene: tick 모양이 틀렸다');
        }
        const runs = payload.runs.map(readSlot);
        if (runs.length !== scene.sides.length) {
          throw new Error('quantumSizeTradeoffScene: tick 의 쪽 수가 몫 수와 다르다');
        }
        return {
          ...scene,
          sides: scene.sides.map((slots, i) => [...slots, runs[i] as SceneSlot]),
          step: { kind: 'tick', tick: payload.tick },
        };
      }
      case 'done': {
        if (!isRecord(payload) || !Array.isArray(payload.sides)) {
          throw new Error('quantumSizeTradeoffScene: done 모양이 틀렸다');
        }
        return { ...scene, totals: payload.sides.map(readTotals), step: { kind: 'end' } };
      }
      default:
        throw new Error(`quantumSizeTradeoffScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
