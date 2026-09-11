/**
 * p-np — 찾는 일과 맞는지 보는 일 사이의 간극은 크기를 밀면 어떻게 벌어지는가.
 *
 * 손잡이는 **원소 개수 n** 하나다. 6 · 8 · 10 · 12 · 15 · 20 으로 밀면 확인이 드는
 * 값은 덧셈 5 → 19 로 거의 그대로인데, 찾기가 들여다봐야 할 후보는 64 →
 * 1,048,576 으로 부푼다. **한쪽이 거의 안 움직이는 것이 이 화면의 주장이다.**
 *
 * ── 세는 단위 — 양쪽에 같은 규칙을 건다
 *
 * 조각 `verifyVsFind` 가 단위 섞임을 잡아 "들여다본 후보의 수" 로 통일했다(확인 1,
 * 찾기 64). 완제품은 그 단위를 그대로 쓰되 **후보 하나를 들여다보는 값**을 밖으로
 * 꺼낸다 — 그것이 덧셈 `n-1` 이고, **양쪽에 똑같이 매긴다.**
 *
 *   확인의 값 = 후보 1 개 × 덧셈 (n-1)
 *   찾기의 값 = 후보 2^n 개 × 덧셈 (n-1)
 *
 * 후보 하나당 값이 양쪽에서 같으므로 비에서 약분되고, **배율은 정확히 후보의 수**가
 * 된다 (64 → 1,048,576). 사양의 표가 확인을 덧셈으로, 찾기를 후보로 센 것은 단위가
 * 섞인 것이고 그 배율(13 → 55,188)은 `2^n / (n-1)` 이다. 단위를 맞추면 배율이 곧
 * 후보의 수라는 더 깨끗한 수가 나온다.
 *
 * **덧셈 `n-1` 은 최악이다** — 수를 전부 고른 후보가 그만큼 든다. 건네받은 후보는
 * 그보다 적게 들 수 있고(이 데이터에서는 둘), 화면은 자의 칸 `n-1` 개 중 실제로
 * 쓴 만큼을 칠해 둘을 함께 보인다.
 *
 * ── 걸음의 단위 — 손잡이와 무관하게 아홉으로 고정한다
 *
 * 후보를 하나씩 보이면 n=20 에서 걸음이 백만이 된다. 간격을 줄이는 것은 규범이
 * 금지한 방향이므로 **걸음 수를 먼저 못박는다.** 한 걸음은 "화면이 한 가지 사실을
 * 말하는 것" 이고, 차례는 이렇다.
 *
 *   문제 · 더하기 · 판정 · 후보 세기 · 훑기 셋 · 간극 · 매듭  =  아홉
 *
 * **아홉은 n 을 밀어도 아홉이다.** 걸음 수가 손잡이를 따라 늘면 "크기를 키우면 일이
 * 많아진다" 는 인상이 되어 주장과 결이 어긋난다 — 이 화면이 재는 것은 걸음의 수가
 * 아니라 **한 걸음이 말하는 수**다. 폭발은 격자가 진다.
 *
 * ── 32비트
 *
 * 가장 큰 수는 후보의 수 2^20 = 1,048,576 이다. 비트마스크(`1 << i`)는 i 가 19 를
 * 넘지 않아 성하다. **IR 은 곱셈을 한 번도 쓰지 않는다** — 후보의 수를 `total +
 * total` 로 세므로 중간값이 후보의 수를 넘을 자리가 없다 (irs.ts 참조).
 *
 * ── 1차 데이터 (facet.ts 의 initialData)
 *   values  고를 수 있는 수 스무 개. 손잡이가 앞에서부터 n 개를 쓴다.
 *   target  부분집합의 합이 이것과 같으면 답이다.
 *   n       이번 판의 원소 개수. 손잡이가 민다.
 *   stepMs  한 걸음의 길이.
 * 후보의 수도 덧셈의 수도 건네받는 후보도 여기 적지 않는다. 전부 여기서 센다.
 *
 * ── 식별자
 *   쓰지 않는다. 후보 번호의 정본은 payload 다 (조각과 같다).
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *   problem          { values: number[]; target; n; candidates; adds }
 *       수 n 개와 목표가 섰다. 두 일이 같은 수를 놓고 갈린다.
 *   check-sum        { picked: number[]; sum; used; adds }
 *       건네받은 후보를 왼쪽부터 더했다. `used` 가 실제로 쓴 덧셈, `adds` 가 최악.
 *   check-verdict    { sum; target; ok; looks; adds }
 *       합이 목표와 같다. 확인은 후보 하나(`looks`)를 보고 멈춘다.
 *   count-candidates { candidates; n }
 *       수 하나가 늘 때마다 후보가 두 배가 되어 이만큼이다.
 *   sweep            { seen; total }
 *       찾기가 여기까지 들여다봤다. 한 걸음에 전체의 1/3 씩.
 *   gap              { checkLooks; findLooks; adds }
 *       확인 1 대 찾기 2^n. 이 걸음이 이 화면의 매듭이다.
 *   done             { n; candidates; adds }
 *       한 판이 끝나고 손잡이를 기다린다.
 *   phase            { phase }                                     silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'check' | 'verdict' | 'count' | 'gap'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5. 전부 정수다)
 *   check-looks · find-looks · add-steps
 *
 * ── 사용자 입력 (reactive)
 *   { type: 'size', payload: { value: 6|8|10|12|15|20, … } }
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 손잡이가 줄 수 있는 값. facet.ts 의 segmented-slider 와 같아야 한다. */
export const P_NP_N_CHOICES: readonly number[] = [6, 8, 10, 12, 15, 20];

