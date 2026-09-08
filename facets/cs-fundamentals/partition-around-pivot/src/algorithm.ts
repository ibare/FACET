/**
 * 피벗 분할 조각 — 값들이 기준선을 사이에 두고 좌우 어느 한쪽으로 건너간다.
 *
 * 이 조각이 답하는 질문 하나: **가르고 나면 정렬된 것인가?**
 * 답은 아니다 — 가른 결과는 "기준보다 작다" 와 "크다" 뿐이고, 각 쪽 안은
 * 여전히 들어온 순서 그대로다. 다만 기준 자신의 자리는 이 한 번으로 확정된다.
 *
 * 화면의 뼈대는 **견줌의 한쪽 끝이 늘 같은 값**이라는 것이다. 값끼리 견주지
 * 않는다. 값 하나하나가 같은 기준선 위로 내려와 같은 기준과 한 번씩만 견주고,
 * 그 결과로 선을 넘어 좌 또는 우에 자리를 잡는다.
 *
 * ── 식별자
 *   `index:<i>`  values 의 i 번째 값
 *
 * ── 이벤트 (전부 facet 고유 확장. `done` 만 표준 어휘)
 *
 * | type          | target      | payload                                                  | silent |
 * |---------------|-------------|----------------------------------------------------------|--------|
 * | `pivot-set`   | —           | `{ pivot: number; count: number }`                         | no     |
 * | `compare`     | `index:<i>` | `{ index: number; value: number; pivot: number }`           | no     |
 * | `cross`       | `index:<i>` | `{ index: number; value: number; pivot: number; side: Side; slot: number }` | no |
 * | `pivot-final` | —           | `{ pivot: number }`                                        | no     |
 * | `done`        | —           | `{ pivot: number; lessCount: number; greaterCount: number }`| no     |
 * | `rewind`      | —           | —                                                          | no     |
 *
 *   `Side` = `'less' | 'greater'`.
 *   `slot` 은 그 쪽 안에서 몇 번째로 도착했는지 (0-based). 자리는 도착 순서가
 *   정할 뿐 값의 대소가 정하지 않는다 — 각 쪽 안이 정렬되지 않는다는 것이
 *   이 조각의 매듭이다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 *
 * ── 진행
 *   reactive. mount 즉시 자동으로 한 번 재생하고, 그 뒤로는 `advance` 입력마다
 *   한 걸음씩 나아간다. 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 `rewind` 를
 *   발신해 되감고 곧바로 첫 걸음까지 보인다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PartitionSide = 'less' | 'greater';

export type PartitionAroundPivotData = {
  type: 'partition-around-pivot';
  /** 기준과 견줄 값들. 이 순서대로 하나씩 건넌다. */
  values: number[];
  /** 모든 견줌의 한쪽 끝. 견줌 횟수는 곧 values 의 길이다. */
  pivot: number;
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 견줌을 보게 하는 짧은 뜸 — 값이 기준선에 닿고 넘어가기 전까지. */
const HOLD_MS = 200;

/** 한 걸음의 문. `false` 면 취소된 것이므로 즉시 멈춘다. */
type Gate = () => Promise<boolean>;

function asPartitionData(data: unknown): PartitionAroundPivotData {
  const d = data as Partial<PartitionAroundPivotData> | undefined;
  const values = Array.isArray(d?.values)
    ? d.values.filter((v): v is number => typeof v === 'number')
    : [];
  return {
    type: 'partition-around-pivot',
    values,
    pivot: typeof d?.pivot === 'number' ? d.pivot : 0,
    stepMs: typeof d?.stepMs === 'number' ? d.stepMs : 700,
  };
}

/** 취소를 검사하며 자는 뜸. */
async function pause(ctx: ReactiveContext<PartitionAroundPivotData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return await ctx.sleep(ms);
}

/** `advance` 하나를 기다린다. 취소되거나 다른 입력이면 흘려보낸다. */
async function waitForAdvance(ctx: ReactiveContext<PartitionAroundPivotData>): Promise<boolean> {
  for (;;) {
    if (ctx.cancelled) return false;
    let type: string;
    try {
      const ev = await ctx.waitForInput();
      type = ev.type;
    } catch {
      return false;
    }
    if (ctx.cancelled) return false;
    if (type === 'advance') return true;
  }
}

/**
 * 한 회차. 걸음마다 `gate` 를 먼저 통과한 뒤 발신한다.
 * 자동 재생이면 gate 가 `sleep(stepMs)`, 수동이면 `advance` 대기다.
 */
async function playThrough(
  ctx: ReactiveContext<PartitionAroundPivotData>,
  data: PartitionAroundPivotData,
  gate: Gate,
): Promise<void> {
  const { values, pivot } = data;

  if (!(await gate())) return;
  await ctx.emit({ type: 'pivot-set', payload: { pivot, count: values.length } });

  // 걸음표를 손으로 적지 않는다 — 순회 대상이 곧 데이터다 (S-piece).
  // 각 쪽의 자리는 도착 순서가 정하므로 여기서 세어 넘긴다.
  let lessCount = 0;
  let greaterCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!(await gate())) return;
    await ctx.emit({
      type: 'compare',
      target: `index:${index}`,
      payload: { index, value, pivot },
    });

    if (!(await pause(ctx, HOLD_MS))) return;

    const side: PartitionSide = value < pivot ? 'less' : 'greater';
    const slot = side === 'less' ? lessCount : greaterCount;
    if (side === 'less') lessCount += 1;
    else greaterCount += 1;

    await ctx.emit({
      type: 'cross',
      target: `index:${index}`,
      payload: { index, value, pivot, side, slot },
    });
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'pivot-final', payload: { pivot } });

  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: { pivot, lessCount, greaterCount } });
}

export const partitionAroundPivotAlgorithm = async (
  ctx: FacetContext<PartitionAroundPivotData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<PartitionAroundPivotData>;
  const data = asPartitionData(rctx.data);
  if (data.values.length === 0) return;

  // 1회차 — 스스로 재생한다. 누르지 않아도 화면은 할 말을 마친다.
  await playThrough(rctx, data, () => pause(rctx, data.stepMs));
  if (rctx.cancelled) return;

  // 그 뒤로는 곱씹는 사람의 것이다. 처음 누르는 advance 는 되감고
  // 첫 걸음까지 보인다 — 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다.
  for (;;) {
    if (!(await waitForAdvance(rctx))) return;
    await rctx.emit({ type: 'rewind' });

    let firstGate = true;
    const manualGate: Gate = async () => {
      if (firstGate) {
        firstGate = false;
        return !rctx.cancelled;
      }
      return await waitForAdvance(rctx);
    };
    await playThrough(rctx, data, manualGate);
    if (rctx.cancelled) return;
  }
};
