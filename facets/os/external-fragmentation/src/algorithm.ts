/**
 * 외부 단편화 — 덩어리가 들고 나는 사이 빈 틈이 흩어져, 빈 몫의 합은 넉넉한데
 * 어느 틈에도 큰 덩어리가 들어가지 못한다.
 *
 * 값은 모두 예로 정한 것이다 (메모리 30 KiB · 덩어리 크기 · 들고 나는 차례).
 * 실제 시스템에서 잰 것이 아니다. 크기 단위는 KiB, 정수로만 다룬다.
 *
 * 규약 (사양의 규약 줄을 옮긴다)
 * - 넣기는 **처음 맞는 틈**(주소가 가장 낮은, 길이가 모자라지 않은 틈)의 앞 끝에.
 * - 이웃한 틈은 하나로 합쳐 센다.
 * - 옮겨 붙이기(압축)는 하지 않는다.
 * - 일 하나가 한 걸음. 못 들어가면 그 걸음에서 끝난다 (뒤에 일이 남아 있어도).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 * - `load`   덩어리 하나가 들어왔다.
 *            payload { id: string; size: number; start: number;
 *                      holes: { start: number; len: number }[]; freeSum: number; largest: number }
 *            holes · freeSum · largest 는 넣은 **뒤**의 빈 틈이다.
 * - `free`   덩어리 하나가 나갔다.
 *            payload { id: string; size: number; start: number;
 *                      holes: { start: number; len: number }[]; freeSum: number; largest: number }
 *            holes · freeSum · largest 는 뺀 **뒤**의 빈 틈이다.
 * - `reject` 덩어리가 어느 틈에도 들어가지 못했다. 이 뒤로 발신이 없다.
 *            payload { id: string; size: number;
 *                      tried: { start: number; len: number }[]; freeSum: number; largest: number }
 *            tried 는 처음 맞는 틈을 찾으며 주소 차례로 대어 본 틈 전부다.
 *
 * 셈할 수 없는 자료(모르는 일 · 없는 덩어리를 뺌 · 같은 이름을 두 번 넣음 · 크기가
 * 양의 정수가 아님 · 메모리 크기가 양의 정수가 아님)는 조용히 넘기지 않고 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FragJob =
  | { op: 'load'; id: string; size: number }
  | { op: 'free'; id: string };

export type ExternalFragmentationFacetData = {
  type: 'external-fragmentation';
  stepMs: number;
  /** 메모리 전체 크기 (KiB) */
  memoryKiB: number;
  /** 들고 나는 일, 이 차례로 */
  jobs: FragJob[];
};

export type Hole = { start: number; len: number };

type Placed = { id: string; start: number; size: number };

function checkKiB(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`external-fragmentation: ${what} 는 양의 정수 KiB 여야 한다 (받은 값 ${String(value)})`);
  }
  return value;
}

/** 놓인 덩어리들 사이의 빈 틈 — 주소 차례, 이웃한 틈은 하나로 합친다. */
export function freeHoles(placed: readonly Placed[], total: number): Hole[] {
  const used = [...placed].sort((x, y) => x.start - y.start);
  const holes: Hole[] = [];
  let cur = 0;
  for (const b of used) {
    if (b.start > cur) holes.push({ start: cur, len: b.start - cur });
    cur = Math.max(cur, b.start + b.size);
  }
  if (cur < total) holes.push({ start: cur, len: total - cur });
  return holes;
}

function sumOf(holes: readonly Hole[]): number {
  let s = 0;
  for (const h of holes) s += h.len;
  return s;
}

function largestOf(holes: readonly Hole[]): number {
  let m = 0;
  for (const h of holes) if (h.len > m) m = h.len;
  return m;
}

export async function externalFragmentation(
  context: FacetContext<ExternalFragmentationFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ExternalFragmentationFacetData>;
  const data = ctx.data;
  const stepMs = checkKiB(data.stepMs, 'stepMs');
  const total = checkKiB(data.memoryKiB, 'memoryKiB');
  if (!Array.isArray(data.jobs)) throw new Error('external-fragmentation: jobs 가 배열이 아니다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const placed: Placed[] = [];

  for (const job of data.jobs) {
    // 걸음 0 (빈 메모리) 도 읽을 틈을 둔다 — 첫 발신 앞에도 문을 둔다.
    if (!(await pause())) return;

    if (job.op === 'load') {
      const size = checkKiB(job.size, `덩어리 ${job.id} 의 크기`);
      if (placed.some((b) => b.id === job.id)) {
        throw new Error(`external-fragmentation: 덩어리 ${job.id} 가 이미 메모리에 있다`);
      }
      const holes = freeHoles(placed, total);
      const fit = holes.find((h) => h.len >= size);
      if (fit === undefined) {
        await ctx.emit({
          type: 'reject',
          payload: {
            id: job.id,
            size,
            tried: holes.map((h) => ({ start: h.start, len: h.len })),
            freeSum: sumOf(holes),
            largest: largestOf(holes),
          },
        });
        return;
      }
      placed.push({ id: job.id, start: fit.start, size });
      const after = freeHoles(placed, total);
      await ctx.emit({
        type: 'load',
        payload: {
          id: job.id,
          size,
          start: fit.start,
          holes: after,
          freeSum: sumOf(after),
          largest: largestOf(after),
        },
      });
    } else if (job.op === 'free') {
      const at = placed.findIndex((b) => b.id === job.id);
      if (at < 0) throw new Error(`external-fragmentation: 메모리에 없는 덩어리 ${job.id} 를 뺄 수 없다`);
      const [gone] = placed.splice(at, 1);
      if (gone === undefined) throw new Error(`external-fragmentation: 덩어리 ${job.id} 를 꺼내지 못했다`);
      const after = freeHoles(placed, total);
      await ctx.emit({
        type: 'free',
        payload: {
          id: gone.id,
          size: gone.size,
          start: gone.start,
          holes: after,
          freeSum: sumOf(after),
          largest: largestOf(after),
        },
      });
    } else {
      throw new Error(`external-fragmentation: 모르는 일 ${JSON.stringify(job)}`);
    }
  }
}
