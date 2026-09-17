/**
 * averageTheBuckets — 하나로 재면 튀는 것을 여럿으로 나눠 재는 일.
 *
 * 키마다 해시에서 ρ(앞자리 0 개수 + 1)가 나온다. 통이 하나면 전체에서 가장 큰 ρ
 * 하나가 답을 정하고, 통이 넷이면 그 튐이 제 통 안에 갇힌다. 넷을 조화평균으로
 * 모으면 튄 값에 덜 끌린다.
 *
 * ── 여기서는 아무 수도 셈하지 않는다
 *
 * 통 번호와 ρ 는 선언이 주는 1차 데이터고, **통별 최댓값 · 통별 추정값 · 통 하나의
 * 답 · 모은 값 · 참값은 장면이 그 1차 데이터에서 센다** (`scene.ts` 의 `maximaOf` ·
 * `spikeOf` · `estimatesOf` · `gatheredOf` · `truthOf`). 그래서 이 파일은 걸음의
 * 이름만 순서대로 발신한다.
 *
 * 한때는 그 다섯을 여기서 셈해 payload 로 실어 보냈고 조화평균 상수도 여기 있었다.
 * 다섯 수가 한 화면에 나란히 뜨는 조각이라 셈하는 자리가 둘이면 언젠가 갈린다 —
 * 장면 방식으로 옮기며 셈을 장면 한 곳으로 모았다.
 *
 * ── 이벤트 (모두 걸음 경계. silent 없음. payload 없음)
 *
 *   stream       키 열여섯이 줄을 선다.
 *   pour         통 하나에 전부 담긴다. 가장 큰 ρ 에 물금이 선다.
 *   read-single  통 하나의 답을 자 위에서 참값과 견준다.
 *   split        벽이 내려와 통이 갈린다.
 *   settle       통마다 남은 ρ 와 그 통 혼자의 답이 선다.
 *   gather       넷을 모은 값이 한 자리에 앉는다.
 *   rewind       처음으로 되감는다. 자동 재생이 끝난 뒤 첫 advance 에서만 나간다.
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

export async function averageTheBucketsAlgorithm(
  ctx: FacetContext<AverageTheBucketsData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<AverageTheBucketsData>;
  const { stepMs } = ctx.data;

  type Gate = () => Promise<boolean>;

  /**
   * 한 바퀴.
   *
   * **문은 걸음 사이에만 있다** — 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece).
   * 자동 재생의 첫 걸음도, 되감은 뒤의 첫 걸음도 이 한 짜임에서 곧바로 선다.
   */
  const play = async (gate: Gate): Promise<boolean> => {
    await ctx.emit({ type: 'stream' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'pour' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-single' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'split' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'settle' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'gather' });
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
