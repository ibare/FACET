/**
 * 캐시 교체 정책 — 자리가 다 찼을 때 무엇을 버릴지 고르는 규칙.
 *
 * 앞일을 모르는 채 지난 일만 보고 고른다. **어느 지난 일을 보느냐** 가 정책이다.
 * 칸마다 두 시각을 적어 두고, 정책은 그중 하나만 읽는다.
 *
 *   lru   마지막 사용 시각이 가장 **작은** 칸을 버린다 (가장 오래 안 쓴 것)
 *   mru   마지막 사용 시각이 가장 **큰** 칸을 버린다   (방금 쓴 것)
 *   fifo  적재 시각이 가장 **작은** 칸을 버린다        (가장 먼저 들어온 것)
 *
 * 셋이 두 축으로 갈린다 — **어느 시각을 보는가**(clock) 와 **가장 작은 것을
 * 고르는가 큰 것을 고르는가**(pick). 그 두 축이 `POLICY_RULES` 이고, IR 의
 * `clockOf` · `chooseVictim` 이 같은 두 축을 인자로 받는다.
 *
 * ── 식별자 문법
 *
 *   index:<slot>   캐시 칸 (0 .. slotCount-1)
 *
 * ── 이벤트 (facet 고유 확장 — C2)
 *
 *   policy-set  payload { policyIndex, policy, clock, pick }      판을 비우고 규칙을 건다
 *   probe       payload { step, line }                            이번에 찾는 줄
 *   hit         target index:<slot>  payload { step, line }       그 줄이 칸에 있다
 *   miss        payload { step, line }                            어디에도 없다
 *   choose      target index:<slot>  payload { clock, value, pick, policy }
 *                                                                 버릴 칸을 골랐다
 *   evict       target index:<slot>  payload { line }             그 줄이 밀려 나간다
 *   install     target index:<slot>  payload { step, line, cold }  새 줄이 그 자리에 든다
 *   clocks      payload { used: number[], loaded: number[] }      칸마다의 두 시각
 *   done        payload { misses, hits, total, policy }           (표준 이벤트)
 *   phase       payload { phase }                    silent: true (메타 — C2/C3)
 *
 * 표준 이벤트는 `done` 뿐이다. 나머지는 캐시 한 벌의 어휘라 표준에 대응이 없다.
 *
 * ── phase 어휘 (irs.ts 와 집합이 정확히 같아야 한다 — C3)
 *
 *   'probe' | 'hit' | 'choose-victim' | 'install' | 'done'
 *
 * ── 메트릭 (C5)
 *
 *   'miss-count' · 'hit-count' · 'evict-count'
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type CacheReplacementData = {
  type: 'cache-replacement';
  /** 칸 수. 집합 하나짜리 완전 연관 캐시라 이것이 곧 연관도다. */
  slotCount: number;
  /** 라인 한 줄의 바이트 수. 화면의 머리말이 쓴다. */
  lineBytes: number;
  /** 접근열 — 줄 번호의 나열. */
  sequence: number[];
  /** 고를 수 있는 정책의 식별자 목록. 사람이 읽는 이름은 messages 의 label.* 에 있다. */
  policies: string[];
  /** 시작 정책의 식별자. */
  policy: string;
  /** 걸음 사이의 기본 간격 (ms). speed 슬라이더가 나눈다. */
  stepMs: number;
};

/** 정책이 읽는 시각. 이것이 첫째 축이다. */
export type CacheClock = 'used' | 'loaded';
/** 고른 시각 중 어느 끝을 버리는가. 이것이 둘째 축이다. */
export type CachePick = 'min' | 'max';

export type CachePolicyRule = {
  id: string;
  clock: CacheClock;
  pick: CachePick;
};

/**
 * 정책 셋이 두 축 위에 놓인 자리.
 *
 * 식별자·축은 알고리즘의 의미라 여기 둔다. 사람이 읽는 이름(`label.lru` 등)은
 * 저작 결정이라 `facet.ts` 의 `messages` 에 있다 (C10).
 */
export const POLICY_RULES: readonly CachePolicyRule[] = [
  { id: 'lru', clock: 'used', pick: 'min' },
  { id: 'mru', clock: 'used', pick: 'max' },
  { id: 'fifo', clock: 'loaded', pick: 'min' },
];

