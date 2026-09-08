/**
 * chaining-bucket — 체이닝 조각(piece) 알고리즘.
 *
 * 답하는 질문 하나: **같은 자리에 둘 이상이 오면 어떻게 되는가.**
 * 밀어내지 않는다. 자리마다 사슬이 있고, 뒤에 온 것이 그 사슬 끝에 걸린다.
 * 찾을 때는 자리로 한 번에 간 뒤 그 사슬만 훑는다.
 *
 * ── 식별자
 *   `index:<b>`   버킷(자리) 번호. 배열 칸이므로 표준 `index:` prefix 를 쓴다.
 *
 * ── 이벤트 (전부 facet 고유 확장. `done` 만 표준 어휘)
 *   key-hung       target `index:<b>`  payload `{ key: string; hash: number; depth: number }`
 *                  키 하나가 들어와 자리 b 의 사슬 depth 번째 칸에 매달린다. silent 아님.
 *   probe-jump     target `index:<b>`  payload `{ key: string }`
 *                  찾는 키가 자리 b 로 곧장 간다 (다른 자리를 훑지 않는다). silent 아님.
 *   probe-compare  target `index:<b>`  payload `{ key: string; depth: number; match: boolean }`
 *                  자리 b 의 사슬 depth 번째 칸과 견준다. silent 아님.
 *   done           target 없음         payload `{ key: string; bucket: number; comparisons: number }`
 *                  몇 번 견줘서 찾았는지. silent 아님.
 *   rewind         target 없음         payload 없음
 *                  판을 비우고 처음으로 돌아간다 (한 걸음씩 다시 볼 때). silent 아님.
 *
 * ── 걸음
 *   mount 즉시 열 걸음을 stepMs 간격으로 자동 재생하고 멈춘다. 그 뒤 `advance`
 *   입력을 받으면 처음부터 한 걸음씩 다시 짚는다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 키 하나와 그 키가 앉을 자리. 해시는 실측값이며 선언(initialData)에 있다. */
export type ChainingEntry = {
  key: string;
  /** Java `String.hashCode` 실측값. */
  hash: number;
  /** `(hash & 0x7FFFFFFF) % bucketCount` 로 정해진 자리. */
  bucket: number;
};

export type ChainingBucketData = {
  type: string;
  bucketCount: number;
  entries: ChainingEntry[];
  /** 마지막에 찾아 보이는 키. */
  lookupKey: string;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

const DEFAULT_STEP_MS = 700;

/** 걸음 사이의 대기. true 면 계속, false 면 취소된 것이니 그 자리에서 그만둔다. */
type Gate = () => Promise<boolean>;

function entryAt(data: ChainingBucketData, i: number): ChainingEntry {
  const e = data.entries[i];
  if (e === undefined) throw new Error(`chaining-bucket: entries[${i}] 가 선언에 없다`);
  return e;
}

/**
 * 한 벌의 걸음. 자동 재생과 한 걸음씩 보기가 같은 순서를 쓰므로 gate 만 갈아 끼운다.
 * 걸음은 배열로 돌지 않고 한 줄씩 편다 — emit 의 type 이 리터럴이어야 한다 (C2).
 */
async function play(ctx: ReactiveContext<ChainingBucketData>, gate: Gate): Promise<void> {
  const data = ctx.data;
  const apple = entryAt(data, 0);
  const elder = entryAt(data, 1);
  const mango = entryAt(data, 2);
  const fig = entryAt(data, 3);
  const kiwi = entryAt(data, 4);

  // ── 넣기. 먼저 성한 경우를 보이고, 그 다음에 같은 자리를 겹친다.
  // depth 는 적어 두지 않고 자리별로 센다 — 사슬 길이는 entries 선언이 정하며,
  // 손으로 적으면 선언을 고칠 때 화면이 조용히 거짓이 된다 (원칙 2).
  const depthAt = new Map<number, number>();
  for (const entry of [apple, elder, mango, fig, kiwi]) {
    const depth = depthAt.get(entry.bucket) ?? 0;
    depthAt.set(entry.bucket, depth + 1);
    await ctx.emit({
      type: 'key-hung',
      target: `index:${entry.bucket}`,
      payload: { key: entry.key, hash: entry.hash, depth },
    });
    if (!(await gate())) return;
  }

  // ── 찾기. 자리로 한 번에 간 뒤, 그 사슬만 훑는다.
  await ctx.emit({
    type: 'probe-jump',
    target: `index:${mango.bucket}`,
    payload: { key: data.lookupKey },
  });
  if (!(await gate())) return;

  // 사슬을 앞에서부터 훑는다. 견준 횟수는 세는 것이지 적어 두는 것이 아니다.
  const chain = [apple, elder, mango].filter((e) => e.bucket === mango.bucket);
  let comparisons = 0;
  for (const [depth, entry] of chain.entries()) {
    comparisons += 1;
    await ctx.emit({
      type: 'probe-compare',
      target: `index:${entry.bucket}`,
      payload: { key: entry.key, depth, match: entry.key === data.lookupKey },
    });
    if (entry.key === data.lookupKey) break;
    if (!(await gate())) return;
  }
  if (!(await gate())) return;

  await ctx.emit({
    type: 'done',
    payload: { key: data.lookupKey, bucket: mango.bucket, comparisons },
  });
  // 마지막 걸음 뒤에는 기다리지 않는다 — 한 번 누르면 한 걸음이어야 한다.
}

export const chainingBucket = async (ctx: FacetContext<ChainingBucketData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<ChainingBucketData>;
  const stepMs =
    typeof rctx.data.stepMs === 'number' && rctx.data.stepMs > 0 ? rctx.data.stepMs : DEFAULT_STEP_MS;

  const pause: Gate = () => rctx.sleep(stepMs);
  const waitAdvance: Gate = async () => {
    for (;;) {
      try {
        const input = await rctx.waitForInput();
        if (rctx.cancelled) return false;
        if (input.type === 'advance') return true;
      } catch {
        // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다.
        return false;
      }
    }
  };

  // 첫 걸음 전에 한 박자. 글을 읽다 눈이 내려오는 시간이다.
  if (!(await pause())) return;
  await play(rctx, pause);

  // 다 본 뒤 — 곱씹고 싶은 사람을 위해 처음부터 한 걸음씩.
  for (;;) {
    if (!(await waitAdvance())) return;
    await rctx.emit({ type: 'rewind' });
    await play(rctx, waitAdvance);
  }
};
