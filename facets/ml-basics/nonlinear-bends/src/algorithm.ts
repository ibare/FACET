/**
 * nonlinear-bends — 활성화 없이 쌓은 층은 한 층으로 접힌다.
 *
 * 입력 x 는 1 차원이다. 층마다 출력 = W·입력 + b 이고 층 사이에 활성화가 없다(항등).
 * 그래서 어느 단위의 출력도 x 에 대해 a·x + b 꼴의 곧은 선이다. 알고리즘은 층을 하나씩
 * 쌓으며 새 단위들의 (a, b) 를 앞 층의 (a, b) 에서 셈해 싣고, 끝에 세 층의 무게를 곱해
 * 얻은 한 층(a = Wn···W1, b = Σ Wn···W(k+1)·bk)을 따로 셈해 싣는다.
 *
 * 이벤트 (발신 차례대로):
 *
 * - `init` (silent) — 바탕. 걸음 0 을 갈아 끼운다.
 *   payload: {
 *     xLo: number; xHi: number;        // 입력 범위
 *     vLo: number; vHi: number;        // 입력 선과 모든 단위 선이 [xLo, xHi] 에서 닿는 값의 폭
 *     input: { a: number; b: number }; // 입력 x 자신 (a 1 · b 0)
 *     layerCount: number;              // 쌓을 층 수
 *     maxUnits: number;                // 가장 넓은 층의 단위 수 (색 가르기용)
 *   }
 * - `layer` — 층 하나를 쌓는다. 걸음 1 · 2 · … · layerCount.
 *   payload: {
 *     index: number;                    // 층 번호 (1 부터)
 *     units: { a: number; b: number }[] // 그 층 단위들의 선, 단위 차례대로
 *   }
 * - `fold` — 모든 층의 무게를 곱해 한 층으로 접는다. 마지막 걸음.
 *   payload: { a: number; b: number }    // 접은 한 층의 기울기와 절편
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** x 에 대한 선 a·x + b. */
export type Line = { a: number; b: number };

/** 층 하나 — 출력 = W·입력 + b. W 는 행이 이 층 단위, 열이 앞 층 단위. */
export type LayerSpec = { W: number[][]; b: number[] };

