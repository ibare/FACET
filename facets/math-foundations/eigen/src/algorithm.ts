/**
 * eigen — 같은 행렬을 거듭 곱할 때 방향이 큰 고유값의 방향으로 쏠리는 빠르기.
 *
 * 두 고유값 λ₁(고정) · λ₂(손잡이) 와 두 고유 방향에서 대칭 정수 행렬
 * A = [(λ₁+λ₂)/2 (λ₁−λ₂)/2 ; (λ₁−λ₂)/2 (λ₁+λ₂)/2] 를 짓고, 출발 방향(손잡이)을 길이 1 로 맞춘 v 에
 * A 를 곱 10 번 거듭 곱한다. 곱마다 w = A v · 늘어난 배수 |w| · 새 v = w / |w| (길이로 정규화) ·
 * 45° 줄(λ₁ 의 고유 방향)과의 틈 · tan 비 · 옆(외적 부호) · 1° 안 여부를 셈한다.
 *
 * 셈의 식과 차례는 IR(`irs.ts` 의 stepsToAlign)과 같다 — 1° 판정이 문턱과 견주기 때문이다:
 *   n = sqrt(dx*dx + dy*dy); ex = dx / n; ey = dy / n
 *   sn = sqrt(sx*sx + sy*sy); vx = sx / sn; vy = sy / sn
 *   곱 k 마다 cross = ex*vy − ey*vx → 판정(|cross| < tol) → (k < products 이면)
 *   wx = a[0]*vx + a[1]*vy; wy = a[2]*vx + a[3]*vy; norm = sqrt(wx*wx + wy*wy); vx = wx / norm; vy = wy / norm
 * 문턱 tol = Math.sin(Math.PI / 180) — |v| = 1 이라 sin(틈) = |cross|.
 *
 * 규약
 *   - 틈 = atan2(|cross|, |dot|) 를 도로 (화살표 방향과 무관, [0°, 90°])
 *   - tan = |cross| ÷ |dot|. tan 비 = tan_k ÷ tan_{k−1}. 출발이 고유 방향 줄 위에 있으면
 *     (정수 외적 또는 정수 내적이 0) 틈이 0° 이거나 90° 라 비를 두지 않는다 (null)
 *   - 옆 = cross 의 부호 (+1 · 0 · −1). 넘나듦 = 앞 곱과 옆이 바뀐 곱 (둘 다 0 이 아닐 때만)
 *   - 1° 안에 든 곱 = 처음 |cross| < tol 인 곱 번호 (0..products), 없으면 −1. 동률 판정은 없다
 *   - v 의 각 = atan2(vy, vx) 를 도로, [0°, 360°)
 *
 * 이벤트
 *   board   (silent) 판 머리 — { a: number[4], big, small, ratioExpected, sx, sy, vx, vy,
 *                    showRatio: boolean, first: number, products: number, planeMax: number,
 *                    logMin: number, logMax: number, thresholdLog: number, motionMs: number }
 *                    planeMax = 사다리 안 |λ| 의 가장 큰 값 (대칭이라 |w| ≤ planeMax)
 *                    logMin · logMax = 사다리 전 조합의 log10(tan) 범위를 정수로 넓힌 것 (축 범위)
 *                    thresholdLog = log10(tan 1°)
 *   origin  걸음 0 — Row
 *   product 걸음 1..products — Row & { wx, wy, stretch, tanRatio: number | null, crossed: boolean }
 *   Row = { k, vx, vy, angle, gap, tanLog: number | null, side: −1 | 0 | 1, inside: boolean,
 *           alignedNow: boolean, first: number, last: boolean }
 *   phase   (silent) { phase } — 걸음 이벤트 바로 앞에
 *
 * phase 어휘 (irs.ts 와 같다)
 *   start   걸음 0, 출발에서 아직 1° 밖
 *   aligned 1° 안에 처음 든 걸음 (걸음 0 일 수도 있다)
 *   iterate 곱 1..products−1 중 나머지
 *   done    마지막 곱
 *
 * 계기
 *   products          곱마다 +1
 *   crossings         곱 뒤 v 가 45° 줄의 반대 옆에 서면 +1
 *   inside-one-degree 곱 뒤 틈이 1° 안이면 +1
 *   판 머리에서 0 으로 되돌린다 (지금 값을 들고 차이만 보낸다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EigenData = {
  type: 'eigen';
  stepMs: number;
  motionMs: number;
  bigEig: number;
  bigDir: number[];
  smallDir: number[];
  starts: number[][];
  products: number;
  smallEigLadder: number[];
  smallEig: number;
  startLadder: number[];
  startDir: number;
};

export type EigenRow = {
  k: number;
  vx: number;
  vy: number;
  angle: number;
  gap: number;
  tanLog: number | null;
  side: -1 | 0 | 1;
  inside: boolean;
  wx: number | null;
  wy: number | null;
  stretch: number | null;
  tanRatio: number | null;
  crossed: boolean;
};

export type EigenBoard = {
  a: number[];
  small: number;
  sx: number;
  sy: number;
  showRatio: boolean;
  first: number;
  rows: EigenRow[];
};

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

function intPair(x: unknown, what: string): number[] {
  if (!Array.isArray(x) || x.length !== 2 || !isInt(x[0]) || !isInt(x[1])) {
    throw new Error(`eigen: ${what} 는 정수 둘의 배열이어야 한다`);
  }
  return [x[0], x[1]];
}

function intList(x: unknown, what: string): number[] {
  if (!Array.isArray(x) || x.length === 0 || !x.every(isInt)) {
    throw new Error(`eigen: ${what} 는 정수 배열이어야 한다`);
  }
  return x.slice();
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다 */
export function narrowEigenData(raw: unknown): EigenData {
  if (typeof raw !== 'object' || raw === null) throw new Error('eigen: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'eigen') throw new Error('eigen: data.type 이 eigen 이 아니다');
  for (const key of ['stepMs', 'motionMs', 'bigEig', 'products', 'smallEig', 'startDir']) {
    if (!isInt(d[key])) throw new Error(`eigen: ${key} 는 정수여야 한다`);
  }
  const stepMs = d.stepMs as number;
  const motionMs = d.motionMs as number;
  const bigEig = d.bigEig as number;
  const products = d.products as number;
  const smallEig = d.smallEig as number;
  const startDir = d.startDir as number;
  if (stepMs <= 0 || motionMs < 0 || bigEig <= 0 || products <= 0) {
    throw new Error('eigen: stepMs · bigEig · products 는 양수, motionMs 는 0 이상이어야 한다');
  }
  const bigDir = intPair(d.bigDir, 'bigDir');
  const smallDir = intPair(d.smallDir, 'smallDir');
  if (!Array.isArray(d.starts) || d.starts.length === 0) throw new Error('eigen: starts 가 비었다');
  const starts = d.starts.map((s, i) => {
    const p = intPair(s, `starts[${i}]`);
    if (p[0] === 0 && p[1] === 0) throw new Error(`eigen: starts[${i}] 가 영 벡터다`);
    return p;
  });
  const smallEigLadder = intList(d.smallEigLadder, 'smallEigLadder');
  const startLadder = intList(d.startLadder, 'startLadder');
  if (startLadder.length !== starts.length || startLadder.some((v, i) => v !== i)) {
    throw new Error('eigen: startLadder 는 starts 의 순번 0.. 이어야 한다');
  }
  if (!smallEigLadder.includes(smallEig)) throw new Error('eigen: smallEig 가 사다리 밖이다');
  if (!startLadder.includes(startDir)) throw new Error('eigen: startDir 가 사다리 밖이다');
  if ((bigDir[0] === 0 && bigDir[1] === 0) || (smallDir[0] === 0 && smallDir[1] === 0)) {
    throw new Error('eigen: 고유 방향이 영 벡터다');
  }
  for (const s of smallEigLadder) buildMatrix(bigEig, s, bigDir, smallDir);
  return {
    type: 'eigen',
    stepMs,
    motionMs,
    bigEig,
    bigDir,
    smallDir,
    starts,
    products,
    smallEigLadder,
    smallEig,
    startLadder,
    startDir,
  };
}

/**
 * 두 고유값에서 대칭 정수 행렬을 짓는다 (행 차례 [a, b, c, d]).
 * λ₂ = 0 · |λ₂| ≥ λ₁ · λ₁ + λ₂ 홀수는 던진다. A·bigDir = λ₁·bigDir, A·smallDir = λ₂·smallDir 를
 * 정수로 확인하고 어긋나면 던진다.
 */
export function buildMatrix(big: number, small: number, bigDir: number[], smallDir: number[]): number[] {
  if (!isInt(big) || !isInt(small)) throw new Error('eigen: 고유값은 정수여야 한다');
  if (small === 0) throw new Error('eigen: λ₂ = 0 은 두지 않는다');
  if (Math.abs(small) >= big) throw new Error('eigen: |λ₂| 는 λ₁ 보다 작아야 한다');
  if ((big + small) % 2 !== 0) throw new Error('eigen: λ₁ + λ₂ 가 홀수라 정수 행렬이 안 된다');
  const p = (big + small) / 2;
  const q = (big - small) / 2;
  const a = [p, q, q, p];
  const check = (dir: number[], lam: number): void => {
    const x = a[0] * dir[0] + a[1] * dir[1];
    const y = a[2] * dir[0] + a[3] * dir[1];
    if (x !== lam * dir[0] || y !== lam * dir[1]) {
      throw new Error(`eigen: A (${a.join(' ')}) 에서 (${dir.join(', ')}) 가 고유값 ${lam} 의 방향이 아니다`);
    }
  };
  check(bigDir, big);
  check(smallDir, small);
  return a;
}

/** 1° 문턱 — sin 1°. IR 에 인자로 넘긴다 */
export function oneDegreeTol(): number {
  return Math.sin(Math.PI / 180);
}

const DEG = 180 / Math.PI;

function angleDeg(vx: number, vy: number): number {
  const deg = Math.atan2(vy, vx) * DEG;
  return deg < 0 ? deg + 360 : deg;
}

/** 한 판을 끝까지 셈한다 — 걸음 0 (출발) 과 곱 1..products */
export function computeBoard(data: EigenData, small: number, startIndex: number): EigenBoard {
  if (!data.smallEigLadder.includes(small)) throw new Error(`eigen: λ₂ ${small} 은 사다리 밖이다`);
  const start = data.starts[startIndex];
  if (!data.startLadder.includes(startIndex) || start === undefined) {
    throw new Error(`eigen: 출발 순번 ${startIndex} 은 사다리 밖이다`);
  }
  const a = buildMatrix(data.bigEig, small, data.bigDir, data.smallDir);
  const [dx, dy] = data.bigDir;
  const [sx, sy] = start;
  // 출발이 고유 방향 줄 위인가 — 정수로 판정한다
  const intCross = dx * sy - dy * sx;
  const intDot = dx * sx + dy * sy;
  const showRatio = intCross !== 0 && intDot !== 0;
  const tol = oneDegreeTol();

  const n = Math.sqrt(dx * dx + dy * dy);
  const ex = dx / n;
  const ey = dy / n;
  const sn = Math.sqrt(sx * sx + sy * sy);
  let vx = sx / sn;
  let vy = sy / sn;
  let first = -1;
  let prevSide: -1 | 0 | 1 = 0;
  let prevTan = 0;
  const rows: EigenRow[] = [];
  for (let k = 0; k <= data.products; k++) {
    let wx: number | null = null;
    let wy: number | null = null;
    let stretch: number | null = null;
    if (k > 0) {
      const x = a[0] * vx + a[1] * vy;
      const y = a[2] * vx + a[3] * vy;
      const norm = Math.sqrt(x * x + y * y);
      if (!(norm > 0)) throw new Error('eigen: 곱이 영 벡터가 되어 정규화할 수 없다');
      vx = x / norm;
      vy = y / norm;
      wx = x;
      wy = y;
      stretch = norm;
    }
    const cross = ex * vy - ey * vx;
    const dot = ex * vx + ey * vy;
    const inside = Math.abs(cross) < tol;
    if (first === -1 && inside) first = k;
    const side: -1 | 0 | 1 = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    const crossed = k > 0 && prevSide !== 0 && side !== 0 && prevSide !== side;
    const tan = showRatio ? Math.abs(cross) / Math.abs(dot) : 0;
    const tanRatio = showRatio && k > 0 ? tan / prevTan : null;
    rows.push({
      k,
      vx,
      vy,
      angle: angleDeg(vx, vy),
      gap: Math.atan2(Math.abs(cross), Math.abs(dot)) * DEG,
      tanLog: showRatio ? Math.log10(tan) : null,
      side,
      inside,
      wx,
      wy,
      stretch,
      tanRatio,
      crossed,
    });
    prevSide = side;
    prevTan = tan;
  }
  return { a, small, sx, sy, showRatio, first, rows };
}

/** 축 범위 — 사다리 전 조합에서 log10(tan) 의 범위를 정수로 넓힌다. 비를 두는 판이 없으면 [−1, 1] */
export function plotRange(data: EigenData): { logMin: number; logMax: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of data.smallEigLadder) {
    for (const i of data.startLadder) {
      const board = computeBoard(data, s, i);
      for (const r of board.rows) {
        if (r.tanLog === null) continue;
        lo = Math.min(lo, r.tanLog);
        hi = Math.max(hi, r.tanLog);
      }
    }
  }
  if (lo === Infinity) return { logMin: -1, logMax: 1 };
  return { logMin: Math.floor(lo), logMax: Math.ceil(hi) };
}