/** 훑기를 몇 걸음으로 나누는가. 손잡이와 무관하게 고정이다. */
export const P_NP_SWEEP_STEPS = 3;

export type PNpData = {
  type: string;
  /** 고를 수 있는 수. 손잡이가 앞에서부터 n 개를 쓴다. 1차 데이터. */
  values: number[];
  /** 부분집합의 합이 이것과 같으면 답이다. 1차 데이터. */
  target: number;
  /** 이번 판의 원소 개수. 손잡이가 민다. */
  n: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 후보 하나 — 번호(비트마스크) · 고른 수 · 더해 온 자취 · 합. */
export type PNpCandidate = {
  mask: number;
  picked: number[];
  sum: number;
};

export type PNpRound = {
  n: number;
  /** 이번 판이 쓰는 수 — values 의 앞 n 개. */
  values: number[];
  /** 찾기가 들여다봐야 할 후보의 수 = 2^n. */
  candidates: number;
  /** 후보 하나를 들여다보는 값 — 최악으로 덧셈 n-1 번. 양쪽에 같게 매긴다. */
  adds: number;
  /** 확인 쪽에 건네지는 후보. */
  given: PNpCandidate;
};

/**
 * 후보 번호를 비트로 풀어 고른 수와 합을 낸다.
 *
 * `1 << i` 의 i 는 손잡이의 끝인 20 을 넘지 않으므로 가장 큰 자리값이 2^19 이고,
 * 번호 자체도 2^20 아래다. 셈하는 **순서**가 중간값을 정하는데, 여기서는 자리값을
 * 하나씩 보는 것이라 중간값이 후보 번호를 넘을 자리가 없다.
 */
function candidateAt(values: number[], mask: number): PNpCandidate {
  const picked: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    if ((mask & (1 << i)) === 0) continue;
    const v = values[i] ?? 0;
    picked.push(v);
    sum += v;
  }
  return { mask, picked, sum };
}

/**
 * 한 판을 셈한다.
 *
 * 건네받는 후보는 **번호가 가장 작은 답**이다. 훑기가 그것을 만나면 곧 멎으므로
 * n=20 이라도 백만 바퀴를 돌지 않는다 — 이 데이터는 앞 여섯 안에 답이 있어 스물일곱
 * 번째 후보에서 멎는다. 답이 하나도 없으면 확인 쪽이 설 자리가 없으므로 오류다 (C6).
 *
 * `registerAlgorithm` 의 `computeResult` 로 등록하지는 않는다 — 그 자리는
 * goal-preview 를 둔 facet 의 것이다. 알고리즘과 검사가 같은 셈을 쓰라고 밖으로 낸다.
 */
