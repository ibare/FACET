/**
 * 거짓 공유(false sharing) 조각의 algorithm.
 *
 * 두 코어가 서로 다른 값을 고치는데 그 값들이 한 줄에 담겨 있어, 한쪽이 고칠
 * 때마다 다른 쪽의 사본이 통째로 쓸모없어진다. 나눠 갖지도 않은 것을 두고
 * 다투는 꼴이라 "거짓" 공유다.
 *
 * ── 1차 데이터는 선언에만 있다
 *
 *   lineBytes 16 · elemBytes 4 · together [0, 1] · apart [0, 4] · writes 8
 *
 * 줄 번호 · 무효화 횟수 · 함께 쓰는 값의 수는 화면이 셈한다. 화면에 뜨는 수는
 * 전부 그 셈의 결과이지 적어 둔 값이 아니다 (S-piece).
 *
 * ── 줄 번호는 함수로 내준다
 *
 *   line(i) = floor(i * elemBytes / lineBytes)
 *
 * 발신에 실어 보내지 않고 `falseSharingLine` 을 export 해 장면이 같은 함수를
 * 부르게 한다. 베끼는 것이 아니라 같은 함수를 지나는 것이라 둘이 갈릴 수 없다.
 *
 * ── 무효화를 세는 법 — 이것만 싣는다
 *
 * 쓰기는 그 줄의 배타 소유를 요구한다. **직전에 다른 코어가 그 줄을 쥐고
 * 있었으면** 그쪽 사본이 무효가 된다. 아무도 쥔 적 없는 첫 쓰기는 빼앗을 것이
 * 없으므로 세지 않는다. 그래서 한 줄을 번갈아 여덟 번 고치면 둘째부터
 * 여덟째까지 일곱 번이고, 줄이 갈리면 서로 빼앗을 일이 없어 영이다.
 *
 * 이 잣대가 곧 조각이 말하려는 바라 장면에 내주지 않는다. 대신 쓰기마다 `stole`
 * 이라는 **판정 한 글자**만 실어 보내고, 몇 번인지는 장면이 그 목록을 세어 안다.
 *
 * ── 이벤트 (전부 이 facet 의 확장 어휘. silent 는 없다)
 *
 *   arrange      { aIndex: number; bIndex: number }
 *       배치를 세운다. 두 번째 `arrange` 는 B 가 맡는 칸이 옮겨 앉는 걸음이다.
 *
 *   write-round  { writes: Array<{ core: 'A' | 'B'; stole: boolean }> }
 *       두 코어가 번갈아 고치므로 한 걸음에 한 바퀴(A 한 번, B 한 번)를 보인다.
 *       `stole` 은 그 쓰기가 상대의 사본을 무르게 했는가 라는 판정이다.
 *
 *   settle       payload 없음
 *       한 배치의 셈을 맺는다. 셈은 장면이 쓰기 목록에서 낸다.
 *
 *   done         payload 없음
 *       두 배치를 견준 결론.
 *
 *   rewind       payload 없음
 *       자동 재생이 끝난 뒤 `advance` 로 처음부터 다시 짚을 때 화면을 비운다.
 *
 * 화면 문안은 여기서 정하지 않는다 — 무엇을 말할지는 두 칸이 한 줄에 앉았나가
 * 정하고 그것은 장면이 안다 (C10).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FalseSharingData = {
  type: 'false-sharing';
  /** 캐시 라인 한 줄의 크기(바이트). */
  lineBytes: number;
  /** 배열 원소 하나의 크기(바이트). */
  elemBytes: number;
  /** 붙어 있을 때 두 코어가 맡는 색인 — [코어 A, 코어 B]. */
  together: number[];
  /** 벌려 놓았을 때 두 코어가 맡는 색인 — [코어 A, 코어 B]. */
  apart: number[];
  /** 번갈아 고치는 횟수. 두 배치에서 같다. */
  writes: number;
  /** 걸음 사이 정지 시간(ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 걸음 사이에 서는 법. 자동 재생은 재우고, 한 걸음씩은 누름을 기다린다. */
