/**
 * matrix-mul — 한 겹에서 곱셈 하나를 덜면 무엇이 벌어지는가.
 *
 * 조각 `rowTimesColumn` 이 **한 칸이 어디서 오는가**를 말하고 멈춘다 — A 의 행
 * 하나와 B 의 열 하나가 한 자리에서 맞물린다. 이 완제품은 그 맞물림을 **한 번 덜
 * 하면** 무엇이 벌어지는지를 보인다.
 *
 * ── 주장은 배율이 아니라 증폭이다
 *
 * 2×2 블록 한 겹에서 표준은 블록 곱 여덟을, 스트라센은 일곱을 쓴다. **차이는
 * 정확히 하나이고 그 하나는 겹이 깊어져도 그대로다.** 그런데 각 겹이 아래 겹을
 * 통째로 되풀이하므로 곱셈은 8ᵏ 와 7ᵏ 로 갈라지고, 아낀 곱셈이 폭발한다.
 *
 *   k          1      2      3       4        5         6          7
 *   n = 2ᵏ     2      4      8      16       32        64        128
 *   표준 8ᵏ    8     64    512    4096    32768    262144    2097152
 *   스트라센   7     49    343    2401    16807    117649     823543
 *   아낀 곱셈  1     15    169    1695    15961    144495    1273609
 *   배율   1.143  1.306  1.493   1.706    1.950     2.228      2.546
 *
 * 배율은 2.5 배에 그치지만 아낀 곱셈은 하나에서 백이십칠만으로 간다. 화면이
 * 말하는 것은 뒤쪽이다.
 *
 * ── 공짜가 아니다
 *
 * 한 겹에서 곱셈은 여덟에서 일곱으로 줄지만 덧셈·뺄셈은 넷에서 열여덟로 는다.
 * 그래서 한 겹만 보면 손해다 — 이득이 곱셈에만 붙고 곱셈이 겹마다 여덟 배로
 * 불어나기 때문에 재귀에서만 값이 돌아온다. 이 사실은 `caption.combine` 이
 * 화면에서 직접 말한다.
 *
 * ── 이벤트 (C2)
 *
 * `phase` 만 silent 다. 나머지는 전부 화면이 바뀌는 걸음 경계다.
 *
 *   'standard-layer'  한 겹을 표준으로 셈했다.
 *     payload { a, b, pairs: Pair[], c: number[][], mults: number, adds: number }
 *   'strassen-layer'  같은 겹을 곱 일곱으로 셈했다.
 *     payload { terms: Term[], mults: number, adds: number }
 *   'combine-layer'   일곱을 다시 모아 C 를 세웠다. 표준과 같은 C 다.
 *     payload { c, combines: Combine[], same: boolean,
 *               standardMults, fastMults, standardAdds, fastAdds }
 *   'depth'           겹 하나를 더 쌓았을 때의 곱셈 수.
 *     payload { level, size, standard, fast, saved, top }
 *
 * **`layer-` 로 시작하지 않는다.** C2 가 그 앞가지를 `layer-discovered` 계열 —
 * 같은 계층의 여럿이 한 걸음에 동시에 확장되는 집합 이벤트 — 로 예약해 두었다.
 * 여기 셋은 "재귀 한 겹을 어느 방법으로 셈했는가" 라 결이 다르므로 앞가지를
 * 빌리지 않고 `<방법>-layer` 로 둔다.
 *
 * **`depth` 라는 글자가 이 파일에서 두 뜻으로 읽힌다.** 위의 것은 **이벤트**이고
 * (겹 하나를 훑는 걸음), `data.depth` 와 `waitForInput` 이 받는 `{ type: 'depth' }`
 * 는 **손잡이**다. 채널이 갈려 있어 섞이지 않지만 (`ctx.emit` ↔ 입력 큐) 글자가
 * 같으니 적어 둔다.
 *   'tally'           고른 깊이에서의 총계.
 *     payload { depth, size, standard, fast, saved }
 *   'phase'  (silent)  코드 패널이 짚을 줄. payload { phase }
 *   'done'   (표준)    한 바퀴가 끝났다. payload 없음.
 *
 * ── phase 어휘 — `irs.ts` 와 집합이 완전히 일치한다 (C3)
 *
 *   'standard' | 'strassen' | 'combine' | 'base' | 'recurse'
 *
 * 겹을 훑는 걸음에서 `level === 0` 은 밑바닥(블록이 수 하나)이라 'base' 이고,
 * 그 위는 'recurse' 다. IR 은 k 에서 0 으로 내려가고 화면은 0 에서 k 로 올라가는데,
 * 같은 점화식을 반대 방향으로 편 것이라 짚는 줄은 같다.
 *
 * ── 메트릭 (facet.ts 의 metrics[] 에 같은 이름이 있어야 한다 — C5)
 *
 *   'matrix-size'      n = 2ᵏ
 *   'standard-count'   표준의 곱셈 수
 *   'strassen-count'   스트라센의 곱셈 수
 *   'saved-count'      아낀 곱셈 — 주 수치
 *
 * 넷 다 정수다. 배율은 분수라 싣지 않는다 — control-bar 가 `String(value)` 로
 * 찍고 metric 은 누적기라 소수 delta 가 부동소수 오차를 쌓는다. 배율은 stage 가
 * 그 자리에서 셈해 그린다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MatrixMulData = {
  type: 'matrix-mul';
  /** 밑 행렬 왼쪽. 한 겹을 실제 수로 보이기 위한 2×2. */
  a: number[][];
  /** 밑 행렬 오른쪽. */
  b: number[][];
  /** 재귀 깊이 k — 손잡이가 바꾸는 값. */
  depth: number;
  /** 손잡이가 고를 수 있는 깊이 전부. */
  depths: number[];
  /** 걸음 사이의 정지 시간 (ms). */
  stepMs: number;
};

