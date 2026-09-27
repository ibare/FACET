/**
 * handshake-lemma 장면 — 알고리즘 이벤트를 상태로 잇는다 (S-scene).
 *
 * - 바탕: 정점 (initialData 에서 베낀다)
 * - 자취: 놓인 간선 · 정점마다 차수 · 차수 합 (알고리즘이 셈해 싣는다)
 * - 이번 걸음: 처음 화면인가, 어느 간선이 놓였고 두 끝이 얼마에서 얼마로 올랐나
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowHandshakeData } from './algorithm.js';

export type HandshakeStep =
  | { kind: 'start' }
  | {
      kind: 'place';
      u: number;
      v: number;
      fromU: number;
      toU: number;
      fromV: number;
      toV: number;
      /** 이 간선을 놓기 전의 차수 합 — 운동이 앞 값에서 출발하도록 장면이 말한다 */
      fromSum: number;
    };

export type HandshakeScene = {
  /** 바탕 — 정점 이름. 그림의 차례도 이것이다. */
  vertices: number[];
  /** 자취 — 놓인 간선, 놓은 차례대로 */
  placed: Array<[number, number]>;
  /** 자취 — `degrees[i]` 는 `vertices[i]` 의 차수. init 전에는 아직 셈하지 않았다 */
  degrees: number[] | null;
  /** 자취 — 차수를 모두 더한 값. init 전에는 null */
  sum: number | null;
  /** 이번 걸음 */
  step: HandshakeStep | null;
};

function intField(p: Record<string, unknown>, key: string, type: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isInteger(x)) {
    throw new Error(`handshakeLemmaScene: ${type}.payload.${key} 가 정수가 아니다`);
  }
  return x;
}

function intArray(p: Record<string, unknown>, key: string, type: string): number[] {
  const x = p[key];
  if (!Array.isArray(x)) throw new Error(`handshakeLemmaScene: ${type}.payload.${key} 가 배열이 아니다`);
  return x.map((n, i) => {
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      throw new Error(`handshakeLemmaScene: ${type}.payload.${key}[${i}] 가 정수가 아니다`);
    }
    return n;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`handshakeLemmaScene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function indexOfVertex(scene: HandshakeScene, name: number, path: string): number {
  const i = scene.vertices.indexOf(name);
  if (i < 0) throw new Error(`handshakeLemmaScene: ${path} 정점 ${name} 가 바탕에 없다`);
  return i;
}

export const handshakeLemmaScene: ScenePlan<HandshakeScene> = {
  initial(initialData: unknown): HandshakeScene {
    const data = narrowHandshakeData(initialData);
    return {
      vertices: [...data.vertices],
      placed: [],
      degrees: null,
      sum: null,
      step: null,
    };
  },

  reduce(scene: HandshakeScene, event: FacetRuntimeEvent): HandshakeScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const vertices = intArray(p, 'vertices', 'init');
        const degrees = intArray(p, 'degrees', 'init');
        const sum = intField(p, 'sum', 'init');
        const edges = intField(p, 'edges', 'init');
        if (vertices.length !== scene.vertices.length || vertices.some((v, i) => v !== scene.vertices[i])) {
          throw new Error('handshakeLemmaScene: init.payload.vertices 가 바탕의 정점과 다르다');
        }
        if (degrees.length !== vertices.length) {
          throw new Error('handshakeLemmaScene: init.payload.degrees 의 길이가 정점 수와 다르다');
        }
        if (edges !== 0) throw new Error('handshakeLemmaScene: init.payload.edges 가 0 이 아니다');
        return {
          vertices: [...scene.vertices],
          placed: [],
          degrees: [...degrees],
          sum,
          step: { kind: 'start' },
        };
      }
      case 'place': {
        const p = payloadOf(event);
        if (scene.degrees === null || scene.sum === null) {
          throw new Error('handshakeLemmaScene: init 전에 place 가 왔다');
        }
        const u = intField(p, 'u', 'place');
        const v = intField(p, 'v', 'place');
        const fromU = intField(p, 'fromU', 'place');
        const toU = intField(p, 'toU', 'place');
        const fromV = intField(p, 'fromV', 'place');
        const toV = intField(p, 'toV', 'place');
        const sum = intField(p, 'sum', 'place');
        const edges = intField(p, 'edges', 'place');
        const index = intField(p, 'index', 'place');
        const iu = indexOfVertex(scene, u, 'place.payload.u');
        const iv = indexOfVertex(scene, v, 'place.payload.v');
        if (index !== scene.placed.length) {
          throw new Error(`handshakeLemmaScene: place.payload.index ${index} 가 놓인 간선 수 ${scene.placed.length} 와 다르다`);
        }
        if (edges !== scene.placed.length + 1) {
          throw new Error(`handshakeLemmaScene: place.payload.edges ${edges} 가 앞 장면과 맞지 않는다`);
        }
        if (scene.degrees[iu] !== fromU) {
          throw new Error(`handshakeLemmaScene: place.payload.fromU ${fromU} 가 정점 ${u} 의 지금 차수와 다르다`);
        }
        if (scene.degrees[iv] !== fromV) {
          throw new Error(`handshakeLemmaScene: place.payload.fromV ${fromV} 가 정점 ${v} 의 지금 차수와 다르다`);
        }
        const degrees = [...scene.degrees];
        degrees[iu] = toU;
        degrees[iv] = toV;
        return {
          vertices: [...scene.vertices],
          placed: [...scene.placed.map((e): [number, number] => [e[0], e[1]]), [u, v]],
          degrees,
          sum,
          step: { kind: 'place', u, v, fromU, toU, fromV, toV, fromSum: scene.sum },
        };
      }
      default:
        throw new Error(`handshakeLemmaScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
