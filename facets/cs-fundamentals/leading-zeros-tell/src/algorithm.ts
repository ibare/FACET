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
 * 앞자리 0 의 개수와 ρ 와 추정값은 여기서 셈한다 — 선언에 적지 않는다.
 * 배열을 도는 것은 손으로 적은 걸음표가 아니라 흘러오는 열쇠를 차례로 읽는
 * 그 연산 자체다.
 *
 * ── 이벤트 (셋 다 silent 아님 — 전부 화면이 바뀌는 걸음이다)
 *   key-read  { index: number; key: string; bits: string; rho: number;
 *               record: boolean; estimate: number }
 *             열쇠 하나가 지나갔다. `record` 면 이 열쇠가 눈금을 밀어 올렸다.
 *             `estimate` 는 이 열쇠까지 본 뒤의 2^(최대 ρ).
 *   rewind    payload 없음. 처음으로 되감는다.
 *   done      { estimate: number }
 *             마지막 열쇠까지 흘려보냈다. 남은 눈금 하나가 답이다.
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

/** 선언이 준 열쇠를 읽어 들인다. 모양이 어긋난 줄은 버린다. */
function readKeys(data: LeadingZerosTellData): LeadingZerosTellKey[] {
  if (!Array.isArray(data.keys)) return [];
  const out: LeadingZerosTellKey[] = [];
  for (const row of data.keys) {
    if (typeof row?.key !== 'string' || typeof row?.bits !== 'string') continue;
    out.push({ key: row.key, bits: row.bits });
  }
  return out;
}

/**
 * ρ — 첫 1 이 선 자리 (= 앞자리 0 의 개수 + 1).
 *
 * 모두 0 이면 자리 수 + 1 이 된다. 이 데이터에는 없지만 셈이 무너지지 않게 둔다.
 */
function rhoOf(bits: string): number {
  let zeros = 0;
  while (zeros < bits.length && bits[zeros] === '0') zeros += 1;
  return zeros + 1;
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

  /** 한 바퀴. `gated` 면 걸음 사이마다 `advance` 를 기다린다. */
  const cycle = async (gated: boolean): Promise<void> => {
    let maxRho = 0;
    for (let i = 0; i < keys.length; i += 1) {
      if (!(await gate(gated, i === 0))) return;
      const row = keys[i];
      const rho = rhoOf(row.bits);
      const record = rho > maxRho;
      if (record) maxRho = rho;
      await ctx.emit({
        type: 'key-read',
        payload: {
          index: i,
          key: row.key,
          bits: row.bits,
          rho,
          record,
          estimate: 2 ** maxRho,
        },
      });
    }
    if (!(await gate(gated, false))) return;
    await ctx.emit({ type: 'done', payload: { estimate: 2 ** maxRho } });
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