/**
 * A 의 한 자리와 B 의 한 자리가 C 의 한 칸에서 만난다.
 *
 * 필드 이름은 조각 `rowTimesColumn` 의 것을 그대로 쓴다 — 부품은 공유하지 않되
 * 어휘는 맞춘다 (S-piece PREFER).
 */
export type Pair = {
  row: number;
  col: number;
  k: number;
  left: number;
  right: number;
  value: number;
};

/** 한 피연산자를 이루는 원소 하나. `sign` 은 +1 또는 −1. */
export type Part = { row: number; col: number; sign: number };

/** 스트라센의 곱 하나. `index` 는 화면의 M 번호(1..7)다. */
export type Term = {
  index: number;
  leftParts: Part[];
  rightParts: Part[];
  left: number;
  right: number;
  value: number;
};

/** 곱들을 다시 모아 세우는 C 의 한 칸. */
export type Combine = {
  row: number;
  col: number;
  parts: { index: number; sign: number }[];
  value: number;
};

const at = (m: number[][], row: number, col: number): number => m[row]?.[col] ?? 0;

const part = (row: number, col: number, sign: number): Part => ({ row, col, sign });
const ref = (index: number, sign: number): { index: number; sign: number } => ({ index, sign });

/**
 * 스트라센의 곱 일곱 — 무엇과 무엇을 곱하는가.
 *
 * **걸음표가 아니라 알고리즘의 정의다.** 사람이 적은 배열을 두르지 말라는 조항
 * (S-piece)은 걸음의 차례를 두고 하는 말이고, 이 일곱은 데이터를 훑어 나오는 것이
 * 아니라 스트라센이 무엇인지 그 자체다. 여기 한 벌로 두면 stage 가 같은 구조를
 * 다시 적지 않고 이것을 받아 그린다.
 */
const TERM_SPECS: { left: Part[]; right: Part[] }[] = [
  { left: [part(0, 0, 1), part(1, 1, 1)], right: [part(0, 0, 1), part(1, 1, 1)] },
  { left: [part(1, 0, 1), part(1, 1, 1)], right: [part(0, 0, 1)] },
  { left: [part(0, 0, 1)], right: [part(0, 1, 1), part(1, 1, -1)] },
  { left: [part(1, 1, 1)], right: [part(1, 0, 1), part(0, 0, -1)] },
  { left: [part(0, 0, 1), part(0, 1, 1)], right: [part(1, 1, 1)] },
  { left: [part(1, 0, 1), part(0, 0, -1)], right: [part(0, 0, 1), part(0, 1, 1)] },
  { left: [part(0, 1, 1), part(1, 1, -1)], right: [part(1, 0, 1), part(1, 1, 1)] },
];

/** 일곱을 다시 모아 C 의 넷을 세우는 법. */
const COMBINE_SPECS: { row: number; col: number; parts: { index: number; sign: number }[] }[] = [
  { row: 0, col: 0, parts: [ref(1, 1), ref(4, 1), ref(5, -1), ref(7, 1)] },
  { row: 0, col: 1, parts: [ref(3, 1), ref(5, 1)] },
  { row: 1, col: 0, parts: [ref(2, 1), ref(4, 1)] },
  { row: 1, col: 1, parts: [ref(1, 1), ref(2, -1), ref(3, 1), ref(6, 1)] },
];

/** 표준이 짓는 짝 전부. 칸마다 안쪽 치수만큼이고, 그 수가 곧 한 겹의 곱셈 수다. */
export function standardPairs(a: number[][], b: number[][]): Pair[] {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  const out: Pair[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      for (let k = 0; k < inner; k += 1) {
        const left = at(a, row, k);
        const right = at(b, k, col);
        out.push({ row, col, k, left, right, value: left * right });
      }
    }
  }
  return out;
}

