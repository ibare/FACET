/**
 * leading-zeros-tell — 서로 다른 것이 몇 개나 지나갔는지 재는 법.
 *
 * 고르게 섞인 해시에서 앞자리가 0 으로 시작할 확률은 1/2, 00 으로 시작할
 * 확률은 1/4 다. 앞자리 0 이 둘인 것을 만났다면 대략 넷쯤은 봤다는 뜻이다.
 * 그래서 본 것 중 **가장 드문 것 하나**가 얼마나 많이 봤는지를 말해 준다 —
 * 본 것을 전부 기억하지 않고도.
 *
 * ρ = 앞자리 0 의 개수 + 1 = 첫 1 이 선 자리. 추정은 2^(최대 ρ) 다.
 *
 * ── 데이터
 * 선언의 `keys` 가 지닌 것은 이진 32자리뿐이다 (murmur3 32bit, seed 0 실측).
 * 앞자리 0 의 개수와 ρ 와 추정값은 선언에 적지 않는다 — **장면이 그 비트에서
 * 센다** (`scene.ts` 의 `rhoOf` · `notchOf` · `estimateOf`). 배열을 도는 것은
 * 손으로 적은 걸음표가 아니라 흘러오는 열쇠를 차례로 읽는 그 연산 자체다.
 *
 * ── 이벤트 (셋 다 silent 아님 — 전부 화면이 바뀌는 걸음이다)
 *   key-read  payload 없음. 열쇠 하나가 지나갔다.
 *             **몇 번째인지도 싣지 않는다** — 차례는 발신이 오는 순서가 이미
 *             말한다. ρ 도 눈금 갱신 여부도 추정값도 장면이 `keys` 에서 셈하므로,
 *             여기서 함께 보내면 화면에 나란히 뜨는 수가 두 출처에서 나온다.
 *   rewind    payload 없음. 처음으로 되감는다.
 *   done      payload 없음. 마지막 열쇠까지 흘려보냈다. 남은 눈금 하나가 답이다.
 *
 * ── 진행
 * reactive. 마운트하면 스스로 재생하고 **첫 걸음은 문을 지나지 않는다**.
 * 자동 재생이 끝나면 `advance` 를 기다리며, 처음 누르는 한 번은 되감고
 * 첫 걸음까지 보인다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LeadingZerosTellKey = {
  /** 흘러오는 열쇠의 이름. */
  key: string;
  /** 그 이름의 murmur3 32bit 를 이진 32자리로 적은 것. */
  bits: string;
};

export type LeadingZerosTellData = {
  type: string;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
  keys: LeadingZerosTellKey[];
};

/** 기본 걸음 간격 — 선언이 말하지 않을 때만 쓴다. */
const FALLBACK_STEP_MS = 640;

/**
 * 선언이 준 열쇠를 읽어 들인다. 모양이 어긋난 줄은 버린다.
 *
 * **장면도 이 함수를 쓴다** (`scene.ts` 의 `initial`). 걸음이 아무것도 실어 보내지
 * 않고 발신이 오는 순서만으로 차례가 정해지므로, 좁히개가 두 벌이면 어긋난 줄
 * 하나에 온 화면이 한 칸씩 밀린다. 여기가 그 단 한 벌이다.
 * `unknown` 을 받는 것은 장면이 러너에게서 날것으로 받기 때문이다 (C9).
 */
export function readKeys(data: unknown): LeadingZerosTellKey[] {
  const rows = (data as { keys?: unknown } | null | undefined)?.keys;
  if (!Array.isArray(rows)) return [];
  const out: LeadingZerosTellKey[] = [];
  for (const row of rows as unknown[]) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.key !== 'string' || typeof r.bits !== 'string') continue;
    out.push({ key: r.key, bits: r.bits });
  }
  return out;
}

export async function leadingZerosTellAlgorithm(
  ctx: FacetContext<LeadingZerosTellData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<LeadingZerosTellData>;
  const keys = readKeys(ctx.data);
  if (keys.length === 0) return;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : FALLBACK_STEP_MS;

  /**
   * 걸음 사이의 문.
   *
   * 첫 걸음 앞에는 기다릴 앞걸음이 없으므로 그냥 지나간다 — 문을 먼저 두면
   * stepMs 만큼 빈 화면이 보인 뒤에야 그림이 선다. 되감은 직후의 첫 문도
   * 같은 자리를 지나므로, 첫 누름이 되감기로만 끝나지 않는다.
   */
  const gate = async (gated: boolean, first: boolean): Promise<boolean> => {
    if (first) return true;
    if (!gated) return rctx.sleep(stepMs);
    // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않게.
    for (;;) {
      const input = await rctx.waitForInput();
      if (input.type === 'advance') return true;
    }
  };

  /**
   * 한 바퀴. `gated` 면 걸음 사이마다 `advance` 를 기다린다.
   *
   * 눈금을 여기서 쥐지 않는다 — 최댓값을 밀어 올리는 셈이 장면과 여기 양쪽에
   * 적혀 있으면 화면의 눈금과 캡션의 수가 갈릴 자리가 생긴다.
   */
  const cycle = async (gated: boolean): Promise<void> => {
    let first = true;
    for (const _key of keys) {
      if (!(await gate(gated, first))) return;
      first = false;
      await ctx.emit({ type: 'key-read' });
    }
    if (!(await gate(gated, false))) return;
    await ctx.emit({ type: 'done' });
  };

  await cycle(false);

  // 자동 재생이 끝났다. 이제 한 걸음씩 곱씹어 볼 사람을 기다린다.
  while (!ctx.cancelled) {
    const input = await rctx.waitForInput();
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    await cycle(true);
  }
}
