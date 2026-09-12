/**
 * coarseThenFine — 위층에서 내려오기.
 *
 * 같은 평면이 세 겹으로 겹쳐 있다. 위층일수록 점이 적고(성기고) 이웃도 적다.
 * 성긴 층에서 크게 건너뛰어 자리를 잡은 뒤, **그 자리를 아래층에 물려주고**
 * 내려가 더 촘촘히 좁힌다. 한 층에서 걷는 일 자체는 다른 조각의 몫이고,
 * 여기서 보이는 것은 층이 여럿이라는 것 · 위가 성기다는 것 · 자리가 물려진다는
 * 것 셋이다.
 *
 * ── 걷는 법
 *
 *   층마다:
 *     들어간 점에서 이웃들을 본다
 *       더 가까운 것이 있으면 가장 가까운 쪽으로 옮기고 되풀이
 *       없으면 그 층에서 멈춘다
 *     멈춘 자리를 다음 층의 진입점으로 물려준다
 *
 * ── 데이터 (initialData) — 1차 데이터만 선언에 둔다
 *
 *   points   점의 이름과 평면 좌표 (정수)
 *   query    찾는 자리
 *   layers   위층부터. 층마다 구성원 목록과 이웃 수(degree)
 *   stepMs   걸음 사이의 정지 시간
 *
 * 파생값은 전부 여기서 셈한다 — 거리 · 층별 이웃 목록 · 본 점 수 · 단층 견줌.
 * 이웃은 그 층 안에서 가장 가까운 것부터 degree 개이며, 거리가 같으면 구성원
 * 목록에 먼저 적힌 쪽이 이긴다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. 표준 어휘를 재해석하지 않는다)
 *
 *   enter      { layer: string; node: string; seen: number }
 *              가장 성긴 층의 진입점에 선다. seen 은 그때까지 거리를 잰 점의 수.
 *   hop        { layer: string; from: string; to: string;
 *                cands: string[]; fresh: string[]; seen: number }
 *              이웃(cands)을 보고 더 가까운 쪽으로 옮긴다. fresh 는 이번에
 *              처음 거리를 잰 점들.
 *   hand-down  { from: string; to: string; node: string;
 *                cands: string[]; fresh: string[]; seen: number }
 *              이 층에는 더 가까운 이웃이 없다. 자리를 아래층에 물려준다.
 *   stop       { layer: string; node: string;
 *                cands: string[]; fresh: string[]; seen: number }
 *              맨 아래층에서도 더 나은 이웃이 없다 — 멈추는 조건.
 *   found      { node: string; seen: number; total: number }
 *              결과와 본 점 수.
 *   flat       { layer: string; path: string[]; seen: string[]; total: number }
 *              같은 진입점에서 맨 아래층 한 층만 쓰면 어디를 거쳐 몇을 보는가.
 *   rewind     {}
 *              자동 재생이 끝난 뒤 한 걸음씩 다시 볼 때 화면을 처음으로 되돌린다.
 *
 * silent 이벤트는 하나도 없다 — 전부 화면이 바뀌는 걸음의 경계다.
 * `ctx.metric` 은 부르지 않는다 (조각은 셀 것이 없다).
 */

import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core';

export type CoarseThenFinePoint = {
  id: string;
  x: number;
  y: number;
};

/** 한 층. 위층일수록 구성원이 적고 이웃 수도 적다. */
export type CoarseThenFineLayer = {
  id: string;
  members: string[];
  degree: number;
};

export type CoarseThenFineData = {
  type: 'coarse-then-fine';
  points: CoarseThenFinePoint[];
  query: { x: number; y: number };
  /** 위층부터 아래층 순서. 마지막이 전부를 담은 바닥 층이다. */
  layers: CoarseThenFineLayer[];
  stepMs: number;
};

type PointMap = ReadonlyMap<string, CoarseThenFinePoint>;

function toMap(points: readonly CoarseThenFinePoint[]): PointMap {
  return new Map(points.map((p) => [p.id, p]));
}

function gap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 한 층 안에서 가장 가까운 것부터 degree 개.
 *
 * 거리가 같으면 구성원 목록의 순서가 가른다 — 부동소수 비교가 흔들리지 않도록
 * 매번 같은 답이 나와야 한다.
 */
