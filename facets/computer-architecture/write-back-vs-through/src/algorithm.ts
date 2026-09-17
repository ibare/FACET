/**
 * write-back 과 write-through 를 나란히 굴리는 조각의 algorithm.
 *
 * 같은 고침 차례를 두 정책이 함께 받는다. 고침 횟수는 어느 쪽이나 같고,
 * 갈리는 것은 **아래층으로 내려간 횟수**뿐이다.
 *
 * ── 여기가 셈하는 것은 하나뿐이다
 *
 * **이 고침을 어느 칸이 받나.** 자리가 모자라면 가장 오래전에 쓴 칸이 내준다
 * (LRU). 그것은 걸음이 내리는 판정이라 발신에 싣는다.
 *
 * 나머지는 전부 장면이 파생시킨다 — 어느 줄인가(차례표에서 나온다) · 적중인가
 * (그 칸에 그 줄이 있었나) · 무엇이 쫓겨나나(그 칸에 있던 것) · 표시가 몇인가 ·
 * **몇 번 내려갔나**. 마지막 것이 이 조각의 결론인데, 화면의 상자를 세는 것과
 * 여기서 세는 것이 두 출처가 되면 언젠가 갈린다. 그래서 여기서는 세지 않는다.
 *
 * 1차 데이터는 칸 수 · 라인 크기 · 고치는 줄 차례뿐이다 (S-piece).
 *
 * ── 식별자
 *   쓰지 않는다. 걸음이 가리키는 것이 칸 번호 하나라 target 이 가리킬 대상이 없다.
 *
 * ── 이벤트 (facet 고유 확장 — C2). 넷 다 silent 가 아니다.
 *   'line-write'  { slot }
 *       고침 한 번. `slot` 은 이 고침을 받는 칸 — 적중이면 그 줄이 있던 칸,
 *       아니면 새로 들어앉을 칸(자리가 찼으면 LRU 로 고른 희생 칸)이다.
 *   'flush'       {}
 *       끝에 남은 고쳐진 줄들을 내려보낸다. 무엇이 남았는지는 장면이 안다.
 *   'done'        {}
 *   'rewind'      {}
 *       한 걸음씩 다시 볼 때 화면을 처음으로 되돌린다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WriteBackVsThroughData = {
  type: string;
  /** 캐시 칸 수. */
  slotCount: number;
  /** 라인 한 줄의 크기(바이트). 화면에는 `2 × 16 B` 표식으로만 나온다. */
  lineBytes: number;
  /** 고치는 줄의 차례. 이 배열이 걸음을 정한다 — 손으로 적은 걸음표가 아니다. */
  writes: number[];
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

/**
 * 고침마다 그것을 받을 칸을 고른다 — LRU.
 *
 * 빈 칸이 있으면 그리로, 없으면 가장 오래전에 쓴 칸이 내준다. 그 칸에 무엇이
 * 있었는지는 여기서 돌려주지 않는다 — 장면이 자기가 쥔 칸에서 읽는다.
 */
function slotPlan(data: WriteBackVsThroughData): number[] {
  const writes = Array.isArray(data.writes) ? data.writes : [];
  const slotCount = Math.max(1, Math.floor(data.slotCount));
  /** 칸에 앉은 줄. 비어 있으면 -1. */
  const seated: number[] = Array.from({ length: slotCount }, () => -1);
  /** 최근에 쓴 칸이 뒤로 간다 — 맨 앞이 가장 오래된 칸이다. */
  const recency: number[] = [];
  const plan: number[] = [];

  for (const raw of writes) {
    const line = Math.max(0, Math.floor(raw));
    let slot = seated.indexOf(line);
    if (slot < 0) {
      const free = seated.indexOf(-1);
      slot = free >= 0 ? free : recency.length > 0 ? recency[0] : 0;
      seated[slot] = line;
    }
    const seen = recency.indexOf(slot);
    if (seen >= 0) recency.splice(seen, 1);
    recency.push(slot);
    plan.push(slot);
  }

  return plan;
}

/** 걸음 사이의 문. 이어 가도 되면 true, 취소·중단이면 false. */
type Gate = () => Promise<boolean>;

export const writeBackVsThroughAlgorithm = async (
  ctx: FacetContext<WriteBackVsThroughData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<WriteBackVsThroughData>;
  const slots = slotPlan(ctx.data);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 700;

  /** 자동 재생 — 스스로 나아간다. */
  const byTime: Gate = () => rc.sleep(stepMs);

  /** 한 걸음씩 — `advance` 를 받을 때까지 선다. 그 밖의 입력은 걸음으로 세지 않는다. */
  const byHand: Gate = async () => {
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      // 뒤에서도 본다 — throw 규약에만 기대지 않는다 (C8).
      if (rc.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  };

  /**
   * 한 판을 처음부터 끝까지 보인다.
   *
   * 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 문은 걸음 *사이*의 것이라
   * 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). 같은 이유로, 되감은 뒤
   * 처음 누르는 `advance` 도 첫 걸음까지 그대로 간다.
   */
  const play = async (gate: Gate): Promise<boolean> => {
    let first = true;
    for (const slot of slots) {
      if (!first && !(await gate())) return false;
      first = false;
      await ctx.emit({ type: 'line-write', payload: { slot } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'flush', payload: {} });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: {} });
    return true;
  };

  if (!(await play(byTime))) return;

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    if (!(await play(byHand))) return;
  }
};
