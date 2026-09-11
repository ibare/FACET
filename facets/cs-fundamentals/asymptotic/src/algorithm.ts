/**
 * asymptotic — 같은 반이면 비가 머물고, 다른 반이면 비가 떠난다.
 *
 * 조각(`curvesCross`)은 삽입 `n²/4` 와 병합 `n log₂n` 이 n = 16 에서 정확히
 * 64 = 64 로 만나는 **한 점**을 보이고 멈춘다. 완제품이 더하는 것은 **교차는 한
 * 점이고 등급은 끝까지의 성질**이라는 것이다. 손잡이는 입력 크기 n 하나이고, 그것을
 * 밀면 같은 반의 비는 2 에 붙박여 있는데 다른 반의 비는 2 → 4 → 10.7 → 32 → 102.4
 * 로 떠난다. n = 4 에서는 **둘이 똑같이 2 라서 구별되지 않는다** — 그것이 이 완제품이
 * 조각에 더하는 자리다. 한 점만 보아서는 반을 알 수 없다.
 *
 * ── 무엇을 세는가: 값이 아니라 비다
 *
 * 화면에 비용 값을 띄우지 않는다. `n²` 는 n = 1024 에서 1,048,576 이라 선형으로는
 * 못 그리고, 로그 축척으로 그리면 둘 다 직선이 되어 "갈린다" 가 화면에서 사라진다.
 * 주 수치가 값이 아니라 **비**이므로 그릴 것도 비다 — 큰 쪽의 자를 작은 쪽의 낱개로
 * 나누면 나뉜 낱개의 수가 곧 비이고, 두 자를 같은 길이로 두면 축척 문제가 통째로
 * 사라진다. 자의 길이는 뜻이 없고 **나뉜 결만** 뜻이 있다는 전제는 글이 밝힌다.
 *
 * ── 1차 데이터
 *
 * 세 함수의 **모양**(계수 · 지수 · 로그 밑)과 n 사다리와 걸음 간격과 손잡이의 처음
 * 자리뿐이다. 비도 낱개 수도 자릿값도 `computeAsymptoticRows` 가 그 자리에서 셈한다.
 * 표의 수를 선언에 옮겨 적으면 사다리를 바꿀 때 화면이 조용히 거짓을 말한다.
 *
 * ── 반올림 규약 (표시와 판정을 같은 수로)
 *
 * `log` 는 부동소수다. 그래서 **자릿값을 먼저 반올림한 정수로 만들고** 그것으로 비용을
 * 셈한다 — `n log₂n` 이 8 · 64 · 384 · 2048 · 10240 이라는 정확한 정수가 되고 비의
 * 내림도 흔들리지 않는다. 사다리가 전부 2 의 거듭제곱이라 이 반올림은 근사가 아니라
 * 정확하다. 반올림을 판정 뒤로 미루면 `Math.log(256)/Math.log(2)` 가
 * 8.000000000000002 로 나오는 기계에서 비가 31.999… 가 되어 낱개 수가 32 가 아니라
 * 31 이 된다. 조각 `curvesCross` 가 같은 자리에서 같은 결정을 했다 (표시와 판정을
 * 같은 수로).
 *
 * ── 낱개를 세는 규약
 *
 * 낱개 수는 비의 **내림**이고, 남은 조각은 부분 낱개로 그린다. 두 자를 같은 규칙으로
 * 다룬다 — 한쪽만 묶고 다른 쪽을 낱낱이 보이면 화면이 거짓 대비를 만든다. 걸음도
 * 마찬가지로 자리마다 양쪽에 하나씩 준다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type         | payload                                               | silent |
 * |--------------|-------------------------------------------------------|--------|
 * | `phase`      | `{ phase: string }`                                   | O      |
 * | `board-set`  | `{ sizes: number[] }`                                 | X      |
 * | `size-set`   | `{ index, n, logBits }`                               | X      |
 * | `tile-cross` | `{ index, n, tiles, remainder }`                      | X      |
 * | `tile-same`  | `{ index, n, tiles, remainder }`                      | X      |
 * | `verdict`    | `{ index, n, crossTiles, sameTiles, gap, visited }`   | X      |
 * | `done`       | 없음 (표준 어휘)                                       | X      |
 *
 * `remainder` 는 온전한 낱개 뒤에 남는 조각(0 이상 1 미만)이다. 분수이지만 계기가
 * 아니라 payload 라 실어도 된다 — 계기에는 정수만 싣는다.
 *
 * ── phase 어휘 (C3 — irs.ts 와 집합이 완전히 일치해야 한다)
 *
 * `scale` · `cross` · `same` · `gap`
 *
 * ── 메트릭 (C5 — facet.ts 의 metrics[].name 과 일치)
 *
 * `cross-tile-count` · `same-tile-count` · `log-bit-count`
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 비용 함수의 모양. `coefficient × n^exponent × log_logBase(n)` 이고 밑 0 이면 로그 없음. */
export type GrowthShape = {
  coefficient: number;
  exponent: number;
  /** 0 이면 로그 인자가 없다. */
  logBase: number;
};

