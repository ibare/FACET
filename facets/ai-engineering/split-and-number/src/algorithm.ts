/**
 * 쪼개서 번호로 — 벡터를 토막 둘로 쪼개고, 토막마다 대표 넷 중 가장 닮은 것을
 * 골라 그 번호만 남긴다.
 *
 * ── 이벤트 어휘 (facet 고유, 전부 step boundary — silent 없음)
 *
 *   split    { row: number; front: number[]; back: number[] }
 *            한 벡터를 토막 둘로 가른다. front/back 은 각 토막의 값 두 개.
 *
 *   assign   { row: number;
 *              frontCode: number; backCode: number;
 *              frontDists: number[]; backDists: number[];
 *              error: number }
 *            토막마다 대표 넷까지의 거리를 재고(dists, 대표 번호 순), 가장 가까운
 *            것으로 갈아탄 뒤 번호만 남긴다. error 는 원본과 되살린 값 사이의
 *            거리 — sqrt(Σ (원본ᵢ - 되살린ᵢ)²).
 *
 *   summary  { plainBytes: number; codeBytes: number }
 *            값을 그대로 들 때와 번호만 들 때의 자리.
 *
 *   rewind   {}
 *            처음으로 되감는다. 자동 재생이 끝난 뒤 advance 를 누르면 온다.
 *
 * ── 진행
 *
 * reactive. 마운트하면 스스로 재생하고, 다 돌면 `advance` 입력을 기다린다.
 * 걸음 간격은 `initialData.stepMs` 가 정한다 (S-piece).
 *
 * ── 1차 데이터와 파생값
 *
 * 선언에 있는 것은 대표 여덟의 좌표와 벡터 다섯의 값뿐이다. 고른 번호 · 거리 ·
 * 오차 · 바이트 수는 전부 여기서 셈한다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitAndNumberData = {
  type: string;
  /** 토막 하나의 길이. 벡터는 이 길이로 갈린다. */
  subDim: number;
  /** 앞 토막 자리의 대표들. 번호는 배열의 자리. */
  frontBook: number[][];
  /** 뒤 토막 자리의 대표들. */
  backBook: number[][];
  /** 양자화할 벡터들. */
  vectors: number[][];
  /** 값 하나를 실수로 들 때의 바이트. */
  bytesPerValue: number;
  /** 번호 하나를 들 때의 바이트. 대표가 넷이면 2비트로 족하나 견주기 쉽게 바이트로 센다. */
  bytesPerCode: number;
  /** 걸음 사이의 정지 시간(ms). */
  stepMs: number;
};

/** 한 줄을 셈한 결과. */
type Row = {
  row: number;
  front: number[];
  back: number[];
  frontDists: number[];
  backDists: number[];
  frontCode: number;
  backCode: number;
  error: number;
};

function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** 대표들까지의 거리를 번호 순으로 재고, 가장 가까운 번호를 고른다. */
function measure(sub: number[], book: number[][]): { dists: number[]; code: number } {
  const dists = book.map((centroid) => distance(sub, centroid));
  let code = 0;
  for (let i = 1; i < dists.length; i += 1) {
    if ((dists[i] ?? Infinity) < (dists[code] ?? Infinity)) code = i;
  }
  return { dists, code };
}

/** 벡터 다섯을 전부 셈한다. 화면에 뜨는 수는 모두 여기서 나온다. */
function quantizeAll(data: SplitAndNumberData): Row[] {
  const cut = data.subDim;
  return data.vectors.map((vector, row) => {
    const front = vector.slice(0, cut);
    const back = vector.slice(cut);
    const f = measure(front, data.frontBook);
    const b = measure(back, data.backBook);
    const restored = [
      ...(data.frontBook[f.code] ?? []),
      ...(data.backBook[b.code] ?? []),
    ];
    return {
      row,
      front,
      back,
      frontDists: f.dists,
      backDists: b.dists,
      frontCode: f.code,
      backCode: b.code,
      error: distance(vector, restored),
    };
  });
}

export async function splitAndNumberAlgorithm(
  ctx: FacetContext<SplitAndNumberData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SplitAndNumberData>;
  const data = ctx.data;
  const rows = quantizeAll(data);
  const plainBytes = data.vectors[0] !== undefined
    ? data.vectors[0].length * data.bytesPerValue
    : 0;
  const codeBytes = 2 * data.bytesPerCode;

  /** 참이면 자동 재생이 끝나 한 걸음씩 짚어 보는 중이다. */
  let manual = false;
  /**
   * 마운트 직후와 되감은 직후의 첫 걸음은 문을 지나지 않는다. 문은 걸음 *사이*의
   * 것이라 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece).
   */
  let skipGate = true;

  /** 걸음 사이의 문. 이어서 나아가도 좋으면 true. */
  async function gate(): Promise<boolean> {
    if (skipGate) {
      skipGate = false;
      return true;
    }
    if (!manual) return rctx.sleep(data.stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      try {
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return false;
        if (input.type !== 'advance') continue;
        return true;
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!ctx.cancelled) throw err;
        return false;
      }
    }
  }

  for (;;) {
    for (const r of rows) {
      if (!(await gate())) return;
      await ctx.emit({
        type: 'split',
        payload: { row: r.row, front: r.front, back: r.back },
      });

      if (!(await gate())) return;
      await ctx.emit({
        type: 'assign',
        payload: {
          row: r.row,
          frontCode: r.frontCode,
          backCode: r.backCode,
          frontDists: r.frontDists,
          backDists: r.backDists,
          error: r.error,
        },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'summary', payload: { plainBytes, codeBytes } });

    // 여기서부터는 한 걸음씩. 처음 누르는 advance 는 되감고 첫 걸음까지 간다.
    manual = true;
    if (!(await gate())) return;
    await ctx.emit({ type: 'rewind', payload: {} });
    skipGate = true;
  }
}
