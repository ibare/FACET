/**
 * bisect-halving — 가운데 커밋을 꺼내 시험하고, 판정에 따라 이력의 절반을 버린다.
 *
 * 커밋 줄기 하나(`commits`, 오래된 것부터)와 판정이 알려진 두 끝(`knownGood` · `knownBad`)이 있다.
 * good 위치 g 와 bad 위치 b 사이(g 는 빼고 b 는 넣는다)가 후보다. 시험할 커밋은 (g + b) 를 2 로 나눈 내림.
 * good 이면 g ← m, bad 면 b ← m. b − g = 1 이면 멈추고 b 가 처음 깨진 커밋이다.
 *
 * `firstBad` 는 **시험 판정기로만** 쓴다 — 위치가 그 커밋 이상이면 bad (한 번 깨지면 뒤도 깨져 있다).
 * 이벤트에는 판정만 실린다. 장면 · 화면은 이 값을 미리 알지 못한다.
 *
 * 이벤트 (모두 silent 아님, 위치는 `commits` 의 0 부터 센 자리):
 *   test   { at: number; verdict: 'good' | 'bad'; tests: number; minutes: number }
 *          — 후보의 가운데 커밋 하나를 꺼내 빌드하고 테스트를 돌린 판정. tests · minutes 는 지금까지 쌓인 값
 *   drop   { at: number; verdict: 'good' | 'bad'; from: number; to: number;
 *            wasGood: number; wasBad: number; good: number; bad: number }
 *          — 판정에 따라 후보에서 빠진 자리 from..to (양끝 포함)와 경계의 앞뒤 값
 *   found  { at: number; tests: number; minutes: number }
 *          — 후보가 하나 남았다. 그 커밋이 처음 깨진 커밋
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BisectVerdict = 'good' | 'bad';

export type BisectHalvingFacetData = {
  type: 'bisect-halving';
  stepMs: number;
  /** 커밋 식별자, 오래된 것부터. 부모는 바로 앞 커밋이다. */
  commits: string[];
  knownGood: string;
  knownBad: string;
  /** 숨은 값 — 시험 판정기로만 쓴다. */
  firstBad: string;
  /** 시험 한 번(꺼내기 + 빌드 + 테스트)에 드는 분. */
  testMinutes: number;
};

/** 커밋 식별자의 자리. 없거나 두 번 나오면 던진다. */
export function commitIndex(commits: readonly string[], id: string, field: string): number {
  const at = commits.indexOf(id);
  if (at < 0) throw new Error(`bisect-halving: ${field} "${id}" 가 commits 에 없다`);
  if (commits.indexOf(id, at + 1) >= 0) throw new Error(`bisect-halving: 커밋 "${id}" 가 두 번 나온다`);
  return at;
}

/** 후보 (good, bad] 의 가운데 — 내림. */
export function middleOf(good: number, bad: number): number {
  if (bad - good < 2) throw new Error(`bisect-halving: 후보 ${good}..${bad} 에는 가운데가 없다`);
  return Math.floor((good + bad) / 2);
}

function checkData(d: BisectHalvingFacetData): { good: number; bad: number; firstBad: number } {
  if (!Array.isArray(d.commits) || d.commits.length < 2) {
    throw new Error('bisect-halving: commits 는 둘 이상이어야 한다');
  }
  for (const id of d.commits) commitIndex(d.commits, id, 'commits[]');
  const good = commitIndex(d.commits, d.knownGood, 'knownGood');
  const bad = commitIndex(d.commits, d.knownBad, 'knownBad');
  const firstBad = commitIndex(d.commits, d.firstBad, 'firstBad');
  if (good >= bad) throw new Error('bisect-halving: knownGood 는 knownBad 보다 앞이어야 한다');
  if (firstBad <= good || firstBad > bad) {
    throw new Error('bisect-halving: firstBad 는 knownGood 뒤, knownBad 이하여야 한다');
  }
  if (!Number.isFinite(d.testMinutes) || d.testMinutes <= 0) {
    throw new Error('bisect-halving: testMinutes 는 양수여야 한다');
  }
  if (!Number.isFinite(d.stepMs) || d.stepMs <= 0) {
    throw new Error('bisect-halving: stepMs 는 양수여야 한다');
  }
  return { good, bad, firstBad };
}

export async function bisectHalving(context: FacetContext<BisectHalvingFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BisectHalvingFacetData>;
  const d = ctx.data;
  const { stepMs, testMinutes } = d;
  const bounds = checkData(d);
  let good = bounds.good;
  let bad = bounds.bad;

  /** 시험 판정기 — 숨은 값은 여기서만 쓴다 (단조). */
  const judge = (at: number): BisectVerdict => (at >= bounds.firstBad ? 'bad' : 'good');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let tests = 0;
  // 걸음 0 은 이미 읽을 것이 있는 화면(줄기와 두 끝)이라 첫 시험 앞에도 머문다.
  while (bad - good > 1) {
    if (!(await pause())) return;
    const at = middleOf(good, bad);
    const verdict = judge(at);
    tests += 1;
    await ctx.emit({
      type: 'test',
      payload: { at, verdict, tests, minutes: tests * testMinutes },
    });

    if (!(await pause())) return;
    const wasGood = good;
    const wasBad = bad;
    let from: number;
    let to: number;
    if (verdict === 'good') {
      from = good + 1;
      to = at;
      good = at;
    } else {
      from = at + 1;
      to = bad;
      bad = at;
    }
    await ctx.emit({
      type: 'drop',
      payload: { at, verdict, from, to, wasGood, wasBad, good, bad },
    });
  }

  if (!(await pause())) return;
  if (judge(bad) !== 'bad' || judge(good) !== 'good') {
    throw new Error('bisect-halving: 끝난 경계의 판정이 어긋난다');
  }
  await ctx.emit({
    type: 'found',
    payload: { at: bad, tests, minutes: tests * testMinutes },
  });
}
