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
 * 줄 번호 · 무효화 횟수 · 함께 쓰는 값의 수는 여기서 셈한다. 화면에 뜨는 수는
 * 전부 그 셈의 결과이지 적어 둔 값이 아니다 (S-piece).
 *
 * ── 줄 번호
 *
 *   line(i) = floor(i * elemBytes / lineBytes)
 *
 * ── 무효화를 세는 법
 *
 * 쓰기는 그 줄의 배타 소유를 요구한다. **직전에 다른 코어가 그 줄을 쥐고
 * 있었으면** 그쪽 사본이 무효가 된다. 아무도 쥔 적 없는 첫 쓰기는 빼앗을 것이
 * 없으므로 세지 않는다. 그래서 한 줄을 번갈아 여덟 번 고치면 둘째부터
 * 여덟째까지 일곱 번이고, 줄이 갈리면 서로 빼앗을 일이 없어 영이다.
 *
 * ── 이벤트 (전부 이 facet 의 확장 어휘. silent 는 없다)
 *
 *   arrange      { mode: 'together' | 'apart'; aIndex: number; bIndex: number;
 *                  aLine: number; bLine: number; sameLine: boolean;
 *                  sharedCount: number; lineBytes: number; elemBytes: number;
 *                  bAddr: number; textKey: string }
 *       배치를 세운다. 'apart' 는 B 가 맡는 칸이 옮겨 앉는 걸음이다.
 *
 *   write-round  { mode: 'together' | 'apart'; round: number; cores: string[];
 *                  indices: number[]; values: number[]; aIndex: number;
 *                  bIndex: number; writes: number; invalidations: number;
 *                  textKey: string }
 *       두 코어가 번갈아 고치므로 한 걸음에 한 바퀴(A 한 번, B 한 번)를 보인다.
 *       `cores` · `indices` · `values` 는 그 바퀴의 쓰기들과 자리가 맞는다.
 *       `writes` · `invalidations` 는 그 배치에서의 누적이다.
 *
 *   settle       { mode: 'together' | 'apart'; writes: number;
 *                  invalidations: number; sharedCount: number; textKey: string }
 *       한 배치의 셈을 맺는다.
 *
 *   done         { sharedCount: number; textKey: string }
 *       두 배치를 견준 결론.
 *
 *   rewind       payload 없음
 *       자동 재생이 끝난 뒤 `advance` 로 처음부터 다시 짚을 때 화면을 비운다.
 *
 * 화면 문안은 여기서 정하지 않는다 — `textKey` 만 싣고 projector 가 해석한다 (C10).
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

type Mode = 'together' | 'apart';

/** 걸음 사이에 서는 법. 자동 재생은 재우고, 한 걸음씩은 누름을 기다린다. */
type Pause = () => Promise<boolean>;

const CORE_A = 'A';
const CORE_B = 'B';

function lineOf(index: number, lineBytes: number, elemBytes: number): number {
  return Math.floor((index * elemBytes) / lineBytes);
}

/**
 * 한 배치를 끝까지 굴린다. 돌려주는 값은 "끝까지 갔는가" 다.
 */
async function playArrangement(
  ctx: ReactiveContext<FalseSharingData>,
  mode: Mode,
  pair: number[],
  gate: () => Promise<boolean>,
): Promise<boolean> {
  const { lineBytes, elemBytes, writes } = ctx.data;
  const aIndex = pair[0];
  const bIndex = pair[1];
  const aLine = lineOf(aIndex, lineBytes, elemBytes);
  const bLine = lineOf(bIndex, lineBytes, elemBytes);
  const sameLine = aLine === bLine;
  // 두 코어가 실제로 함께 쓰는 값의 수. 서로 다른 칸을 맡으면 영이다 —
  // 이것이 "거짓" 이라는 말의 근거다.
  const sharedCount = aIndex === bIndex ? 1 : 0;

  if (!(await gate())) return false;
  await ctx.emit({
    type: 'arrange',
    payload: {
      mode,
      aIndex,
      bIndex,
      aLine,
      bLine,
      sameLine,
      sharedCount,
      lineBytes,
      elemBytes,
      bAddr: bIndex * elemBytes,
      textKey: sameLine ? 'caption.together' : 'caption.apart',
    },
  });
  if (ctx.cancelled) return false;

  /** 줄 → 그 줄을 마지막으로 쥔 코어. */
  const holder = new Map<number, string>();
  /** 색인 → 그 칸이 지금 담은 값. 코어마다 제 칸 하나를 올린다. */
  const value = new Map<number, number>();
  let done = 0;
  let invalidations = 0;

  for (let w = 0; w < writes; w += 2) {
    const cores: string[] = [];
    const indices: number[] = [];
    const values: number[] = [];
    for (let k = 0; k < 2 && w + k < writes; k += 1) {
      const core = (w + k) % 2 === 0 ? CORE_A : CORE_B;
      const index = core === CORE_A ? aIndex : bIndex;
      const line = lineOf(index, lineBytes, elemBytes);
      const prev = holder.get(line);
      if (prev !== undefined && prev !== core) invalidations += 1;
      holder.set(line, core);
      const next = (value.get(index) ?? 0) + 1;
      value.set(index, next);
      done += 1;
      cores.push(core);
      indices.push(index);
      values.push(next);
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'write-round',
      payload: {
        mode,
        round: w / 2 + 1,
        cores,
        indices,
        values,
        aIndex,
        bIndex,
        writes: done,
        invalidations,
        textKey: sameLine ? 'caption.collide' : 'caption.quiet',
      },
    });
    if (ctx.cancelled) return false;
  }

  if (!(await gate())) return false;
  await ctx.emit({
    type: 'settle',
    payload: {
      mode,
      writes: done,
      invalidations,
      sharedCount,
      textKey: sameLine ? 'caption.tally' : 'caption.tallyApart',
    },
  });
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
  const arrangements: Array<{ mode: Mode; pair: number[] }> = [
    { mode: 'together', pair: ctx.data.together },
    { mode: 'apart', pair: ctx.data.apart },
  ];
  for (const arrangement of arrangements) {
    if (!(await playArrangement(ctx, arrangement.mode, arrangement.pair, gate))) return false;
  }

  // 끝에 남아 있는 배치가 벌려 놓은 쪽이므로 그 배치의 셈으로 맺는다.
  const last = ctx.data.apart;
  const sharedCount = last[0] === last[1] ? 1 : 0;

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done', payload: { sharedCount, textKey: 'caption.done' } });
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
