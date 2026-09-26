/**
 * layoutPerFrame — 이벤트
 *
 *   frame   { frameNum: number; left: number; x: number; width: number;
 *             measured: number; painted: number; style: number; composite: number }
 *           장 하나가 돈다. `left` 선언이 바뀌어 상자의 자리(x)·너비가 다시
 *           셈해지고(measured), 다시 칠해진다(painted). style·composite 는
 *           같은 장에서 함께 도는 나머지 두 단계의 누적 횟수. silent 아님.
 *
 * 걸음 0(애니메이션 전)은 이벤트 없이 scene.ts 의 `initial` 이 initialData 에서
 * 채운다 — 이미 읽을 것이 있는 화면(상자·값 0)이라, 첫 emit 앞에서 stepMs 만큼
 * 기다려 읽을 틈을 준다 (아래 pause() 가 루프 첫 문장이다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LayoutPerFrameFacetData = {
  type: 'layoutPerFrame';
  frames: number;
  perFrame: number;
  width: number;
  stepMs: number;
};

export async function layoutPerFrame(ctx: FacetContext<LayoutPerFrameFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<LayoutPerFrameFacetData>;
  const { frames, perFrame, width, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  for (let frameNum = 1; frameNum <= frames; frameNum += 1) {
    if (!(await pause())) return;
    const left = perFrame * frameNum;
    await rc.emit({
      type: 'frame',
      payload: {
        frameNum,
        left,
        x: left,
        width,
        measured: frameNum,
        painted: frameNum,
        style: frameNum,
        composite: frameNum,
      },
    });
  }
}
