/**
 * fixed-size-frames — 페이징은 프로세스 하나를 메모리에 어떻게 나눠 싣는가.
 *
 * 값은 모두 예로 정한 것이다. 메모리 칸 여덟 · 칸 하나 4 KiB · 이미 찬 칸 · 프로세스 크기는
 * 실제 시스템에서 잰 것이 아니다.
 *
 * 규약 (사양의 규약 줄을 그대로 옮김)
 *   - 자르기: 0 KiB 부터 pageKib 씩, 마지막 조각은 남은 만큼. 조각 i = 페이지 i.
 *   - 넣기: 페이지 번호 차례로, 빈 칸 가운데 번호가 가장 낮은 것에 하나씩.
 *   - 걸음: 처음(initial 장면) · 잘림(한 걸음) · 페이지마다 넣기 한 걸음.
 *   - 주소 번역은 하지 않는다.
 *   - 셈할 수 없는 상태(빈 칸 모자람 · 칸 번호가 범위 밖 · 같은 칸이 두 번 참)는 던진다.
 *
 * 이벤트
 *   - 'cut'   { pieces: { page: number; loKib: number; hiKib: number }[] }
 *             프로세스를 같은 길이로 자른 결과. silent 아님 (걸음 1).
 *   - 'place' { page: number; frame: number }
 *             페이지 하나가 빈 칸 하나에 들어간다. silent 아님 (걸음 2..).
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (메모리 · 찬 칸 · 통짜 프로세스).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface FixedSizeFramesFacetData {
  type: 'fixed-size-frames';
  stepMs: number;
  /** 메모리 칸 수 (프레임 0 부터) */
  frameCount: number;
  /** 칸 하나 = 페이지 하나의 크기 (KiB) */
  pageKib: number;
  /** 이미 다른 프로세스가 쥔 칸 */
  occupied: { frame: number; owner: string }[];
  /** 실을 프로세스 */
  process: { id: string; sizeKib: number };
}

export interface Piece {
  page: number;
  loKib: number;
  hiKib: number;
}

/** 프로세스를 pageKib 씩 자른다. 마지막 조각은 남은 만큼. */
export function cutPieces(sizeKib: number, pageKib: number): Piece[] {
  if (!Number.isInteger(sizeKib) || sizeKib <= 0) {
    throw new Error(`fixed-size-frames: 프로세스 크기가 양의 정수가 아니다 (${sizeKib})`);
  }
  if (!Number.isInteger(pageKib) || pageKib <= 0) {
    throw new Error(`fixed-size-frames: 페이지 크기가 양의 정수가 아니다 (${pageKib})`);
  }
  const pieces: Piece[] = [];
  for (let lo = 0, page = 0; lo < sizeKib; lo += pageKib, page += 1) {
    pieces.push({ page, loKib: lo, hiKib: Math.min(sizeKib, lo + pageKib) });
  }
  return pieces;
}

/** 빈 칸 번호를 오름차순으로. 범위 밖이나 겹친 칸은 던진다. */
export function freeFrames(frameCount: number, occupied: { frame: number }[]): number[] {
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error(`fixed-size-frames: 칸 수가 양의 정수가 아니다 (${frameCount})`);
  }
  const taken = new Set<number>();
  for (const o of occupied) {
    if (!Number.isInteger(o.frame) || o.frame < 0 || o.frame >= frameCount) {
      throw new Error(`fixed-size-frames: 찬 칸 번호가 범위 밖이다 (${o.frame})`);
    }
    if (taken.has(o.frame)) {
      throw new Error(`fixed-size-frames: 칸 ${o.frame} 이 두 번 찼다`);
    }
    taken.add(o.frame);
  }
  const free: number[] = [];
  for (let f = 0; f < frameCount; f += 1) if (!taken.has(f)) free.push(f);
  return free;
}

export async function fixedSizeFrames(
  context: FacetContext<FixedSizeFramesFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FixedSizeFramesFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const pieces = cutPieces(data.process.sizeKib, data.pageKib);
  const free = freeFrames(data.frameCount, data.occupied);
  if (free.length < pieces.length) {
    throw new Error(
      `fixed-size-frames: 빈 칸이 모자란다 (페이지 ${pieces.length} · 빈 칸 ${free.length})`,
    );
  }

  // 걸음 0 (통짜 프로세스 · 메모리) 을 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({
    type: 'cut',
    payload: { pieces: pieces.map((p) => ({ page: p.page, loKib: p.loKib, hiKib: p.hiKib })) },
  });

  let next = 0;
  for (const piece of pieces) {
    if (!(await pause())) return;
    const frame = free[next];
    if (frame === undefined) {
      throw new Error(`fixed-size-frames: 페이지 ${piece.page} 에 줄 빈 칸이 없다`);
    }
    next += 1;
    await ctx.emit({ type: 'place', payload: { page: piece.page, frame } });
  }
}
