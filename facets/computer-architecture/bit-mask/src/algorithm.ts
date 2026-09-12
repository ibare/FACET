/**
 * 비트 마스크 — 필요한 자리만 남긴다.
 *
 * 한 값 위에 구멍 뚫린 덮개(마스크)를 차례로 씌운다. AND 는 자리마다 둘 다 1 일
 * 때만 1 이므로, 마스크의 0 자리는 원래 값이 무엇이든 0 이 된다. 그래서 마스크는
 * 덮개다 — 1 이 구멍이고 0 이 가림막이다.
 *
 * 여덟 자리는 서로를 모른 채 한꺼번에 결정된다. 그래서 걸음을 자리마다 쪼개지
 * 않고 덮개 한 장이 통째로 내려앉는 것으로 낸다.
 *
 * ── 이벤트 목록 + payload 스키마 (다섯 다 이 facet 고유 확장) ───────────────
 *   mask-shown    { maskBits: number[]; mask: number }  덮개가 값 위로 들어와 뜬다
 *   mask-applied  { value: number }                     덮개가 내려앉는다. value = 원값 & 마스크
 *   mask-lifted   { value: number }                     덮개를 걷는다. value = 원래 값
 *   rewind        payload 없음                           되감기 — 화면을 처음 상태로
 *   done          payload 없음                           할 말을 마쳤다
 *
 *   `maskBits` 는 MSB 우선 (`bitCount` 자리). 값의 10진·16진 표기는 그림이
 *   제 자리에서 셈한다 — 알고리즘은 수만 보낸다 (C10).
 *   silent 이벤트는 없다. 다섯 다 화면이 바뀐다.
 *
 * 메트릭은 없다 (조각, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitMaskData = {
  type: 'bit-mask';
  /** 덮개를 씌울 값. */
  value: number;
  /** 자리 수. */
  bitCount: number;
  /** 차례로 씌울 마스크. */
  masks: number[];
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

/** 값을 MSB 우선 비트 배열로 편다. */
function toBits(value: number, bitCount: number): number[] {
  const out: number[] = [];
  for (let i = bitCount - 1; i >= 0; i -= 1) out.push((value >> i) & 1);
  return out;
}

/**
 * 걸음 사이의 문. 열리면 true, 취소되었으면 false.
 *
 * 자동 재생과 한 걸음씩 짚기가 같은 장면을 돌되 문만 다르다. 장면을 손으로 적은
 * 걸음표 배열로 두르지 않으려면 이렇게 가를 수밖에 없다 (S-piece).
 */
type Gate = () => Promise<boolean>;

async function runScene(ctx: ReactiveContext<BitMaskData>, gate: Gate): Promise<boolean> {
  const { value, bitCount, masks } = ctx.data;

  for (const [i, mask] of masks.entries()) {
    // 둘째 마스크부터는 앞 덮개를 먼저 걷는다. 걷고 나면 원래 값 그대로라는 것이
    // 이 조각이 지나가며 하는 말이다 — AND 는 원본을 지우지 않는다.
    if (i > 0) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'mask-lifted', payload: { value } });
    }

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'mask-shown',
      payload: { maskBits: toBits(mask, bitCount), mask },
    });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'mask-applied', payload: { value: value & mask } });
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });
  return true;
}

export async function bitMaskAlgorithm(base: FacetContext<BitMaskData>): Promise<void> {
  const ctx = base as ReactiveContext<BitMaskData>;
  const { stepMs } = ctx.data;

  // 마운트 직후의 첫 걸음은 문을 지나지 않는다. 문을 먼저 두면 stepMs 만큼 빈
  // 화면이 보인 뒤에야 그림이 선다 (S-piece).
  let autoOpened = false;
  const autoGate: Gate = async () => {
    if (!autoOpened) {
      autoOpened = true;
      return !ctx.cancelled;
    }
    return ctx.sleep(stepMs);
  };

  if (!(await runScene(ctx, autoGate))) return;

  // 자동 재생이 끝났다. 곱씹으며 한 걸음씩 짚어 보고 싶은 사람을 기다린다.
  for (;;) {
    const input = await ctx.waitForInput();
    // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 세이지 않게 (S-piece).
    if (input.type !== 'advance') continue;

    await ctx.emit({ type: 'rewind' });

    // 되감기 직후의 첫 문은 그냥 통과한다. 되감기만 하고 멈추면 눌러도 반응이
    // 없는 것으로 읽힌다 (S-piece).
    let manualOpened = false;
    const manualGate: Gate = async () => {
      if (!manualOpened) {
        manualOpened = true;
        return !ctx.cancelled;
      }
      for (;;) {
        const next = await ctx.waitForInput();
        if (next.type === 'advance') return !ctx.cancelled;
      }
    };

    if (!(await runScene(ctx, manualGate))) return;
  }
}
