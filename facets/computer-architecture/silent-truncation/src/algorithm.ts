/**
 * silentTruncation — 그릇보다 큰 수를 담으면 윗자리가 그릇 밖으로 떨어져 나간다.
 *
 * 1차 데이터는 값 셋과 그릇의 비트 폭뿐이다. 2진 표기 · 남는 값 · 떨어져 나간
 * 값은 전부 여기서 셈한다. 화면에 뜨는 수를 손으로 적어 두면 데이터를 바꿀 때
 * 그것이 따라오지 못한다 (S-piece).
 *
 * ── 발신 이벤트 (facet 고유 확장 · C2)
 *
 *   value-offered  { value: number; bits: string; from: number }
 *       16비트로 센 값 하나가 도착했다. bits 는 from 자리로 채운 2진 표기.
 *       silent 아님.
 *
 *   poured         { width: number; over: number; lost: number }
 *       width 비트 그릇에 담았다. over 는 테두리 밖에 걸린 자리 수,
 *       lost 는 그 자리들이 지니고 있던 값. silent 아님.
 *
 *   truncated      { kept: number; lost: number }
 *       테두리 밖 자리가 떨어져 나갔다. kept 는 그릇에 남은 값. silent 아님.
 *
 *   rewind         {}
 *       되감아 처음으로 돌아간다 (advance 로 다시 짚을 때). silent 아님.
 *
 *   done           { results: number[] }
 *       값마다 그릇에 남은 것. silent 아님.
 *
 * 메트릭은 없다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SilentTruncationData = {
  type: 'silent-truncation';
  /** 원래 값들. from 비트로 셈한 것이다. */
  values: number[];
  /** 담을 그릇의 비트 폭. 부호 없는 그릇이라 범위는 0 … 2^width - 1. */
  width: number;
  /** 원래 값을 세던 비트 폭. */
  from: number;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** n 을 w 자리 2진 표기로. 앞자리는 0 으로 채운다. */
function toBits(n: number, w: number): string {
  return n.toString(2).padStart(w, '0');
}

export async function silentTruncation(base: FacetContext<SilentTruncationData>): Promise<void> {
  const ctx = base as ReactiveContext<SilentTruncationData>;
  const { values, width, from, stepMs } = ctx.data;
  const capacity = 2 ** width;
  const over = from - width;

  /*
   * 문(gate)은 걸음 **사이**의 것이다. 첫 걸음 앞에는 기다릴 앞걸음이 없으므로
   * 그냥 통과시킨다 — 먼저 두면 stepMs 만큼 빈 화면이 보인 뒤에야 그림이 선다
   * (S-piece). 되감은 직후의 첫 문도 같은 까닭으로 연다.
   */
  let open = true;

  /** 자동 재생의 문 — 스스로 걸음 간격만큼 쉰다. */
  const auto = async (): Promise<boolean> => {
    if (open) {
      open = false;
      return !ctx.cancelled;
    }
    return await ctx.sleep(stepMs);
  };

  /** 한 걸음씩 짚어 볼 때의 문 — 누를 때까지 기다린다. */
  const manual = async (): Promise<boolean> => {
    if (open) {
      open = false;
      return true;
    }
    // 받은 것의 종류를 본다. 위젯 입력이 붙는 날 그것까지 걸음으로 세지 않게.
    for (;;) {
      if ((await ctx.waitForInput()).type === 'advance') return true;
    }
  };

  /** 값을 하나씩 그릇에 담아 본다. 걸음 사이를 여는 것은 gate 다. */
  async function pourEach(gate: () => Promise<boolean>): Promise<void> {
    const results: number[] = [];

    for (const value of values) {
      // 남는 것은 넘친 만큼이 아니라 capacity 를 뺀 값이다.
      const kept = value % capacity;
      const lost = value - kept;

      if (!(await gate())) return;
      await ctx.emit({
        type: 'value-offered',
        payload: { value, bits: toBits(value, from), from },
      });

      if (!(await gate())) return;
      await ctx.emit({ type: 'poured', payload: { width, over, lost } });

      if (!(await gate())) return;
      await ctx.emit({ type: 'truncated', payload: { kept, lost } });

      results.push(kept);
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: { results } });
  }

  await pourEach(auto);

  // 자동 재생이 끝난 뒤 — 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  for (;;) {
    if ((await ctx.waitForInput()).type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    open = true;
    await pourEach(manual);
  }
}
