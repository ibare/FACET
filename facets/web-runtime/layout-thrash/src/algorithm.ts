/**
 * layout-thrash — 스크립트 안의 읽기·쓰기 차례가 강제 동기 레이아웃을 가른다.
 *
 * 상자 열(box1..boxN, N = boxCount)에 세 차례(order) 중 하나로 `+10px` 를 적용한다.
 * 레이아웃은 깨끗/더러움 둘 — 쓰면 더러워지고, 더러운 채로 읽으면(offsetWidth 류) 그
 * 자리에서 강제 동기 레이아웃이 돈다. 스크립트가 더러운 채로 끝나면 브라우저가 다음
 * 프레임에서 한 번 더 잰다(강제가 아닌 프레임 레이아웃).
 *
 * 이벤트 (모두 이 모듈 고유, target 은 `index:<1부터 상자 번호>`):
 *   'round'          payload: { boxCount, order, widths }            판이 새로 시작 — 상자 열을 다시 그린다
 *   'read'           payload: { boxIndex, width }                    한 상자의 offsetWidth 를 읽는다 (번갈아 전용)
 *   'forced-layout'  payload: { boxIndex }                           그 읽기가 강제 동기 레이아웃을 일으켰다
 *   'write'          payload: { boxIndex, from, to }                 한 상자의 style.width 를 쓴다 — 오른쪽 상자들이 밀린다
 *   'read-all'       payload: { widths }                             상자 전부를 한 번에 읽는다 (읽기 모아서 전용, 레이아웃 없음)
 *   'write-all'      payload: { from, to }                           상자 전부를 한 번에 쓴다 — 한 줄 흐름이 한 번에 밀린다
 *   'frame-layout'   payload: {}                                     스크립트가 끝난 뒤 브라우저가 미룬 레이아웃을 돈다
 *   'phase'          payload: { phase: string | null }  silent: true 코드 패널 하이라이트
 *
 * phase 어휘 (irs.ts 와 정확히 같은 집합). 한 상자를 끝까지 처리하는 것이 한 걸음이라
 * 그 안의 읽기·강제 판정·쓰기는 코드 패널에서 한 덩어리로 강조한다(따로 걸음 경계를
 * 두지 않으면 마지막 것만 남기 때문 — "덮이는 phase"):
 *   rw-step(그 상자의 읽기+강제 판정+쓰기) · rw-frame · wr-step(쓰기+강제 읽기) ·
 *   batch-read · batch-write · batch-frame
 *
 * 계기: layouts · forced · measured — 이번 **판** 에서 지금까지 생긴 만큼을 보인다.
 * 판이 시작하는 자리에서 셋 다 0 으로 되돌리고(지금 보이는 값을 들고 차이만 보내는
 * 헬퍼로), 그 판이 끝날 때까지 쌓아 올린다. 그래서 같은 상자 수 · 차례로 되돌아오면
 * 처음 그 판을 돌았을 때와 계기가 똑같다 — 판을 오간 횟수가 값에 섞이지 않는다.
 *
 * 동률: 실수를 쓰지 않는다 — 너비·카운터 전부 정수라 동률 규칙이 따로 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LayoutThrashData = {
  type: 'layout-thrash';
  boxCount: number;
  order: number;
  boxWidths: number[];
  stepMs: number;
};

/** 차례 값 — 손잡이 `order` 의 segments[].value 와 같다. */
const RW = 0;
const WR = 1;
const BATCH = 2;

const BOX_COUNTS = new Set([1, 2, 4, 8, 16]);
const ORDERS = new Set([RW, WR, BATCH]);
const METRIC_NAMES = ['layouts', 'forced', 'measured'] as const;
type MetricName = (typeof METRIC_NAMES)[number];

function pickedValue(payload: unknown, allowed: Set<number>): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number' || !allowed.has(v)) return null;
  return v;
}

export async function layoutThrashAlgorithm(ctx: FacetContext<LayoutThrashData>): Promise<void> {
  const rc = ctx as ReactiveContext<LayoutThrashData>;
  const phase = (name: string | null) => rc.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 지금 화면에 뜬 계기 값 — 판이 바뀌면 이 값을 0으로 되돌리는 차이를 보낸다.
  const shown: Record<MetricName, number> = { layouts: 0, forced: 0, measured: 0 };
  const setMetric = (name: MetricName, target: number) => {
    rc.metric(name, target - shown[name]);
    shown[name] = target;
  };

  let boxCount = rc.data.boxCount;
  let order = rc.data.order;

  try {
    while (true) {
      if (rc.cancelled) return;
      await playRound(rc, phase, setMetric, boxCount, order);
      if (rc.cancelled) return;

      while (true) {
        if (rc.cancelled) return;
        const ev = await rc.waitForInput();
        if (rc.cancelled) return;
        const boxCountPick = ev.type === 'boxCount' ? pickedValue(ev.payload, BOX_COUNTS) : null;
        const orderPick = ev.type === 'order' ? pickedValue(ev.payload, ORDERS) : null;
        if (boxCountPick !== null) {
          boxCount = boxCountPick;
          break;
        }
        if (orderPick !== null) {
          order = orderPick;
          break;
        }
        // 우리 것이 아닌 입력은 흘려보낸다.
      }
    }
  } catch (err) {
    if (!rc.cancelled) throw err;
  }
}

