/**
 * 완전 탐색 — 후보 수는 그대로 두고 차원만 키운다.
 *
 * 질문 하나로 줄이면 이렇다. **후보를 줄이면 될 일인가.** 아니다. 후보 수를 64 로
 * 못박아 두고 차원만 2 에서 768 로 옮기면 곱셈이 128 에서 49,152 로, 384 배로
 * 불어난다. 벡터 하나가 두꺼워지면 훑어야 할 양이 통째로 두꺼워지기 때문이다.
 *
 * ── 1차 데이터 (호스트가 셈해 준 값)
 *
 *   candidates  후보 수. 64 로 고정한다 — 이 화면에서 움직이지 않는 쪽이다.
 *   dims        손잡이가 고를 수 있는 차원 다섯.
 *   dim         처음 차원.
 *   batch       한 걸음에 훑는 후보 수. 걸음 수를 정하는 저작 결정이다.
 *   stepMs      걸음 사이의 정지 시간. 읽을 틈을 주는 저작 결정이다.
 *
 * 파생값은 전부 여기서 셈한다 — 곱셈은 `후보 × 차원`, 벡터 하나의 자리는
 * `차원 × 4바이트`, 전체 자리는 `후보 × 차원 × 4바이트`. 표의 수를 선언에 박지
 * 않는다. 선언이 아는 것은 후보 64 와 차원 다섯뿐이다.
 *
 * ── 발신하는 이벤트
 *
 *   state-changed  target 'config'
 *     payload { dim, candidates, unit, tilesMax, multiplies, vectorBytes, totalBytes }
 *     손잡이가 정한 차원으로 판을 새로 세운다. silent 아님.
 *
 *   mark           target `index:<방금 훑은 마지막 후보>`
 *     payload { scanned, candidates, multiplies, bytes }
 *     후보 묶음 하나를 훑었다. 수는 payload 가 정본이고 target 은 화면에서
 *     어느 후보까지 왔는지를 가리킨다. silent 아님.
 *
 *   done           payload { candidates, multiplies, bytes }
 *     이 차원에서 다 훑었다. silent 아님.
 *
 * `phase` 는 발신하지 않는다. 코드 패널이 없어 `irs.ts` 가 빈 배열이고, C3 은
 * all-or-none 이라 한쪽만 두면 어긋난다.
 *
 * ── 계기
 *
 *   multiply-count  지금까지의 곱셈 횟수
 *   byte-sum        지금까지 훑은 전체 자리 (바이트)
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ExhaustiveSearchData = {
  type: string;
  /** 후보 수. 손잡이를 돌려도 바뀌지 않는다. */
  candidates: number;
  /** 손잡이가 고를 수 있는 차원. */
  dims: number[];
  /** 처음 차원. */
  dim: number;
  /** 한 걸음에 훑는 후보 수. */
  batch: number;
  /** 걸음 사이의 정지 시간 (ms). */
  stepMs: number;
};

/** 4바이트 실수 하나. 임베딩이 실제로 쓰는 자리다. */
const BYTES_PER_NUMBER = 4;

export type ExhaustiveSearchCost = {
  /** 후보 전부를 훑는 데 드는 곱셈 횟수. */
  multiplies: number;
  /** 벡터 하나가 차지하는 자리 (바이트). */
  vectorBytes: number;
  /** 후보 전부가 차지하는 자리 (바이트). */
  totalBytes: number;
};

/**
 * 한 차원에서의 비용. 화면도 검사도 이 함수 하나를 본다 — 같은 셈을 두 곳에
 * 적으면 둘이 나란히 틀릴 수 있다.
 */
export function exhaustiveSearchCost(candidates: number, dim: number): ExhaustiveSearchCost {
  return {
    multiplies: candidates * dim,
    vectorBytes: dim * BYTES_PER_NUMBER,
    totalBytes: candidates * dim * BYTES_PER_NUMBER,
  };
}

