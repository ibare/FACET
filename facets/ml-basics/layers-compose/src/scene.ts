/**
 * layers-compose 장면.
 *
 * 바탕: 평면 반폭 · 치우침 · 단위들 · 짚는 자리 (initialData) + 꺾임선 (init)
 * 자취: 합에 든 단위 수 · 지금 모습(경계 · 모서리 · 켜진 쪽 · 짚는 자리의 o)
 * 이번 걸음: 처음 모습이거나, 단위 하나를 더하며 지나간 모습들
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowHinges,
  narrowLayersComposeData,
  narrowSnapshot,
  type LayersUnit,
  type Pt,
  type Snapshot,
} from './algorithm.js';

export type LayersStep = { kind: 'start' } | { kind: 'add'; unit: number; frames: Snapshot[] };

export type LayersComposeScene = {
  box: number;
  c: number;
  units: LayersUnit[];
  probes: Pt[];
  /** 단위마다 꺾임선의 두 끝 — init 전에는 없다 */
  hinges: Pt[][] | null;
  /** 둘째 층의 합에 든 단위 수 */
  added: number;
  shape: Snapshot | null;
  step: LayersStep | null;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`layers-compose 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function checkProbes(scene: LayersComposeScene, s: Snapshot, path: string): void {
  if (s.probeO.length !== scene.probes.length) {
    throw new Error(`layers-compose 장면: ${path}.probeO 의 길이 ${s.probeO.length} 가 짚는 자리 수 ${scene.probes.length} 와 다르다`);
  }
}

export const layersComposeScene: ScenePlan<LayersComposeScene> = {
  initial(initialData: unknown): LayersComposeScene {
    const data = narrowLayersComposeData(initialData);
    return {
      box: data.box,
      c: data.c,
      units: data.units.map((u) => ({ ...u })),
      probes: data.probes.map((p) => [p[0], p[1]] as Pt),
      hinges: null,
      added: 0,
      shape: null,
      step: null,
    };
  },

  reduce(scene: LayersComposeScene, event: FacetRuntimeEvent): LayersComposeScene {
    switch (event.type) {
      case 'init': {
        if (scene.hinges !== null) throw new Error('layers-compose 장면: init 이 두 번 왔다');
        const p = payloadOf(event);
        const hinges = narrowHinges(p.hinges, 'init.payload.hinges');
        if (hinges.length !== scene.units.length) {
          throw new Error(`layers-compose 장면: init.payload.hinges 의 길이 ${hinges.length} 가 단위 수 ${scene.units.length} 와 다르다`);
        }
        const start = narrowSnapshot(p.start, 'init.payload.start');
        checkProbes(scene, start, 'init.payload.start');
        return { ...scene, hinges, added: 0, shape: start, step: { kind: 'start' } };
      }
      case 'add': {
        if (scene.hinges === null || scene.shape === null) throw new Error('layers-compose 장면: init 전에 add 가 왔다');
        const p = payloadOf(event);
        const unit = p.unit;
        if (typeof unit !== 'number' || !Number.isInteger(unit)) throw new Error('layers-compose 장면: add.payload.unit 이 정수가 아니다');
        if (unit !== scene.added + 1) {
          throw new Error(`layers-compose 장면: add.payload.unit ${unit} — 다음 단위는 ${scene.added + 1} 이어야 한다`);
        }
        if (unit > scene.units.length) throw new Error(`layers-compose 장면: add.payload.unit ${unit} 이 단위 수를 넘는다`);
        const shape = narrowSnapshot(p.shape, 'add.payload.shape');
        checkProbes(scene, shape, 'add.payload.shape');
        if (!Array.isArray(p.frames)) throw new Error('layers-compose 장면: add.payload.frames 가 배열이 아니다');
        const frames = p.frames.map((f, i) => {
          const s = narrowSnapshot(f, `add.payload.frames[${i}]`);
          checkProbes(scene, s, `add.payload.frames[${i}]`);
          return s;
        });
        if (frames.length < 2) throw new Error('layers-compose 장면: add.payload.frames 가 둘보다 적다');
        return { ...scene, added: unit, shape, step: { kind: 'add', unit, frames } };
      }
      default:
        throw new Error(`layers-compose 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