type Pause = () => Promise<boolean>;

const CORE_A = 'A';
const CORE_B = 'B';

/**
 * 그 색인이 앉는 줄의 번호.
 *
 * 주소를 줄 크기로 나눈 몫이다. 자르는 잣대라 장면이 같은 함수를 부르게 내준다 —
 * 두 군데서 자르면 갈린다 (프로토콜 4 절).
 */
export function falseSharingLine(index: number, lineBytes: number, elemBytes: number): number {
  if (lineBytes <= 0) return 0;
  return Math.floor((index * elemBytes) / lineBytes);
}

/**
 * 한 배치를 끝까지 굴린다. 돌려주는 값은 "끝까지 갔는가" 다.
 */
async function playArrangement(
  ctx: ReactiveContext<FalseSharingData>,
  pair: number[],
  gate: () => Promise<boolean>,
): Promise<boolean> {
  const { lineBytes, elemBytes, writes } = ctx.data;
  const aIndex = pair[0];
  const bIndex = pair[1];

  if (!(await gate())) return false;
  await ctx.emit({ type: 'arrange', payload: { aIndex, bIndex } });
  if (ctx.cancelled) return false;

  /** 줄 → 그 줄을 마지막으로 쥔 코어. 판정을 내리는 데만 쓴다. */
  const holder = new Map<number, string>();

  for (let w = 0; w < writes; w += 2) {
    const round: Array<{ core: string; stole: boolean }> = [];
    for (let k = 0; k < 2 && w + k < writes; k += 1) {
      const core = (w + k) % 2 === 0 ? CORE_A : CORE_B;
      const index = core === CORE_A ? aIndex : bIndex;
      const line = falseSharingLine(index, lineBytes, elemBytes);
      const prev = holder.get(line);
      round.push({ core, stole: prev !== undefined && prev !== core });
      holder.set(line, core);
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'write-round', payload: { writes: round } });
    if (ctx.cancelled) return false;
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'settle' });
  return !ctx.cancelled;
}

/**
 * 한 논증을 처음부터 끝까지 발신한다.
 *
 * 자동 재생과 한 걸음씩이 같은 차례를 밟아야 하므로 서는 법만 밖에서 받는다.
 */
async function sequence(ctx: ReactiveContext<FalseSharingData>, pause: Pause): Promise<boolean> {
  let first = true;
  const gate = async (): Promise<boolean> => {
    // 첫 걸음 앞에는 기다릴 앞걸음이 없다. 문을 먼저 두면 빈 화면이 먼저
    // 보인다 (S-piece).
    if (first) {
      first = false;
      return true;
    }
    return pause();
  };

  // 차례가 곧 논증이다 — 붙여 놓아 문제를 세우고, 벌려 놓아 무엇이 원인이었는지
  // 가린다. 두 배치의 색인 쌍 자체는 선언에서 온다.
  for (const pair of [ctx.data.together, ctx.data.apart]) {
    if (!(await playArrangement(ctx, pair, gate))) return false;
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });
  return !ctx.cancelled;
}

export const falseSharingAlgorithm = async (
  base: FacetContext<FalseSharingData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<FalseSharingData>;
  const stepMs = ctx.data.stepMs;

  const autoPause: Pause = () => ctx.sleep(stepMs);

  const advancePause: Pause = async () => {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: { type: string };
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세지 않게 (S-piece).
      if (input.type === 'advance') return true;
    }
  };

  if (!(await sequence(ctx, autoPause))) return;

  // 자동 재생이 끝났다. 여기서 처음 누르는 한 걸음은 되감고 **첫 걸음까지** 간다 —
  // 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    if (!(await advancePause())) return;
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
    if (!(await sequence(ctx, advancePause))) return;
  }
};
