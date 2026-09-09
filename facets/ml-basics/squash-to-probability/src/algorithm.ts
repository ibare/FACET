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
 * ── 이벤트 (전부 facet 고유. silent 인 것은 없다)
 *
 *   axis-extends    { scores: number[] }
 *                   점수 축이 양쪽 끝까지 뻗는다. scores 는 오름차순.
 *   band-appears    {}
 *                   확률의 띠가 두 벽 사이에 선다.
 *   score-squashed  { index: number; z: number; p: number;
 *                     fromIndex: number | null; fromZ: number | null;
 *                     fromP: number | null;
 *                     axisGap: number | null; bandGap: number | null }
 *                   점수 하나가 띠로 내려앉는다. index 는 오름차순 scores 에서의
 *                   자리. from* / *Gap 은 이미 내려앉은 이웃이 없을 때 (한가운데
 *                   첫 걸음) 전부 null.
 *   tails-pressed   { lowP: number; highP: number }
 *                   축의 나머지 (가장 작은 점수 바깥 · 가장 큰 점수 바깥) 가
 *                   양 끝 자투리로 눌려 든다. 두 값은 그 자투리의 안쪽 끝.
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
 * 이미 내려앉은 이웃. 가운데에서 바깥으로 밟으므로 안쪽 이웃이 먼저 있다.
 * 데이터에 0 이 없어 양쪽 첫 걸음이 갈리는 경우를 위해 바깥쪽도 본다.
 */
function landedNeighbour(index: number, z: number, landed: Set<number>): number | null {
  const inner = z < 0 ? index + 1 : index - 1;
  const outer = z < 0 ? index - 1 : index + 1;
  if (landed.has(inner)) return inner;
  if (landed.has(outer)) return outer;
  return null;
}

export async function squashToProbabilityAlgorithm(
  base: FacetContext<SquashToProbabilityData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SquashToProbabilityData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;
  const asc = [...ctx.data.scores].sort((a, b) => a - b);
  const order = asc
    .map((z, index) => ({ z, index }))
    .sort((a, b) => Math.abs(a.z) - Math.abs(b.z) || a.z - b.z);

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
    await ctx.emit({ type: 'axis-extends', payload: { scores: asc } });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'band-appears', payload: {} });
    if (!(await gate())) return false;

    const landed = new Set<number>();
    for (const { z, index } of order) {
      const p = sigmoid(z);
      const fromIndex = landedNeighbour(index, z, landed);
      const fromZ = fromIndex === null ? null : asc[fromIndex];
      const fromP = fromZ === null ? null : sigmoid(fromZ);
      await ctx.emit({
        type: 'score-squashed',
        payload: {
          index,
          z,
          p,
          fromIndex,
          fromZ,
          fromP,
          axisGap: fromZ === null ? null : Math.abs(z - fromZ),
          bandGap: fromP === null ? null : Math.abs(p - fromP),
        },
      });
      landed.add(index);
      if (!(await gate())) return false;
    }

    await ctx.emit({
      type: 'tails-pressed',
      payload: { lowP: sigmoid(asc[0]), highP: sigmoid(asc[asc.length - 1]) },
    });
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
