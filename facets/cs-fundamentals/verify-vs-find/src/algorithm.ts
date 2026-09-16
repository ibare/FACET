/**
 * verify-vs-find — 답을 찾는 일과 맞는지 보는 일은 왜 값이 다른가.
 *
 * 수 몇 개에서 합이 목표가 되는 부분집합을 찾는다. 찾는 쪽은 후보 2^n 을 하나도
 * 빠짐없이 들여다봐야 하고, 확인하는 쪽은 건네받은 후보 하나만 들여다본다.
 *
 * **두 쪽이 세는 단위는 같다 — 들여다본 후보의 수.** 한쪽은 후보의 수를 세고
 * 다른 쪽은 덧셈의 수를 세면 단위가 갈려 화면이 거짓 대비를 만든다. 덧셈은 후보
 * 하나를 들여다보는 일 **안에서** 일어나는 것이라 그 안에 둔다.
 *
 * ── 1차 데이터
 * `values` · `target` · `stepMs` 뿐이다. 후보의 수도, 답도, 건네받는 후보도
 * 여기서 셈한다.
 *
 * ── 걸음의 단위 (걸음 벽시계)
 * 후보를 하나씩 보이면 예순네 걸음이 되어 재생이 1 분에 가까워진다. 간격을
 * 줄이는 것은 규범이 금지한 방향이므로 **걸음 수를 먼저 못박고(최대 여덟) 묶음
 * 크기를 거기서 낸다.** 같은 규칙을 확인 쪽에도 그대로 적용한다 — 확인은 후보가
 * 하나라 한 묶음, 곧 한 걸음이다.
 *
 * ── 32비트
 * 후보 번호를 비트마스크로 세므로 `1 << i` 가 수의 개수만큼 자란다. 수가 서른을
 * 넘으면 이 셈이 무너진다. 화면에 띄우는 것은 후보의 **수**이지 후보가 담은 값의
 * 합이 아니므로, 이 데이터(여섯 → 64)에서는 벽에 닿지 않는다.
 *
 * ── 이벤트 (전부 facet 고유. silent 는 없다 — 모두 화면이 바뀌는 걸음이다)
 *   setup            {}
 *   verify-candidate { mask: number }
 *   sweep-block      { to: number; found: number[] }
 *   done             {}
 *   rewind           {}
 *
 * 식별자(target)는 쓰지 않는다. 후보 번호의 정본은 payload 다.
 *
 * ── 왜 이렇게 얇은가
 * 장면이 셀 수 있는 것은 싣지 않는다. 후보의 수(`2^n`)·목표·수 목록은 선언에서
 * 나오고, "지금까지 몇을 보았나" 는 장면이 자취에서 센다 — 그 수가 화면의 자취와
 * 다른 출처가 되면 언젠가 갈린다. 마스크를 고른 수·중간 합·합으로 펼치는 일은
 * 순수 함수 `expandCandidate` 로 내주어 장면이 부른다.
 *
 * **싣는 것은 걸음이 내리는 판정뿐이다** — 건네받은 후보가 어느 것인가(`mask`),
 * 이번 묶음이 어디까지인가(`to`), 그 안에서 답으로 드러난 것이 무엇인가(`found`).
 * 전수 탐색 자체(`computeVerifyVsFindResult`)는 이 조각의 알고리즘 그 자체라
 * 장면에 내주지 않는다 — 내주면 장면이 알고리즘을 되풀이하고 발신이 장식이 된다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VerifyVsFindData = {
  type: string;
  /** 고를 수 있는 수. 1차 데이터. */
  values: number[];
  /** 부분집합의 합이 이것과 같으면 답이다. 1차 데이터. */
  target: number;
  /** 걸음 사이의 정지 시간. 애니메이션이 그 위에 더해진다 (S-piece). */
  stepMs: number;
};

/** 후보 하나 — 번호(비트마스크) · 고른 수 · 더해 온 자취 · 합. */
export type VerifyVsFindCandidate = {
  mask: number;
  picked: number[];
  /** 왼쪽부터 하나씩 더해 온 중간 합. 마지막 값이 곧 sum. */
  partials: number[];
  sum: number;
};

export type VerifyVsFindResult = {
  /** 후보의 수 = 2^n. */
  candidates: number;
  /** 합이 목표와 같은 후보 전부. 번호 오름차순. */
  answers: VerifyVsFindCandidate[];
  /** 확인 쪽에 건네지는 후보 하나. */
  given: VerifyVsFindCandidate;
};

/** 걸음 수의 상한. 묶음 크기는 이것에서 나온다. */
const SWEEP_STEPS_MAX = 8;

/**
 * 후보 번호를 고른 수 · 더해 온 자취 · 합으로 펼친다.
 *
 * 바탕(수 목록)과 번호만 있으면 나오는 순수 함수라 발신에 실어 보내지 않고
 * 밖으로 낸다 — 장면이 이것을 부른다. 이 함수만 떼어 내도 이 조각이 말하려는
 * 바(찾기와 확인의 값 차이)는 남으므로 내주는 쪽이 옳다.
 */
