import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { ReadIsSubscribeFacetData } from './algorithm.js';

export type ReadIsSubscribeSceneValue = { name: string; value: number | string };
export type ReadIsSubscribeSceneView = { name: string; code: string[]; output: number | string | null };
export type ReadIsSubscribeSceneEdge = { from: string; to: string };
export type ReadIsSubscribeSceneWrite = { name: string; value: number | string };

export type ReadIsSubscribeSceneStep =
  | null
  | { kind: 'read'; view: string; name: string; value: number | string }
  | { kind: 'write'; name: string; value: number | string; targets: string[] };

/**
 * 장면 모양 — 바탕(values·views·writes 는 initial 이 한 번 정한다) · 자취(edges·writeIndex 는
 * 걸음이 쌓는다) · 이번 걸음(step).
 */
export type ReadIsSubscribeScene = {
  values: ReadIsSubscribeSceneValue[];
  views: ReadIsSubscribeSceneView[];
  writes: ReadIsSubscribeSceneWrite[];
  edges: ReadIsSubscribeSceneEdge[];
  /** writes 중 몇 번째까지 처리됐는가. 하나도 안 됐으면 -1. */
  writeIndex: number;
  step: ReadIsSubscribeSceneStep;
};

function readPayload(
  payload: unknown,
): { view: string; name: string; value: number | string; output: number | string | undefined } {
  const p = payload as { view?: unknown; name?: unknown; value?: unknown; output?: unknown } | undefined;
  if (typeof p?.view !== 'string' || typeof p.name !== 'string') {
    throw new Error(`read 이벤트의 payload 가 이상하다: ${JSON.stringify(payload)}`);
  }
  if (typeof p.value !== 'number' && typeof p.value !== 'string') {
    throw new Error(`read 이벤트의 value 가 수 · 글자가 아니다: ${JSON.stringify(payload)}`);
  }
  if (p.output !== undefined && typeof p.output !== 'number' && typeof p.output !== 'string') {
    throw new Error(`read 이벤트의 output 이 수 · 글자가 아니다: ${JSON.stringify(payload)}`);
  }
  return { view: p.view, name: p.name, value: p.value, output: p.output };
}

function writePayload(
  payload: unknown,
): { name: string; value: number | string; targets: string[]; reruns: { view: string; output: number | string }[] } {
  const p = payload as { name?: unknown; value?: unknown; targets?: unknown; reruns?: unknown } | undefined;
  if (typeof p?.name !== 'string') throw new Error(`write 이벤트에 name 이 없다: ${JSON.stringify(payload)}`);
  if (typeof p.value !== 'number' && typeof p.value !== 'string') {
    throw new Error(`write 이벤트의 value 가 수 · 글자가 아니다: ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(p.targets)) throw new Error(`write 이벤트에 targets 배열이 없다: ${JSON.stringify(payload)}`);
  const targets: string[] = [];
  for (const t of p.targets) {
    if (typeof t !== 'string') throw new Error(`write 이벤트의 targets 원소가 글자가 아니다: ${JSON.stringify(t)}`);
    targets.push(t);
  }
  if (!Array.isArray(p.reruns)) throw new Error(`write 이벤트에 reruns 배열이 없다: ${JSON.stringify(payload)}`);
  const reruns: { view: string; output: number | string }[] = [];
  for (const r of p.reruns) {
    if (typeof r !== 'object' || r === null) throw new Error(`reruns 원소가 이상하다: ${JSON.stringify(r)}`);
    const rr = r as { view?: unknown; output?: unknown };
    if (typeof rr.view !== 'string') throw new Error(`reruns 원소에 view 가 없다: ${JSON.stringify(r)}`);
    if (typeof rr.output !== 'number' && typeof rr.output !== 'string') {
      throw new Error(`reruns 원소의 output 이 수 · 글자가 아니다: ${JSON.stringify(r)}`);
    }
    reruns.push({ view: rr.view, output: rr.output });
  }
  return { name: p.name, value: p.value, targets, reruns };
}

export const readIsSubscribeScene: ScenePlan<ReadIsSubscribeScene> = {
  initial(initialData: unknown): ReadIsSubscribeScene {
    const data = initialData as ReadIsSubscribeFacetData;
    return {
      values: data.values.map((v) => ({ name: v.name, value: v.value })),
      views: data.views.map((v) => ({ name: v.name, code: [...v.code], output: null })),
      writes: data.writes.map((w) => ({ name: w.name, value: w.value })),
      edges: [],
      writeIndex: -1,
      step: null,
    };
  },

  reduce(scene: ReadIsSubscribeScene, event: FacetRuntimeEvent): ReadIsSubscribeScene {
    if (event.type === 'read') {
      const p = readPayload(event.payload);
      return {
        ...scene,
        views:
          p.output === undefined
            ? scene.views
            : scene.views.map((v) => (v.name === p.view ? { ...v, output: p.output as number | string } : v)),
        edges: [...scene.edges, { from: p.name, to: p.view }],
        step: { kind: 'read', view: p.view, name: p.name, value: p.value },
      };
    }
    if (event.type === 'write') {
      const p = writePayload(event.payload);
      return {
        ...scene,
        values: scene.values.map((v) => (v.name === p.name ? { ...v, value: p.value } : v)),
        views: scene.views.map((v) => {
          const found = p.reruns.find((r) => r.view === v.name);
          return found ? { ...v, output: found.output } : v;
        }),
        writeIndex: scene.writeIndex + 1,
        step: { kind: 'write', name: p.name, value: p.value, targets: p.targets },
      };
    }
    throw new Error(`알 수 없는 이벤트 종류: ${event.type}`);
  },
};
