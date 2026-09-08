/**
 * shift-on-remove — 가운데를 빼면 뒤가 당겨진다.
 *
 * 조각(piece). 한 질문에만 답한다: **배열에서 가운데 값을 빼면 뒤는 어떻게 되는가.**
 * 답은 "빠진 자리를 메우러 뒤의 값들이 왼쪽으로 한 칸씩 옮겨 온다" 이고, 그
 * 옮김을 앞에서부터 해야 한다는 것과 끝에 쓰이지 않는 칸이 남는다는 것까지가
 * 한 논증이다.
 *
 * ── 식별자 ────────────────────────────────────────────────────────────
 *   index:<n>   배열의 n 번 칸. 칸은 고정된 자리이고 값만 움직인다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────
 * 전부 이 facet 고유 어휘다. 표준 어휘 (enqueue / dequeue / append 등) 는 큐·리스트
 * 의미를 이미 갖고 있어 "고정된 칸 사이에서 값이 한 칸 옮겨 온다" 를 그 이름으로
 * 부르면 뜻이 어긋난다 (C2 — 표준 이벤트 재해석 금지).
 *
 *   caption   payload { textKey: string; index?: number; moved?: number }
 *             화면 서사 한 줄. 문안이 아니라 **키** 를 보낸다 (C10).
 *             index / moved 는 문안이 아니라 값이므로 algorithm 이 채운다.
 *             silent: 아니다.
 *   remove    target 'index:<i>'   payload { index: number; value: number }
 *             그 칸의 값이 배열 밖으로 빠져나가고 자리가 빈다. silent: 아니다.
 *   pull      target ['index:<from>', 'index:<to>']  payload { from: number; to: number }
 *             빈 자리를 메우러 뒤의 값이 왼쪽으로 한 칸 옮겨 온다. silent: 아니다.
 *   settle    payload { usedLength: number }
 *             쓰이는 구간이 한 칸 줄고, 꼬리 칸이 더 쓰이지 않는 칸으로 남는다.
 *             silent: 아니다.
 *   rewind    payload 없음
 *             처음 상태로 되돌린다. advance 로 한 걸음씩 다시 짚을 때
 *             매 바퀴의 첫 발신이다 (S-piece). silent: 아니다.
 *
 * ── 메트릭 ────────────────────────────────────────────────────────────
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece / C5).
 *
 * ── 진행 ─────────────────────────────────────────────────────────────
 * mechanismKind 는 'reactive'. mount 즉시 스스로 한 번 재생하고 (걸음 사이는
 * `ctx.sleep(stepMs)`), 그 뒤로는 `advance` 를 받을 때마다 같은 걸음을 처음부터
 * 하나씩 다시 짚는다. 걸음의 나열은 `play()` 한 곳에만 있고, 자동 재생과 손으로
 * 짚는 재생은 **걸음 사이를 무엇으로 벌리느냐** 만 다르다 (gate).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShiftOnRemoveFacetData = {
  type: string;
  /** 칸에 처음 들어 있는 값. 칸 수도 이 배열이 정한다. */
  values: number[];
  /** 빼낼 자리. */
  removeIndex: number;
  /** 걸음 사이의 간격(ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 한 걸음에서 다음 걸음으로 넘어가는 방식.
 *
 * 자동 재생은 `ctx.sleep(stepMs)`, 손으로 짚는 재생은 `advance` 대기다.
 * false 를 돌려주면 (취소·리셋) 그 자리에서 멈춘다.
 */
type Gate = () => Promise<boolean>;

/** 다음 `advance` 신호를 기다린다. 취소로 깨어나면 false. */
async function nextAdvance(ctx: ReactiveContext<ShiftOnRemoveFacetData>): Promise<boolean> {
  for (;;) {
    if (ctx.cancelled) return false;
    try {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      if (input.type === 'advance') return true;
    } catch {
      return false;
    }
  }
}

/**
 * 걸음의 나열. 한 줄에 한 걸음이고, 걸음 사이는 gate 가 벌린다.
 *
 * 순서가 곧 논증이다 — 성한 상태를 보이고(전제), 구멍을 내고(문제), 당기는
 * 규칙을 말한 뒤(장치), 당기고, 남은 것을 센다(결과).
 */
async function play(ctx: ReactiveContext<ShiftOnRemoveFacetData>, gate: Gate): Promise<boolean> {
  const values = ctx.data.values;
  const removeIndex = ctx.data.removeIndex;
  const last = values.length - 1;

  await ctx.emit({ type: 'caption', payload: { textKey: 'caption.intact' } });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'caption', payload: { textKey: 'caption.remove', index: removeIndex } });
  await ctx.emit({
    type: 'remove',
    target: `index:${removeIndex}`,
    payload: { index: removeIndex, value: values[removeIndex] },
  });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'caption', payload: { textKey: 'caption.pull' } });
  if (!(await gate())) return false;

  // 빈 칸 바로 뒤의 값부터, 앞에서 뒤로. 이 오름차순이 곧 주장이다 — 뒤에서
  // 시작하면 아직 옮기지 않은 값 위에 덮어쓰게 된다. 옮김은 세 번이 아니라
  // "빈 자리 뒤의 전부" 이므로 루프로 둔다 (emit 의 type 은 그대로 리터럴이다).
  for (let from = removeIndex + 1; from <= last; from += 1) {
    if (ctx.cancelled) return false;
    await ctx.emit({
      type: 'pull',
      target: [`index:${from}`, `index:${from - 1}`],
      payload: { from, to: from - 1 },
    });
    if (!(await gate())) return false;
  }

  await ctx.emit({ type: 'caption', payload: { textKey: 'caption.result', moved: last - removeIndex } });
  await ctx.emit({ type: 'settle', payload: { usedLength: values.length - 1 } });
  return true;
}

export const shiftOnRemove = async (ctx: FacetContext<ShiftOnRemoveFacetData>): Promise<void> => {
  const rc = ctx as ReactiveContext<ShiftOnRemoveFacetData>;

  // 1) 스스로 한 번 재생한다. 아무것도 누르지 않아도 화면은 할 말을 마친다.
  if (!(await play(rc, () => rc.sleep(rc.data.stepMs)))) return;

  // 2) 그 뒤로는 advance 를 누를 때마다 처음부터 한 걸음씩. 곱씹으려는 사람 몫이다.
  for (;;) {
    if (!(await nextAdvance(rc))) return;
    await rc.emit({ type: 'rewind' });
    if (!(await play(rc, () => nextAdvance(rc)))) return;
  }
};
