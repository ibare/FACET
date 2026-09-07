/**
 * 해시 사슬 (hash chain) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "지난 기록을 몰래 고치면 왜 들통나는가?"
 *
 * 각 칸이 앞 칸의 해시를 자기 안에 품기 때문이다. 그래서 한 칸을 고치면 그
 * 칸의 해시가 바뀌고, 다음 칸이 품고 있던 값과 어긋나고, 그 어긋남이 끝까지
 * 번진다. 고친 자리 하나만 손봐서는 덮을 수 없다.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 걸음 간격도
 * 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 칸을 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init          payload: { algorithmLabel, blocks, tamper }
 *   - rewind payload: {}   손으로 짚기 시작할 때 화면을 되감는다
 *   - reveal-chain  payload: {}   칸들이 앞 칸의 해시를 품은 채 이어진다
 *   - tamper        payload: {}   가운데 한 칸의 내용이 바뀐다
 *   - break-link    payload: {}   그 칸의 해시가 바뀌어 다음 칸과 어긋난다
 *   - cascade       payload: {}   어긋남이 끝까지 번진다
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 사슬 한 칸. */
export type ChainBlock = {
  /** 이 칸이 담은 내용. */
  data: string;
  /** 이 칸이 품은 앞 칸의 해시. 첫 칸은 0으로 채운다. */
  prev: string;
  /** sha256(prev + data) 실측값. */
  hash: string;
};

/** 손댄 뒤의 사슬. 고친 자리부터 끝까지 값이 갈린다. */
export type ChainTamper = {
  /** 손댄 칸의 위치 (0-based). */
  index: number;
  /** 바뀐 내용. */
  data: string;
  /** 손댄 뒤 다시 계산한 칸들. blocks 와 길이가 같다. */
  blocks: ChainBlock[];
};

/** 손으로 짚어 보는 입력. control-bar 의 advance 버튼이 보낸다. */
export type ChainInput = { type: 'advance' } | { type: string };

/** 자동 재생과 손으로 짚기가 공유하는 걸음 수. */
const STEP_COUNT = 4;

export type HashChainFacetData = {
  type: 'hash-chain';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 손대기 전의 사슬. */
  blocks: ChainBlock[];
  /** 손댄 뒤의 사슬. */
  tamper: ChainTamper;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

export async function hashChain(
  ctxBase: FacetContext<HashChainFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashChainFacetData>;
  const { algorithmLabel, blocks, tamper, stepMs } = ctx.data;

  /**
   * 한 걸음을 실제로 발신한다. 자동 재생과 손으로 짚기가 같은 경로를 쓴다.
   *
   * 인덱스로 분기하되 emit 의 type 은 리터럴이다 (C2).
   */
  async function playStep(i: number): Promise<void> {
    switch (i) {
      case 0:
        await ctx.emit({ type: 'reveal-chain' });
        break;
      case 1:
        await ctx.emit({ type: 'tamper' });
        break;
      case 2:
        await ctx.emit({ type: 'break-link' });
        break;
      default:
        await ctx.emit({ type: 'cascade' });
        break;
    }
  }

  /**
   * 걸음 사이 머무름. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8).
   *
   * 걸음을 배열로 순회하지 않고 한 줄씩 펴 쓰는 이유는 `ctx.emit` 의 type 이
   * 리터럴이어야 하기 때문이다 (C2). 덕분에 어휘가 코드에 그대로 드러난다.
   */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    return ok && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { algorithmLabel, blocks, tamper },
  });

  // 네 걸음. 성한 사슬을 먼저 보여야 어긋남이 어긋남으로 보인다.
  for (let i = 0; i < STEP_COUNT; i++) {
    if (!(await pause())) return;
    await playStep(i);
  }

  // 손으로 짚어 보는 루프. 끝까지 간 뒤 다시 누르면 처음으로 되감는다.
  let cursor = STEP_COUNT;
  for (;;) {
    if (ctx.cancelled) return;
    let ev: ChainInput;
    try {
      ev = await ctx.waitForInput<ChainInput>();
    } catch {
      return;
    }
    if (ev.type !== 'advance') continue;
    if (cursor >= STEP_COUNT) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await playStep(cursor);
    cursor += 1;
  }
}
