/**
 * move-without-repaint — 합성 전용 애니메이션 (origin: composited-animation).
 *
 * 이미 한 번 칠해 따로 둔 장(painted layer)을 장마다 옆으로 밀기만 한다.
 * 칠한 횟수는 애니메이션 내내 오르지 않고, 합성 횟수만 장마다 하나씩 오른다.
 *
 * 이벤트
 *   'move-without-repaint:frame'  payload { frame: number; x: number; composites: number }
 *     장 하나가 나왔다 — 칠한 장을 x px 자리로 밀어 합성했다. silent 아님(걸음을 늘린다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface MoveWithoutRepaintFacetData {
  type: 'move-without-repaint';
  stepMs: number;
  frames: number;
  perFramePx: number;
  paintedCount: number;
  layoutCount: number;
  codeTemplate: string;
}

export async function moveWithoutRepaint(
  ctx: FacetContext<MoveWithoutRepaintFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<MoveWithoutRepaintFacetData>;
  const { frames, perFramePx, stepMs } = rctx.data;

  /** 걸음 사이의 쉼 — 취소되면 false. 걸음 0(바탕 구조)도 읽을 틈을 준다. */
  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  for (let frame = 1; frame <= frames; frame += 1) {
    if (!(await pause())) return;
    const x = perFramePx * frame;
    await rctx.emit({
      type: 'move-without-repaint:frame',
      payload: { frame, x, composites: frame },
    });
  }
}
