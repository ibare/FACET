/**
 * 공간 지역성 — 옆자리를 이어서 쓴다.
 *
 * 한 줄이 올라오면 그 줄이 다 쓰일 때까지 아래층을 찾지 않는다. 넷을 짚는 동안
 * 내려가는 일은 처음 한 번뿐이고, 줄이 끝나는 자리에서만 다시 내려간다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 는 없다 — 넷 다 화면이 바뀐다)
 *
 *   probe      {}   찾는 자리가 위층에 비어 있다
 *   line-lift  {}   아래층에서 그 줄이 통째로 올라온다
 *   touch      {}   이미 올라와 있다 — 히트
 *   rewind     {}   처음으로 되감는다
 *   done       {}   다 짚었다
 *
 * **payload 가 하나도 없다.** 발신이 싣던 수는 전부 둘 중 하나였다.
 *
 * - *몇 번째 짚기인가* (`index`) — 짚기는 올 때마다 하나씩 쌓이므로 장면이 센다.
 * - *그 색인에서 바탕이 정하는 것* (`addr` · `line` · `span`) — 아래 순수 함수를
 *   내주어 장면이 같은 함수를 부른다. 조각이 가리키는 셈이 바로 `주소 ÷ 줄 크기`
 *   라 두 곳에 적히면 언젠가 갈린다.
 * - *마지막 셈* (`touches` · `misses` · `hits`) — 짚은 목록과 올라온 줄 목록에서
 *   그대로 나온다. 화면과 다른 출처를 두지 않는다.
 *
 * 남은 것은 **걸음의 종류**뿐이고, 그것이 곧 이 algorithm 이 내리는 판정이다 —
 * 위층에 있었나(`touch`) 없었나(`probe` → `line-lift`).
 *
 * ── 식별자
 *
 * 쓰지 않는다. 어느 칸이 어디 놓이는지는 stage 가 색인에서 셈한다 (S-piece).
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없다 (S-piece).
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

/** 걸음도 그림도 함께 쓰는 바탕. 좁히는 규칙은 아래 하나뿐이다. */
export type SpatialLocalityShape = {
  lineBytes: number;
  elemBytes: number;
  count: number;
};

/**
 * `initialData` 를 좁힌다.
 *
 * 장면 방식에서는 이것이 좁히는 **유일한** 자리다 — `scene.ts` 의 `initial` 이
 * 부르고 그림은 장면에서 받는다. 두 벌이 되면 화면과 걸음이 다른 바탕을 본다
 * (S-piece).
 */
export function readSpatialLocality(raw: unknown): SpatialLocalityShape {
  const src = (raw ?? {}) as Record<string, unknown>;
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : fallback;
  return {
    lineBytes: num(src.lineBytes, 16),
    elemBytes: num(src.elemBytes, 4),
    count: Math.max(1, num(src.count, 8)),
  };
}

/** 한 줄에 함께 실려 오는 원소 수. 16 ÷ 4 = 4. */
export function spanOf(shape: SpatialLocalityShape): number {
  return Math.max(1, Math.floor(shape.lineBytes / shape.elemBytes));
}

/** 그 원소의 바이트 주소. */
export function addrOf(index: number, shape: SpatialLocalityShape): number {
  return index * shape.elemBytes;
}

/**
 * 그 주소가 속한 줄 번호 — **주소 ÷ 줄 크기의 몫**.
 *
 * 이 조각이 가리키는 셈이 바로 이것이다. 12 다음이 16 이 되는 자리에서 몫이
 * 0 에서 1 로 바뀌고, 거기서만 아래층으로 내려간다.
 */
export function lineOf(index: number, shape: SpatialLocalityShape): number {
  return Math.floor(addrOf(index, shape) / shape.lineBytes);
}

/**
 * 그림이 그리는 칸 수.
 *
 * 줄은 통째로 올라오므로 마지막으로 짚는 칸이 속한 줄의 **남은 칸까지** 그린다.
 * 그 칸들이 곧 "묻지 않았는데 덤으로 올라온 이웃" 이다.
 */
export function cellCountOf(shape: SpatialLocalityShape): number {
  const last = lineOf(shape.count - 1, shape);
  let n = shape.count;
  // 주소가 걸음마다 elemBytes 씩 늘므로 몫은 반드시 last 를 넘는다 — 멎는다.
  while (lineOf(n, shape) === last) n += 1;
  return n;
}

/**
 * 한 걸음이 무엇인지.
 *
 * 미스는 두 걸음으로 나뉜다 — 위층을 먼저 짚어 **비어 있음**을 보이고(`probe`),
 * 그 다음에 아래층에서 줄이 올라온다(`fetch`). 원인보다 결과를 먼저 보이면
 * 논증이 설명으로 주저앉는다 (S-piece).
 *
 * 갈래 이름만 남는다. 어느 칸의 일인지는 짚기가 쌓인 수가 말한다.
 */
type Step = { kind: 'probe' } | { kind: 'fetch' } | { kind: 'hit' } | { kind: 'done' };

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 짚는 순서를 훑어 걸음표를 만든다.
 *
 * **손으로 적은 배열이 아니라 순회의 결과다** (S-piece). 어느 자리에서 미스가
 * 나는지는 저작 결정이 아니라 `lineOf` 의 몫이 정한다 — 여기서 그것을 실제로
 * 나눠 보고, 몫이 바뀌는 자리에서만 아래층으로 내려간다.
 */
function planSteps(shape: SpatialLocalityShape): Step[] {
  const steps: Step[] = [];
  const resident = new Set<number>();

  for (let index = 0; index < shape.count; index += 1) {
    const line = lineOf(index, shape);
    if (resident.has(line)) {
      steps.push({ kind: 'hit' });
      continue;
    }
    steps.push({ kind: 'probe' });
    steps.push({ kind: 'fetch' });
    resident.add(line);
  }

  steps.push({ kind: 'done' });
  return steps;
}

/** 걸음 하나를 발신한다. type 은 갈래마다 리터럴이다 (C2). */
async function fire(ctx: ReactiveContext<SpatialLocalityData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'probe':
      await ctx.emit({ type: 'probe' });
      return;
    case 'fetch':
      await ctx.emit({ type: 'line-lift' });
      return;
    case 'hit':
      await ctx.emit({ type: 'touch' });
      return;
    case 'done':
      await ctx.emit({ type: 'done' });
      return;
  }
}

export const spatialLocalityAlgorithm = async (
  ctx: FacetContext<SpatialLocalityData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<SpatialLocalityData>;
  const steps = planSteps(readSpatialLocality(rc.data));
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
