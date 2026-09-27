/**
 * SVD 와 저랭크 근사 — 6 × 7 수의 표를 특이값 순서의 겹으로 나누어 큰 겹부터 쌓는다.
 *
 * 손잡이 둘(reactive):
 *   - `picture` — 그림 0 하트 · 1 십자 · 2 계단 · 3 흩어짐 (사다리 `pictureLadder`)
 *   - `keep`    — 남길 겹 1..6 (사다리 `keepLadder`). 판이 걸음 k 에서 끝난다 (걸음 수 k + 1)
 *
 * 셈 규약:
 *   - SVD = AAᵀ (6 × 6) 의 순환 야코비 고유분해 (대각 밖 제곱합 < 1e−24 에서 멈춤).
 *     고유값 큰 것부터, σᵢ = √max(λᵢ, 0), uᵢ = 그 고유벡터(길이 1)
 *   - 겹 L_j = u_j u_jᵀ A (u 의 부호와 무관), 쌓은 표 A_j = L_1 + … + L_j
 *   - 오차 % = ‖A − A_j‖ / ‖A‖ × 100 (프로베니우스)
 *   - 같은 칸 = Math.round(A_j 의 칸) 이 원래 칸과 같은 수 (/42). 반올림 경계(x.5 에서 1e−9 안)에 떨어지면 던진다.
 *     이 데이터에서 경계에 걸리는 칸은 없다 (sim 단언 · test 로 잠근다)
 *   - 칸 크기의 잣대 = 네 그림 · 모든 A_j · L_j 의 가장 큰 |칸 값|. σ 막대 잣대 = 네 그림의 가장 큰 σ.
 *     무대가 셈하지 않게 여기서 셈해 싣는다
 *
 * 이벤트:
 *   - `board` (silent) — 판 머리. 걸음 0 을 짓는다. payload:
 *       { picture: number, pictureId: string, keep: number, motionMs: number,
 *         cells: number[][] (6 × 7 원래 표), sigmas: number[6],
 *         layers: number[][][] (L_1..L_6, 각 6 × 7), stacks: number[][][] (A_1..A_6, 각 6 × 7),
 *         errors: number[6] (A_1..A_6 의 오차 %), same: number[6] (A_1..A_6 의 같은 칸),
 *         cellScale: number, sigmaScale: number }
 *   - `stack-layer` (silent 아님) — 걸음 j (1..k). 겹 j 를 쌓는다. payload:
 *       { layer: number (j), sigma: number, error: number, same: number,
 *         last: boolean (j === k), firstFull: number | null (1..k 안에서 42/42 에 처음 닿은 겹, 없으면 null) }
 *
 * phase 어휘: 없음 — IR · 코드 패널을 두지 않는다 (irs.ts 머리 주석).
 *
 * 계기 (판 머리에서 0 으로, 지금 값을 들고 차이만 보낸다):
 *   - `layers`     — 쌓은 겹 (걸음마다 +1, 판 끝 = k)
 *   - `same-cells` — 지금 쌓은 표의 같은 칸 (걸음 0 은 0)
 *
 * 재생: 판 머리 board → sleep(stepMs + motionMs) → 걸음 1 → sleep → … → 걸음 k → 입력 대기.
 * sleep 은 k 번이라 한 판이 k × (stepMs + motionMs).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const ROWS = 6;
export const COLS = 7;
export const CELLS = ROWS * COLS;

export type SvdPicture = { id: string; cells: number[][] };

export type SvdData = {
  type: 'svd';
  stepMs: number;
  motionMs: number;
  pictures: SvdPicture[];
  pictureLadder: number[];
  picture: number;
  keepLadder: number[];
  keep: number;
};

/** 한 그림의 분해 — σ · 겹 · 쌓은 표 · 오차 · 같은 칸. */
export type SvdDecomposition = {
  sigmas: number[];
  layers: number[][][];
  stacks: number[][][];
  errors: number[];
  same: number[];
  norm: number;
};

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다. */
export function readSvdData(raw: unknown): SvdData {
  if (typeof raw !== 'object' || raw === null) throw new Error('svd: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'svd') throw new Error(`svd: type 이 'svd' 가 아니다 (${String(d.type)})`);
  const { stepMs, motionMs, picture, keep } = d;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('svd: stepMs 가 양수가 아니다');
  if (typeof motionMs !== 'number' || motionMs < 0) throw new Error('svd: motionMs 가 음수가 아닌 수가 아니다');
  if (!Array.isArray(d.pictures) || d.pictures.length === 0) throw new Error('svd: pictures 가 비었다');
  const pictures: SvdPicture[] = d.pictures.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) throw new Error(`svd: 그림 ${i} 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') throw new Error(`svd: 그림 ${i} 의 id 가 없다`);
    if (!Array.isArray(q.cells) || q.cells.length !== ROWS) throw new Error(`svd: 그림 ${q.id} 가 ${ROWS} 행이 아니다`);
    const cells = q.cells.map((row: unknown) => {
      if (!isIntArray(row) || row.length !== COLS) throw new Error(`svd: 그림 ${q.id} 의 행이 정수 ${COLS} 칸이 아니다`);
      for (const v of row) if (v < 0 || v > 9) throw new Error(`svd: 그림 ${q.id} 의 칸 ${v} 가 0..9 밖이다`);
      return [...row];
    });
    return { id: q.id, cells };
  });
  if (!isIntArray(d.pictureLadder) || d.pictureLadder.length !== pictures.length) {
    throw new Error('svd: pictureLadder 가 그림 수와 맞지 않는다');
  }
  d.pictureLadder.forEach((v, i) => {
    if (v !== i) throw new Error(`svd: pictureLadder[${i}] 가 ${i} 가 아니다`);
  });
  if (!isIntArray(d.keepLadder) || d.keepLadder.length === 0) throw new Error('svd: keepLadder 가 비었다');
  for (const k of d.keepLadder) if (k < 1 || k > ROWS) throw new Error(`svd: keepLadder 의 ${k} 가 1..${ROWS} 밖이다`);
  if (typeof picture !== 'number' || !d.pictureLadder.includes(picture)) throw new Error('svd: picture 가 사다리 밖이다');
  if (typeof keep !== 'number' || !d.keepLadder.includes(keep)) throw new Error('svd: keep 이 사다리 밖이다');
  return {
    type: 'svd',
    stepMs,
    motionMs,
    pictures,
    pictureLadder: [...d.pictureLadder],
    picture,
    keepLadder: [...d.keepLadder],
    keep,
  };
}

/** 대칭 행렬의 순환 야코비 — 고유값(큰 것부터)과 그 고유벡터(열이 아니라 목록, 길이 1). */
export function jacobiEigen(sym: number[][]): { values: number[]; vectors: number[][] } {
  const n = sym.length;
  const a = sym.map((row) => {
    if (row.length !== n) throw new Error('svd: 야코비 입력이 정사각이 아니다');
    return [...row];
  });
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const offSq = (): number => {
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) s += a[i]![j]! * a[i]![j]!;
    return s;
  };
  let sweeps = 0;
  while (offSq() >= 1e-24) {
    sweeps += 1;
    if (sweeps > 100) throw new Error('svd: 야코비가 100 번 돌아도 멈추지 않는다');
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (apq === 0) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(tt * tt + 1);
        const s = tt * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y]![y]! - a[x]![x]!);
  return {
    values: order.map((i) => a[i]![i]!),
    vectors: order.map((i) => v.map((row) => row[i]!)),
  };
}

function frobenius(m: number[][]): number {
  let s = 0;
  for (const row of m) for (const x of row) s += x * x;
  return Math.sqrt(s);
}

/** Math.round 비교 — 반올림 경계에 떨어지면 던진다. */
export function countSame(stack: number[][], cells: number[][]): number {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = stack[r]![c]!;
      const frac = Math.abs(x - Math.floor(x) - 0.5);
      if (frac < 1e-9) throw new Error(`svd: 칸 (${r + 1}, ${c + 1}) 의 ${x} 가 반올림 경계에 있다`);
      if (Math.round(x) === cells[r]![c]!) n += 1;
    }
  }
  return n;
}

/** 한 그림을 겹으로 나눈다. */
export function decompose(cells: number[][]): SvdDecomposition {
  const aat: number[][] = Array.from({ length: ROWS }, (_, i) =>
    Array.from({ length: ROWS }, (_, j) => {
      let s = 0;
      for (let k = 0; k < COLS; k++) s += cells[i]![k]! * cells[j]![k]!;
      return s;
    }),
  );
  const { values, vectors } = jacobiEigen(aat);
  const sigmas = values.map((lam) => Math.sqrt(Math.max(lam, 0)));
  const layers = vectors.map((u) => {
    // uᵀ A — 길이 7
    const ua = Array.from({ length: COLS }, (_, c) => {
      let s = 0;
      for (let r = 0; r < ROWS; r++) s += u[r]! * cells[r]![c]!;
      return s;
    });
    return Array.from({ length: ROWS }, (_, r) => ua.map((x) => u[r]! * x));
  });
  const norm = frobenius(cells);
  const stacks: number[][][] = [];
  let acc: number[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
  for (const layer of layers) {
    acc = acc.map((row, r) => row.map((x, c) => x + layer[r]![c]!));
    stacks.push(acc);
  }
  const errors = stacks.map((s) => (frobenius(cells.map((row, r) => row.map((x, c) => x - s[r]![c]!))) / norm) * 100);
  const same = stacks.map((s) => countSame(s, cells));
  return { sigmas, layers, stacks, errors, same, norm };
}

/** 칸 크기 잣대 — 모든 그림의 A_j · L_j 에서 가장 큰 |칸 값|. */
export function cellScaleOf(decs: SvdDecomposition[]): number {
  let m = 0;
  for (const d of decs) {
    for (const grid of [...d.layers, ...d.stacks]) for (const row of grid) for (const x of row) m = Math.max(m, Math.abs(x));
  }
  if (!(m > 0)) throw new Error('svd: 칸 크기 잣대가 0 이다');
  return m;
}

/** σ 막대 잣대 — 모든 그림의 가장 큰 σ. */
export function sigmaScaleOf(decs: SvdDecomposition[]): number {
  const m = Math.max(...decs.map((d) => d.sigmas[0]!));
  if (!(m > 0)) throw new Error('svd: σ 잣대가 0 이다');
  return m;
}

/** 1..k 안에서 42/42 에 처음 닿은 겹 (없으면 null). */
export function firstFullWithin(same: number[], k: number): number | null {
  for (let j = 1; j <= k; j++) if (same[j - 1] === CELLS) return j;
  return null;
}

function readLadderValue(payload: unknown, ladder: number[], name: string): number {
  if (typeof payload !== 'object' || payload === null) throw new Error(`svd: ${name} 입력에 payload 가 없다`);
  const value = (payload as Record<string, unknown>).value;
  if (typeof value !== 'number' || !ladder.includes(value)) {
    throw new Error(`svd: ${name} 입력 값 ${String(value)} 가 사다리 밖이다`);
  }
  return value;
}

export async function svdAlgorithm(ctx: FacetContext<SvdData>): Promise<void> {
  const r = ctx as ReactiveContext<SvdData>;
  const data = readSvdData(ctx.data);
  const decs = data.pictures.map((p) => decompose(p.cells));
  const cellScale = cellScaleOf(decs);
  const sigmaScale = sigmaScaleOf(decs);
  let picture = data.picture;
  let keep = data.keep;

  const shown = { layers: 0, same: 0 };
  const showLayers = (v: number) => {
    ctx.metric('layers', v - shown.layers);
    shown.layers = v;
  };
  const showSame = (v: number) => {
    ctx.metric('same-cells', v - shown.same);
    shown.same = v;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const pic = data.pictures[picture]!;
      const dec = decs[picture]!;
      showLayers(0);
      showSame(0);
      await ctx.emit({
        type: 'board',
        silent: true,
        payload: {
          picture,
          pictureId: pic.id,
          keep,
          motionMs: data.motionMs,
          cells: pic.cells.map((row) => [...row]),
          sigmas: [...dec.sigmas],
          layers: dec.layers,
          stacks: dec.stacks,
          errors: [...dec.errors],
          same: [...dec.same],
          cellScale,
          sigmaScale,
        },
      });
      if (!(await r.sleep(data.stepMs + data.motionMs))) return;
      const firstFull = firstFullWithin(dec.same, keep);
      for (let j = 1; j <= keep; j++) {
        if (ctx.cancelled) return;
        showLayers(j);
        showSame(dec.same[j - 1]!);
        await ctx.emit({
          type: 'stack-layer',
          payload: {
            layer: j,
            sigma: dec.sigmas[j - 1]!,
            error: dec.errors[j - 1]!,
            same: dec.same[j - 1]!,
            last: j === keep,
            firstFull: j === keep ? firstFull : null,
          },
        });
        if (j < keep && !(await r.sleep(data.stepMs + data.motionMs))) return;
      }
      // 입력 대기 — 우리 손잡이만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await r.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'picture') {
          picture = readLadderValue(input.payload, data.pictureLadder, 'picture');
          break;
        }
        if (input.type === 'keep') {
          keep = readLadderValue(input.payload, data.keepLadder, 'keep');
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
