/**
 * facet:primality — 한 수가 소수인가. √까지만 나눠 보면 되고, **그것이 얼마나 큰
 * 아낌인가.**
 *
 * 조각 `facet:divisorPairsSqrt` 가 36 에서 말한 것을 이어받는다 — 약수는 짝을
 * 이루고 짝의 작은 쪽은 언제나 √n 이하이므로, √n 까지만 훑으면 빠짐이 없다.
 * 그 조각은 **아낌을 한 글자도 말하지 않는다.** 36 은 2 에서 바로 걸려 √까지
 * 가든 끝까지 가든 검사 횟수가 같기 때문이다.
 *
 * 아낌은 여기서 말한다. 그리고 그것이 드러나려면 **n 이 소수여야 한다** — 합성수는
 * 두 방법이 다 일찍 멈춰 차이가 안 난다. 소수일 때만 둘 다 끝까지 가고, 그때
 * 비로소 √ 의 값이 드러난다.
 *
 * ── 1차 데이터
 *
 *   n 하나다. 후보도 √n 도 검사 횟수도 배율도 전부 여기서 셈한다. 화면에 박아 둔
 *   수는 없다.
 *
 * ── 손잡이 (전부 소수다)
 *
 *   n         97     211    409    797    1597
 *   √까지     8      13     19     27     38
 *   2..n-1    95     209    407    795    1595
 *   배율      11.9   16.1   21.4   29.4   42.0
 *
 * ── 왜 합성수 갈래가 화면에 없는가
 *
 *   `examine` 은 나누어떨어지는 순간 멈추는 **온전한 소수 판정**이다 (테스트가
 *   합성수로 그것을 잰다). 다만 손잡이가 소수만 내주므로 그 갈래는 화면에 닿지
 *   않고, 그래서 그것을 위한 캡션을 선언하지 않는다 — 뜰 수 없는 문안은 코드에만
 *   있는 죽은 문장이 된다 (배치 공통 지침).
 *
 *   그 갈래가 **코드 패널에는 있다.** `irs.ts` 의 `return 0` 이 그것이고, 재생
 *   내내 그 줄에는 한 번도 불이 들어오지 않는다. 불이 안 들어온다는 것이 곧
 *   n 이 소수라는 뜻이라, 없는 갈래가 아니라 **보이는 증거**가 된다.
 *
 * ── 이벤트 (전부 facet 고유 확장. C2)
 *
 *   built    { n, limit, fullChecks }          판을 세운다. 후보는 2..limit
 *   check    { n, d, checks }                  후보 d 로 나눠 봤다 (걸음 하나)
 *   wall     { n, limit }                      √ 에 닿았다. 그 너머는 볼 것이 없다
 *   verdict  { n, checks, fullChecks }         소수다 + 아낌
 *   phase    { phase }                         silent: true (코드 패널 하이라이트)
 *
 *   `phase` 만 silent 다. 나머지 넷은 모두 화면을 바꾸는 걸음 경계다.
 *
 * ── phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다
 *
 *   'bound' | 'test' | 'next' | 'prime'
 *
 *   합성수일 때 돌아가는 `return 0` 에는 phase 를 두지 않는다. 손잡이가 소수만
 *   내주어 algorithm 이 그 phase 를 영영 발신하지 않으므로, 붙이면 그것이
 *   dead phase 가 된다 (C3 MUST NOT).
 *
 * ── 메트릭 (C5)
 *
 *   check-count · full-check-count — 둘 다 정수다. **배율은 싣지 않는다** —
 *   control-bar 가 `String(value)` 로 찍고 metric 은 누적기라 소수 delta 가
 *   부동소수 오차를 쌓는다. 배율은 stage 가 직접 그린다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type PrimalityData = {
  type: 'primality';
  /** 소수인지 판정할 수. 손잡이가 바꾼다. */
  n: number;
  /** 판을 세우는 걸음의 정지 시간(ms). */
  buildMs: number;
  /** 후보 하나를 나눠 보는 걸음의 정지 시간(ms). */
  stepMs: number;
};

/**
 * 손잡이가 고를 수 있는 수. **다섯 다 소수다.**
 *
 * 합성수를 섞으면 그 값에서만 두 방법이 다 일찍 멈춰 아낌이 사라진다. 손잡이를
 * 움직이는 사람이 보아야 하는 것은 "n 이 커질수록 √ 가 더 많이 아낀다" 하나이고,
 * 그 단조로움이 깨지면 손잡이가 무엇을 말하는지 알 수 없게 된다.
 */
export const PRIMALITY_NS: readonly number[] = [97, 211, 409, 797, 1597];

const DEFAULT_N = 97;
const DEFAULT_BUILD_MS = 900;
const DEFAULT_STEP_MS = 520;

export type PrimalityFacts = {
  n: number;
  /** ⌊√n⌋ — 마지막으로 보는 후보. 후보는 2..limit. */
  limit: number;
  /** 실제로 나눠 본 후보들. 소수면 2..limit 전부, 합성수면 걸린 자리에서 끊긴다. */
  candidates: number[];
  /** √ 쪽이 한 검사 횟수 = candidates.length. */
  sqrtChecks: number;
  /** 2..n-1 을 낱낱이 볼 때의 검사 횟수. */
  fullChecks: number;
  prime: boolean;
  /** 소수가 아니면 걸린 약수. 소수면 null. */
  factor: number | null;
};

