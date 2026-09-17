/**
 * 전역과 지역 구조 조각 — 같은 자료를 두 가지로 펴서 나란히 놓고 견준다.
 *
 * 무대는 산점도가 아니라 **자(직선) 둘과 그 위에 놓인 자리들**이다. 위 자는 큰
 * 거리를 지키는 방식(가장 넓게 퍼진 방향에 내려 찍기), 아래 자는 이웃만 지키는
 * 방식(무리 안의 차례만 지키고 무리끼리는 같은 간격)이다. 같은 자리끼리 이으면
 * 어긋남이 드러난다.
 *
 * ── 식별자
 *   group:<name>   무리 (A · B · C)
 *   point:<id>     자리 하나
 *
 * ── 여기가 셈하는 것은 **두 자의 자리뿐이다.**
 *   위 자   12 점의 첫 주성분 좌표. 축은 공분산 2x2 의 큰 고윳값 쪽 고유벡터.
 *   아래 자 무리마다 제 무리의 주축으로 차례를 정하고, 그 차례대로 `clusterSpan`
 *           폭에 고르게 앉힌다. 무리 가운데는 `clusterSpan + clusterGap` 간격.
 *
 *   앵커·몫·사이·비는 싣지 않는다. 전부 그 자리들에서 곧바로 나오는 값이라
 *   장면이 셈한다 (`scene.ts`) — 실어 보내면 화면의 자와 글자의 수가 다른 출처가
 *   된다. 비교를 언제나 **몫**으로 하는 까닭(두 자의 단위가 서로 다르다)도 거기
 *   적혀 있다.
 *
 * ── 발신 이벤트 (전부 facet 고유. silent 는 없다)
 *
 *   rulers        { global: Flattening; local: Flattening }
 *                 두 자의 자리. **이 조각의 알고리즘이 내놓는 것**이라 여기서만
 *                 싣는다. 아직 화면에는 앵커만 내려온다.
 *   spread-global 위 자에 12 자리가 펴진다.
 *   spread-local  아래 자에 같은 12 자리가 펴진다.
 *   tie           같은 자리끼리 잇는다.
 *   inside        무리 하나가 차지하는 몫을 본다.
 *   measure-gap   이웃한 두 무리 사이를 잰다. 올 때마다 한 쌍씩 나아간다.
 *   ratio         마지막 사이 / 첫 사이.
 *   verdict       아래 자에서 무리 사이 거리를 읽으면 안 된다는 판정.
 *   done          닫는 말.
 *   rewind        되감기. 화면을 비우고 처음부터 다시 밟는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GlobalAndLocalPointSpec = { id: string; x: number; y: number };

export type GlobalAndLocalGroupSpec = {
  name: string;
  points: GlobalAndLocalPointSpec[];
};

export type GlobalAndLocalData = {
  type: string;
  groups: GlobalAndLocalGroupSpec[];
  /** 이웃만 지키는 방식의 자리 잡는 법. 무리 폭과 무리 사이 틈. */
  local: { clusterSpan: number; clusterGap: number };
  stepMs: number;
};

type PlacedPoint = { id: string; group: string; value: number };
type PlacedCentroid = { group: string; value: number };

/** 한 자의 자리 전부. */
type Flattening = { points: PlacedPoint[]; centroids: PlacedCentroid[] };

/** 두 자의 자리. 이 조각이 내놓는 것의 전부다. */
type Spread = { global: Flattening; local: Flattening };

type Axis = { mx: number; my: number; ux: number; uy: number };

/**
 * 점 무리의 주축 — 공분산 2x2 의 큰 고윳값에 딸린 고유벡터.
 *
 * 방향은 둘 중 하나뿐이라 부호를 못박아 둔다. 안 그러면 같은 자료가 재생마다
 * 좌우로 뒤집혀 나온다.
 */