async function playRound(
  rc: ReactiveContext<LayoutThrashData>,
  phase: (name: string | null) => Promise<void>,
  setMetric: (name: MetricName, target: number) => void,
  boxCount: number,
  order: number,
): Promise<void> {
  const stepMs = rc.data.stepMs;
  // 판마다 사전 데이터(1..16 의 처음 너비)에서 다시 시작한다 — 판을 거듭해도 쌓이지 않는다.
  const widths = rc.data.boxWidths.slice(0, boxCount);
  // 이번 판의 계기를 0부터 다시 쌓는다 — 처음 도는 판이면 차이가 0이라도 보내
  // 세 이름이 다 실리게 한다.
  setMetric('layouts', 0);
  setMetric('forced', 0);
  setMetric('measured', 0);

  await phase(null);
  await rc.emit({ type: 'round', payload: { boxCount, order, widths: widths.slice() } });
  if (!(await rc.sleep(stepMs))) return;

  if (order === RW) {
    let dirty = false;
    let layouts = 0;
    let forced = 0;
    let measured = 0;
    for (let i = 0; i < boxCount; i += 1) {
      if (rc.cancelled) return;
      await phase('rw-step');
      await rc.emit({ type: 'read', target: `index:${i + 1}`, payload: { boxIndex: i + 1, width: widths[i] } });
      if (dirty) {
        await rc.emit({ type: 'forced-layout', target: `index:${i + 1}`, payload: { boxIndex: i + 1 } });
        layouts += 1;
        forced += 1;
        measured += boxCount;
        setMetric('layouts', layouts);
        setMetric('forced', forced);
        setMetric('measured', measured);
        dirty = false;
      }
      const from = widths[i];
      const to = from + 10;
      widths[i] = to;
      dirty = true;
      await rc.emit({ type: 'write', target: `index:${i + 1}`, payload: { boxIndex: i + 1, from, to } });
      if (i === boxCount - 1 && dirty) {
        // 마지막 상자를 쓴 뒤 더러운 채로 스크립트가 끝난다 — 프레임 레이아웃이 같은 걸음에 실린다.
        await phase('rw-frame');
        await rc.emit({ type: 'frame-layout', payload: {} });
        layouts += 1;
        measured += boxCount;
        setMetric('layouts', layouts);
        setMetric('measured', measured);
        dirty = false;
      }
      if (!(await rc.sleep(stepMs))) return;
    }
    return;
  }

  if (order === WR) {
    let layouts = 0;
    let forced = 0;
    let measured = 0;
    for (let i = 0; i < boxCount; i += 1) {
      if (rc.cancelled) return;
      const from = widths[i];
      const to = from + 10;
      widths[i] = to;
      await phase('wr-step');
      await rc.emit({ type: 'write', target: `index:${i + 1}`, payload: { boxIndex: i + 1, from, to } });
      // 쓰고 바로 읽으므로(void box.offsetWidth) 늘 더러운 채로 읽어 강제 레이아웃이 돈다.
      await rc.emit({ type: 'forced-layout', target: `index:${i + 1}`, payload: { boxIndex: i + 1 } });
      layouts += 1;
      forced += 1;
      measured += boxCount;
      setMetric('layouts', layouts);
      setMetric('forced', forced);
      setMetric('measured', measured);
      if (!(await rc.sleep(stepMs))) return;
    }
    return;
  }

  // BATCH — 읽기 모아서.
  if (rc.cancelled) return;
  await phase('batch-read');
  await rc.emit({ type: 'read-all', payload: { widths: widths.slice() } });
  if (!(await rc.sleep(stepMs))) return;

  if (rc.cancelled) return;
  const from = widths.slice();
  const to = from.map((w) => w + 10);
  for (let i = 0; i < boxCount; i += 1) widths[i] = to[i];
  await phase('batch-write');
  await rc.emit({ type: 'write-all', payload: { from, to } });
  if (!(await rc.sleep(stepMs))) return;

  if (rc.cancelled) return;
  await phase('batch-frame');
  await rc.emit({ type: 'frame-layout', payload: {} });
  setMetric('layouts', 1);
  setMetric('measured', boxCount);
  if (!(await rc.sleep(stepMs))) return;
}