export function expandCandidate(values: number[], mask: number): VerifyVsFindCandidate {
  const picked: number[] = [];
  const partials: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    if ((mask & (1 << i)) === 0) continue;
    const v = values[i] ?? 0;
    picked.push(v);
    sum += v;
    partials.push(sum);
  }
  return { mask, picked, partials, sum };
}

/**
 * 후보를 전수로 훑어 답을 모은다.
 *
 * 레지스트리의 `computeResult` 로 등록하지는 않는다 — 그 자리는 goal-preview 를
 * 둔 facet 의 것이고 조각에는 그 패널이 없다. 알고리즘과 검사가 같은 셈을 쓰라고
 * 밖으로 낸다.
 */
export function computeVerifyVsFindResult(data: VerifyVsFindData): VerifyVsFindResult {
  const values = data.values;
  const candidates = 2 ** values.length;
  const answers: VerifyVsFindCandidate[] = [];
  for (let mask = 0; mask < candidates; mask += 1) {
    const c = expandCandidate(values, mask);
    if (c.sum === data.target) answers.push(c);
  }
  // 건넬 것이 없으면 수를 전부 고른 후보를 건넨다. 그것도 후보 하나이고,
  // 확인이 하는 일(한 번 더해 본다)은 답이든 아니든 같다.
  const given = answers[0] ?? expandCandidate(values, Math.max(0, candidates - 1));
  return { candidates, answers, given };
}

/** 걸음 사이의 문. 이어 가도 되면 true, 취소면 false. */
type Gate = () => Promise<boolean>;

async function waitAdvance(ctx: ReactiveContext<VerifyVsFindData>): Promise<boolean> {
  for (;;) {
    // 문이 루프 바디의 첫 줄이다 — 이것이 진입 검사를 대신한다 (C6·C8).
    if (ctx.cancelled) return false;
    let input;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!ctx.cancelled) throw err;
      return false;
    }
    if (input.type === 'advance') return true;
  }
}

/**
 * 한 바퀴. 걸음 사이마다 문을 지난다 — 자동 재생이면 `sleep`, 한 걸음씩이면
 * `advance` 를 기다린다. 문이 emit **뒤**에 있으므로 마운트 직후의 첫 걸음은
 * 기다리지 않고 곧장 선다 (S-piece).
 */
async function runOnce(ctx: ReactiveContext<VerifyVsFindData>, gate: Gate): Promise<boolean> {
  const values = ctx.data.values;
  if (values.length === 0) return true;
  const result = computeVerifyVsFindResult(ctx.data);

  // 수 목록도 목표도 싣지 않는다 — 선언에 있는 것이라 장면이 그대로 읽는다.
  await ctx.emit({ type: 'setup' });
  if (!(await gate())) return false;

  // 건네받는 후보가 어느 것인가는 걸음의 판정이다. 고른 수·중간 합·합은
  // `expandCandidate` 가 번호에서 펼치므로 싣지 않는다.
  await ctx.emit({ type: 'verify-candidate', payload: { mask: result.given.mask } });
  if (!(await gate())) return false;

  // 묶음 크기는 걸음 수 상한에서 나온다. 후보가 적으면 한 묶음으로 끝난다.
  const block = Math.max(1, Math.ceil(result.candidates / SWEEP_STEPS_MAX));
  for (let from = 0; from < result.candidates; from += block) {
    const to = Math.min(result.candidates, from + block);
    const found = result.answers.filter((a) => a.mask >= from && a.mask < to).map((a) => a.mask);
    // `from` 은 싣지 않는다 — 묶음은 차례로 오므로 앞 걸음의 `to` 가 곧 이번 `from` 이다.
    await ctx.emit({ type: 'sweep-block', payload: { to, found } });
    if (!(await gate())) return false;
  }

  // 두 쪽이 몇을 보았는지는 화면의 자취가 센다. 여기서 세어 실으면 출처가 둘이 된다.
  await ctx.emit({ type: 'done' });
  return true;
}

/**
 * 마운트하면 스스로 한 바퀴 돌고, 그 뒤로는 `advance` 를 받아 처음부터 한
 * 걸음씩 짚는다. 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 되감고 **첫
 * 걸음까지** 간다 (S-piece).
 */
export async function verifyVsFind(rawCtx: FacetContext<VerifyVsFindData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<VerifyVsFindData>;
  const stepMs = ctx.data.stepMs;

  if (!(await runOnce(ctx, () => ctx.sleep(stepMs)))) return;

  for (;;) {
    if (!(await waitAdvance(ctx))) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await runOnce(ctx, () => waitAdvance(ctx)))) return;
  }
}
