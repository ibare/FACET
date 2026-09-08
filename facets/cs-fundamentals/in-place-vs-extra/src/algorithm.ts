/**
 * 제자리 정렬 vs 자리를 빌리는 정렬 — 조각(piece) 알고리즘.
 *
 * 같은 값 넷을 두 벌 늘어놓고 나란히 정렬한다. 한쪽은 처음 받은 칸 안에서
 * 끝내고, 다른 쪽은 결과를 적을 띠를 따로 얻어 거기에 옮겨 적는다. 견주고
 * 옮기는 일이 아니라 **차지한 넓이**가 이 화면의 주인공이므로, 걸음마다
 * 양쪽이 지금까지 더 쓴 칸 수를 함께 실어 보낸다.
 *
 * ── 두 방식
 *   제자리       삽입 정렬. 값 하나를 잠깐 들어 올리고, 그보다 큰 값들을 오른쪽으로
 *                건너뛰게 한 뒤, 빈자리에 내려놓는다. 들고 있을 자리 **하나**를
 *                라운드가 몇 번이든 다시 쓴다.
 *   자리를 빌려   남은 값 중 가장 작은 것을 새 띠에 옮겨 적는다. 옮겨 적을 때마다
 *                칸이 하나씩 더 필요하므로 넓이가 값의 개수만큼 늘어난다.
 *
 * ── 식별자
 * 띠가 둘이라 `index:N` 하나로는 어느 쪽 몇 번 칸인지 가리킬 수 없다. 그래서
 * target 을 쓰지 않고 payload 의 필드 이름으로 어느 띠인지 지시한다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음 — 모두 화면이 바뀌는 걸음이다)
 *
 *   'begin'   { values: number[] }
 *             두 띠를 같은 값으로 놓고 시작한다. 빌린 넓이는 양쪽 다 0.
 *
 *   'round'   { round: number;
 *               liftFrom: number; heldValue: number; shiftFrom: number; dropTo: number;
 *               inPlaceAfter: number[];
 *               takeFrom: number; takenValue: number; outSlot: number; outAfter: number[];
 *               inPlaceExtra: number; extraExtra: number }
 *             한 라운드. 두 띠가 같은 걸음에서 함께 움직인다.
 *               liftFrom  제자리 띠에서 들어 올릴 칸
 *               shiftFrom 오른쪽으로 한 칸씩 건너뛸 구간의 시작 (구간은 [shiftFrom, liftFrom-1])
 *               dropTo    들고 있던 값이 내려앉을 칸 (= shiftFrom)
 *               takeFrom  빌리는 띠가 원본에서 가져갈 칸
 *               outSlot   새로 여는 칸 번호 (= round)
 *               inPlaceExtra / extraExtra  지금까지 각자 더 쓴 칸 수
 *
 *   'done'    { result: number[]; inPlaceExtra: number; extraExtra: number; total: number }
 *             결과는 같고 넓이는 다르다.
 *
 *   'rewind'  payload 없음
 *             자동 재생을 마친 뒤 처음으로 돌아간다. 화면이 초기 상태로 바뀌므로
 *             silent 가 아니다.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type InPlaceVsExtraData = {
  type: string;
  /** 정렬할 값. 두 방식이 같은 것을 받는다. */
  values: number[];
  /** 걸음 간격 (ms). 재생 총 길이는 여기에 stage 의 이동 애니메이션이 더해진다. */
  stepMs: number;
};

/** 한 라운드에서 두 띠가 각각 하는 일. 전부 데이터에서 셈해 나온다. */
type Round = {
  round: number;
  liftFrom: number;
  heldValue: number;
  shiftFrom: number;
  dropTo: number;
  inPlaceAfter: number[];
  takeFrom: number;
  takenValue: number;
  outSlot: number;
  outAfter: number[];
  inPlaceExtra: number;
  extraExtra: number;
};

type Plan = {
  rounds: Round[];
  result: number[];
  /** 제자리 방식이 원본 밖에 더 쓴 칸 수. 값을 들고 있을 자리 하나. */
  inPlaceExtra: number;
  /** 빌리는 방식이 얻어 쓴 칸 수. 결과를 적을 띠 — 원본과 같은 수가 된다. */
  extraExtra: number;
};

