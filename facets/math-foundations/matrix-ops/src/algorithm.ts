/**
 * matrix-ops — 두 변환을 잇따라 거는 것과 곱 YX 로 한 번에 뛰는 것.
 *
 * 손잡이 "먼저"(X) · "다음"(Y) 가 변환 여섯 가운데 하나씩 고른다. 점 넷이 X 로 한 번, Y 로 또 한 번
 * 뛰고, 처음 자리에서 곱 YX 로 한 번에 뛰어 두 번 간 자리와 견준다. 끝으로 차례를 바꾼 XY 로 뛴
 * 유령 점이 YX 의 자리와 같은 곳인지 센다.
 *
 * 규약 (공통 안내문 · 사양 그대로):
 * - 행렬은 행 차례 평평한 배열 [a, b, c, d] = [a b ; c d]. 점 p 가 가는 자리 = A p = (a·x + b·y, c·x + d·y)
 * - "X 먼저 · Y 다음" = YX. 점에는 Y (X p). 차례를 바꾼 곱 = XY
 * - 곱은 칸마다 행 · 열 맞물림 (IR 의 `compose` 와 같은 식 · 같은 차례)
 * - det = ad − bc
 * - 모든 수가 정수라 같음은 `===` (허용 오차 없음)
 * - 같은 곳 = XY 로 뛴 점 가운데 YX 로 뛴 자리와 좌표가 같은 점 수
 * - 제자리 = 두 번 뛴 뒤 처음 자리에 선 점 수
 * - 자리 수 = 점 넷이 선 서로 다른 좌표의 수 (자리의 차례는 점 차례로 처음 나온 차례)
 * - 축 범위 `axisMax` = 사다리의 모든 짝 · 모든 뜀에서 가장 큰 |좌표| (판이 바뀌어도 틀이 흔들리지 않게)
 *
 * 이벤트 (payload 의 점은 [x, y] 정수 쌍, 자리는 { x, y, n } — n 은 그 자리에 선 점 수):
 * - `round`         silent · 판 머리 (걸음 0). { firstMap, secondMap, motionMs, axisMax, total,
 *                   xCard, yCard, home, afterX, afterY, viaYX, viaXY, yx, xy, detYX,
 *                   spotsAfterX, spotsAfterY, homeCount, matchCount, sameCount }
 *                   card = { mapId, symbol, m, det }
 * - `jump-first`    걸음 1. { points: X p 넷, spots, spotCount, total }
 * - `jump-second`   걸음 2. { points: Y (X p) 넷, spots, spotCount, homeCount, total }
 * - `compose`       걸음 3. { yx, detY, detX, detYX }
 * - `jump-once`     걸음 4. { points: (YX) p 넷, matchCount, total } — 자리는 걸음 2 와 같아 싣지 않는다
 * - `jump-swapped`  걸음 5. { xy, points: (XY) p 넷, spots, sameCount, total }
 * - `phase`         silent. { phase }
 *
 * phase 어휘 (걸음 발신 앞에): `jump-x` · `jump-y` · `product` · `jump-yx` · `jump-xy`. 걸음 0 은 phase 없음.
 *
 * 계기 (지금 값을 쥐고 차이만 보낸다 · 판 머리에서 0 으로):
 * - `same-spot`      걸음 5 — XY 로 뛴 점 가운데 YX 와 같은 곳
 * - `back-home`      걸음 2 — 두 번 뛴 뒤 처음 자리에 선 점
 * - `landing-spots`  걸음 2 — 점 넷이 선 서로 다른 자리
 *
 * 재생: 판 머리 뒤와 걸음 1..4 뒤에 sleep(stepMs + motionMs), 걸음 5 뒤는 입력 대기.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MatrixOpsMap = { id: string; m: number[] };

export type MatrixOpsData = {
  type: 'matrix-ops';
  stepMs: number;
  motionMs: number;
  maps: MatrixOpsMap[];
  symbols: string[];
  points: number[][];
  mapLadder: number[];
  firstMap: number;
  secondMap: number;
};

export type Point = [number, number];
export type Spot = { x: number; y: number; n: number };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다 */
export function readMatrixOpsData(raw: unknown): MatrixOpsData {
  if (typeof raw !== 'object' || raw === null) throw new Error('matrix-ops: 데이터가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'matrix-ops') throw new Error('matrix-ops: type 이 matrix-ops 가 아니다');
  if (typeof d.stepMs !== 'number' || d.stepMs <= 0) throw new Error('matrix-ops: stepMs 가 없다');
  if (typeof d.motionMs !== 'number' || d.motionMs < 0) throw new Error('matrix-ops: motionMs 가 없다');
  if (!Array.isArray(d.maps) || d.maps.length === 0) throw new Error('matrix-ops: maps 가 없다');
  const maps: MatrixOpsMap[] = d.maps.map((raw2, i) => {
    if (typeof raw2 !== 'object' || raw2 === null) throw new Error(`matrix-ops: maps[${i}] 가 객체가 아니다`);
    const e = raw2 as Record<string, unknown>;
    if (typeof e.id !== 'string') throw new Error(`matrix-ops: maps[${i}].id 가 없다`);
    if (!Array.isArray(e.m) || e.m.length !== 4 || !e.m.every(isInt)) {
      throw new Error(`matrix-ops: maps[${i}].m 은 정수 칸 넷이어야 한다`);
    }
    return { id: e.id, m: e.m.slice() as number[] };
  });
  if (!Array.isArray(d.symbols) || d.symbols.length !== maps.length || !d.symbols.every((s) => typeof s === 'string')) {
    throw new Error('matrix-ops: symbols 는 maps 와 같은 길이의 문자열이어야 한다');
  }
  if (!Array.isArray(d.points) || d.points.length === 0) throw new Error('matrix-ops: points 가 없다');
  const points = d.points.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(isInt)) throw new Error(`matrix-ops: points[${i}] 는 정수 쌍이어야 한다`);
    return [p[0], p[1]] as number[];
  });
  if (!Array.isArray(d.mapLadder) || d.mapLadder.length !== maps.length) throw new Error('matrix-ops: mapLadder 가 maps 와 맞지 않는다');
  d.mapLadder.forEach((v, i) => {
    if (v !== i) throw new Error(`matrix-ops: mapLadder[${i}] 는 ${i} 여야 한다`);
  });
  const ladder = d.mapLadder as number[];
  if (!isInt(d.firstMap) || !ladder.includes(d.firstMap)) throw new Error('matrix-ops: firstMap 이 사다리 밖이다');
  if (!isInt(d.secondMap) || !ladder.includes(d.secondMap)) throw new Error('matrix-ops: secondMap 이 사다리 밖이다');
  return {
    type: 'matrix-ops',
    stepMs: d.stepMs,
    motionMs: d.motionMs,
    maps,
    symbols: d.symbols.slice() as string[],
    points,
    mapLadder: ladder.slice(),
    firstMap: d.firstMap,
    secondMap: d.secondMap,
  };
}

