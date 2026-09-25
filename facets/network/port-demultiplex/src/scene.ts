/**
 * 포트 역다중화의 장면.
 *
 * - 바탕: 받는 호스트의 주소, 듣고 있는 응용, 보낸 주소 목록 (initialData 에서 베낀다.
 *   보낸 주소 목록은 처음 나온 차례 — 무대가 점 색의 차례로 쓴다)
 * - 자취: 응용에 닿은 조각들, 닿은 차례대로
 * - 이번 걸음: 시작이거나, 방금 닿은 조각의 차례
 *
 * 포트를 찾는 셈은 알고리즘이 한다. 장면은 `deliver` 가 실어 온 응용을 그대로 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneApp = { id: string; port: number };

export type SceneDelivery = {
  index: number;
  srcAddr: string;
  srcPort: number;
  dstAddr: string;
  dstPort: number;
  app: string;
};

export type PortDemultiplexStep = { kind: 'start' } | { kind: 'deliver'; index: number };

export type PortDemultiplexSceneState = {
  host: string;
  apps: SceneApp[];
  /** 들어오는 조각들의 보낸 주소, 처음 나온 차례대로 겹치지 않게 */
  sources: string[];
  delivered: SceneDelivery[];
  step: PortDemultiplexStep;
};

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

export const portDemultiplexScene: ScenePlan<PortDemultiplexSceneState> = {
  initial(initialData: unknown): PortDemultiplexSceneState {
    const data = record(initialData);
    if (data === null) throw new Error('portDemultiplexScene: initialData 가 객체가 아니다');
    const { host, apps, segments } = data;
    if (typeof host !== 'string' || host === '') {
      throw new Error('portDemultiplexScene: 받는 호스트의 주소가 없다');
    }
    if (!Array.isArray(apps)) throw new Error('portDemultiplexScene: apps 가 배열이 아니다');
    const copied: SceneApp[] = apps.map((raw, i) => {
      const app = record(raw);
      if (app === null || typeof app.id !== 'string' || typeof app.port !== 'number') {
        throw new Error(`portDemultiplexScene: 응용 ${i + 1} 의 모양이 틀렸다`);
      }
      return { id: app.id, port: app.port };
    });
    if (!Array.isArray(segments)) throw new Error('portDemultiplexScene: segments 가 배열이 아니다');
    const sources: string[] = [];
    segments.forEach((raw, i) => {
      const seg = record(raw);
      if (seg === null || typeof seg.srcAddr !== 'string' || seg.srcAddr === '') {
        throw new Error(`portDemultiplexScene: 조각 ${i + 1} 의 보낸 주소가 없다`);
      }
      if (!sources.includes(seg.srcAddr)) sources.push(seg.srcAddr);
    });
    return { host, apps: copied, sources, delivered: [], step: { kind: 'start' } };
  },

  reduce(scene: PortDemultiplexSceneState, event: FacetRuntimeEvent): PortDemultiplexSceneState {
    if (event.type !== 'deliver') return scene;
    const p = record(event.payload);
    if (p === null) throw new Error('portDemultiplexScene: deliver 의 payload 가 없다');
    const { index, srcAddr, srcPort, dstAddr, dstPort, app } = p;
    if (
      typeof index !== 'number' ||
      typeof srcAddr !== 'string' ||
      typeof srcPort !== 'number' ||
      typeof dstAddr !== 'string' ||
      typeof dstPort !== 'number' ||
      typeof app !== 'string'
    ) {
      throw new Error('portDemultiplexScene: deliver 의 payload 모양이 틀렸다');
    }
    if (!scene.apps.some((a) => a.id === app)) {
      throw new Error(`portDemultiplexScene: 모르는 응용 ${app}`);
    }
    return {
      host: scene.host,
      apps: scene.apps,
      sources: scene.sources,
      delivered: [...scene.delivered, { index, srcAddr, srcPort, dstAddr, dstPort, app }],
      step: { kind: 'deliver', index },
    };
  },
};
