/**
 * dequeBothEnds — 양방향 큐 조각(piece)의 걸음.
 *
 * 주장 하나만 말한다: **문이 넷이 아니라 둘인데, 둘 다 넣기와 빼기를 겸한다.**
 * 그래서 걸음도 네 조작을 두 끝에 두 개씩 붙여 보이고 멈춘다.
 *
 * ── 식별자
 *   queue:front   앞쪽 문 (표준 prefix `queue` 재사용)
 *   queue:back    뒤쪽 문
 *
 * ── 이벤트
 *   enqueue  target `queue:front` | `queue:back`, payload `{ value: number }`
 *            그 문으로 값 하나가 들어간다. silent 아님.
 *   dequeue  target `queue:front` | `queue:back`, payload 없음
 *            그 문으로 끝의 값 하나가 나온다. silent 아님.
 *   done     payload 없음. 네 문이 한꺼번에 열려 양방향임을 보인다. silent 아님.
 *   rewind   (facet 고유 확장) payload 없음. 처음 상태로 되돌린다 —
 *            자동 재생이 끝난 뒤 `advance` 로 한 걸음씩 짚어 볼 때만 발신된다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DequeBothEndsData = {
  type: 'dequeBothEnds';
  /** 처음 통 안에 앉아 있는 값 — 가운데 자리를 차지한다. */
  values: number[];
  /** 앞 문으로 넣었다가 앞 문으로 빼는 값. */
  frontValue: number;
  /** 뒤 문으로 넣었다가 뒤 문으로 빼는 값. */
  backValue: number;
  /** 통 안의 자리 수. 양끝으로 하나씩 자라도 남을 만큼. */
  capacity: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 다음 걸음으로 넘어가는 문지기. 자동 재생은 시간이, 짚어 보기는 누름이 연다. */
type Gate = () => Promise<boolean>;

const DEFAULT_STEP_MS = 660;

/**
 * 네 조작 + 마무리. 걸음을 배열로 순회하지 않고 한 줄씩 편다 (C2 — emit type 리터럴).
 * 문지기가 false 를 돌려주면 (취소) 그 자리에서 멈춘다.
 */
async function playSteps(ctx: FacetContext<DequeBothEndsData>, gate: Gate): Promise<boolean> {
  const frontValue = typeof ctx.data.frontValue === 'number' ? ctx.data.frontValue : 0;
  const backValue = typeof ctx.data.backValue === 'number' ? ctx.data.backValue : 0;

  if (!(await gate())) return false;
  await ctx.emit({ type: 'enqueue', target: 'queue:front', payload: { value: frontValue } });

  if (!(await gate())) return false;
  await ctx.emit({ type: 'enqueue', target: 'queue:back', payload: { value: backValue } });

  if (!(await gate())) return false;
  await ctx.emit({ type: 'dequeue', target: 'queue:front' });

  if (!(await gate())) return false;
  await ctx.emit({ type: 'dequeue', target: 'queue:back' });

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });

  return true;
}

export const dequeBothEnds = async (ctx: FacetContext<DequeBothEndsData>): Promise<void> => {
  const rc = ctx as ReactiveContext<DequeBothEndsData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생 — 걸음마다 읽을 틈을 준다. */
  const bySleep: Gate = () => rc.sleep(stepMs);
  /** 짚어 보기 — 한 번 누를 때마다 한 걸음. */
  const byPress: Gate = async () => {
    await rc.waitForInput();
    return !rc.cancelled;
  };

  /**
   * 되감은 누름이 곧 첫 걸음이다 — 첫 문만 그냥 통과시킨다.
   *
   * playSteps 는 문을 emit 앞에 두므로, 되감기 직후 그대로 넘기면 사람이
   * 한 번 더 눌러야 첫 걸음이 나온다. 눌렀는데 되감기만 하고 멈추면 반응이
   * 없는 것으로 읽힌다.
   */
  const openFirst = (gate: Gate): Gate => {
    let opened = false;
    return async () => {
      if (!opened) {
        opened = true;
        return !rc.cancelled;
      }
      return gate();
    };
  };

  if (!(await playSteps(ctx, bySleep))) return;

  // 자동 재생은 끝났다. 이제 `advance` 를 누를 때마다 처음으로 되감고
  // 한 걸음씩 나아간다 (S-piece). cancelled 면 waitForInput 이 reject 해
  // 메커니즘이 조용히 거둔다.
  while (!rc.cancelled) {
    await rc.waitForInput();
    if (rc.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await playSteps(ctx, openFirst(byPress)))) return;
  }
};
