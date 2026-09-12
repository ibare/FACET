/**
 * 공간 지역성 — 옆자리를 이어서 쓴다.
 *
 * 한 줄이 올라오면 그 줄이 다 쓰일 때까지 아래층을 찾지 않는다. 넷을 짚는 동안
 * 내려가는 일은 처음 한 번뿐이고, 줄이 끝나는 자리에서만 다시 내려간다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 는 없다 — 넷 다 화면이 바뀐다)
 *
 *   probe      { index, addr, line }              찾는 자리가 위층에 비어 있다
 *   line-lift  { index, addr, line, span }        아래층에서 그 줄이 통째로 올라온다.
 *                                                 span 은 한 줄에 함께 오는 원소 수
 *   touch      { index, addr, line }              이미 올라와 있다 — 히트
 *   rewind     (payload 없음)                     처음으로 되감는다
 *   done       { touches, misses, hits }          다 짚었다
 *
 * ── 식별자
 *
 * 쓰지 않는다. 어느 칸이 어디 놓이는지는 stage 가 색인에서 셈한다 (S-piece).
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없다 (S-piece). 마지막 셈은 `done` 의 payload 로 한 번만
 * 나가고, 그 수는 아래 순회가 실제로 센 것이다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SpatialLocalityData = {
  type: 'spatialLocality';
  /** 캐시 라인 한 줄이 담는 바이트 수. */
  lineBytes: number;
  /** 원소 하나의 바이트 수. */
  elemBytes: number;
  /** a[0] 부터 차례로 몇 개를 짚는지. */
  count: number;
  /** 걸음 하나가 끝난 뒤의 정지 시간 (ms). */
  stepMs: number;
};

/**
 * 한 걸음이 무엇인지.
 *
 * 미스는 두 걸음으로 나뉜다 — 위층을 먼저 짚어 **비어 있음**을 보이고(`probe`),
 * 그 다음에 아래층에서 줄이 올라온다(`fetch`). 원인보다 결과를 먼저 보이면
 * 논증이 설명으로 주저앉는다 (S-piece).
 */
type Step =
  | { kind: 'probe'; index: number; addr: number; line: number }
  | { kind: 'fetch'; index: number; addr: number; line: number; span: number }
  | { kind: 'hit'; index: number; addr: number; line: number }
  | { kind: 'done'; touches: number; misses: number; hits: number };

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 짚는 순서를 훑어 걸음표를 만든다.
 *
 * **손으로 적은 배열이 아니라 순회의 결과다** (S-piece). 어느 자리에서 미스가
 * 나는지는 저작 결정이 아니라 `주소 ÷ 라인 크기` 의 몫이 정한다 — 여기서 그것을
 * 실제로 나눠 보고, 몫이 바뀌는 자리에서만 아래층으로 내려간다.
 */
function planSteps(data: SpatialLocalityData): Step[] {
  const lineBytes = positive(data.lineBytes, 16);
  const elemBytes = positive(data.elemBytes, 4);
  const count = Math.max(1, Math.floor(positive(data.count, 8)));
  /** 한 줄에 함께 실려 오는 원소 수. 16 ÷ 4 = 4. */
  const span = Math.max(1, Math.floor(lineBytes / elemBytes));

  const steps: Step[] = [];
  const resident = new Set<number>();
  let misses = 0;

  for (let index = 0; index < count; index += 1) {
    const addr = index * elemBytes;
    const line = Math.floor(addr / lineBytes);
    if (resident.has(line)) {
      steps.push({ kind: 'hit', index, addr, line });
      continue;
    }
    steps.push({ kind: 'probe', index, addr, line });
    steps.push({ kind: 'fetch', index, addr, line, span });
    resident.add(line);
    misses += 1;
  }

  steps.push({ kind: 'done', touches: count, misses, hits: count - misses });
  return steps;
}

/** 걸음 하나를 발신한다. type 은 갈래마다 리터럴이다 (C2). */
async function fire(ctx: ReactiveContext<SpatialLocalityData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'probe':
      await ctx.emit({
        type: 'probe',
        payload: { index: step.index, addr: step.addr, line: step.line },
      });
      return;
    case 'fetch':
      await ctx.emit({
        type: 'line-lift',
        payload: { index: step.index, addr: step.addr, line: step.line, span: step.span },
      });
      return;
    case 'hit':
      await ctx.emit({
        type: 'touch',
        payload: { index: step.index, addr: step.addr, line: step.line },
      });
      return;
    case 'done':
      await ctx.emit({
        type: 'done',
        payload: { touches: step.touches, misses: step.misses, hits: step.hits },
      });
      return;
  }
}

export const spatialLocalityAlgorithm = async (
  ctx: FacetContext<SpatialLocalityData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<SpatialLocalityData>;
  const steps = planSteps(rc.data);
  const stepMs = positive(rc.data.stepMs, 650);

  // 자동 재생. **첫 걸음은 문을 지나지 않는다** — 문은 걸음 *사이*의 것이라
  // 앞걸음이 없는 첫 걸음 앞에 두면 stepMs 만큼 빈 화면이 먼저 보인다 (S-piece).
  for (let i = 0; i < steps.length; i += 1) {
    if (i > 0 && !(await rc.sleep(stepMs))) return;
    await fire(rc, steps[i]!);
  }

  // 그 뒤로는 한 걸음씩. 곱씹으며 읽고 싶은 사람을 위한 자리다.
  let cursor = steps.length;
  for (;;) {
    if (rc.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await rc.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!rc.cancelled) throw err;
      return;
    }
    if (rc.cancelled) return;
    // 받은 것의 종류를 본다 — 위젯 입력이 하나라도 붙으면 그것까지 걸음으로
    // 세게 되고, 그때 어긋나는 것은 이 대목을 빠뜨린 조각뿐이다 (S-piece).
    if (input.type !== 'advance') continue;

    if (cursor >= steps.length) {
      // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다. 첫 걸음까지 간다.
      await rc.emit({ type: 'rewind' });
      cursor = 0;
    }
    await fire(rc, steps[cursor]!);
    cursor += 1;
  }
};