/**
 * 타일 하나가 지는 곱셈 — **가장 작은 차원에서의 전체 곱셈**이다.
 *
 * 자릿수가 갈리는 양을 길이로 그리면 작은 쪽이 티끌이 되고, 접으면 (로그)
 * 주장 자체가 사라진다. 그래서 길이가 아니라 **낱개의 수**로 옮긴다. 가장 작은
 * 값이 타일 하나가 되게 단위를 잡으면, 384 배가 "타일 1 개와 384 개" 가 되어
 * 한 화면에 정직하게 들어온다. 축척은 끝까지 한 번도 바뀌지 않는다.
 */
export function exhaustiveSearchUnit(candidates: number, dims: number[]): number {
  return candidates * Math.min(...dims);
}

/** 판이 담아야 하는 타일 수 — 가장 큰 차원에서의 곱셈을 단위로 나눈 것. */
export function exhaustiveSearchTilesMax(candidates: number, dims: number[]): number {
  const unit = exhaustiveSearchUnit(candidates, dims);
  return Math.round((candidates * Math.max(...dims)) / unit);
}

export async function exhaustiveSearchAlgorithm(
  ctx: FacetContext<ExhaustiveSearchData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<ExhaustiveSearchData>;
  const data = ctx.data;
  const n = data.candidates;
  const dims = data.dims;
  const unit = exhaustiveSearchUnit(n, dims);
  const tilesMax = exhaustiveSearchTilesMax(n, dims);
  const batch = Math.max(1, data.batch);

  /**
   * 계기에 지금 값을 앉힌다.
   *
   * `ctx.metric` 은 누적 채널이고 러너는 **되감기 때만** 그것을 비운다. 손잡이를
   * 돌려 다시 도는 것은 되감기가 아니므로, 지금 값을 들고 차이만 보내야 한다.
   * 델타가 0 이어도 보낸다 — 화면과 여기가 어긋날 자리를 남기지 않는다.
   */
  const shown = new Map<string, number>();
  const put = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - prev);
  };

  /**
   * 손잡이를 기다린다. 새 차원이면 그 수, 취소됐으면 null.
   *
   * 갈림과 취소를 한 값에 겹치지 않으려고 `null` 을 취소 전용으로 쓴다 (C8).
   * `waitForInput` 둘레는 앞뒤로 본다 — 앞 검사가 루프 안 첫 줄이라
   * `continue` 로 돌아와도 반드시 지난다.
   */
  const waitDim = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input: ReactiveInputEvent = await rx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'dims') continue;
      const p = input.payload as { value?: unknown } | undefined;
      const picked = typeof p?.value === 'number' ? p.value : Number.NaN;
      if (!Number.isFinite(picked) || !dims.includes(picked)) continue;
      return picked;
    }
  };

  let dim = dims.includes(data.dim) ? data.dim : dims[0]!;

  try {
    for (;;) {
      if (ctx.cancelled) return;

      const cost = exhaustiveSearchCost(n, dim);
      put('multiply-count', 0);
      put('byte-sum', 0);
      await ctx.emit({
        type: 'state-changed',
        target: 'config',
        payload: {
          dim,
          candidates: n,
          unit,
          tilesMax,
          multiplies: cost.multiplies,
          vectorBytes: cost.vectorBytes,
          totalBytes: cost.totalBytes,
        },
      });

      for (let scanned = 0; scanned < n; ) {
        if (ctx.cancelled) return;
        scanned = Math.min(n, scanned + batch);
        const multiplies = scanned * dim;
        const bytes = scanned * dim * BYTES_PER_NUMBER;
        put('multiply-count', multiplies);
        put('byte-sum', bytes);
        await ctx.emit({
          type: 'mark',
          target: `index:${scanned - 1}`,
          payload: { scanned, candidates: n, multiplies, bytes },
        });
        if (!(await rx.sleep(data.stepMs))) return;
      }

      await ctx.emit({
        type: 'done',
        payload: { candidates: n, multiplies: cost.multiplies, bytes: cost.totalBytes },
      });

      const next = await waitDim();
      if (next === null) return;
      dim = next;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