const DEFAULT_STEP_MS = 850;

/**
 * 두 방식을 끝까지 돌려 라운드 목록을 셈한다.
 *
 * 넓이는 화면에 박아 넣지 않고 여기서 구조로 센다 — 제자리는 값을 든 자리
 * 하나가 전부라 라운드가 늘어도 1 에서 멈추고, 빌리는 쪽은 옮겨 적은 만큼
 * 늘어 결국 원본과 같은 수가 된다.
 */
function planRounds(values: readonly number[]): Plan {
  const arr = [...values];
  const taken = values.map(() => false);
  const out: number[] = [];
  const rounds: Round[] = [];
  let inPlaceExtra = 0;

  for (let i = 0; i < arr.length; i++) {
    // ── 제자리: 삽입 정렬 한 걸음.
    const held = arr[i];
    // 값을 잠깐 들고 있을 자리. 라운드마다 같은 자리를 다시 쓰므로 1 에서 멈춘다.
    inPlaceExtra = 1;
    let j = i;
    while (j > 0 && arr[j - 1] > held) {
      arr[j] = arr[j - 1];
      j -= 1;
    }
    arr[j] = held;

    // ── 자리를 빌려: 남은 값 중 가장 작은 것을 새 칸에 옮겨 적는다.
    let takeFrom = -1;
    for (let k = 0; k < values.length; k++) {
      if (taken[k]) continue;
      if (takeFrom === -1 || values[k] < values[takeFrom]) takeFrom = k;
    }
    if (takeFrom >= 0) {
      taken[takeFrom] = true;
      out.push(values[takeFrom]);
    }

    rounds.push({
      round: i,
      liftFrom: i,
      heldValue: held,
      shiftFrom: j,
      dropTo: j,
      inPlaceAfter: [...arr],
      takeFrom,
      takenValue: takeFrom >= 0 ? values[takeFrom] : held,
      outSlot: i,
      outAfter: [...out],
      inPlaceExtra,
      extraExtra: out.length,
    });
  }

  return { rounds, result: [...arr], inPlaceExtra, extraExtra: out.length };
}

/**
 * 값 목록을 두 방식으로 정렬한 결과. 두 방식은 같은 답을 낸다 — 이 조각이
 * 견주는 것은 답이 아니라 넓이다.
 */
export function computeInPlaceVsExtraResult(data: InPlaceVsExtraData): number[] {
  return planRounds(Array.isArray(data.values) ? data.values : []).result;
}

export async function inPlaceVsExtra(ctx: FacetContext<InPlaceVsExtraData>): Promise<void> {
  const rc = ctx as ReactiveContext<InPlaceVsExtraData>;
  const values = Array.isArray(ctx.data.values) ? ctx.data.values.map(Number) : [];
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;
  const plan = planRounds(values);

  /** 한 걸음씩 짚어 보는 중인가. 자동 재생을 마친 뒤 advance 를 처음 누르면 켜진다. */
  let manual = false;
  /**
   * 다음 문을 그냥 통과시킨다. 재생 첫 걸음과 되감기 직후에 켠다 —
   * 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
   */
  let openGate = true;

  /** 다음 걸음으로 나아가도 되는지. false 면 취소된 것이다. */
  const gate = async (): Promise<boolean> => {
    if (openGate) {
      openGate = false;
      return !ctx.cancelled;
    }
    if (manual) {
      for (;;) {
        const input = await rc.waitForInput();
        if (ctx.cancelled) return false;
        if (input.type === 'advance') return true;
      }
    }
    return rc.sleep(stepMs);
  };

  const playOnce = async (): Promise<boolean> => {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'begin', payload: { values: [...values] } });

    for (const r of plan.rounds) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'round', payload: { ...r } });
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'done',
      payload: {
        result: [...plan.result],
        inPlaceExtra: plan.inPlaceExtra,
        extraExtra: plan.extraExtra,
        total: values.length,
      },
    });
    return true;
  };

  for (;;) {
    if (!(await playOnce())) return;
    // 할 말은 마쳤다. 곱씹으며 다시 볼 사람을 기다린다.
    const input = await rc.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    manual = true;
    await ctx.emit({ type: 'rewind' });
    openGate = true;
  }
}