/** 빈 칸의 표식. IR 의 `-1` 과 같은 값이다. */
const EMPTY = -1;

export function policyIndexOf(id: string): number {
  const i = POLICY_RULES.findIndex((p) => p.id === id);
  return i < 0 ? 0 : i;
}

function ruleAt(index: number): CachePolicyRule {
  return POLICY_RULES[index] ?? POLICY_RULES[0]!;
}

/** 어느 칸이 이 줄을 담고 있는가. 없으면 -1. (IR 의 `findSlot`) */
function findSlot(tag: readonly number[], line: number): number {
  for (let i = 0; i < tag.length; i += 1) {
    if (tag[i] === line) return i;
  }
  return EMPTY;
}

/**
 * 버릴 자리를 고른다. (IR 의 `chooseVictim`)
 *
 * 빈 칸이 있으면 그것이 먼저다 — 아직 버릴 것이 없다. 다 찼으면 정책이 읽는
 * 시각(`clock`)만 보고 그 끝(`pick`)을 고른다.
 */
function pickVictim(
  tag: readonly number[],
  used: readonly number[],
  loaded: readonly number[],
  rule: CachePolicyRule,
): number {
  for (let i = 0; i < tag.length; i += 1) {
    if (tag[i] === EMPTY) return i;
  }
  const clockOf = (i: number): number => (rule.clock === 'loaded' ? loaded[i]! : used[i]!);
  let best = 0;
  let bestClock = clockOf(0);
  for (let i = 1; i < tag.length; i += 1) {
    const cur = clockOf(i);
    if (rule.pick === 'max') {
      if (cur > bestClock) {
        best = i;
        bestClock = cur;
      }
    } else {
      if (cur < bestClock) {
        best = i;
        bestClock = cur;
      }
    }
  }
  return best;
}

export type CacheReplacementResult = {
  misses: number;
  hits: number;
  /** 버려진 줄의 차례. 정책마다 이 차례가 갈린다. */
  evicted: number[];
};

/**
 * 한 정책으로 접근열을 끝까지 돌린 결과. 순수 함수라 `ctx` 를 받지 않는다 (C8 Exception).
 *
 * 화면과 IR 을 견주는 자리에서 셋째 증인으로 쓴다.
 */
export function computeCacheReplacementResult(
  data: CacheReplacementData,
  policyId: string,
): CacheReplacementResult {
  const rule = ruleAt(policyIndexOf(policyId));
  const tag: number[] = new Array<number>(data.slotCount).fill(EMPTY);
  const used: number[] = new Array<number>(data.slotCount).fill(0);
  const loaded: number[] = new Array<number>(data.slotCount).fill(0);
  const evicted: number[] = [];
  let misses = 0;
  let hits = 0;

  for (let t = 0; t < data.sequence.length; t += 1) {
    const line = data.sequence[t]!;
    const at = findSlot(tag, line);
    if (at < 0) {
      misses += 1;
      const victim = pickVictim(tag, used, loaded, rule);
      if (tag[victim] !== EMPTY) evicted.push(tag[victim]!);
      tag[victim] = line;
      loaded[victim] = t;
      used[victim] = t;
    } else {
      hits += 1;
      used[at] = t;
    }
  }
  return { misses, hits, evicted };
}

/** 한 번의 재생이 어떻게 끝났는가. 취소와 갈림을 한 boolean 에 겹치지 않는다 (C8). */
type RunOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'switch'; policy: number };

/** 입력에서 정책 번호를 읽는다. 그 입력이 아니면 null (C9 — 단언 뒤에 검사가 있다). */
function readPolicyIndex(input: ReactiveInputEvent | null): number | null {
  if (input === null) return null;
  if (input.type !== 'policy') return null;
  const p = input.payload as { value?: unknown } | undefined;
  const value = p?.value;
  if (typeof value !== 'number') return null;
  if (!Number.isInteger(value)) return null;
  if (value < 0 || value >= POLICY_RULES.length) return null;
  return value;
}