export type NonlinearBendsFacetData = {
  type: 'nonlinear-bends';
  stepMs: number;
  xRange: [number, number];
  layers: LayerSpec[];
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다.
 * 층의 열 수는 앞 층의 행 수(첫 층은 1)와 같아야 하고, 마지막 층의 행은 하나다.
 */
export function narrowNonlinearBendsData(raw: unknown): NonlinearBendsFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('nonlinear-bends: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'nonlinear-bends') throw new Error(`nonlinear-bends: initialData.type 이 어긋난다 (${String(d.type)})`);
  if (!isNum(d.stepMs) || d.stepMs <= 0) throw new Error('nonlinear-bends: initialData.stepMs 가 양수가 아니다');
  const xr = d.xRange;
  if (!Array.isArray(xr) || xr.length !== 2 || !isNum(xr[0]) || !isNum(xr[1]) || !(xr[0] < xr[1])) {
    throw new Error('nonlinear-bends: initialData.xRange 는 [작은 수, 큰 수] 여야 한다');
  }
  if (!Array.isArray(d.layers) || d.layers.length === 0) throw new Error('nonlinear-bends: initialData.layers 가 비었다');
  const layers: LayerSpec[] = [];
  let width = 1;
  d.layers.forEach((rawLayer: unknown, li: number) => {
    const path = `initialData.layers[${li}]`;
    if (typeof rawLayer !== 'object' || rawLayer === null) throw new Error(`nonlinear-bends: ${path} 가 객체가 아니다`);
    const l = rawLayer as Record<string, unknown>;
    if (!Array.isArray(l.W) || l.W.length === 0) throw new Error(`nonlinear-bends: ${path}.W 가 비었다`);
    if (!Array.isArray(l.b) || l.b.length !== l.W.length) throw new Error(`nonlinear-bends: ${path}.b 의 길이가 W 의 행 수와 다르다`);
    const W = l.W.map((row: unknown, ri: number) => {
      if (!Array.isArray(row) || row.length !== width) {
        throw new Error(`nonlinear-bends: ${path}.W[${ri}] 의 길이가 앞 층 단위 수(${width})와 다르다`);
      }
      return row.map((w: unknown, ci: number) => {
        if (!isNum(w)) throw new Error(`nonlinear-bends: ${path}.W[${ri}][${ci}] 가 수가 아니다`);
        return w;
      });
    });
    const b = l.b.map((v: unknown, bi: number) => {
      if (!isNum(v)) throw new Error(`nonlinear-bends: ${path}.b[${bi}] 가 수가 아니다`);
      return v;
    });
    layers.push({ W, b });
    width = W.length;
  });
  if (width !== 1) throw new Error('nonlinear-bends: 마지막 층의 단위가 하나가 아니다');
  return { type: 'nonlinear-bends', stepMs: d.stepMs, xRange: [xr[0], xr[1]], layers };
}

/** 층 하나를 지난 단위 선들 — 새 단위 i 의 (a, b) = Σj W[i][j]·(앞 단위 j 의 (a, b)) + (0, b[i]). */
export function passLayer(prev: readonly Line[], layer: LayerSpec): Line[] {
  return layer.W.map((row, i) => {
    let a = 0;
    let c = 0;
    row.forEach((w, j) => {
      const src = prev[j];
      if (src === undefined) throw new Error(`nonlinear-bends: 앞 층 단위 ${j} 가 없다`);
      a += w * src.a;
      c += w * src.b;
    });
    const bias = layer.b[i];
    if (bias === undefined) throw new Error(`nonlinear-bends: b[${i}] 가 없다`);
    return { a, b: c + bias };
  });
}

function matMul(A: readonly number[][], B: readonly number[][]): number[][] {
  return A.map((row) => {
    const firstB = B[0];
    if (firstB === undefined) throw new Error('nonlinear-bends: 빈 행렬을 곱한다');
    return firstB.map((_, j) =>
      row.reduce((s, v, k) => {
        const bk = B[k];
        const bkj = bk?.[j];
        if (bkj === undefined) throw new Error('nonlinear-bends: 행렬 크기가 맞지 않는다');
        return s + v * bkj;
      }, 0),
    );
  });
}

function matVec(A: readonly number[][], v: readonly number[]): number[] {
  return A.map((row) =>
    row.reduce((s, w, k) => {
      const vk = v[k];
      if (vk === undefined) throw new Error('nonlinear-bends: 벡터 길이가 맞지 않는다');
      return s + w * vk;
    }, 0),
  );
}

/**
 * 모든 층을 한 층으로 접는다 — 위 층에서 아래로 무게를 곱해 간다.
 * a = Wn·…·W1, b = bn + Wn·b(n−1) + Wn·W(n−1)·b(n−2) + …
 * 층을 지나며 선을 셈하는 `passLayer` 와 셈의 차례가 반대다 (아래에서 위가 아니라 위에서 아래).
 */
export function foldLayers(layers: readonly LayerSpec[]): Line {
  const top = layers[layers.length - 1];
  if (top === undefined) throw new Error('nonlinear-bends: 접을 층이 없다');
  let P: number[][] = top.W.map((r) => [...r]);
  let bias: number[] = [...top.b];
  for (let k = layers.length - 2; k >= 0; k -= 1) {
    const layer = layers[k];
    if (layer === undefined) throw new Error(`nonlinear-bends: 층 ${k} 가 없다`);
    const add = matVec(P, layer.b);
    bias = bias.map((v, i) => {
      const ai = add[i];
      if (ai === undefined) throw new Error('nonlinear-bends: 절편 길이가 맞지 않는다');
      return v + ai;
    });
    P = matMul(P, layer.W);
  }
  const a = P[0]?.[0];
  const b = bias[0];
  if (a === undefined || b === undefined || P.length !== 1 || P[0]?.length !== 1) {
    throw new Error('nonlinear-bends: 접은 층이 1 → 1 이 아니다');
  }
  return { a, b };
}

/** 표시용 수 — 자리수 고정, 음수는 −(U+2212), −0 은 0. */
export function formatNum(v: number, digits: number): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** 선의 글자 조각 — 기울기 · 절편의 부호 · 절편 크기. */
export function lineParts(line: Line): { a: string; sign: 'plus' | 'minus'; b: string } {
  const bText = formatNum(Math.abs(line.b), 2);
  const neg = line.b < 0 && Number(bText) !== 0;
  return { a: formatNum(line.a, 2), sign: neg ? 'minus' : 'plus', b: bText };
}

export async function nonlinearBends(ctx: FacetContext<NonlinearBendsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<NonlinearBendsFacetData>;
  const data = narrowNonlinearBendsData(rctx.data);
  const stepMs = data.stepMs;
  const [xLo, xHi] = data.xRange;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 층마다 단위 선을 미리 셈해 값의 폭(축 범위)을 정한다
  const input: Line = { a: 1, b: 0 };
  const stacked: Line[][] = [];
  let prev: Line[] = [input];
  for (const layer of data.layers) {
    if (rctx.cancelled) return;
    prev = passLayer(prev, layer);
    stacked.push(prev);
  }
  // 선은 곧으니 양 끝에서 닿는 값이 그 선의 폭이다
  const ends = [input, ...stacked.flat()].flatMap((u) => [u.a * xLo + u.b, u.a * xHi + u.b]);
  const vLo = Math.min(...ends);
  const vHi = Math.max(...ends);

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      xLo,
      xHi,
      vLo,
      vHi,
      input,
      layerCount: data.layers.length,
      maxUnits: Math.max(...data.layers.map((l) => l.W.length)),
    },
  });

  // 걸음 0 은 이미 입력 선이 선 화면이라 첫 층 앞에도 읽을 틈을 둔다
  for (let i = 0; i < stacked.length; i += 1) {
    if (!(await pause())) return;
    const units = stacked[i];
    if (units === undefined) throw new Error(`nonlinear-bends: 층 ${i + 1} 의 선이 없다`);
    await rctx.emit({ type: 'layer', payload: { index: i + 1, units } });
  }

  if (!(await pause())) return;
  const folded = foldLayers(data.layers);
  await rctx.emit({ type: 'fold', payload: { a: folded.a, b: folded.b } });
}
