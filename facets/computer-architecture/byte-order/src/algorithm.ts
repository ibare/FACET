/**
 * byteOrder — 같은 값을 반대 차례로 늘어놓는다 (조각).
 *
 * 1차 데이터는 **값 하나와 바이트 수 하나**뿐이다. 바이트 쪼개기 · 두 배치 ·
 * 세 읽기 결과는 전부 그 둘에서 나온다. 화면에 뜨는 수는 지어낸 것이 하나도 없다
 * (S-piece 의 실측 조항).
 *
 * **셈은 여기 있지 않고 장면에 있다.** 이 파일이 내주는 `splitBytes` 하나를
 * `scene.ts` 가 부르고, 두 배치와 세 읽기는 장면이 **그려진 줄에서** 낸다. 걸음이
 * 수를 실어 오면 그림과 다른 출처가 되어 언젠가 갈린다 — 옛 발신은 `big` ·
 * `little` · `value` 셋을 실었고 그림은 그림대로 바이트를 늘어놓고 있었다.
 *
 * 그래서 여기 남은 것은 **논증의 차례**다. 무엇을 언제 말할지가 저작 결정이고,
 * 발신은 그것만 말한다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 인 것은 없다 — 걸음마다 화면이 바뀐다)
 *
 *   value-shown  (payload 없음)   값이 바이트로 갈려 한 줄로 선다
 *   laid-big     (payload 없음)   큰 자리가 낮은 주소로 내려앉는다
 *   laid-little  (payload 없음)   같은 바이트가 서로 건너가 반대 차례로 앉는다
 *   read-both    (payload 없음)   두 배치를 제 규칙으로 읽는다 — 같은 수
 *   misread      (payload 없음)   리틀엔디언 바이트열을 빅엔디언으로 읽는다
 *   rewind       (payload 없음)   처음 상태로 되돌린다
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ByteOrderData = {
  type: 'byte-order';
  /** 늘어놓을 값. 여기서 바이트로 갈린다. */
  value: number;
  /** 그 값이 차지하는 바이트 수. 주소 칸의 수이기도 하다. */
  byteCount: number;
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 값을 바이트로 가른다. 앞이 큰 자리 — 사람이 수를 적는 차례다.
 *
 * 이 파일은 이것을 부르지 않는다. `scene.ts` 가 부른다 — 바탕에 순수 함수를
 * 먹이면 나오는 값은 싣지 않고 **함수를 내준다**. 그 규칙이 두 벌이 되지 않게
 * 한 자리에만 둔다.
 *
 * 내주어도 조각이 말하려는 바는 그대로다. 이 조각의 주장은 *갈린 바이트를 어느
 * 차례로 늘어놓고 어느 끝에서 읽느냐*이지 *수가 어떻게 바이트로 갈리느냐*가
 * 아니다 — 바이트 배열을 통째로 건네받아도 조각은 같은 말을 한다.
 */
export function splitBytes(value: number, byteCount: number): number[] {
  const out: number[] = [];
  for (let i = byteCount - 1; i >= 0; i -= 1) {
    // 나눗셈으로 가른다. 시프트는 32비트에서 부호가 끼어들어 값이 음수로 돈다.
    out.push(Math.floor(value / 256 ** i) % 256);
  }
  return out;
}

export async function byteOrderAlgorithm(ctxRaw: FacetContext<ByteOrderData>): Promise<void> {
  const ctx = ctxRaw as ReactiveContext<ByteOrderData>;
  // 걸음 사이의 정지 시간만 쓴다. 값과 바이트 수는 장면이 선언에서 곧바로 읽는다.
  const { stepMs } = ctx.data;

  /**
   * 걸음 사이의 문. 자동 재생일 땐 시간이 열고, 손으로 짚을 땐 `advance` 가 연다.
   * 취소되면 false 로 돌아와 걸음이 거기서 멎는다.
   */
  let manual = false;
  const gate = async (): Promise<boolean> => {
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게 (S-piece).
      const input = await ctx.waitForInput();
      if (input.type === 'advance') return true;
    }
  };

  const run = async (): Promise<void> => {
    // 첫 걸음 앞에는 문이 없다. 문은 걸음 *사이*의 것이라 기다릴 앞걸음이 없고,
    // 문을 먼저 두면 마운트 직후 빈 화면이 stepMs 만큼 서 있게 된다 (S-piece).
    await ctx.emit({ type: 'value-shown' });
    if (!(await gate())) return;

    await ctx.emit({ type: 'laid-big' });
    if (!(await gate())) return;

    await ctx.emit({ type: 'laid-little' });
    if (!(await gate())) return;

    await ctx.emit({ type: 'read-both' });
    if (!(await gate())) return;

    await ctx.emit({ type: 'misread' });
  };

  await run();
  if (ctx.cancelled) return;

  // 자동 재생이 끝났다. 이제부터는 한 걸음씩 — 처음 누르는 `advance` 는 되감고
  // 첫 걸음까지 보인다. 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
  for (;;) {
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    await ctx.emit({ type: 'rewind' });
    // 그 누름이 첫 걸음까지를 낸다. run 의 첫 문에서 다음 누름을 기다린다.
    await run();
    if (ctx.cancelled) return;
  }
}