/**
 * √까지 나눠 보는 온전한 소수 판정. **세는 것이 아니라 실제로 돌린다.**
 *
 * 검사 횟수를 공식으로 적어 두면 그것이 화면과 어긋나도 아무도 모른다. 여기서
 * 도는 루프가 곧 화면이 보이는 걸음이고, `fullChecks` 도 같은 뜻으로 2..n-1 을
 * 실제로 돌려 센다.
 *
 * 경계는 `d <= Math.sqrt(n)` 이다 — `irs.ts` 가 `d <= sqrt(n)` 으로 적는 것과
 * 같은 식이라야 코드 패널이 **지금 도는 코드**를 보인다. 그 둘이 갈리면 패널이
 * 다른 코드를 보이게 되고, 패널을 다는 까닭이 지워진다.
 */
export function examine(n: number): PrimalityFacts {
  const limit = Math.floor(Math.sqrt(n));
  const candidates: number[] = [];
  let prime = n >= 2;
  let factor: number | null = null;

  const root = Math.sqrt(n);
  for (let d = 2; d <= root; d += 1) {
    candidates.push(d);
    if (n % d === 0) {
      prime = false;
      factor = d;
      break;
    }
  }

  // 낱낱이 보는 쪽. 같은 판정을 다른 방법으로 구해 검사 횟수를 센다.
  let fullChecks = 0;
  for (let d = 2; d < n; d += 1) {
    fullChecks += 1;
    if (n % d === 0) break;
  }

  return { n, limit, candidates, sqrtChecks: candidates.length, fullChecks, prime, factor };
}

function pickN(value: unknown, fallback: number): number {
  return typeof value === 'number' && PRIMALITY_NS.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 입력에서 수를 읽는다. 알아볼 수 없으면 null. */
function readN(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.value === 'number' && PRIMALITY_NS.includes(p.value)) return p.value;
  if (typeof p.n === 'string') {
    const v = Number(p.n);
    if (PRIMALITY_NS.includes(v)) return v;
  }
  return null;
}

export const primalityAlgorithm = async (base: FacetContext<PrimalityData>): Promise<void> => {
  const ctx = base as ReactiveContext<PrimalityData>;
  const data = ctx.data;

  const buildMs = typeof data.buildMs === 'number' ? data.buildMs : DEFAULT_BUILD_MS;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  /**
   * `ctx.metric` 은 **더하는** 채널이라 값을 그대로 앉힐 수 없다. 지금 화면에
   * 걸린 값을 따로 들고 그 차이만 보낸다 — 손잡이를 움직여 다시 돌 때 검사
   * 횟수가 앞 회차 위에 쌓이면 안 되기 때문이다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name) ?? 0;
    if (value === cur) return;
    ctx.metric(name, value - cur);
    shown.set(name, value);
  };

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  let n = pickN(data.n, DEFAULT_N);

  for (;;) {
    if (ctx.cancelled) return;
    data.n = n;
    const facts = examine(n);

    setMetric('check-count', 0);
    setMetric('full-check-count', facts.fullChecks);

    await ctx.emit({
      type: 'built',
      payload: { n, limit: facts.limit, fullChecks: facts.fullChecks },
    });
    if (!(await ctx.sleep(buildMs))) return;

    // 후보를 하나씩 짚는다. 걸음 하나가 후보 하나다 — 손잡이 어느 값에서도
    // 여든 아래(최대 38)라 낱낱이 보일 수 있다. 견주는 쪽(2..n-1)은 1595 까지
    // 가므로 걸음으로 펴지 않고 아래 자(meter)가 비율로 대신 말한다.
    let checks = 0;
    for (const d of facts.candidates) {
      if (ctx.cancelled) return;
      await phase('bound');
      await phase('test');
      checks += 1;
      setMetric('check-count', checks);
      await ctx.emit({ type: 'check', payload: { n, d, checks } });
      await phase('next');
      if (!(await ctx.sleep(stepMs))) return;
    }

    // 문(gate)을 한 번 더 지나 경계가 깨지는 것이 √ 의 벽이다.
    await phase('bound');
    await ctx.emit({ type: 'wall', payload: { n, limit: facts.limit } });
    if (!(await ctx.sleep(buildMs))) return;

    await phase('prime');
    await ctx.emit({
      type: 'verdict',
      payload: { n, checks, fullChecks: facts.fullChecks },
    });

    // 입력 대기. 여기서 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
    let next = n;
    try {
      for (;;) {
        if (ctx.cancelled) return;
        const ev: ReactiveInputEvent = await ctx.waitForInput();
        // 이 facet 이 정의한 위젯은 손잡이 하나('n')다. 그 밖의 어휘는 조용히
        // 흘린다 (C2). 지금은 손잡이뿐이라 없어도 돌지만, control-bar 는 facet
        // 고유 button 의 payload 에 `inputState` 를 통째로 얹으므로 단추가 하나만
        // 붙어도 그 클릭에 `n: '97'` 이 실려 온다. 그때 type 을 안 보면 단추
        // 누름을 "수를 골랐다" 로 읽는다.
        if (ev.type !== 'n') continue;
        const v = readN(ev.payload);
        if (v !== null) {
          next = v;
          break;
        }
      }
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    n = next;
  }
};
