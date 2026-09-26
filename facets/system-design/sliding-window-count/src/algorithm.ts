/**
 * 고정 창과 미는 창 — 같은 요청 열을 두 제한기가 한 걸음에 함께 판정한다.
 *
 * 한도는 "창 {windowSec} 초에 {limit} 건". 두 제한기 모두 **받아들인** 요청만 센다.
 *
 * - 고정 창: 칸 번호 = ⌊at / windowSec⌋. 요청이 든 칸에서 앞서 받아들인 수 < limit 면 받는다.
 *   칸이 바뀌면 셈은 그 칸의 것(처음엔 0)으로 돌아간다.
 * - 미는 창(로그 꼴): 받아들인 요청의 시각을 모두 적어 두고, 시각 at 의 요청은
 *   (at − windowSec, at] 안에서 앞서 받아들인 수 < limit 면 받는다.
 * - 같은 초의 둘 이상은 데이터 차례대로 판정한다.
 *
 * 이벤트
 *   init   (silent) payload { fixedCell: number; fixedCount: number; slideCount: number }
 *          두 제한기의 빈 셈. 고정 창의 칸은 시각 0 이 든 칸이다.
 *   judge  payload {
 *            index: number;                       요청의 데이터 차례 (0 부터)
 *            id: string;                          요청 식별자 (대조용)
 *            fixed: { before: number; verdict: 'accept' | 'reject'; after: number; recent: number };
 *            slide: { before: number; verdict: 'accept' | 'reject'; after: number };
 *          }
 *          before = 판정 앞서 받아들인 수 (고정: 그 칸 안 · 미는: 그 창 안)
 *          after  = 판정 뒤 같은 범위 안의 수
 *          fixed.recent = 고정 창이 (at − windowSec, at] 안에서 받아들인 수 — "두 배" 를 재는 값
 *
 * 걸음: 걸음 0 = 요청 시각과 빈 셈, 걸음 k = 요청 k 하나.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SlidingWindowRequest = { id: string; at: number };

export type SlidingWindowCountFacetData = {
  type: 'sliding-window-count';
  stepMs: number;
  limit: number;
  windowSec: number;
  requests: SlidingWindowRequest[];
};

export type Verdict = 'accept' | 'reject';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`sliding-window-count: ${path} 는 양의 정수여야 한다 (${String(v)})`);
  }
  return v;
}

/** 모양을 검사하고 어긋나면 던지는 좁히개. 알고리즘과 장면이 함께 부른다. */
export function narrowSlidingWindowCountData(raw: unknown): SlidingWindowCountFacetData {
  if (!isRecord(raw)) throw new Error('sliding-window-count: 자료가 객체가 아니다');
  if (raw.type !== 'sliding-window-count') {
    throw new Error(`sliding-window-count: type 이 다르다 (${String(raw.type)})`);
  }
  const stepMs = positiveInt(raw.stepMs, 'stepMs');
  const limit = positiveInt(raw.limit, 'limit');
  const windowSec = positiveInt(raw.windowSec, 'windowSec');
  if (!Array.isArray(raw.requests) || raw.requests.length === 0) {
    throw new Error('sliding-window-count: requests 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  const requests: SlidingWindowRequest[] = raw.requests.map((r: unknown, i: number) => {
    if (!isRecord(r)) throw new Error(`sliding-window-count: requests[${i}] 가 객체가 아니다`);
    if (typeof r.id !== 'string' || r.id === '') {
      throw new Error(`sliding-window-count: requests[${i}].id 가 문자열이 아니다`);
    }
    if (seen.has(r.id)) throw new Error(`sliding-window-count: requests[${i}].id 가 겹친다 (${r.id})`);
    seen.add(r.id);
    if (typeof r.at !== 'number' || !Number.isInteger(r.at) || r.at < 0) {
      throw new Error(`sliding-window-count: requests[${i}].at 은 0 이상의 정수 초여야 한다`);
    }
    return { id: r.id, at: r.at };
  });
  for (let i = 1; i < requests.length; i += 1) {
    if (requests[i]!.at < requests[i - 1]!.at) {
      throw new Error(`sliding-window-count: requests[${i}].at 이 앞 요청보다 이르다 — 데이터 차례가 온 차례다`);
    }
  }
  return { type: 'sliding-window-count', stepMs, limit, windowSec, requests };
}

/** 고정 창의 칸 번호 — ⌊at / windowSec⌋. */
export function cellOf(at: number, windowSec: number): number {
  return Math.floor(at / windowSec);
}

/** 칸 cell 의 경계 [lo, hi). */
export function cellBounds(cell: number, windowSec: number): { lo: number; hi: number } {
  return { lo: cell * windowSec, hi: (cell + 1) * windowSec };
}

/** 시각 at 에서 미는 창의 경계 (lo, hi]. lo 는 음수일 수 있다 — 셈 그대로다. */
export function windowBounds(at: number, windowSec: number): { lo: number; hi: number } {
  return { lo: at - windowSec, hi: at };
}

/** 그림의 시간 축 끝 — 마지막 요청이 든 칸의 끝. 바탕에서 정해지는 셈이다. */
export function axisEndOf(requests: readonly SlidingWindowRequest[], windowSec: number): number {
  const last = requests[requests.length - 1];
  if (!last) throw new Error('sliding-window-count: 요청이 없어 축을 정할 수 없다');
  return cellBounds(cellOf(last.at, windowSec), windowSec).hi;
}

function countWithin(times: readonly number[], lo: number, hi: number): number {
  return times.filter((x) => x > lo && x <= hi).length;
}

export async function slidingWindowCount(
  ctx: FacetContext<SlidingWindowCountFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SlidingWindowCountFacetData>;
  const data = narrowSlidingWindowCountData(ctx.data);
  const { limit, windowSec, requests, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { fixedCell: cellOf(0, windowSec), fixedCount: 0, slideCount: 0 },
  });

  // 받아들인 요청의 시각 — 고정 창은 칸 번호로, 미는 창은 로그로 센다
  const fixedAccepted: number[] = [];
  const slideAccepted: number[] = [];

  for (let index = 0; index < requests.length; index += 1) {
    // 걸음 0 에 읽을 것(요청 시각)이 있으니 첫 판정 앞에도 머문다
    if (!(await pause())) return;
    const req = requests[index]!;
    const cell = cellOf(req.at, windowSec);

    const fixedBefore = fixedAccepted.filter((x) => cellOf(x, windowSec) === cell).length;
    const fixedVerdict: Verdict = fixedBefore < limit ? 'accept' : 'reject';
    if (fixedVerdict === 'accept') fixedAccepted.push(req.at);
    const fixedAfter = fixedAccepted.filter((x) => cellOf(x, windowSec) === cell).length;

    const win = windowBounds(req.at, windowSec);
    const slideBefore = countWithin(slideAccepted, win.lo, win.hi);
    const slideVerdict: Verdict = slideBefore < limit ? 'accept' : 'reject';
    if (slideVerdict === 'accept') slideAccepted.push(req.at);
    const slideAfter = countWithin(slideAccepted, win.lo, win.hi);

    const fixedRecent = countWithin(fixedAccepted, win.lo, win.hi);

    await ctx.emit({
      type: 'judge',
      payload: {
        index,
        id: req.id,
        fixed: { before: fixedBefore, verdict: fixedVerdict, after: fixedAfter, recent: fixedRecent },
        slide: { before: slideBefore, verdict: slideVerdict, after: slideAfter },
      },
    });
  }
}