/** 정수 곱에서 생기는 −0 을 0 으로 (payload · 표 대조에 −0 이 새지 않게) */
const z = (v: number): number => v + 0;

/** dst = y · x — 칸마다 행 · 열 맞물림 (IR `compose` 와 같은 식 · 같은 차례) */
export function compose(y: readonly number[], x: readonly number[]): number[] {
  return [
    z(y[0]! * x[0]! + y[1]! * x[2]!),
    z(y[0]! * x[1]! + y[1]! * x[3]!),
    z(y[2]! * x[0]! + y[3]! * x[2]!),
    z(y[2]! * x[1]! + y[3]! * x[3]!),
  ];
}

export function det(m: readonly number[]): number {
  return z(m[0]! * m[3]! - m[1]! * m[2]!);
}

function apply(m: readonly number[], p: readonly number[]): Point {
  return [z(m[0]! * p[0]! + m[1]! * p[1]!), z(m[2]! * p[0]! + m[3]! * p[1]!)];
}

function spotsOf(points: readonly Point[]): Spot[] {
  const spots: Spot[] = [];
  for (const [x, y] of points) {
    const hit = spots.find((s) => s.x === x && s.y === y);
    if (hit) hit.n += 1;
    else spots.push({ x, y, n: 1 });
  }
  return spots;
}

