/**
 * 지연 계단 — 못 찾을 때마다 한 층씩 더 내려간다.
 *
 * 코어가 값을 찾는다. 가장 가까운 층에 없으면 한 층 내려가고, 거기도 없으면 또
 * 한 층 내려간다. 층은 넷뿐인데 처음과 끝이 쉰 배다.
 *
 * ── 식별자
 *   층은 `initialData.levels` 의 `id` 를 그대로 쓴다 (`l1` · `l2` · `l3` · `dram`).
 *   사람이 읽는 이름은 데이터가 아니라 문안이므로 `facet.ts` 의 `label.*` 에 있다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음)
 *   `ask`    첫 층에 묻는다. 걸음의 시작이라 문(gate)을 지나지 않는다.
 *   `miss`   지금 층에 없어 한 층 내려간다.
 *   `hit`    마지막 층에서 찾는다.
 *   `span`   첫 층 대비 마지막 층의 총 배수를 잰다.
 *   `rewind` 한 걸음씩 다시 보기 전에 화면을 처음으로 되돌린다.
 *
 *   **다섯 다 payload 가 비어 있다.** 어느 층인가는 발신이 온 차례가 말하고
 *   (층은 하나씩 내려가므로 내려간 횟수가 곧 그 층의 자리다), 사이클 수 · 배수 ·
 *   총 배수 · 나노초는 선언의 층 목록에서 순수하게 결정되는 값이라 아래 함수들이
 *   낸다. 같은 수를 발신에도 싣고 화면에서도 셈하면 그림이 제 안에서 갈린다
 *   (`tasks/scene-migration-protocol.md` 4 절 — payload 가 친절하면 위험하다).
 *
 * ── 셈은 순수 함수로 내준다
 *   `latencyLevelsOf` · `latencyRungs` · `latencySpanFactor` 는 선언만 받아 화면이
 *   쓰는 수를 전부 낸다. 장면이 이것을 부르므로 좁히개도 환산도 한 자리에만 있다.
 *   순회 자체(없으면 한 층 더 내려간다)는 내주지 않는다 — 그것이 이 조각의
 *   알고리즘이다 (프로토콜 4 절의 경계).
 *
 * 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LatencyLevel = {
  /** 층 식별자. 사람이 읽는 이름은 `facet.ts` 의 `label.<id>` 가 갖는다. */
  id: string;
  /** 그 층에 닿는 데 드는 대략의 사이클 수. */
  cycles: number;
};

export type LatencyLadderData = {
  type: 'latency-ladder';
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  levels: LatencyLevel[];
};

/**
 * 사이클 하나의 시간(ns). 3.3GHz 언저리의 코어를 가정한 값이며, 그 전제를
 * 밝히는 것은 화면이 아니라 `description.ts` 의 일이다 (S-piece).
 */
const NS_PER_CYCLE = 0.3;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * 선언의 층 목록을 좁힌다. 장면과 algorithm 이 **같은 이것**을 부르므로 걸음 수와
 * 화면의 층 수가 갈릴 수 없다 (프로토콜 4 절 — 자르는 잣대가 두 군데면 갈린다).
 *
 * 새 배열과 새 객체를 낸다. 넘겨받은 것을 참조로 쥐면 되짚을 때 이미 굴러간
 * 자료로 바탕을 그리게 된다 (S-scene).
 *
 * 단언 뒤에 필드마다 `typeof` 가 따라오므로 좁히개다 (C9).
 */
export function latencyLevelsOf(raw: unknown): LatencyLevel[] {
  const out: LatencyLevel[] = [];
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    const cycles = typeof rec.cycles === 'number' && Number.isFinite(rec.cycles) ? rec.cycles : 0;
    if (id !== '' && cycles > 0) out.push({ id, cycles });
  }
  return out;
}

/** 한 층의 셈 전부. 화면에 뜨는 수는 모두 여기를 지난다. */
export type LatencyRung = {
  id: string;
  cycles: number;
  /** 사이클을 나노초로 환산한 값. */
  ns: number;
  /** 바로 위 층 대비 배수. 맨 위 층은 견줄 것이 없어 null. */
  factor: number | null;
};