/** 표준의 곱 — 짝을 칸마다 더한다. */
export function standardProduct(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0]?.length ?? 0;
  const out: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: number[] = [];
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      for (let k = 0; k < b.length; k += 1) sum += at(a, row, k) * at(b, k, col);
      line.push(sum);
    }
    out.push(line);
  }
  return out;
}

/** 표준의 덧셈 수 — 칸마다 짝의 수보다 하나 적다. */
export function standardAddCount(a: number[][], b: number[][]): number {
  const cells = a.length * (b[0]?.length ?? 0);
  return cells * Math.max(0, b.length - 1);
}

const sumParts = (m: number[][], parts: Part[]): number =>
  parts.reduce((acc, p) => acc + p.sign * at(m, p.row, p.col), 0);

/** 스트라센의 곱 일곱 — 피연산자는 원소 하나이거나 둘의 합·차다. */
export function strassenTerms(a: number[][], b: number[][]): Term[] {
  return TERM_SPECS.map((spec, i) => {
    const left = sumParts(a, spec.left);
    const right = sumParts(b, spec.right);
    return {
      index: i + 1,
      leftParts: spec.left,
      rightParts: spec.right,
      left,
      right,
      value: left * right,
    };
  });
}

/** 일곱에서 C 의 넷으로. 여기에는 곱셈이 없다 — 더하고 빼기만 한다. */
export function strassenCombines(terms: Term[]): Combine[] {
  const valueOf = new Map(terms.map((t) => [t.index, t.value]));
  return COMBINE_SPECS.map((spec) => ({
    row: spec.row,
    col: spec.col,
    parts: spec.parts,
    value: spec.parts.reduce((acc, p) => acc + p.sign * (valueOf.get(p.index) ?? 0), 0),
  }));
}

/** 스트라센의 곱. 표준과 같은 C 여야 한다 — 검사가 그것을 잰다. */
export function strassenProduct(a: number[][], b: number[][]): number[][] {
  const combines = strassenCombines(strassenTerms(a, b));
  const out: number[][] = [
    [0, 0],
    [0, 0],
  ];
  for (const c of combines) {
    const line = out[c.row];
    if (line) line[c.col] = c.value;
  }
  return out;
}

/** 피연산자를 짓는 데 드는 덧셈·뺄셈. */
export function operandAddCount(terms: Term[]): number {
  return terms.reduce(
    (acc, t) => acc + Math.max(0, t.leftParts.length - 1) + Math.max(0, t.rightParts.length - 1),
    0,
  );
}

/** 되맞추는 데 드는 덧셈·뺄셈. */
export function combineAddCount(combines: Combine[]): number {
  return combines.reduce((acc, c) => acc + Math.max(0, c.parts.length - 1), 0);
}

/**
 * 깊이 `depth` 에서의 곱셈 수 — 한 겹이 `perLayer` 벌로 갈라지고, 각 벌이 아래
 * 겹을 통째로 되풀이한다. 밑바닥(깊이 0)은 수 하나의 곱이라 1 이다.
 */
export function productCount(depth: number, perLayer: number): number {
  let out = 1;
  for (let i = 0; i < depth; i += 1) out *= perLayer;
  return out;
}

/** 깊이 k 의 행렬 크기 n = 2ᵏ. */
export function matrixSize(depth: number): number {
  return productCount(depth, 2);
}

function sameMatrix(x: number[][], y: number[][]): boolean {
  if (x.length !== y.length) return false;
  return x.every((line, row) => {
    const other = y[row] ?? [];
    return line.length === other.length && line.every((value, col) => value === other[col]);
  });
}

/**
 * 손잡이의 눈금 — 재귀 깊이로 고를 수 있는 값 전부.
 *
 * **같은 눈금이 세 곳에 있다.** 선언(`facet.ts` 의 슬라이더 칸과 `initialData.depths`),
 * 여기, 그리고 stage 의 깊이 자다. stage 는 원칙 1 때문에 algorithm 을 참조할 수
 * 없어 `initialData` 로 받는 수밖에 없고, 그래서 셋이 갈릴 길이 열려 있다.
 * 갈리면 **축이 조용히 거짓말을 한다** — 자는 일곱 칸인데 손잡이는 아홉까지 가는
 * 꼴이 되고 예외도 나지 않는다. `test/matrix-mul.test.ts` 가 셋을 묶어 잠근다.
 *
 * 7 에서 멈추는 까닭은 8ᵏ 다. 깊이 8 이면 천육백만을 넘어 코드 패널의 여섯 언어
 * 가운데 32비트 정수를 쓰는 쪽과 값이 갈린다.
 */
export const MATRIX_MUL_DEPTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * 손잡이가 보낸 값을 읽는다. **눈금 밖은 받지 않는다** — 어긋난 dispatch 하나가
 * 깊이를 눈금 너머로 밀면 화면의 자와 코드 패널이 동시에 거짓이 된다.
 */
