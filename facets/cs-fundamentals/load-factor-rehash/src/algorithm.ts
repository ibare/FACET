/**
 * 적재율과 재해싱 — 조각(piece) facet 의 algorithm.
 *
 * 답하는 질문: **판을 넓히면 담긴 것들의 자리는 어떻게 되는가.**
 * 옛 자리를 그대로 옮기는 것이 아니라 새 버킷 수로 전부 다시 나눈다. 그래서
 * 어떤 것은 자리가 바뀌고 어떤 것은 우연히 그대로 남는다.
 *
 * ── 걸음 ─────────────────────────────────────────────────────────────────
 *   1      여섯 번째 키가 여덟 칸 판에 앉는다 → 적재율이 임계 0.75 에 닿는다
 *   2      판을 열여섯 칸으로 넓힌다 → 적재율이 내려간다
 *   3..8   여섯 키를 자리 순서대로 다시 셈한다 (셋은 바뀌고 셋은 그대로)
 *   9      끝
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 없음 — 모두 시각 변화가 있다) ──
 *   insert  { key: string; masked: number; slot: number; buckets: number; count: number }
 *           target `index:<slot>`. 새 키가 옛 판의 slot 에 앉고 적재율이 오른다.
 *   grow    { buckets: number; count: number }
 *           판이 buckets 칸으로 열린다. 적재율의 분모가 바뀐다.
 *   rehash  { key: string; masked: number; buckets: number; from: number; to: number }
 *           target `index:<to>`. 한 키를 새 버킷 수로 다시 나눠 자리를 정한다.
 *           from === to 면 우연히 그대로 남은 것이다.
 *   done    payload 없음. 재계산이 끝났다.
 *   rewind  payload 없음. 처음 상태로 되감는다 (advance 로 다시 짚어 볼 때).
 *
 * ── 메트릭 ──────────────────────────────────────────────────────────────
 *   없다. 조각은 셀 것이 없다 (S-piece).
 *
 * ── 진행 ────────────────────────────────────────────────────────────────
 * mechanismKind 는 'reactive'. mount 시 스스로 자동 재생을 마치고, 그 뒤
 * `waitForInput` 으로 `advance` 를 받아 처음부터 한 걸음씩 다시 짚는다.
 * 걸음 간격은 `data.stepMs` — 읽을 시간을 주는 것은 저작 결정이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 판에 담기는 키 하나. 모든 수는 실측값이다 (Java `String.hashCode`). */
export type RehashKey = {
  /** 키 문자열 */
  key: string;
  /** `String.hashCode()` 원값. 음수일 수 있다. */
  hashCode: number;
  /** `hashCode & 0x7FFFFFFF` — 자리를 셈할 때 실제로 나누는 수. */
  masked: number;
  /** 좁은 판(`buckets`)에서의 자리 */
  slotSmall: number;
  /** 넓힌 판(`grownBuckets`)에서의 자리 */
  slotLarge: number;
};

export type LoadFactorRehashData = {
  type: 'load-factor-rehash';
  /** 처음 판의 칸 수 */
  buckets: number;
  /** 넓힌 판의 칸 수 */
  grownBuckets: number;
  /** 이 적재율을 넘으면 판을 넓힌다 */
  threshold: number;
  /** 여섯 키. `slotSmall` 오름차순 — 옛 판을 자리 순서로 훑는 순서 그대로. */
  keys: RehashKey[];
  /** `keys` 중 마지막에 들어와 임계를 건드리는 키 */
  incoming: string;
  /** 걸음 간격 (ms) */
  stepMs: number;
};

/**
 * 걸음 사이의 사이. 자동 재생이면 `sleep`, 한 걸음씩이면 사용자 입력 대기.
 * 취소되었으면 false 를 돌려 시퀀스를 접는다.
 */
type Gate = () => Promise<boolean>;

/**
 * 한 벌의 논증을 처음부터 끝까지 흘린다. 자동 재생과 한 걸음씩 짚기가 같은
 * 시퀀스를 쓰고 `gate` 만 달라진다 — 두 벌로 나누면 걸음이 갈라진다.
 */
async function play(ctx: ReactiveContext<LoadFactorRehashData>, gate: Gate): Promise<boolean> {
  const data = ctx.data;
  const incoming = data.keys.find((k) => k.key === data.incoming);
  if (!incoming) return false;
  const count = data.keys.length;

  await ctx.emit({
    type: 'insert',
    target: `index:${incoming.slotSmall}`,
    payload: {
      key: incoming.key,
      masked: incoming.masked,
      slot: incoming.slotSmall,
      buckets: data.buckets,
      count,
    },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'grow',
    payload: { buckets: data.grownBuckets, count },
  });
  if (!(await gate())) return false;

  // 옛 판을 자리 순서로 훑으며 담긴 것을 하나씩 다시 셈한다. 재해싱 자체가 이
  // 순회이므로 걸음표를 배열로 두른 것이 아니다 — emit 의 type 은 리터럴로
  // 고정되어 있고 (C2), 도는 것은 데이터다.
  for (const k of data.keys) {
    await ctx.emit({
      type: 'rehash',
      target: `index:${k.slotLarge}`,
      payload: {
        key: k.key,
        masked: k.masked,
        buckets: data.grownBuckets,
        from: k.slotSmall,
        to: k.slotLarge,
      },
    });
    if (!(await gate())) return false;
  }

  // 바뀐 수와 그대로인 수는 셈해서 싣는다 — 문안에 굳히면 선언을 고칠 때 거짓이 된다.
  const moved = data.keys.filter((k) => k.slotSmall !== k.slotLarge).length;
  await ctx.emit({
    type: 'done',
    payload: { moved, stayed: data.keys.length - moved },
  });
  return !ctx.cancelled;
}

export const loadFactorRehash = async (ctx: FacetContext<LoadFactorRehashData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<LoadFactorRehashData>;
  const stepMs = rctx.data.stepMs;

  const autoGate: Gate = async () => (await rctx.sleep(stepMs)) && !rctx.cancelled;
  const manualGate: Gate = async () => {
    await rctx.waitForInput();
    return !rctx.cancelled;
  };

  if (!(await play(rctx, autoGate))) return;

  // 할 말은 여기서 이미 끝났다. 곱씹으며 읽고 싶은 사람을 위해, advance 한 번이
  // 처음으로 되감고 첫 걸음을 놓는다.
  for (;;) {
    await rctx.waitForInput();
    if (rctx.cancelled) return;
    await rctx.emit({ type: 'rewind' });
    if (!(await play(rctx, manualGate))) return;
  }
};