export function computePNpResult(data: PNpData, n: number): PNpRound {
  const values = data.values.slice(0, n);
  const candidates = 2 ** values.length;
  for (let mask = 0; mask < candidates; mask += 1) {
    const c = candidateAt(values, mask);
    if (c.sum !== data.target) continue;
    return { n: values.length, values, candidates, adds: Math.max(0, values.length - 1), given: c };
  }
  throw new Error(`p-np: 합이 ${data.target} 인 부분집합이 앞 ${n} 개 안에 없다`);
}

function pick(value: number, choices: readonly number[], fallback: number): number {
  return choices.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: PNpData, input: ReactiveInputEvent): void {
  if (input.type !== 'size') return;
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  data.n = pick(value, P_NP_N_CHOICES, data.n);
}

export const pNpAlgorithm = async (ctx: FacetContext<PNpData>): Promise<void> => {
  const rc = ctx as ReactiveContext<PNpData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 판을 다시
   * 세우는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 판의 수를 보이게 한다 (sieve 와 같다).
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8).
   *
   * 걸음마다 같은 길이다 — stage 가 전면 동기라 얹히는 애니메이션이 없고, 그래서
   * 어느 걸음이 가장 얇은지 따질 것이 없다.
   */
  const beat = (): Promise<boolean> => rc.sleep(ctx.data.stepMs);

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const n = pick(ctx.data.n, P_NP_N_CHOICES, P_NP_N_CHOICES[0] ?? 6);
    const round = computePNpResult(ctx.data, n);
    const given = round.given;

    setMetric('check-looks', 0);
    setMetric('find-looks', 0);
    setMetric('add-steps', 0);

    await ctx.emit({
      type: 'problem',
      payload: {
        values: [...round.values],
        target: ctx.data.target,
        n: round.n,
        candidates: round.candidates,
        adds: round.adds,
      },
    });
    if (!(await beat())) return false;

    // ── 확인. 후보 하나를 실제로 더해 본다.
    await phase('check');
    await ctx.emit({
      type: 'check-sum',
      payload: {
        picked: [...given.picked],
        sum: given.sum,
        // 실제로 쓴 덧셈과 최악의 덧셈을 함께 낸다. 화면이 둘을 겹쳐 보인다.
        used: Math.max(0, given.picked.length - 1),
        adds: round.adds,
      },
    });
    if (!(await beat())) return false;

    setMetric('check-looks', 1);
    setMetric('add-steps', round.adds);
    await phase('verdict');
    await ctx.emit({
      type: 'check-verdict',
      payload: {
        sum: given.sum,
        target: ctx.data.target,
        ok: given.sum === ctx.data.target,
        looks: 1,
        adds: round.adds,
      },
    });
    if (!(await beat())) return false;

    // ── 찾기. 건네주는 이가 없으니 후보가 몇인지부터 세야 한다.
    await phase('count');
    await ctx.emit({
      type: 'count-candidates',
      payload: { candidates: round.candidates, n: round.n },
    });
    if (!(await beat())) return false;

    for (let k = 1; k <= P_NP_SWEEP_STEPS; k += 1) {
      // 문이 바디의 첫 줄이 아니다 — 한 걸음에서 emit 이 둘 나가므로 진입 검사를
      // 따로 둔다 (C8 의 MUST).
      if (ctx.cancelled) return false;

      const seen =
        k === P_NP_SWEEP_STEPS
          ? round.candidates
          : Math.floor((round.candidates * k) / P_NP_SWEEP_STEPS);
      setMetric('find-looks', seen);
      await phase('count');
      await ctx.emit({ type: 'sweep', payload: { seen, total: round.candidates } });
      if (!(await beat())) return false;
    }

    // ── 매듭. 이 한 걸음이 이 화면의 주장이다.
    await phase('gap');
    await ctx.emit({
      type: 'gap',
      payload: { checkLooks: 1, findLooks: round.candidates, adds: round.adds },
    });
    if (!(await beat())) return false;

    await ctx.emit({
      type: 'done',
      payload: { n: round.n, candidates: round.candidates, adds: round.adds },
    });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;
      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
