/**
 * 제자리 정렬 vs 자리를 빌리는 정렬 — 조각(piece) 알고리즘.
 *
 * 같은 값 넷을 두 벌 늘어놓고 나란히 정렬한다. 한쪽은 처음 받은 칸 안에서
 * 끝내고, 다른 쪽은 결과를 적을 띠를 따로 얻어 거기에 옮겨 적는다. 견주고
 * 옮기는 일이 아니라 **차지한 넓이**가 이 화면의 주인공이다.
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
 * ── 발신은 **걸음이 내리는 판정만** 싣는다
 *
 * 넓이도, 몇 번째 라운드인가도, 라운드 뒤의 배열도 싣지 않는다. 전부 화면의
 * 구조에서 세지는 것이라 장면이 센다 (`scene.ts` 의 `extraCellsOf` ·
 * `copiedValuesOf` · `takenFlagsOf`). 특히 두 넓이는 **화면에 나란히 뜨는 수**라,
 * 여기서 세어 실어 보내면 장면이 세는 것과 갈릴 자리가 생긴다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음 — 모두 화면이 바뀌는 걸음이다)
 *
 *   'begin'   payload 없음
 *             두 띠에 같은 값을 놓고 시작한다. 값은 `initialData` 가 이미 말했다.
 *
 *   'round'   { dropTo: number; takeFrom: number }
 *             한 라운드. 두 띠가 같은 걸음에서 함께 움직인다. 이 라운드가 다루는
 *             칸 번호는 싣지 않는다 — 라운드마다 값 하나씩이라 발신이 온 차례가
 *             이미 말한다.
 *               dropTo    제자리 띠에서 들고 있던 값이 내려앉을 칸.
 *                         건너뛰는 구간은 [dropTo, 이번 칸 − 1] 로 결정된다.
 *               takeFrom  빌리는 띠가 원본에서 이번에 가져갈 칸
 *
 *   'done'    payload 없음
 *             결과는 같고 넓이는 다르다. 양쪽 다 화면에 그대로 서 있다.
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

/**
 * 한 라운드에서 두 띠가 내리는 판정.
 *
 * 값도 배열도 넓이도 없다 — 그것들은 이 둘과 바탕에서 결정되므로 장면이 셈한다.
 */
type Round = {
  /** 제자리 띠: 들고 있던 값이 내려앉을 칸. */
  dropTo: number;
  /** 빌리는 띠: 원본에서 이번에 가져갈 칸. */
  takeFrom: number;
};

type Plan = {
  rounds: Round[];
  result: number[];
};

const DEFAULT_STEP_MS = 850;

/**
 * 두 방식을 끝까지 돌려 라운드 목록을 셈한다.
 *
 * 라운드 `i` 는 제자리 띠의 `i` 번 칸을 들어 올리고 빌린 띠의 `i` 번 칸을 새로
 * 여는데, 그 번호는 라운드의 차례가 이미 말하므로 여기서 적어 두지 않는다.
 */
function planRounds(values: readonly number[]): Plan {
  const arr = [...values];
  const taken = values.map(() => false);
  const rounds: Round[] = [];

  for (let i = 0; i < arr.length; i++) {
    // ── 제자리: 삽입 정렬 한 걸음. 들고 있을 자리 하나를 라운드마다 다시 쓴다.
    const held = arr[i];
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
    if (takeFrom >= 0) taken[takeFrom] = true;

    rounds.push({ dropTo: j, takeFrom });
  }

  return { rounds, result: [...arr] };
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
    await ctx.emit({ type: 'begin' });

    for (const r of plan.rounds) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'round', payload: { dropTo: r.dropTo, takeFrom: r.takeFrom } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
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
