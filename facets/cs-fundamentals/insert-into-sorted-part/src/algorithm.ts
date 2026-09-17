/**
 * 정렬부 삽입 — 조각(piece) facet 의 알고리즘.
 *
 * 질문: **"끼워 넣는다" 는 자리가 저절로 벌어지는 일인가?**
 * 아니다. 새 값은 줄에서 **뽑혀 나와 들려 있고**, 그 아래에서 값들이 하나씩
 * 오른쪽으로 비켜서면서 **빈자리가 왼쪽으로 옮겨 온다.** 비켜서는 일은 뒤에서부터
 * 앞으로 번지고 (앞에서부터 하면 아직 안 비킨 값을 덮는다), 왼쪽이 이미 줄 서
 * 있으므로 자기보다 크지 않은 값을 만나는 순간 멈춘다.
 *
 * ── 진행 모델 (S-piece)
 * `mechanismKind: 'reactive'` 라 mount 하면 스스로 한 바퀴 자동 재생하고
 * (`ctx.sleep(stepMs)`), 그 뒤로는 `advance` 입력을 받아 한 걸음씩 나아간다.
 * 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 되감고 첫 걸음까지 보인다 —
 * 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
 *
 * ── 식별자
 * `index:<칸 번호>` — 줄의 칸. 0 부터 시작하며 마지막 칸이 새 값의 출발 자리다.
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 없음)
 * | type         | payload | 뜻 |
 * |--------------|---------|----|
 * | `lift`       | 없음    | 새 값이 마지막 칸에서 뽑혀 위로 들린다. 그 칸은 빈자리가 된다 |
 * | `compare`    | 없음    | 들린 값과 빈자리 왼쪽 칸을 견준다 |
 * | `step-aside` | 없음    | 견준 값이 오른쪽 빈자리로 비켜선다. 빈자리가 한 칸 왼쪽으로 옮겨 온다 |
 * | `stop`       | 없음    | 견준 값이 크지 않다. 더 왼쪽으로 가지 않고 경계를 세운다 |
 * | `settle`     | 없음    | 들려 있던 값이 빈자리로 내려앉는다 |
 * | `done`       | 없음    | 끝 |
 * | `rewind`     | 없음    | 처음 상태로 되감는다 (`advance` 로 되짚어 볼 때) |
 *
 * **어느 발신도 payload 를 싣지 않는다.** 걸음이 실을 만한 수 — 들리는 칸, 빈자리,
 * 견주는 칸, 견준 값, 비켜섬·견줌 횟수, 끝난 배열 — 이 전부 장면의 구조에서 셈되기
 * 때문이다. 빈자리는 칸 목록에서 비어 있는 칸이고, 견줄 자리는 그 왼쪽이며, 비켜선
 * 값들은 빈자리 오른쪽에 모여 있다. 실어 보내면 같은 물음에 답이 둘이 되어 언젠가
 * 갈린다 (`scene.ts` 의 `holeOf` · `hasShifted` · `tallyOf`).
 *
 * `target` 은 어휘 정합을 위해 남긴다 (C2, 원칙 4).
 *
 * 메트릭은 두지 않는다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { AlgorithmFn, ReactiveContext } from '@ffacet/core/runtime';

export type InsertIntoSortedPartData = {
  type: 'insert-into-sorted-part';
  /** 이미 줄 선 쪽. 오름차순임을 전제한다. */
  sorted: number[];
  /** 그 오른쪽 칸에서 출발해 줄 안으로 들어갈 새 값. */
  incoming: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/**
 * 걸음 사이의 문(gate).
 *
 * 자동 재생이면 `ctx.sleep`, 되짚어 보기면 `advance` 대기. `false` 를 돌려주면
 * 취소된 것이므로 그 자리에서 접는다.
 */
type Gate = () => Promise<boolean>;

const FALLBACK_STEP_MS = 750;

/**
 * 한 바퀴. 문 하나가 걸음 하나다.
 *
 * 걸음표를 손으로 적지 않는다 — 견줌과 비켜섬의 횟수는 데이터가 정한다 (C2).
 * 어디서 멈추는지가 이 조각의 요점이므로 그것도 세지 않고 나온 대로 따른다.
 */
async function playOnce(
  ctx: ReactiveContext<InsertIntoSortedPartData>,
  gate: Gate,
): Promise<boolean> {
  const sorted = ctx.data.sorted;
  const key = ctx.data.incoming;
  const keyIndex = sorted.length;

  if (!(await gate())) return false;
  await ctx.emit({ type: 'lift', target: `index:${keyIndex}` });

  // 빈자리. 들린 값이 내려앉을 후보이며 비켜섬마다 왼쪽으로 옮겨 온다.
  let hole = keyIndex;

  // 뒤에서부터 앞으로. 아직 비키지 않은 값을 덮지 않으려면 이 방향이어야 한다.
  for (let probe = keyIndex - 1; probe >= 0; probe -= 1) {
    // 칸 probe 는 아직 손대지 않았으므로 원래 값이 그대로 있다.
    // 견줌의 결과는 어디까지 갈지를 정할 뿐 실어 보내지 않는다 — 두 값이 모두
    // 화면에 있으므로 장면이 같은 견줌을 스스로 한다.
    const yields = sorted[probe] > key;

    if (!(await gate())) return false;
    await ctx.emit({ type: 'compare', target: `index:${probe}` });

    if (!yields) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'stop', target: `index:${probe}` });
      break;
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'step-aside', target: `index:${probe}` });
    hole = probe;
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'settle', target: `index:${hole}` });

  if (!(await gate())) return false;
  await ctx.emit({ type: 'done' });
  return true;
}

export const insertIntoSortedPart: AlgorithmFn<InsertIntoSortedPartData> = async (base) => {
  const ctx = base as ReactiveContext<InsertIntoSortedPartData>;
  const stepMs = ctx.data.stepMs > 0 ? ctx.data.stepMs : FALLBACK_STEP_MS;

  // 1회차 — 자동 재생. 아무것도 누르지 않아도 화면은 할 말을 마친다.
  if (!(await playOnce(ctx, () => ctx.sleep(stepMs)))) return;

  // 2회차부터 — 곱씹으며 읽고 싶은 사람을 위해 `advance` 로 한 걸음씩.
  for (;;) {
    try {
      await ctx.waitForInput();
    } catch {
      return; // 취소
    }
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });

    // 되감기 직후의 첫 문은 그냥 통과시킨다. 되감기만 하고 멈추면 눌러도
    // 반응이 없는 것으로 읽힌다 (S-piece).
    let opened = false;
    const advance: Gate = async () => {
      if (!opened) {
        opened = true;
        return true;
      }
      try {
        await ctx.waitForInput();
      } catch {
        return false;
      }
      return !ctx.cancelled;
    };
    if (!(await playOnce(ctx, advance))) return;
  }
};
