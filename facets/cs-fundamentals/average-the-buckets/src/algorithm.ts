/**
 * averageTheBuckets — 하나로 재면 튀는 것을 여럿으로 나눠 재는 일.
 *
 * 키마다 해시에서 ρ(앞자리 0 개수 + 1)가 나온다. 통이 하나면 전체에서 가장 큰 ρ
 * 하나가 답을 정하고, 통이 넷이면 그 튐이 제 통 안에 갇힌다. 넷을 조화평균으로
 * 모으면 튄 값에 덜 끌린다.
 *
 * 통 번호와 ρ 는 선언이 주는 1차 데이터다. **통별 최댓값 · 통별 추정값 ·
 * 모은 값은 여기서 셈한다** — 화면에 뜨는 수를 선언에 적어 두면 데이터를 바꿀 때
 * 둘이 갈린다.
 *
 * ── 이벤트 (모두 걸음 경계. silent 없음)
 *
 *   stream       { count: number }
 *                키 열여섯이 줄을 선다. count 는 키 수.
 *   pour         { maxRho: number }
 *                통 하나에 전부 담는다. maxRho 는 전체에서 가장 큰 ρ.
 *   read-single  { estimate: number; truth: number }
 *                통 하나의 답 2^maxRho 와 참값.
 *   split        { buckets: number }
 *                벽이 내려와 통이 buckets 개로 갈린다.
 *   settle       { maxima: number[]; estimates: number[] }
 *                통별로 남은 최대 ρ 와 그 통 혼자의 답 2^ρ.
 *   gather       { estimate: number; truth: number }
 *                넷을 모은 값과 참값.
 *   rewind       payload 없음
 *                처음으로 되감는다. 자동 재생이 끝난 뒤 첫 advance 에서만 나간다.
 *
 * 메트릭 없음 (조각).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AverageTheBucketsKey = {
  /** 키 이름. 화면의 칸 하나. */
  id: string;
  /** 해시 앞 2비트가 정한 통 번호. */
  bucket: number;
  /** 나머지 30비트의 앞자리 0 개수 + 1. */
  rho: number;
};

export type AverageTheBucketsData = {
  type: string;
  /** 걸음 사이의 정지 시간. 애니메이션이 끝난 뒤부터 센다 (S-piece). */
  stepMs: number;
  bucketCount: number;
  keys: AverageTheBucketsKey[];
};

/**
 * 치우침 보정 상수.
 *
 * HyperLogLog 가 통 열여섯에 쓰는 0.673 을 그대로 빌린다. 통이 넷인 구간은 표준이
 * 상수를 따로 정해 두지 않았고, 이 조각이 말하려는 것은 상수의 값이 아니라
 * **큰 값에 덜 끌리는 평균**이다. 이 전제는 description.ts 가 밝힌다.
 */
const ALPHA = 0.673;

export async function averageTheBucketsAlgorithm(
  ctx: FacetContext<AverageTheBucketsData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<AverageTheBucketsData>;
  const { keys, bucketCount, stepMs } = ctx.data;

  // 통마다 들어온 ρ 중 가장 큰 것만 남는다.
  const maxima: number[] = [];
  for (let b = 0; b < bucketCount; b += 1) maxima.push(0);
  for (const k of keys) {
    if (k.bucket < 0 || k.bucket >= bucketCount) continue;
    if (k.rho > maxima[k.bucket]) maxima[k.bucket] = k.rho;
  }

  // 나누지 않았다면 전체에서 가장 큰 ρ 하나가 답을 정한다.
  let globalMax = 0;
  for (const k of keys) if (k.rho > globalMax) globalMax = k.rho;

  const singleEstimate = 2 ** globalMax;
  const estimates = maxima.map((r) => 2 ** r);
  // 조화평균 — 역수의 합으로 나눈다. 큰 값의 역수가 작아 덜 끌린다.
  const invSum = maxima.reduce((s, r) => s + 2 ** -r, 0);
  const gathered = invSum === 0 ? 0 : (ALPHA * bucketCount * bucketCount) / invSum;
  const truth = keys.length;

  type Gate = () => Promise<boolean>;

  /**
   * 한 바퀴.
   *
   * **문은 걸음 사이에만 있다** — 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece).
   * 자동 재생의 첫 걸음도, 되감은 뒤의 첫 걸음도 이 한 짜임에서 곧바로 선다.
   */
  const play = async (gate: Gate): Promise<boolean> => {
    await ctx.emit({ type: 'stream', payload: { count: truth } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'pour', payload: { maxRho: globalMax } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-single', payload: { estimate: singleEstimate, truth } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'split', payload: { buckets: bucketCount } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'settle', payload: { maxima, estimates } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'gather', payload: { estimate: gathered, truth } });
    return true;
  };

  /** 자동 재생의 문 — 스스로 나아간다. */
  const tick: Gate = () => rc.sleep(stepMs);

  /** 한 걸음씩 짚을 때의 문 — advance 말고는 걸음으로 세지 않는다. */
  const advance: Gate = async () => {
    for (;;) {
      if (ctx.cancelled) return false;
      if ((await rc.waitForInput()).type === 'advance') return true;
    }
  };

  if (!(await play(tick))) return;

  // 자동 재생이 끝났다. 여기서부터는 누르는 사람의 걸음이다.
  for (;;) {
    if (ctx.cancelled) return;
    if ((await rc.waitForInput()).type !== 'advance') continue;
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 — 첫 걸음까지 간다.
    await ctx.emit({ type: 'rewind' });
    if (!(await play(advance))) return;
  }
}
