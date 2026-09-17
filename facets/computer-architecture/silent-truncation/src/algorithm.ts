/**
 * silentTruncation — 그릇보다 큰 수를 담으면 윗자리가 그릇 밖으로 떨어져 나간다.
 *
 * 1차 데이터는 값 셋과 그릇의 비트 폭뿐이다. **그리고 발신이 싣는 것은 값 하나뿐**
 * 이다 — 2진 표기도, 그릇에 남는 값도, 떨어져 나간 값도 여기서 셈하지 않는다.
 *
 * 그 셋은 화면이 비트열을 그릇 테두리로 갈라 그리는 바로 그 구조에서 나온다
 * (`scene.ts` 의 `bitsOf` · `keptOf` · `lostOf`). 여기서 `value % 2 ** width` 로
 * 또 셈해 실어 보내면 **같은 물음에 답이 둘**이 되고, 화면에 나란히 뜨는 세 수가
 * 언젠가 갈린다 (S-piece · Scene 이행 프로토콜 4 절).
 *
 * 그래서 이 함수에 남은 것은 **박자**뿐이다 — 값을 하나씩 내밀고, 담고, 잘린다.
 *
 * ── 발신 이벤트 (facet 고유 확장 · C2)
 *
 *   value-offered  { value: number }
 *       값 하나가 도착했다. 어느 값을 이번에 담아 보는가는 구조가 셀 수 없는,
 *       걸음이 내리는 판정이라 이것만 싣는다. silent 아님.
 *
 *   poured         {}
 *       그릇에 담았다. 아래 자리는 바닥에 닿고 윗자리는 테두리 밖에 걸린다.
 *       걸린 자리 수도 그 값도 장면이 센다. silent 아님.
 *
 *   truncated      {}
 *       테두리 밖 자리가 떨어져 나갔다. silent 아님.
 *
 *   rewind         {}
 *       되감아 처음으로 돌아간다 (advance 로 다시 짚을 때). silent 아님.
 *
 *   done           {}
 *       값을 다 담았다. 남은 값들은 장면이 걸어온 자취에서 센다. silent 아님.
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

export async function silentTruncation(base: FacetContext<SilentTruncationData>): Promise<void> {
  const ctx = base as ReactiveContext<SilentTruncationData>;
  const { values, stepMs } = ctx.data;

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
    for (const value of values) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'value-offered', payload: { value } });

      if (!(await gate())) return;
      await ctx.emit({ type: 'poured' });

      if (!(await gate())) return;
      await ctx.emit({ type: 'truncated' });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done' });
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
