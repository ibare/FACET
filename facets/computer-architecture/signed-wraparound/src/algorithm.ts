/**
 * signedWraparound — 부호 있는 정수의 끝과 끝.
 *
 * 시작값에 1 을 거듭 더한다. 오른쪽 끝(가장 큰 수)에 닿고, 한 번 더 더하면
 * 자리올림이 부호 자리까지 번져 왼쪽 끝(가장 작은 수)에서 다시 나온다.
 * 비트열과 양 끝 값은 여기서 셈한다 — 선언에 있는 것은 비트 폭과 시작값뿐이다.
 *
 * 진행 모델은 reactive (S-piece). mount 즉시 스스로 재생하고, 다 보인 뒤에는
 * `advance` 입력을 받아 처음부터 한 걸음씩 다시 짚는다. 마운트 직후의 첫
 * 걸음과 되감은 직후의 첫 걸음은 문(gate)을 지나지 않는다.
 *
 * ── 이벤트 목록 + payload 스키마 (C2)
 *
 * | type        | payload  | silent |
 * |-------------|----------|--------|
 * | `advance`   | `{ to }` | 아니오 |
 * | `reach-max` | `{ to }` | 아니오 |
 * | `wrap`      | `{ to }` | 아니오 |
 * | `done`      | 없음      | 아니오 |
 * | `rewind`    | 없음      | 아니오 |
 *
 *   to   1 을 더해 닿은 값 (부호 있는 해석)
 *
 * **닿은 값 하나만 싣는다.** 떠난 값은 장면이 걸어 온 자취의 마지막이고,
 * 비트열과 양 끝 값은 아래 `toBits` · `signedMin` · `signedMax` 가 값에서
 * 셈한다 — 장면이 같은 함수를 부르므로 화면과 알고리즘이 갈릴 자리가 없다
 * (`tasks/scene-migration-protocol.md` 4 절).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SignedWraparoundData = {
  type: string;
  /** 셈에 쓰는 비트 폭. 부호 있는 해석이라 맨 앞 한 자리가 부호 자리다. */
  bitWidth: number;
  /** 1 을 더하기 시작하는 값. */
  start: number;
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

const FALLBACK_BIT_WIDTH = 8;
const FALLBACK_STEP_MS = 700;

/** 이 폭이 담는 가장 작은 수. */
export function signedMin(bitWidth: number): number {
  return -(2 ** (bitWidth - 1));
}

/** 이 폭이 담는 가장 큰 수. */
export function signedMax(bitWidth: number): number {
  return 2 ** (bitWidth - 1) - 1;
}

/**
 * 2의 보수 비트열.
 *
 * 값을 폭 안으로 접어 넣는 나머지 연산이 곧 넘어감이다 — 127 + 1 은 여기서
 * `10000000` 이 되고, 부호 있는 해석이 그것을 -128 로 읽는다.
 */
export function toBits(value: number, bitWidth: number): string {
  const span = 2 ** bitWidth;
  const raw = ((value % span) + span) % span;
  let out = '';
  for (let i = bitWidth - 1; i >= 0; i -= 1) {
    out += Math.floor(raw / 2 ** i) % 2 === 1 ? '1' : '0';
  }
  return out;
}

export const signedWraparound = async (
  ctx: FacetContext<SignedWraparoundData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<SignedWraparoundData>;
  const bitWidth =
    typeof rc.data.bitWidth === 'number' && rc.data.bitWidth >= 4
      ? Math.floor(rc.data.bitWidth)
      : FALLBACK_BIT_WIDTH;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : FALLBACK_STEP_MS;
  const min = signedMin(bitWidth);
  const max = signedMax(bitWidth);
  const start =
    typeof rc.data.start === 'number' ? Math.min(max, Math.max(min, Math.trunc(rc.data.start))) : max - 2;

  /**
   * 한 번 재생한다.
   *
   * 걸음은 데이터가 정한다 — 시작값에서 가장 큰 수까지 1 씩 더하고, 거기서 한
   * 번 더 더해 넘어가고, 넘어간 자리에서 한 걸음 더 간다. 손으로 적은 걸음표가
   * 아니므로 `type` 은 갈래마다 리터럴로 쓴다 (C2).
   */
  const play = async (manual: boolean): Promise<void> => {
    let first = true;
    /** 걸음 사이의 문. 첫 걸음 앞에는 기다릴 앞걸음이 없으므로 그냥 지난다. */
    const gate = async (): Promise<boolean> => {
      if (first) {
        first = false;
        return true;
      }
      if (!manual) return rc.sleep(stepMs);
      for (;;) {
        const input = await rc.waitForInput();
        if (input.type === 'advance') return true;
      }
    };

    let value = start;
    while (value < max) {
      const next = value + 1;
      if (!(await gate())) return;
      if (next === max) {
        await rc.emit({ type: 'reach-max', payload: { to: next } });
      } else {
        await rc.emit({ type: 'advance', payload: { to: next } });
      }
      value = next;
    }

    // 오른쪽 끝을 지난다 — 자리올림이 부호 자리까지 번져 가장 작은 수가 된다.
    if (!(await gate())) return;
    await rc.emit({ type: 'wrap', payload: { to: min } });

    // 왼쪽 끝에서 다시 오른쪽으로. 고리라는 것이 여기서 확인된다.
    if (!(await gate())) return;
    await rc.emit({ type: 'advance', payload: { to: min + 1 } });

    if (!(await gate())) return;
    await rc.emit({ type: 'done' });
  };

  await play(false);

  // 다 보인 뒤 — 누르면 되감고 첫 걸음까지 보인 다음, 한 번에 한 걸음씩.
  for (;;) {
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    await play(true);
  }
};
