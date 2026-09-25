/**
 * indirect-block — 파일이 한 블록씩 자라며 inode 의 직접 칸을 채우다가, 칸이 다 차면
 * 다음 번호는 디스크의 한 블록(간접 블록)으로 내려가 적힌다.
 *
 * 규약 (사양 그대로):
 * - 할당: 새 블록이 필요하면 번호가 가장 작은 빈칸을 잡는다.
 * - 데이터 k 를 덧붙일 때 직접 칸에 자리가 있으면 거기 적는다.
 * - 직접 칸이 다 찼고 간접 블록이 아직 없으면 간접 블록을 먼저 잡고(한 걸음),
 *   그다음 데이터 블록을 잡아 간접 블록의 다음 칸에 적는다(다음 걸음).
 * - 한 걸음 = 블록 하나를 잡아 번호 하나를 적는 일.
 * - 이중 간접은 없다 — 간접 블록의 칸이 모자라면 던진다. 디스크가 차도 던진다.
 *
 * 이벤트 (전부 silent 아님, 한 걸음씩):
 * - `place`         { k: number; block: number; slot: number; reads: number }
 *     데이터 k 를 블록 block 에 잡고 그 번호를 inode 의 직접 칸 slot 에 적었다.
 *     reads = 데이터 k 에 닿는 디스크 읽기 수 (inode 는 이미 읽었다) — 1.
 * - `spill`         { block: number; capBefore: number; capAfter: number }
 *     직접 칸이 다 차서 블록 block 을 간접 블록으로 잡고 inode 의 간접 칸에 적었다.
 *     capBefore / capAfter = 담을 수 있는 데이터 블록 수 (직접만 / 간접 하나를 더해).
 * - `placeIndirect` { k: number; block: number; slot: number; indirectAt: number; reads: number }
 *     데이터 k 를 블록 block 에 잡고 그 번호를 간접 블록 indirectAt 의 칸 slot 에 적었다.
 *     reads = 간접 블록 + 데이터 — 2.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IndirectBlockFacetData = {
  type: 'indirect-block';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 디스크 블록 수 (번호 0 부터) */
  diskSize: number;
  /** 다른 파일이 이미 쓰는 블록 번호 */
  usedByOthers: number[];
  /** 자라는 파일의 식별자 (파일 이름은 번역하지 않는다) */
  file: string;
  /** 덧붙일 데이터 블록 수 */
  grow: number;
  /** inode 의 직접 칸 수 */
  directSlots: number;
  /** 블록 하나에 들어가는 번호 수 */
  ptrsPerBlock: number;
};

function checkCount(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`indirect-block: ${name} 는 양의 정수여야 한다 (${String(v)})`);
  }
  return v;
}

export async function indirectBlock(
  ctxIn: FacetContext<IndirectBlockFacetData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<IndirectBlockFacetData>;
  const data = ctx.data;
  const stepMs = checkCount('stepMs', data.stepMs);
  const diskSize = checkCount('diskSize', data.diskSize);
  const grow = checkCount('grow', data.grow);
  const directSlots = checkCount('directSlots', data.directSlots);
  const ptrsPerBlock = checkCount('ptrsPerBlock', data.ptrsPerBlock);
  if (!Array.isArray(data.usedByOthers)) {
    throw new Error('indirect-block: usedByOthers 가 배열이 아니다');
  }

  const used = new Set<number>();
  for (const b of data.usedByOthers) {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b >= diskSize) {
      throw new Error(`indirect-block: 디스크에 없는 블록 번호 ${String(b)}`);
    }
    if (used.has(b)) throw new Error(`indirect-block: 블록 ${b} 가 두 번 적혔다`);
    used.add(b);
  }

  /** 번호가 가장 작은 빈칸을 잡는다. */
  function alloc(): number {
    for (let b = 0; b < diskSize; b += 1) {
      if (!used.has(b)) {
        used.add(b);
        return b;
      }
    }
    throw new Error('indirect-block: 디스크가 찼다');
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const direct: number[] = [];
  const indirect: number[] = [];
  let indirectAt: number | null = null;

  // 걸음 0 은 이미 읽을 것이 있는 화면(빈 inode 와 디스크)이라 첫 발신 앞에도 머문다.
  for (let k = 1; k <= grow; k += 1) {
    if (!(await pause())) return;
    if (direct.length < directSlots) {
      const block = alloc();
      direct.push(block);
      await ctx.emit({
        type: 'place',
        payload: { k, block, slot: direct.length - 1, reads: 1 },
      });
      continue;
    }
    if (indirectAt === null) {
      indirectAt = alloc();
      await ctx.emit({
        type: 'spill',
        payload: {
          block: indirectAt,
          capBefore: directSlots,
          capAfter: directSlots + ptrsPerBlock,
        },
      });
      if (!(await pause())) return;
    }
    if (indirect.length >= ptrsPerBlock) {
      throw new Error('indirect-block: 단일 간접으로 모자란다 — 이중 간접은 이 조각에 없다');
    }
    const block = alloc();
    indirect.push(block);
    await ctx.emit({
      type: 'placeIndirect',
      payload: { k, block, slot: indirect.length - 1, indirectAt, reads: 2 },
    });
  }
}