export async function cacheReplacementAlgorithm(
  ctxIn: FacetContext<CacheReplacementData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<CacheReplacementData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 480;

  /** phase 는 이름이 호출부에 리터럴로 남는다 (C3). */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 메트릭은 누적이라 다시 돌릴 때 0 으로 되돌려야 한다. 러너의 `resetMetrics`
   * 는 되감기에만 걸리므로, 정책을 갈아 끼운 재생은 여기서 직접 맞춘다.
   * 호출부에 이름이 리터럴로 남는다 (C5).
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  async function runOnce(policyIndex: number): Promise<RunOutcome> {
    const rule = ruleAt(policyIndex);
    const slots = data.slotCount;
    const tag: number[] = new Array<number>(slots).fill(EMPTY);
    const used: number[] = new Array<number>(slots).fill(0);
    const loaded: number[] = new Array<number>(slots).fill(0);
    let misses = 0;
    let hits = 0;
    let evictions = 0;

    await ctx.emit({
      type: 'policy-set',
      payload: { policyIndex, policy: rule.id, clock: rule.clock, pick: rule.pick },
    });
    setMetric('miss-count', 0);
    setMetric('hit-count', 0);
    setMetric('evict-count', 0);
    await ctx.emit({ type: 'clocks', payload: { used: [...used], loaded: [...loaded] } });

    for (let t = 0; t < data.sequence.length; t += 1) {
      if (ctx.cancelled) return { kind: 'cancelled' };
      const line = data.sequence[t]!;

      await phase('probe');
      await ctx.emit({ type: 'probe', payload: { step: t, line } });

      const at = findSlot(tag, line);
      if (at >= 0) {
        hits += 1;
        used[at] = t;
        await phase('hit');
        await ctx.emit({ type: 'hit', target: `index:${at}`, payload: { step: t, line } });
        setMetric('hit-count', hits);
      } else {
        misses += 1;
        await ctx.emit({ type: 'miss', payload: { step: t, line } });
        setMetric('miss-count', misses);

        await phase('choose-victim');
        const victim = pickVictim(tag, used, loaded, rule);
        const cold = tag[victim] === EMPTY;
        if (!cold) {
          const clockValue = rule.clock === 'loaded' ? loaded[victim]! : used[victim]!;
          await ctx.emit({
            type: 'choose',
            target: `index:${victim}`,
            payload: { clock: rule.clock, value: clockValue, pick: rule.pick, policy: rule.id },
          });
          evictions += 1;
          await ctx.emit({
            type: 'evict',
            target: `index:${victim}`,
            payload: { line: tag[victim]! },
          });
          setMetric('evict-count', evictions);
        }

        await phase('install');
        tag[victim] = line;
        loaded[victim] = t;
        used[victim] = t;
        await ctx.emit({
          type: 'install',
          target: `index:${victim}`,
          payload: { step: t, line, cold },
        });
      }

      await ctx.emit({ type: 'clocks', payload: { used: [...used], loaded: [...loaded] } });

      const alive = await ctx.sleep(stepMs);
      if (!alive) return { kind: 'cancelled' };

      // 재생 도중에도 손잡이를 받는다 — 기다리게 하지 않고 그 자리에서 갈아 끼운다.
      const switched = readPolicyIndex(ctx.pollInput());
      if (switched !== null && switched !== policyIndex) {
        return { kind: 'switch', policy: switched };
      }
    }

    await phase('done');
    await ctx.emit({
      type: 'done',
      payload: { misses, hits, total: data.sequence.length, policy: rule.id },
    });
    return { kind: 'done' };
  }

  /** 다음 정책을 기다린다. 취소면 null — 갈림과 취소를 겹치지 않는다 (C8). */
  async function waitPolicy(): Promise<number | null> {
    for (;;) {
      if (ctx.cancelled) return null;
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return null;
      }
      if (ctx.cancelled) return null;
      const next = readPolicyIndex(input);
      if (next === null) continue;
      return next;
    }
  }

  let policyIndex = policyIndexOf(data.policy);
  for (;;) {
    if (ctx.cancelled) return;
    const out = await runOnce(policyIndex);
    if (out.kind === 'cancelled') return;
    if (out.kind === 'switch') {
      policyIndex = out.policy;
      continue;
    }
    const next = await waitPolicy();
    if (next === null) return;
    policyIndex = next;
  }
}