function countSame(a: readonly Point[], b: readonly Point[]): number {
  if (a.length !== b.length) throw new Error('matrix-ops: 견줄 점 수가 다르다');
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i]![0] === b[i]![0] && a[i]![1] === b[i]![1]) n += 1;
  return n;
}

export type MatrixOpsRound = {
  firstMap: number;
  secondMap: number;
  x: number[];
  y: number[];
  detX: number;
  detY: number;
  home: Point[];
  afterX: Point[];
  afterY: Point[];
  yx: number[];
  detYX: number;
  viaYX: Point[];
  matchCount: number;
  xy: number[];
  viaXY: Point[];
  sameCount: number;
  homeCount: number;
  spotsAfterX: Spot[];
  spotsAfterY: Spot[];
  spotsViaYX: Spot[];
  spotsViaXY: Spot[];
};

/** 한 판의 모든 수 — 알고리즘이 화면에 내는 값 전부가 여기서 나온다 */
export function computeRound(data: MatrixOpsData, firstMap: number, secondMap: number): MatrixOpsRound {
  const xMap = data.maps[firstMap];
  const yMap = data.maps[secondMap];
  if (!xMap || !yMap) throw new Error(`matrix-ops: 없는 변환 (${firstMap}, ${secondMap})`);
  const x = xMap.m;
  const y = yMap.m;
  const home: Point[] = data.points.map((p) => [p[0]!, p[1]!]);
  const afterX = home.map((p) => apply(x, p));
  const afterY = afterX.map((p) => apply(y, p));
  const yx = compose(y, x);
  const viaYX = home.map((p) => apply(yx, p));
  const matchCount = countSame(afterY, viaYX);
  if (matchCount !== home.length) {
    throw new Error(`matrix-ops: 두 번 뛴 자리와 YX 로 뛴 자리가 다르다 (${firstMap}, ${secondMap})`);
  }
  const xy = compose(x, y);
  const viaXY = home.map((p) => apply(xy, p));
  return {
    firstMap,
    secondMap,
    x: x.slice(),
    y: y.slice(),
    detX: det(x),
    detY: det(y),
    home,
    afterX,
    afterY,
    yx,
    detYX: det(yx),
    viaYX,
    matchCount,
    xy,
    viaXY,
    sameCount: countSame(viaXY, viaYX),
    homeCount: countSame(afterY, home),
    spotsAfterX: spotsOf(afterX),
    spotsAfterY: spotsOf(afterY),
    spotsViaYX: spotsOf(viaYX),
    spotsViaXY: spotsOf(viaXY),
  };
}

/** 사다리의 모든 짝 · 모든 뜀에서 가장 큰 |좌표| — 무대 틀의 잣대 */
export function axisMaxOf(data: MatrixOpsData): number {
  let top = 0;
  const see = (pts: readonly Point[]) => {
    for (const [a, b] of pts) top = Math.max(top, Math.abs(a), Math.abs(b));
  };
  for (const f of data.mapLadder) {
    for (const s of data.mapLadder) {
      const r = computeRound(data, f, s);
      see(r.home);
      see(r.afterX);
      see(r.afterY);
      see(r.viaXY);
    }
  }
  return top;
}

type MetricName = 'same-spot' | 'back-home' | 'landing-spots';