function principalAxis(points: readonly GlobalAndLocalPointSpec[]): Axis {
  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  sxx /= n;
  sxy /= n;
  syy /= n;

  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lead = trace / 2 + disc;

  let ux: number;
  let uy: number;
  if (Math.abs(sxy) > 1e-12) {
    ux = lead - syy;
    uy = sxy;
  } else if (sxx >= syy) {
    ux = 1;
    uy = 0;
  } else {
    ux = 0;
    uy = 1;
  }
  const norm = Math.hypot(ux, uy) || 1;
  ux /= norm;
  uy /= norm;
  if (ux < 0 || (ux === 0 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  return { mx, my, ux, uy };
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** 두 자의 자리를 좌표에서 통째로 셈한다. ctx 를 받지 않는 순수 함수다 (C8). */
function computeSpread(data: GlobalAndLocalData): Spread {
  const groups = data.groups;
  if (groups.length < 2) {
    throw new Error(`전역과 지역 조각: 무리가 둘 이상이어야 한다 — 받은 무리 수 ${groups.length}`);
  }
  for (const g of groups) {
    if (g.points.length === 0) {
      throw new Error(`전역과 지역 조각: 자리가 없는 무리 — ${g.name}`);
    }
  }

  // ── 위 자: 12 점 전체의 첫 주성분에 내려 찍는다.
  const all = groups.flatMap((g) => g.points);
  const axis = principalAxis(all);
  const raw = (p: GlobalAndLocalPointSpec): number =>
    (p.x - axis.mx) * axis.ux + (p.y - axis.my) * axis.uy;
  const first = mean(groups[0]!.points.map(raw));
  const last = mean(groups[groups.length - 1]!.points.map(raw));
  const orient = first > last ? -1 : 1;
  const globalOf = (p: GlobalAndLocalPointSpec): number => orient * raw(p);

  const globalPoints: PlacedPoint[] = [];
  const globalCentroids: PlacedCentroid[] = [];
  for (const g of groups) {
    for (const p of g.points) globalPoints.push({ id: p.id, group: g.name, value: globalOf(p) });
    globalCentroids.push({ group: g.name, value: mean(g.points.map(globalOf)) });
  }

  // ── 아래 자: 무리 안의 차례만 제 무리의 주축에서 얻고, 무리끼리는 같은 간격.
  const width = data.local.clusterSpan;
  const gap = data.local.clusterGap;
  const localPoints: PlacedPoint[] = [];
  const localCentroids: PlacedCentroid[] = [];
  groups.forEach((g, gi) => {
    const centre = gi * (width + gap);
    const own = principalAxis(g.points);
    const ordered = g.points
      .map((p) => ({ p, t: (p.x - own.mx) * own.ux + (p.y - own.my) * own.uy }))
      .sort((a, b) => a.t - b.t || a.p.id.localeCompare(b.p.id));
    const k = ordered.length;
    const step = k > 1 ? width / (k - 1) : 0;
    const base = k > 1 ? centre - width / 2 : centre;
    ordered.forEach((o, j) => {
      localPoints.push({ id: o.p.id, group: g.name, value: base + step * j });
    });
    localCentroids.push({ group: g.name, value: centre });
  });

  // ── 앵커가 설 수 있는가. 두 자에서 첫 무리와 마지막 무리의 가운데를 같은 자리에
  //    맞추므로, 그 둘이 겹치면 자를 세울 길이 없다.
  const gSpan = globalCentroids[globalCentroids.length - 1]!.value - globalCentroids[0]!.value;
  const lSpan = localCentroids[localCentroids.length - 1]!.value - localCentroids[0]!.value;
  if (Math.abs(gSpan) < 1e-9 || Math.abs(lSpan) < 1e-9) {
    throw new Error('전역과 지역 조각: 첫 무리와 마지막 무리의 가운데가 겹쳐 앵커를 세울 수 없다');
  }

  return {
    global: { points: globalPoints, centroids: globalCentroids },
    local: { points: localPoints, centroids: localCentroids },
  };
}

export async function globalAndLocalAlgorithm(ctx: FacetContext<GlobalAndLocalData>): Promise<void> {
  const rc = ctx as ReactiveContext<GlobalAndLocalData>;
  const stepMs = ctx.data.stepMs;
  const spread = computeSpread(ctx.data);
  /** 이웃한 무리의 쌍 수. 사이를 재는 걸음이 그만큼 선다. */
  const pairs = ctx.data.groups.length - 1;

  /** 자동 재생이 한 번 끝나면 그 뒤로는 한 걸음씩 짚는다. */
  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  };

  /**
   * 한 바퀴. 첫 emit 은 문 앞에 두지 않는다 — 문은 걸음 *사이*의 것이라
   * 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). 되감기 직후에도 같은
   * 이유로 첫 걸음이 곧바로 보인다.
   */
  const pass = async (): Promise<boolean> => {
    await ctx.emit({
      type: 'rulers',
      payload: { global: spread.global, local: spread.local },
    });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'spread-global' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'spread-local' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'tie' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'inside' });

    for (let pair = 0; pair < pairs; pair += 1) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'measure-gap' });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'ratio' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'verdict' });

    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await pass())) return;
      if (!(await gate())) return;
      await ctx.emit({ type: 'done' });

      manual = true;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'advance') break;
      }
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