export type AsymptoticData = {
  type: 'asymptotic';
  /** 입력 크기 사다리. 손잡이가 이 중 하나를 고른다. */
  sizes: number[];
  /** `n log₂n` 의 모양. */
  nLogN: GrowthShape;
  /** `n²` 의 모양. */
  nSquared: GrowthShape;
  /** `2n²` 의 모양 — `n²` 와 계수만 다르다. 그래서 같은 반이다. */
  twiceNSquared: GrowthShape;
  /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
  size: number;
  /**
   * 걸음 하나가 끝난 뒤 쉬는 시간.
   *
   * stage 의 운동이 그 앞에 더해진다 — 가장 얇은 걸음(크기 짚기)이 440ms 라
   * 벽시계는 860ms 이고 **실측은 864ms** 였다. 800ms 바닥선은 `S-piece` 85–87 이 조각에 못박은 것이나 이
   * 배치의 사양이 완제품의 자동 재생에도 같은 잣대를 걸어 그대로 준용한다.
   * 실측은 `test/asymptotic.test.ts` 가 실제 stage 를 굴리며 잰다.
   */
  stepMs: number;
};

export type AsymptoticRow = {
  index: number;
  n: number;
  /** 반올림한 자릿값 `log₂n`. 2 · 4 · 6 · 8 · 10 으로 아주 느리게 자란다. */
  logBits: number;
  /** 다른 반의 비 — `n²` 안에 `n log₂n` 이 몇 번 들어가는가. */
  crossRatio: number;
  crossTiles: number;
  crossRemainder: number;
  /** 같은 반의 비 — `2n²` 안에 `n²` 이 몇 번 들어가는가. 늘 2 다. */
  sameRatio: number;
  sameTiles: number;
  sameRemainder: number;
  /** 두 반의 낱개 수 차이. n = 4 에서 0 이고 거기서는 둘이 구별되지 않는다. */
  gap: number;
};

/**
 * 반올림한 로그 인자. 밑이 0 이면 로그가 없으므로 1 이다.
 *
 * 반올림을 **셈 전에** 한다 — 위 주석의 반올림 규약.
 */
export function logFactor(n: number, logBase: number): number {
  if (logBase <= 0) return 1;
  return Math.floor(Math.log(n) / Math.log(logBase) + 0.5);
}

/** 모양 하나의 비용. 화면에 띄우지는 않고 비를 내는 데만 쓴다. */
export function costOf(shape: GrowthShape, n: number): number {
  return shape.coefficient * n ** shape.exponent * logFactor(n, shape.logBase);
}

/** 사다리 한 칸을 나누는 규칙 — 온전한 낱개와 남은 조각. */
function split(ratio: number): { tiles: number; remainder: number } {
  const tiles = Math.floor(ratio);
  return { tiles, remainder: ratio - tiles };
}

/** 사다리마다 두 비를 셈한다. 선언이 준 모양에서만 나온다. */
export function computeAsymptoticRows(data: AsymptoticData): AsymptoticRow[] {
  return data.sizes.map((n, index) => {
    const crossRatio = costOf(data.nSquared, n) / costOf(data.nLogN, n);
    const sameRatio = costOf(data.twiceNSquared, n) / costOf(data.nSquared, n);
    const cross = split(crossRatio);
    const same = split(sameRatio);
    return {
      index,
      n,
      logBits: logFactor(n, data.nLogN.logBase),
      crossRatio,
      crossTiles: cross.tiles,
      crossRemainder: cross.remainder,
      sameRatio,
      sameTiles: same.tiles,
      sameRemainder: same.remainder,
      gap: cross.tiles - same.tiles,
    };
  });
}