type MetricName = 'products' | 'crossings' | 'inside-one-degree';

export async function eigenAlgorithm(ctx: FacetContext<EigenData>): Promise<void> {
  const rctx = ctx as ReactiveContext<EigenData>;
  const data = narrowEigenData(ctx.data);
  let small = data.smallEig;
  let startIndex = data.startDir;
  const range = plotRange(data);
  const planeMax = Math.max(data.bigEig, ...data.smallEigLadder.map((s) => Math.abs(s)));
  const thresholdLog = Math.log10(Math.tan(Math.PI / 180));

  const shown: Record<MetricName, number> = { products: 0, crossings: 0, 'inside-one-degree': 0 };
  const announced = new Set<MetricName>();
  const setMetric = (name: MetricName, value: number): void => {
    const delta = value - shown[name];
    if (delta !== 0 || !announced.has(name)) ctx.metric(name, delta);
    announced.add(name);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playBoard = async (): Promise<boolean> => {
    const board = computeBoard(data, small, startIndex);
    const last = data.products;
    setMetric('products', 0);
    setMetric('crossings', 0);
    setMetric('inside-one-degree', 0);
    const row0 = board.rows[0];
    await ctx.emit({
      type: 'board',
      payload: {
        a: board.a,
        big: data.bigEig,
        small: board.small,
        ratioExpected: Math.abs(board.small) / data.bigEig,
        sx: board.sx,
        sy: board.sy,
        vx: row0.vx,
        vy: row0.vy,
        showRatio: board.showRatio,
        first: board.first,
        products: last,
        planeMax,
        logMin: range.logMin,
        logMax: range.logMax,
        thresholdLog,
        motionMs: data.motionMs,
      },
      silent: true,
    });
    if (!(await rctx.sleep(data.stepMs + data.motionMs))) return false;

    if (board.first === 0) await phase('aligned');
    else await phase('start');
    await ctx.emit({
      type: 'origin',
      payload: {
        k: 0,
        vx: row0.vx,
        vy: row0.vy,
        angle: row0.angle,
        gap: row0.gap,
        tanLog: row0.tanLog,
        side: row0.side,
        inside: row0.inside,
        alignedNow: board.first === 0,
        first: board.first,
        last: false,
      },
    });

    let crossings = 0;
    let inside = 0;
    for (let k = 1; k <= last; k++) {
      if (!(await rctx.sleep(data.stepMs + data.motionMs))) return false;
      const row = board.rows[k];
      if (k === last) await phase('done');
      else if (board.first === k) await phase('aligned');
      else await phase('iterate');
      await ctx.emit({
        type: 'product',
        payload: {
          k,
          vx: row.vx,
          vy: row.vy,
          angle: row.angle,
          gap: row.gap,
          tanLog: row.tanLog,
          side: row.side,
          inside: row.inside,
          alignedNow: board.first === k,
          first: board.first,
          last: k === last,
          wx: row.wx,
          wy: row.wy,
          stretch: row.stretch,
          tanRatio: row.tanRatio,
          crossed: row.crossed,
        },
      });
      if (row.crossed) crossings += 1;
      if (row.inside) inside += 1;
      setMetric('products', k);
      setMetric('crossings', crossings);
      setMetric('inside-one-degree', inside);
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'smallEig' && input.type !== 'startDir') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>).value
            : undefined;
        if (typeof value !== 'number') throw new Error(`eigen: ${input.type} 입력의 value 가 수가 아니다`);
        if (input.type === 'smallEig') {
          if (!data.smallEigLadder.includes(value)) throw new Error(`eigen: λ₂ ${value} 는 사다리 밖이다`);
          small = value;
        } else {
          if (!data.startLadder.includes(value)) throw new Error(`eigen: 출발 순번 ${value} 는 사다리 밖이다`);
          startIndex = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