export function neighborsOf(
  points: PointMap,
  layer: CoarseThenFineLayer,
  node: string,
): string[] {
  const self = points.get(node);
  if (!self) return [];
  const rank = new Map(layer.members.map((id, i) => [id, i]));
  const reach = (id: string): number => {
    const p = points.get(id);
    return p ? gap(self, p) : Number.POSITIVE_INFINITY;
  };
  return layer.members
    .filter((id) => id !== node)
    .sort((a, b) => reach(a) - reach(b) || (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    .slice(0, Math.max(0, layer.degree));
}

/**
 * 한 층만 쓰는 견줌.
 *
 * 층을 쌓는 것이 실제로 무엇을 아꼈는지는 **같은 진입점**에서 같은 층을 걸어
 * 봐야 나온다. 진입점이 다르면 본 점 수도 달라지므로 층수 말고는 다 같게 둔다.
 */
export function flatSearch(
  data: CoarseThenFineData,
  entry: string,
): { result: string; path: string[]; seen: string[] } {
  const points = toMap(data.points);
  const layer = data.layers[data.layers.length - 1];
  const toQuery = (id: string): number => {
    const p = points.get(id);
    return p ? gap(p, data.query) : Number.POSITIVE_INFINITY;
  };
  if (!layer) return { result: entry, path: [entry], seen: [entry] };

  const seen: string[] = [entry];
  const mark = new Set<string>(seen);
  const path: string[] = [entry];
  let cur = entry;
  for (;;) {
    let best = cur;
    let bestReach = toQuery(cur);
    for (const id of neighborsOf(points, layer, cur)) {
      if (!mark.has(id)) {
        mark.add(id);
        seen.push(id);
      }
      const reach = toQuery(id);
      if (reach < bestReach) {
        bestReach = reach;
        best = id;
      }
    }
    if (best === cur) return { result: cur, path, seen };
    cur = best;
    path.push(cur);
  }
}

export async function coarseThenFine(ctx: FacetContext<CoarseThenFineData>): Promise<void> {
  const rx = ctx as ReactiveContext<CoarseThenFineData>;
  const data = rx.data;
  const layers = data.layers;
  const top = layers[0];
  const entry = top?.members[0];
  if (!top || entry === undefined) return;

  const points = toMap(data.points);
  const toQuery = (id: string): number => {
    const p = points.get(id);
    return p ? gap(p, data.query) : Number.POSITIVE_INFINITY;
  };

  /** 한 걸음씩 보는 중인가. 자동 재생을 마친 뒤 `advance` 를 받으면 켜진다. */
  let manual = false;
  /** 이 회차의 첫 걸음인가. 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). */
  let opening = true;

  /** 걸음 사이의 문. `advance` 만 문을 연다. */
  const gate = async (): Promise<boolean> => {
    for (;;) {
      if (rx.cancelled) return false;
      try {
        const input = await rx.waitForInput();
        if (rx.cancelled) return false;
        if (input.type !== 'advance') continue;
        return true;
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!rx.cancelled) throw err;
        return false;
      }
    }
  };

  const beat = async (event: FacetRuntimeEvent): Promise<boolean> => {
    if (manual && !opening && !(await gate())) return false;
    opening = false;
    await rx.emit(event);
    if (rx.cancelled) return false;
    if (!manual && !(await rx.sleep(data.stepMs))) return false;
    return true;
  };

  /** 걸음 전부. 끝까지 갔으면 true, 도중에 접혔으면 false. */
  const play = async (): Promise<boolean> => {
    const seen = new Set<string>([entry]);
    let cur = entry;

    for (let li = 0; li < layers.length; li += 1) {
      const layer = layers[li];
      if (!layer) continue;
      const below = layers[li + 1];

      if (li === 0) {
        if (!(await beat({
          type: 'enter',
          target: `node:${cur}`,
          payload: { layer: layer.id, node: cur, seen: seen.size },
        }))) return false;
      }

      for (;;) {
        const cands = neighborsOf(points, layer, cur);
        const fresh = cands.filter((id) => !seen.has(id));
        for (const id of cands) seen.add(id);

        let best = cur;
        let bestReach = toQuery(cur);
        for (const id of cands) {
          const reach = toQuery(id);
          if (reach < bestReach) {
            bestReach = reach;
            best = id;
          }
        }

        if (best !== cur) {
          const from = cur;
          cur = best;
          if (!(await beat({
            type: 'hop',
            target: `node:${cur}`,
            payload: { layer: layer.id, from, to: cur, cands, fresh, seen: seen.size },
          }))) return false;
          continue;
        }

        if (below) {
          if (!(await beat({
            type: 'hand-down',
            target: `node:${cur}`,
            payload: { from: layer.id, to: below.id, node: cur, cands, fresh, seen: seen.size },
          }))) return false;
        } else if (!(await beat({
          type: 'stop',
          target: `node:${cur}`,
          payload: { layer: layer.id, node: cur, cands, fresh, seen: seen.size },
        }))) return false;
        break;
      }
    }

    if (!(await beat({
      type: 'found',
      target: `node:${cur}`,
      payload: { node: cur, seen: seen.size, total: data.points.length },
    }))) return false;

    const flat = flatSearch(data, entry);
    const bottom = layers[layers.length - 1];
    return beat({
      type: 'flat',
      target: `node:${flat.result}`,
      payload: {
        layer: bottom ? bottom.id : '',
        path: flat.path,
        seen: flat.seen,
        total: data.points.length,
      },
    });
  };

  for (;;) {
    if (!(await play())) return;
    // 자동 재생이 끝났다. 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다.
    if (!(await gate())) return;
    manual = true;
    opening = true;
    await rx.emit({ type: 'rewind' });
    if (rx.cancelled) return;
  }
}