/** segmented-slider 가 보내는 payload 에서 고른 값을 꺼낸다 (C9). */
function segmentValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const asymptoticAlgorithm = async (ctx: FacetContext<AsymptoticData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<AsymptoticData>;
  const rows = computeAsymptoticRows(ctx.data);
  const sizes = ctx.data.sizes;
  const step = ctx.data.stepMs;

  /** 사다리에서 지금 손잡이가 짚은 칸. 없는 값이면 마지막 칸으로 본다. */
  const indexOfSize = (value: number): number => {
    const hit = sizes.indexOf(value);
    return hit >= 0 ? hit : sizes.length - 1;
  };

  let limit = indexOfSize(ctx.data.size);

  /**
   * 메트릭은 늘 **더해진다** (`ctx.metric` 이 누적기다). 손잡이를 밀 때마다 처음부터
   * 다시 세므로 보이고 싶은 것은 누적이 아니라 이번 판의 값이다. 지금 보이는 값을
   * 기억해 두고 그 차이를 보낸다. 실리는 것은 정수뿐이다.
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판 — 사다리를 손잡이가 짚은 칸까지 걸어가고 판정까지. 끝까지 갔으면 true. */
  const playRound = async (): Promise<boolean> => {
    await ctx.emit({ type: 'board-set', payload: { sizes } });
    setMetric('cross-tile-count', 0);
    setMetric('same-tile-count', 0);
    setMetric('log-bit-count', 0);
    if (!(await rctx.sleep(step))) return false;

    for (let i = 0; i <= limit; i += 1) {
      // 문(gate)을 바디 첫 줄에 둘 수 없다 — 한 자리가 세 걸음이라 쉬는 자리가 그
      // 안쪽에 흩어진다. 그래서 진입 검사를 직접 둔다 (C8).
      if (ctx.cancelled) return false;
      const row = rows[i];
      if (!row) return false;

      await phase('scale');
      await ctx.emit({
        type: 'size-set',
        payload: { index: row.index, n: row.n, logBits: row.logBits },
      });
      setMetric('log-bit-count', row.logBits);
      if (!(await rctx.sleep(step))) return false;

      await phase('cross');
      await ctx.emit({
        type: 'tile-cross',
        payload: {
          index: row.index,
          n: row.n,
          tiles: row.crossTiles,
          remainder: row.crossRemainder,
        },
      });
      setMetric('cross-tile-count', row.crossTiles);
      if (!(await rctx.sleep(step))) return false;

      await phase('same');
      await ctx.emit({
        type: 'tile-same',
        payload: {
          index: row.index,
          n: row.n,
          tiles: row.sameTiles,
          remainder: row.sameRemainder,
        },
      });
      setMetric('same-tile-count', row.sameTiles);
      if (!(await rctx.sleep(step))) return false;
    }

    const last = rows[limit];
    if (!last) return false;
    await phase('gap');
    await ctx.emit({
      type: 'verdict',
      payload: {
        index: last.index,
        n: last.n,
        crossTiles: last.crossTiles,
        sameTiles: last.sameTiles,
        gap: last.gap,
        visited: limit + 1,
      },
    });
    // 판정이 한 박자 머문 뒤에 "이제 기다린다" 로 넘어간다. 둘을 붙여 내보내면
    // 판정 문장이 같은 프레임에 덮여 아무도 읽지 못한다.
    if (!(await rctx.sleep(step * 3))) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;

      // 손잡이를 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와 위젯만 남는다.
      const ev = await rctx.waitForInput();
      // waitForInput 이 취소 시 throw 하더라도 그 규약에 기대지 않는다 (C8) —
      // 이 루프가 가장 바깥이라 여기서 새면 아무도 못 잡는다.
      if (ctx.cancelled) return;
      if (ev.type === 'size') {
        const v = segmentValue(ev.payload);
        if (v !== null) limit = indexOfSize(v);
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
