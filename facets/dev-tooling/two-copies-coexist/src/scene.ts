/**
 * two-copies-coexist 의 장면.
 *
 * 바탕 — 뿌리 이름 · 꾸러미마다 부름 · 찾는 이름 · 그림의 뼈대(꼭대기 이름 차례 · 안쪽 자리 · 벌 수 합).
 *        뼈대는 알고리즘이 내놓은 순수 함수 `layoutOf` 로 얻는다 (그림과 같은 함수).
 * 자취 — 놓인 것(`placed`) · 다시 쓴 것(`reused`) · 본 자리(`looked`).
 * 이번 걸음 — `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { layoutOf, type Call, type Layout, type TwoCopiesCoexistFacetData } from './algorithm.js';

export type Placed = { from: string; name: string; range: string; version: string; parent: string | null; was: string | null };
export type Reused = { from: string; name: string; range: string; version: string };
export type Looked = { seeker: string; name: string; parent: string | null; version: string | null };

export type TwoCopiesStep =
  | { kind: 'place'; index: number }
  | { kind: 'reuse'; index: number }
  | { kind: 'look'; index: number };

export type TwoCopiesCoexistScene = {
  root: string;
  calls: Record<string, Call[]>;
  target: string;
  layout: Layout;
  placed: Placed[];
  reused: Reused[];
  looked: Looked[];
  step: TwoCopiesStep | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`two-copies-coexist: ${type} 의 ${key} 가 문자열이 아니다`);
  return v;
}

function strOrNull(p: Record<string, unknown>, key: string, type: string): string | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`two-copies-coexist: ${type} 의 ${key} 가 문자열도 null 도 아니다`);
  return v;
}

function narrowData(raw: unknown): TwoCopiesCoexistFacetData {
  if (!isRecord(raw) || raw.type !== 'two-copies-coexist') {
    throw new Error('two-copies-coexist: initialData 의 type 이 맞지 않다');
  }
  const { root, calls, published, lookFor, stepMs } = raw;
  if (typeof root !== 'string' || typeof lookFor !== 'string' || typeof stepMs !== 'number') {
    throw new Error('two-copies-coexist: initialData 의 root · lookFor · stepMs 가 비었다');
  }
  if (!isRecord(calls) || !isRecord(published)) {
    throw new Error('two-copies-coexist: initialData 의 calls · published 가 객체가 아니다');
  }
  const outCalls: Record<string, Call[]> = {};
  for (const [pkg, list] of Object.entries(calls)) {
    if (!Array.isArray(list)) throw new Error(`two-copies-coexist: ${pkg} 의 부름이 목록이 아니다`);
    outCalls[pkg] = list.map((c: unknown) => {
      if (!isRecord(c)) throw new Error(`two-copies-coexist: ${pkg} 의 부름 모양이 틀렸다`);
      return { name: str(c, 'name', 'call'), range: str(c, 'range', 'call') };
    });
  }
  const outPublished: Record<string, string[]> = {};
  for (const [pkg, list] of Object.entries(published)) {
    if (!Array.isArray(list) || !list.every((v: unknown) => typeof v === 'string')) {
      throw new Error(`two-copies-coexist: ${pkg} 의 공개 목록이 문자열 목록이 아니다`);
    }
    outPublished[pkg] = [...(list as string[])];
  }
  return { type: 'two-copies-coexist', stepMs, root, calls: outCalls, published: outPublished, lookFor };
}

export const twoCopiesCoexistScene: ScenePlan<TwoCopiesCoexistScene> = {
  initial(initialData: unknown): TwoCopiesCoexistScene {
    const data = narrowData(initialData);
    return {
      root: data.root,
      calls: data.calls,
      target: data.lookFor,
      layout: layoutOf(data),
      placed: [],
      reused: [],
      looked: [],
      step: null,
    };
  },

  reduce(scene: TwoCopiesCoexistScene, event: FacetRuntimeEvent): TwoCopiesCoexistScene {
    const p = event.payload;
    if (event.type === 'place') {
      if (!isRecord(p)) throw new Error('two-copies-coexist: place 의 payload 가 없다');
      const item: Placed = {
        from: str(p, 'from', 'place'),
        name: str(p, 'name', 'place'),
        range: str(p, 'range', 'place'),
        version: str(p, 'version', 'place'),
        parent: strOrNull(p, 'parent', 'place'),
        was: strOrNull(p, 'was', 'place'),
      };
      return { ...scene, placed: [...scene.placed, item], step: { kind: 'place', index: scene.placed.length } };
    }
    if (event.type === 'reuse') {
      if (!isRecord(p)) throw new Error('two-copies-coexist: reuse 의 payload 가 없다');
      const item: Reused = {
        from: str(p, 'from', 'reuse'),
        name: str(p, 'name', 'reuse'),
        range: str(p, 'range', 'reuse'),
        version: str(p, 'version', 'reuse'),
      };
      return { ...scene, reused: [...scene.reused, item], step: { kind: 'reuse', index: scene.reused.length } };
    }
    if (event.type === 'look') {
      if (!isRecord(p)) throw new Error('two-copies-coexist: look 의 payload 가 없다');
      const item: Looked = {
        seeker: str(p, 'seeker', 'look'),
        name: str(p, 'name', 'look'),
        parent: strOrNull(p, 'parent', 'look'),
        version: strOrNull(p, 'version', 'look'),
      };
      return { ...scene, looked: [...scene.looked, item], step: { kind: 'look', index: scene.looked.length } };
    }
    throw new Error(`two-copies-coexist: 모르는 이벤트 ${JSON.stringify(event.type)}`);
  },
};
