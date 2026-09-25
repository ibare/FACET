/**
 * pure-same-output 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕 (init 이 한 번 정한다): lines · lanes · maxOut · rows
 * 자취 (걸음이 쌓는다): outer (바깥 이름과 지금 값, 넣은 차례) · piles (함수마다 부른 차례대로의 출력)
 * 이번 걸음: step — assign 이면 옛 값 `was` 를 계기값으로 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PureLine = { indent: number; text: string };
export type PureLane = { name: string; header: number; body: number[]; outer: string[] };
export type PureRead = { name: string; value: number };

export type PureSceneStep =
  | { kind: 'start' }
  | { kind: 'assign'; line: number; name: string; value: number; was: number | null }
  | {
      kind: 'call';
      line: number;
      lane: number;
      args: number[];
      out: number;
      reads: PureRead[];
    };

export type PureSameOutputScene = {
  lines: PureLine[];
  lanes: PureLane[];
  maxOut: number;
  rows: number;
  outer: PureRead[];
  piles: number[][];
  step: PureSceneStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map(num) : [];
}
function reads(v: unknown): PureRead[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((r) => ({ name: str(r.name), value: num(r.value) }));
}

function emptyScene(): PureSameOutputScene {
  return { lines: [], lanes: [], maxOut: 0, rows: 0, outer: [], piles: [], step: { kind: 'start' } };
}

export const pureSameOutputScene: ScenePlan<PureSameOutputScene> = {
  initial(): PureSameOutputScene {
    return emptyScene();
  },

  reduce(scene: PureSameOutputScene, event: FacetRuntimeEvent): PureSameOutputScene {
    const p = isRecord(event.payload) ? event.payload : {};

    if (event.type === 'init') {
      const lines = Array.isArray(p.lines)
        ? p.lines.filter(isRecord).map((l) => ({ indent: num(l.indent), text: str(l.text) }))
        : [];
      const lanes = Array.isArray(p.lanes)
        ? p.lanes.filter(isRecord).map((l) => ({
            name: str(l.name),
            header: num(l.header),
            body: nums(l.body),
            outer: Array.isArray(l.outer) ? l.outer.map(str) : [],
          }))
        : [];
      return {
        lines,
        lanes,
        maxOut: num(p.maxOut),
        rows: num(p.rows),
        outer: [],
        piles: lanes.map(() => []),
        step: { kind: 'start' },
      };
    }

    if (event.type === 'assign') {
      const name = str(p.name);
      const value = num(p.value);
      const found = scene.outer.find((o) => o.name === name);
      const outer = found
        ? scene.outer.map((o) => (o.name === name ? { name, value } : { ...o }))
        : [...scene.outer.map((o) => ({ ...o })), { name, value }];
      return {
        ...scene,
        outer,
        piles: scene.piles.map((pile) => [...pile]),
        step: {
          kind: 'assign',
          line: num(p.line),
          name,
          value,
          was: found ? found.value : null,
        },
      };
    }

    if (event.type === 'call') {
      const lane = num(p.lane);
      const out = num(p.out);
      return {
        ...scene,
        outer: scene.outer.map((o) => ({ ...o })),
        piles: scene.piles.map((pile, k) => (k === lane ? [...pile, out] : [...pile])),
        step: {
          kind: 'call',
          line: num(p.line),
          lane,
          args: nums(p.args),
          out,
          reads: reads(p.reads),
        },
      };
    }

    return scene;
  },
};
