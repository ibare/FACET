/**
 * who-goes-first 의 장면.
 *
 * 바탕   규칙 · 소스 · 요청한 대상 — initialData 에서 베낀다 (걸음 0 이 곧 이 그래프)
 * 자취   path  요구가 내려간 길. 앞이 요청한 대상, 끝이 지금 요구하는 대상 (기다리는 줄)
 *        asked 내려간 차례 · built 세운 차례
 * 이번   step  이번 걸음. from 은 이 걸음이 이어진 윗대상(요청한 대상이면 null)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { WhoGoesFirstRule } from './algorithm.js';

export type WhoGoesFirstStep =
  | { kind: 'descend'; target: string; from: string | null }
  | { kind: 'build'; target: string; from: string | null; order: number }
  | { kind: 'already'; target: string; from: string };

export type WhoGoesFirstSceneState = {
  rules: WhoGoesFirstRule[];
  sources: string[];
  goal: string;
  path: string[];
  asked: string[];
  built: string[];
  step: WhoGoesFirstStep | null;
};

function readBase(initialData: unknown): Pick<WhoGoesFirstSceneState, 'rules' | 'sources' | 'goal'> {
  if (typeof initialData !== 'object' || initialData === null) {
    return { rules: [], sources: [], goal: '' };
  }
  const d = initialData as Record<string, unknown>;
  const rules: WhoGoesFirstRule[] = [];
  if (Array.isArray(d.rules)) {
    for (const r of d.rules as unknown[]) {
      if (typeof r !== 'object' || r === null) throw new Error('who-goes-first: 규칙 모양이 틀렸다');
      const rr = r as Record<string, unknown>;
      if (typeof rr.target !== 'string' || !Array.isArray(rr.inputs)) {
        throw new Error('who-goes-first: 규칙에 target · inputs 가 없다');
      }
      const inputs: string[] = [];
      for (const i of rr.inputs as unknown[]) {
        if (typeof i !== 'string') throw new Error(`who-goes-first: ${rr.target} 의 입력이 글자가 아니다`);
        inputs.push(i);
      }
      rules.push({ target: rr.target, inputs });
    }
  }
  const sources: string[] = [];
  if (Array.isArray(d.sources)) {
    for (const s of d.sources as unknown[]) {
      if (typeof s !== 'string') throw new Error('who-goes-first: 소스 이름이 글자가 아니다');
      sources.push(s);
    }
  }
  const goal = typeof d.goal === 'string' ? d.goal : '';
  return { rules, sources, goal };
}

function readTarget(event: FacetRuntimeEvent): string {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`who-goes-first: ${event.type} 에 payload 가 없다`);
  const target = (p as { target?: unknown }).target;
  if (typeof target !== 'string') throw new Error(`who-goes-first: ${event.type} 에 target 이 없다`);
  return target;
}

export const whoGoesFirstScene: ScenePlan<WhoGoesFirstSceneState> = {
  initial(initialData: unknown): WhoGoesFirstSceneState {
    const base = readBase(initialData);
    return { ...base, path: [], asked: [], built: [], step: null };
  },

  reduce(scene: WhoGoesFirstSceneState, event: FacetRuntimeEvent): WhoGoesFirstSceneState {
    if (event.type === 'descend') {
      const target = readTarget(event);
      const from = scene.path.length > 0 ? scene.path[scene.path.length - 1] ?? null : null;
      return {
        ...scene,
        path: [...scene.path, target],
        asked: [...scene.asked, target],
        step: { kind: 'descend', target, from },
      };
    }
    if (event.type === 'build') {
      const target = readTarget(event);
      const tail = scene.path[scene.path.length - 1];
      if (tail !== target) throw new Error(`who-goes-first: 세우는 ${target} 가 요구의 끝(${String(tail)})이 아니다`);
      const order = (event.payload as { order?: unknown }).order;
      const built = [...scene.built, target];
      if (typeof order !== 'number' || order !== built.length) {
        throw new Error(`who-goes-first: ${target} 의 세운 차례가 어긋났다`);
      }
      const path = scene.path.slice(0, -1);
      const from = path.length > 0 ? path[path.length - 1] ?? null : null;
      return { ...scene, path, built, step: { kind: 'build', target, from, order } };
    }
    if (event.type === 'already') {
      const target = readTarget(event);
      const from = scene.path[scene.path.length - 1];
      if (from === undefined) throw new Error(`who-goes-first: ${target} 에 닿은 윗대상이 없다`);
      if (!scene.built.includes(target)) throw new Error(`who-goes-first: ${target} 는 아직 서지 않았다`);
      return { ...scene, step: { kind: 'already', target, from } };
    }
    throw new Error(`who-goes-first: 모르는 이벤트 ${event.type}`);
  },
};
