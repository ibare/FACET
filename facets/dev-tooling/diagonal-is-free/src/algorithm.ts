/**
 * diagonal-is-free — Myers diff 의 앞으로 가는 탐욕을 끝점 하나씩 걷는다.
 *
 * 자리 (x, y) = A 에서 x 줄 · B 에서 y 줄을 지나온 곳. (0, 0) 에서 (N, M) 까지.
 * 오른쪽 = A 한 줄 지움 (값 1), 아래 = B 한 줄 넣음 (값 1), A[x] == B[y] 이면 대각선 (값 0).
 * 값 D = 0, 1, 2, … 마다 대각선 k = −D, −D+2, …, D 차례로 끝점 하나를 뻗는다.
 * (N, M) 에 닿으면 그 자리에서 멈춘다 — 같은 D 의 남은 k 를 돌지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 한 이벤트가 한 걸음이다):
 *
 *   reach  끝점 하나 (D, k) 가 뻗었다
 *     payload: {
 *       index: number            끝점 차례 (0 부터)
 *       d: number                치른 값 D
 *       k: number                대각선 번호 (x − y)
 *       move: 'start' | 'down' | 'right'   D = 0 은 start (값 없이 미끄러지기만)
 *       from: [number, number]   출발 자리 (앞 D 의 끝점)
 *       mid: [number, number]    값 1 을 치르고 한 칸 간 자리 (start 는 from 과 같다)
 *       to: [number, number]     공짜로 미끄러진 뒤 닿은 자리
 *       slide: number            공짜로 미끄러진 칸 수
 *       path: number[] | null    끝 (N, M) 에 닿은 걸음에만 — 되짚은 경로의 끝점 차례 (앞에서 뒤로)
 *     }
 *
 * 걸음 0 은 두 파일과 자리 (0, 0) 이 이미 서 있는 화면이라 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DiagonalIsFreeFacetData = {
  type: 'diagonal-is-free';
  /** 가로 파일 — 오른쪽으로 한 칸 = 이 파일의 한 줄 지움 */
  a: string[];
  /** 세로 파일 — 아래로 한 칸 = 이 파일의 한 줄 넣음 */
  b: string[];
  stepMs: number;
};

export type MyersMove = 'start' | 'down' | 'right';

export type MyersReach = {
  d: number;
  k: number;
  move: MyersMove;
  from: [number, number];
  mid: [number, number];
  to: [number, number];
  slide: number;
};

/** 파일 줄 목록을 좁힌다. 모르는 모양은 필드 경로를 담아 던진다 (C6). */
export function readLines(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`diagonal-is-free: initialData.${field} 는 비지 않은 줄 목록이어야 한다`);
  }
  return raw.map((line, i) => {
    if (typeof line !== 'string') {
      throw new Error(`diagonal-is-free: initialData.${field}[${i}] 가 글자가 아니다`);
    }
    return line;
  });
}

/** 자리 (x, y) 에서 대각선으로 공짜로 갈 수 있는가 — 두 쪽 다음 줄이 글자 그대로 같은가. */
export function isFree(a: readonly string[], b: readonly string[], x: number, y: number): boolean {
  return x < a.length && y < b.length && a[x] === b[y];
}

function frontier(v: Map<number, number>, k: number, d: number): number {
  const x = v.get(k);
  if (x === undefined) throw new Error(`diagonal-is-free: D=${d} 에서 대각선 ${k} 의 앞 끝점이 없다`);
  return x;
}

/**
 * Myers 의 끝점을 차례대로 셈한다. 끝에 닿은 경로도 되짚어 끝점 차례로 돌려준다.
 * 판 밖 끝점 · 닿지 못함은 던진다 (C6).
 */
export function myersReaches(
  a: readonly string[],
  b: readonly string[],
): { reaches: MyersReach[]; path: number[] } {
  const n = a.length;
  const m = b.length;
  const v = new Map<number, number>();
  const reaches: MyersReach[] = [];
  for (let d = 0; d <= n + m; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let move: MyersMove;
      let x: number;
      let from: [number, number];
      if (d === 0) {
        move = 'start';
        x = 0;
        from = [0, 0];
      } else if (k === -d || (k !== d && frontier(v, k - 1, d) < frontier(v, k + 1, d))) {
        move = 'down';
        x = frontier(v, k + 1, d);
        from = [x, x - (k + 1)];
      } else {
        move = 'right';
        x = frontier(v, k - 1, d) + 1;
        from = [x - 1, x - 1 - (k - 1)];
      }
      let y = x - k;
      if (x > n || y > m || x < 0 || y < 0) {
        throw new Error(`diagonal-is-free: D=${d} k=${k} 의 끝점 (${x}, ${y}) 가 판 밖이다`);
      }
      const mid: [number, number] = [x, y];
      let slide = 0;
      while (isFree(a, b, x, y)) {
        x += 1;
        y += 1;
        slide += 1;
      }
      v.set(k, x);
      reaches.push({ d, k, move, from, mid, to: [x, y], slide });
      if (x === n && y === m) return { reaches, path: tracePath(reaches) };
    }
  }
  throw new Error('diagonal-is-free: 끝 (N, M) 에 닿지 못했다');
}

/** 끝에 닿은 끝점에서 앞 D 의 끝점을 거슬러 올라가 경로를 되짚는다. */
function tracePath(reaches: readonly MyersReach[]): number[] {
  const path: number[] = [];
  let at = reaches.length - 1;
  for (;;) {
    const r = reaches[at];
    if (r === undefined) throw new Error(`diagonal-is-free: 되짚을 끝점 ${at} 이 없다`);
    path.push(at);
    if (r.move === 'start') break;
    const pk = r.move === 'down' ? r.k + 1 : r.k - 1;
    const prev = reaches.findIndex((p) => p.d === r.d - 1 && p.k === pk);
    if (prev < 0) throw new Error(`diagonal-is-free: D=${r.d - 1} k=${pk} 끝점이 없다`);
    at = prev;
  }
  return path.reverse();
}

export async function diagonalIsFree(context: FacetContext<DiagonalIsFreeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DiagonalIsFreeFacetData>;
  const a = readLines(ctx.data.a, 'a');
  const b = readLines(ctx.data.b, 'b');
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('diagonal-is-free: initialData.stepMs 는 양수여야 한다');
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { reaches, path } = myersReaches(a, b);
  const last = reaches.length - 1;
  for (const [index, r] of reaches.entries()) {
    // 걸음 0 이 이미 두 파일을 보이므로 첫 발신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    await ctx.emit({
      type: 'reach',
      payload: {
        index,
        d: r.d,
        k: r.k,
        move: r.move,
        from: r.from,
        mid: r.mid,
        to: r.to,
        slide: r.slide,
        path: index === last ? path : null,
      },
    });
  }
}