/**
 * 층 목록에서 층별 셈을 낸다.
 *
 * 떼어 내도 "층마다 몇 배씩 벌어진다" 는 주장은 남는다 — 그러니 내준다
 * (프로토콜 4 절의 잣대).
 */
export function latencyRungs(levels: readonly LatencyLevel[]): LatencyRung[] {
  return levels.map((level, i) => {
    const above = levels[i - 1];
    return {
      id: level.id,
      cycles: level.cycles,
      ns: round1(level.cycles * NS_PER_CYCLE),
      factor: above === undefined || above.cycles <= 0 ? null : round1(level.cycles / above.cycles),
    };
  });
}

/**
 * 첫 층 대비 마지막 층의 총 배수. 층이 둘 미만이면 잴 것이 없어 null.
 *
 * 이 조각의 결론이라 층별 배수와 **같은 자리**에서 같은 반올림을 지난다.
 */
export function latencySpanFactor(levels: readonly LatencyLevel[]): number | null {
  if (levels.length < 2) return null;
  const first = levels[0];
  const last = levels[levels.length - 1];
  if (first === undefined || last === undefined || first.cycles <= 0) return null;
  return round1(last.cycles / first.cycles);
}

/**
 * 걸음 사이의 문. 자동 재생에서는 `ctx.sleep`, 다시 보기에서는 `advance` 대기다.
 * false 를 돌려주면 취소된 것이므로 걸음을 멈춘다.
 */
type Gate = () => Promise<boolean>;

/**
 * 한 번의 내려가기. 걸음표를 손으로 적지 않고 `levels` 를 순회한다 — 순서를
 * 정하는 것은 저작자가 아니라 데이터다 (S-piece).
 *
 * 발신은 무엇이 일어났는지만 말한다. 몇 번째 층인지는 `miss` 가 온 횟수가 말하고
 * 그 층의 수치는 장면이 `latencyRungs` 로 낸다.
 */
async function descend(
  ctx: ReactiveContext<LatencyLadderData>,
  levels: readonly LatencyLevel[],
  gate: Gate,
): Promise<void> {
  // 마운트 직후의 첫 걸음은 문을 지나지 않는다. 문을 먼저 두면 stepMs 만큼
  // 빈 화면이 보인 뒤에야 그림이 선다 (S-piece).
  await ctx.emit({ type: 'ask' });

  // 첫 층을 뺀 나머지 층마다 한 번씩 내려간다.
  for (let below = 1; below < levels.length; below += 1) {
    if (!(await gate())) return;
    await ctx.emit({ type: 'miss' });
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'hit' });

  if (!(await gate())) return;
  await ctx.emit({ type: 'span' });
}

export const latencyLadderAlgorithm = async (
  ctx: FacetContext<LatencyLadderData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<LatencyLadderData>;
  const data = rctx.data;
  const levels = latencyLevelsOf(data.levels);
  if (levels.length < 2) return;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 700;

  // 1. 자동 재생. 스스로 시작해 할 말을 마친다.
  await descend(rctx, levels, () => rctx.sleep(stepMs));

  // 2. 그 뒤로는 한 걸음씩. 곱씹으며 읽고 싶은 사람을 위한 것이다.
  for (;;) {
    if (rctx.cancelled) return;
    let input: { type: string };
    try {
      input = await rctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!rctx.cancelled) throw err;
      return;
    }
    if (rctx.cancelled) return;
    // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 세지 않게 (S-piece).
    if (input.type !== 'advance') continue;

    // 첫 누름은 되감고 첫 걸음까지 간다. 되감기만 하면 눌러도 반응이 없는 것으로
    // 읽힌다 — 첫 emit 이 문 밖에 있으므로 이 한 번에 둘이 나간다.
    await rctx.emit({ type: 'rewind' });
    await descend(rctx, levels, async () => {
      for (;;) {
        if (rctx.cancelled) return false;
        try {
          const next = await rctx.waitForInput();
          if (rctx.cancelled) return false;
          if (next.type === 'advance') return true;
        } catch (err) {
          if (!rctx.cancelled) throw err;
          return false;
        }
      }
    });
  }
};