export async function matrixOpsAlgorithm(ctx: FacetContext<MatrixOpsData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MatrixOpsData>;
  const data = readMatrixOpsData(ctx.data);
  const axisMax = axisMaxOf(data);
  const pause = data.stepMs + data.motionMs;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 보이는 값을 쥐고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다.
  const shown: Record<MetricName, number> = { 'same-spot': 0, 'back-home': 0, 'landing-spots': 0 };
  const sent: Record<MetricName, boolean> = { 'same-spot': false, 'back-home': false, 'landing-spots': false };
  const setMetric = (name: MetricName, value: number) => {
    const delta = value - shown[name];
    if (delta !== 0 || !sent[name]) ctx.metric(name, delta);
    shown[name] = value;
    sent[name] = true;
  };

  const card = (index: number) => {
    const map = data.maps[index];
    const symbol = data.symbols[index];
    if (!map || symbol === undefined) throw new Error(`matrix-ops: 없는 변환 ${index}`);
    return { mapId: map.id, symbol, m: map.m.slice(), det: det(map.m) };
  };

  const playRound = async (firstMap: number, secondMap: number): Promise<boolean> => {
    const r = computeRound(data, firstMap, secondMap);
    const total = r.home.length;
    await ctx.emit({
      type: 'round',
      silent: true,
      payload: {
        firstMap,
        secondMap,
        motionMs: data.motionMs,
        axisMax,
        total,
        xCard: card(firstMap),
        yCard: card(secondMap),
        home: r.home,
        afterX: r.afterX,
        afterY: r.afterY,
        viaYX: r.viaYX,
        viaXY: r.viaXY,
        yx: r.yx,
        xy: r.xy,
        detYX: r.detYX,
        spotsAfterX: r.spotsAfterX,
        spotsAfterY: r.spotsAfterY,
        homeCount: r.homeCount,
        matchCount: r.matchCount,
        sameCount: r.sameCount,
      },
    });
    setMetric('same-spot', 0);
    setMetric('back-home', 0);
    setMetric('landing-spots', 0);
    if (!(await rctx.sleep(pause))) return false;

    await phase('jump-x');
    await ctx.emit({
      type: 'jump-first',
      payload: { points: r.afterX, spots: r.spotsAfterX, spotCount: r.spotsAfterX.length, total },
    });
    if (!(await rctx.sleep(pause))) return false;

    await phase('jump-y');
    await ctx.emit({
      type: 'jump-second',
      payload: {
        points: r.afterY,
        spots: r.spotsAfterY,
        spotCount: r.spotsAfterY.length,
        homeCount: r.homeCount,
        total,
      },
    });
    setMetric('back-home', r.homeCount);
    setMetric('landing-spots', r.spotsAfterY.length);
    if (!(await rctx.sleep(pause))) return false;

    await phase('product');
    await ctx.emit({ type: 'compose', payload: { yx: r.yx, detY: r.detY, detX: r.detX, detYX: r.detYX } });
    if (!(await rctx.sleep(pause))) return false;

    await phase('jump-yx');
    await ctx.emit({
      type: 'jump-once',
      payload: { points: r.viaYX, matchCount: r.matchCount, total },
    });
    if (!(await rctx.sleep(pause))) return false;

    await phase('jump-xy');
    await ctx.emit({
      type: 'jump-swapped',
      payload: { xy: r.xy, points: r.viaXY, spots: r.spotsViaXY, sameCount: r.sameCount, total },
    });
    setMetric('same-spot', r.sameCount);
    return true;
  };

  let firstMap = data.firstMap;
  let secondMap = data.secondMap;
  try {
    while (!ctx.cancelled) {
      if (ctx.cancelled) return;
      if (!(await playRound(firstMap, secondMap))) return;
      // 한 판이 끝나면 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘리고, 제 것인데 값이 어긋나면 던진다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'firstMap' && input.type !== 'secondMap') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !data.mapLadder.includes(value)) {
          throw new Error(`matrix-ops: ${input.type} 값이 사다리 밖이다 (${String(value)})`);
        }
        if (input.type === 'firstMap') firstMap = value;
        else secondMap = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
