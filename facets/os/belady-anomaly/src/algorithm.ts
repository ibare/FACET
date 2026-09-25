/**
 * beladyAnomaly — 같은 참조를 프레임 셋과 넷에 FIFO 로 흘려, 두 쪽의 폴트 수가
 * 나란히 쌓이다 넷 쪽이 앞지르는 것을 보인다 (벨레이디의 역설).
 *
 * 값은 모두 예로 정한 것이다 — 참조 열과 프레임 수는 실제 시스템에서 잰 것이 아니다.
 *
 * 규약 (FIFO, evict-oldest 와 같다)
 *   - 참조한 페이지가 이미 프레임에 있으면 적중, 없으면 폴트. 폴트는 참조 하나에 하나.
 *   - 빈 프레임이 있으면 번호가 낮은 것부터 채운다.
 *   - 빈 프레임이 없으면 들어온 줄의 맨 앞(가장 먼저 들어온 페이지)을 내보내고,
 *     새 페이지는 그 프레임 자리에 들어간다 (프레임 번호가 바뀌지 않는다).
 *   - 적중은 들어온 줄의 차례를 바꾸지 않는다.
 *   - 참조 하나가 한 걸음이고, 그 걸음에 두 쪽이 함께 움직인다.
 *
 * 이벤트 (전부 silent 아님)
 *   ref { index: number, page: number,
 *         sides: Array<{ kind: 'hit' | 'fault', frame: number, victim: number | null, faults: number }> }
 *     — 참조 하나. sides 는 initialData.frameCounts 의 차례와 같다.
 *       frame 은 적중한 프레임 또는 새 페이지가 들어간 프레임, victim 은 내보낸 페이지(없으면 null),
 *       faults 는 이 참조까지의 누적 폴트 수.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BeladyAnomalyFacetData = {
  type: 'belady-anomaly';
  /** 참조 열 — 페이지 번호 */
  refs: number[];
  /** 견줄 두 쪽의 프레임 수 */
  frameCounts: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type SideOutcome = {
  kind: 'hit' | 'fault';
  frame: number;
  victim: number | null;
  faults: number;
};

/** 한 쪽의 FIFO 상태. 알고리즘 안에서만 쓴다. */
type FifoSide = {
  frames: (number | null)[];
  queue: number[];
  faults: number;
};

function checkData(data: BeladyAnomalyFacetData): void {
  if (!Array.isArray(data.refs) || data.refs.length === 0) {
    throw new Error('beladyAnomaly: refs 가 비었다');
  }
  for (const p of data.refs) {
    if (!Number.isInteger(p)) throw new Error(`beladyAnomaly: 페이지 번호가 정수가 아니다 — ${String(p)}`);
  }
  if (!Array.isArray(data.frameCounts) || data.frameCounts.length !== 2) {
    throw new Error('beladyAnomaly: frameCounts 는 두 쪽이어야 한다');
  }
  for (const n of data.frameCounts) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`beladyAnomaly: 프레임 수가 틀렸다 — ${String(n)}`);
  }
  if (typeof data.stepMs !== 'number' || data.stepMs <= 0) {
    throw new Error('beladyAnomaly: stepMs 가 없다');
  }
}

/** FIFO 로 참조 하나를 넣는다. side 를 고치고 결과를 돌려준다. */
function fifoReference(side: FifoSide, page: number): SideOutcome {
  const at = side.frames.indexOf(page);
  if (at >= 0) {
    return { kind: 'hit', frame: at, victim: null, faults: side.faults };
  }
  let frame = side.frames.indexOf(null);
  let victim: number | null = null;
  if (frame < 0) {
    const oldest = side.queue.shift();
    if (oldest === undefined) throw new Error('beladyAnomaly: 빈 프레임도 들어온 줄도 없다');
    frame = side.frames.indexOf(oldest);
    if (frame < 0) throw new Error(`beladyAnomaly: 들어온 줄의 페이지 ${oldest} 가 프레임에 없다`);
    victim = oldest;
  }
  side.frames[frame] = page;
  side.queue.push(page);
  side.faults += 1;
  return { kind: 'fault', frame, victim, faults: side.faults };
}

export async function beladyAnomaly(
  ctxIn: FacetContext<BeladyAnomalyFacetData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<BeladyAnomalyFacetData>;
  const data = ctx.data;
  checkData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sides: FifoSide[] = data.frameCounts.map((n) => ({
    frames: new Array<number | null>(n).fill(null),
    queue: [],
    faults: 0,
  }));

  // 걸음 0 은 빈 프레임 두 쪽과 참조 열이 이미 서 있는 화면이라 읽을 틈을 먼저 준다.
  for (let index = 0; index < data.refs.length; index += 1) {
    if (!(await pause())) return;
    const page = data.refs[index];
    if (page === undefined) throw new Error(`beladyAnomaly: 참조 ${index} 가 없다`);
    const outcomes = sides.map((side) => fifoReference(side, page));
    await ctx.emit({ type: 'ref', payload: { index, page, sides: outcomes } });
  }
}
