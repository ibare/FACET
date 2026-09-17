/**
 * 시그모이드 — 끝없이 커지는 점수를 0 과 1 사이의 확률로 눌러 담는다.
 *
 * 재료는 둘뿐이다. 양쪽으로 끝이 없는 **점수 축**과, 0 과 1 이라는 두 벽 사이에
 * 갇힌 **확률의 띠**. 걸음마다 점수 하나가 축에서 띠로 내려앉고, 그때 이웃과
 * 축에서 벌린 거리에 견주어 띠에서 얻은 폭을 잰다. 그 두 수의 어긋남이 이
 * 조각의 논증이다 — 가운데에서는 축에서 1 을 가면 띠에서 0.23 을 얻지만,
 * 바깥에서는 축에서 4 를 가도 띠에서 0.018 밖에 못 얻는다.
 *
 * ── 걸음 순서 (가운데에서 바깥으로)
 *
 * 순서를 정하는 것은 데이터다 — 원점에서의 거리 `|z|` 오름차순, 같으면 값
 * 오름차순. 손으로 적은 걸음표가 아니라 축 위의 자리에서 나온 순서다.
 * 바깥부터 밟으면 −8 과 −4 가 띠에서 사실상 겹쳐 앉아 무엇을 보라는 것인지
 * 알 수 없다. 안쪽부터 밟아야 얻는 폭이 걸음마다 줄어드는 것이 순서 자체로
 * 드러난다.
 *
 * 그 차례를 정하는 `squashOrder` 와 점수를 거르는 `squashScoresOf` 는 **내준다** —
 * 장면이 같은 함수를 불러 몇 번째 걸음인지와 바탕을 셈한다 (S-scene). 둘 다
 * 목록만 있으면 정해지는 잣대라 떼어 내도 이 조각이 말하려는 바가 남는다.
 * 반대로 **σ 는 내주지 않는다** — 그것이 이 조각의 알고리즘 그 자체라, 장면이
 * 대신 풀면 발신이 장식이 된다.
 *
 * ── 이벤트 (전부 facet 고유. silent 인 것은 없다)
 *
 *   axis-extends    {}
 *                   점수 축이 양쪽 끝까지 뻗는다. 점수 목록은 선언에서 온다.
 *   band-appears    {}
 *                   확률의 띠가 두 벽 사이에 선다.
 *   score-squashed  { p: number }
 *                   점수 하나가 띠로 내려앉는다. p 는 σ(z) — 이 걸음이 내리는
 *                   판정 하나다. 어느 자리인지는 싣지 않는다 (밟는 차례가
 *                   `squashOrder` 로 정해지므로 장면이 센다).
 *   tails-pressed   {}
 *                   축의 나머지 (가장 작은 점수 바깥 · 가장 큰 점수 바깥) 가
 *                   양 끝 자투리로 눌려 든다. 그 안쪽 끝 두 값은 그때 이미
 *                   내려앉아 있으므로 장면의 자취가 쥐고 있다.
 *   rewind          {}
 *                   한 걸음씩 다시 보려고 처음으로 되감는다.
 *   done            {}
 *                   마지막 걸음의 강조를 거둔다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SquashToProbabilityData = {
  type: 'squash-to-probability';
  /** 눌러 담을 점수. 구조만 둔다 — 확률은 여기서 셈한다. */
  scores: number[];
  /** 걸음 간격 (S-piece). 읽을 시간을 주는 저작 결정이라 선언에 있다. */
  stepMs: number;
};

const FALLBACK_STEP_MS = 700;

/** σ(z) = 1 / (1 + e^(−z)). */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * 눌러 담을 점수를 오름차순으로 거른다.
 *
 * **새 배열을 돌려준다** — 선언이 준 배열을 그대로 쥐면 장면이 바탕을 참조로 쥐는
 * 꼴이 된다 (S-scene).
 */
export function squashScoresOf(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const one of raw) {
    if (typeof one === 'number' && Number.isFinite(one)) out.push(one);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 밟는 차례 — 오름차순 점수 목록에서의 자리를 가운데부터 바깥으로.
 *
 * 원점에서의 거리 오름차순, 같으면 값 오름차순. 저작자가 손으로 적은 걸음표가
 * 아니라 축 위의 자리에서 나온 순서다 (S-piece).
 */
export function squashOrder(asc: readonly number[]): number[] {
  return asc
    .map((z, index) => ({ z, index }))
    .sort((a, b) => Math.abs(a.z) - Math.abs(b.z) || a.z - b.z)
    .map((one) => one.index);
}

export async function squashToProbabilityAlgorithm(
  base: FacetContext<SquashToProbabilityData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SquashToProbabilityData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;
  const asc = squashScoresOf(ctx.data.scores);

  /** 자동 재생을 마치면 걸음의 동력이 시간에서 사용자 입력으로 바뀐다. */
  let manual = false;

  /** 다음 걸음까지의 문. 이어 가면 true, 취소되었으면 false. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  }

  /**
   * 처음부터 끝까지 한 바퀴. 문은 걸음 **뒤**에 둔다 — 그래야 되감은 직후의
   * 첫 걸음이 문에 걸리지 않고 바로 보인다 (S-piece).
   */
  async function play(): Promise<boolean> {
    await ctx.emit({ type: 'axis-extends', payload: {} });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'band-appears', payload: {} });
    if (!(await gate())) return false;

    for (const index of squashOrder(asc)) {
      await ctx.emit({ type: 'score-squashed', payload: { p: sigmoid(asc[index]) } });
      if (!(await gate())) return false;
    }

    await ctx.emit({ type: 'tails-pressed', payload: {} });
    await ctx.emit({ type: 'done', payload: {} });
    return true;
  }

  if (!(await play())) return;

  manual = true;
  for (;;) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind', payload: {} });
    if (!(await play())) return;
  }
}