function readDepth(payload: unknown, fallback: number, allowed: readonly number[]): number {
  const ok = (n: number): number => (allowed.includes(n) ? n : fallback);
  if (typeof payload !== 'object' || payload === null) return fallback;
  const p = payload as Record<string, unknown>;
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return ok(p.value);
  if (typeof p.depth === 'string') {
    const n = Number(p.depth);
    if (Number.isFinite(n) && n > 0) return ok(n);
  }
  return fallback;
}

export async function matrixMulAlgorithm(base: FacetContext<MatrixMulData>): Promise<void> {
  // reactive 메커니즘이 주입하는 확장 컨텍스트. 등록 시그니처는 `FacetContext` 그대로라
  // 알고리즘 쪽에서 좁혀 받는다 — `runtime/context.ts` 가 적어 둔 규약이고, 설계상
  // 열린 경계라 이 단언은 C9 가 허용하는 자리다.
  const ctx = base as ReactiveContext<MatrixMulData>;
  const data = ctx.data;

  // ctx.metric 은 **더하는** 채널이라 (mechanism 이 누적한다) 값을 그대로 앉히려면
  // 차이를 보내야 한다. 지금 화면에 떠 있는 값을 여기서 기억한다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  };

  // 이름은 호출부에 리터럴로 남는다 — `phase('standard')` 꼴이라 grep 으로 잡힌다 (C3).
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  for (;;) {
    if (ctx.cancelled) return;

    const depth = data.depth;
    const a = data.a;
    const b = data.b;

    // 한 겹을 실제로 셈한다. **여덟과 일곱은 상수가 아니라 여기서 나온다** —
    // 밑 행렬을 바꾸면 두 수가 함께 움직이고 화면이 거짓이 되지 않는다.
    const pairs = standardPairs(a, b);
    const cStandard = standardProduct(a, b);
    const terms = strassenTerms(a, b);
    const combines = strassenCombines(terms);
    const cFast = strassenProduct(a, b);

    const standardAdds = standardAddCount(a, b);
    const fastAdds = operandAddCount(terms) + combineAddCount(combines);

    const standard = productCount(depth, pairs.length);
    const fast = productCount(depth, terms.length);

    setMetric('matrix-size', matrixSize(depth));
    setMetric('standard-count', standard);
    setMetric('strassen-count', fast);
    setMetric('saved-count', standard - fast);

    // ── 1. 한 겹을 표준으로. 조각이 말한 맞물림이 블록 단위로 여덟 번 일어난다.
    await phase('standard');
    await ctx.emit({
      type: 'standard-layer',
      payload: {
        a: a.map((line) => [...line]),
        b: b.map((line) => [...line]),
        pairs,
        c: cStandard,
        mults: pairs.length,
        adds: standardAdds,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return;

    // ── 2. 같은 겹을 곱 일곱으로. 피연산자가 합과 차가 되는 대신 곱이 하나 준다.
    await phase('strassen');
    await ctx.emit({
      type: 'strassen-layer',
      payload: { terms, mults: terms.length, adds: operandAddCount(terms) },
    });
    if (!(await ctx.sleep(data.stepMs))) return;

    // ── 3. 되맞추기. 답이 같다는 것이 이 걸음의 전부다.
    await phase('combine');
    await ctx.emit({
      type: 'combine-layer',
      payload: {
        c: cFast,
        combines,
        same: sameMatrix(cStandard, cFast),
        standardMults: pairs.length,
        fastMults: terms.length,
        standardAdds,
        fastAdds,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return;

    // ── 4. 겹을 쌓는다. 한 겹의 차이는 그대로인데 아낀 곱셈이 벌어진다.
    for (let level = 0; level <= depth; level += 1) {
      // 문이 바디의 끝에 있으므로 진입 검사를 따로 둔다 (C8).
      if (ctx.cancelled) return;
      if (level === 0) await phase('base');
      else await phase('recurse');
      const levelStandard = productCount(level, pairs.length);
      const levelFast = productCount(level, terms.length);
      await ctx.emit({
        type: 'depth',
        payload: {
          level,
          size: matrixSize(level),
          standard: levelStandard,
          fast: levelFast,
          saved: levelStandard - levelFast,
          top: depth,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;
    }

    // ── 5. 총계.
    await ctx.emit({
      type: 'tally',
      payload: {
        depth,
        size: matrixSize(depth),
        standard,
        fast,
        saved: standard - fast,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return;

    await ctx.emit({ type: 'done' });

    // 여기서부터 입력 대기다 — 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
    try {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type === 'depth') {
        data.depth = readDepth(input.payload, data.depth, data.depths ?? MATRIX_MUL_DEPTHS);
      }
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
  }
}
