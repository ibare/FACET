/**
 * inode-points-blocks — inode 의 직접 칸을 칸 차례대로 짚어 흩어진 블록의 내용을 모은다.
 *
 * 규약 (사양 그대로):
 * - 걸음 0 = inode 와 디스크를 보인다 (모인 글 없음). 장면의 `initial()` 이 initialData 에서 세운다.
 * - 걸음 1–6 = 칸 하나씩, 칸 0 부터. 한 걸음에 칸 하나를 짚고 그 번호의 블록 글자를 모인 글 끝에 붙인다.
 * - 파일 차례는 칸 차례뿐이다 — 블록 번호로 줄 세우지 않는다.
 * - inode 에는 직접 칸만 있다. 빈 블록은 아무 파일의 것도 아니다.
 * - 고리 · 빈칸에 닿기 · 없는 번호 · 겹친 주인 · 모르는 모양은 던진다.
 *
 * 이벤트:
 * - `read` — silent 아님. payload `{ slot: number; block: number; letter: string }`
 *   칸 `slot` 에 적힌 번호 `block` 을 따라가 그 블록의 글자 `letter` 를 읽었다.
 *
 * 걸음 0 이 이미 읽을 화면(inode 와 디스크)이라 첫 발신 앞에도 `stepMs` 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 블록 하나에 담긴 글자 (예로 정한 모형 — 블록 하나의 내용을 글자 하나로 줄였다). */
export type BlockContent = { block: number; letter: string };

export type InodePointsBlocksFacetData = {
  type: 'inode-points-blocks';
  stepMs: number;
  /** 디스크 블록 수. 번호는 0 부터. */
  diskSize: number;
  /** 다른 파일이 쓰는 블록 번호. 내용은 보이지 않는다. */
  otherBlocks: number[];
  /** 파일 이름 — 번역하지 않는 자료라 화면에 그대로 뜬다. */
  file: string;
  /** inode 의 직접 칸 — 칸 차례로 적힌 블록 번호. */
  slots: number[];
  /** 파일 블록에 담긴 글자. */
  contents: BlockContent[];
};

export type BlockOwner = 'file' | 'other' | 'free';
export type DiskBlock = { owner: BlockOwner; letter: string | null };

function intArray(raw: unknown, name: string): number[] {
  if (!Array.isArray(raw)) throw new Error(`inode-points-blocks: ${name} 가 배열이 아니다`);
  return raw.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new Error(`inode-points-blocks: ${name}[${i}] 가 정수가 아니다`);
    }
    return v;
  });
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 — 걸음이 줄어든 그림을 조용히 내지 않는다. */
export function readInodeData(raw: unknown): InodePointsBlocksFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('inode-points-blocks: 자료가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'inode-points-blocks') throw new Error('inode-points-blocks: 모르는 자료 종류');
  const { stepMs, diskSize, file } = r;
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) throw new Error('inode-points-blocks: stepMs 가 없다');
  if (typeof diskSize !== 'number' || !Number.isInteger(diskSize) || diskSize <= 0) {
    throw new Error('inode-points-blocks: diskSize 가 없다');
  }
  if (typeof file !== 'string' || file === '') throw new Error('inode-points-blocks: file 이 없다');
  if (!Array.isArray(r.contents)) throw new Error('inode-points-blocks: contents 가 배열이 아니다');
  const contents = r.contents.map((c, i): BlockContent => {
    if (typeof c !== 'object' || c === null) throw new Error(`inode-points-blocks: contents[${i}] 모양이 틀렸다`);
    const { block, letter } = c as Record<string, unknown>;
    if (typeof block !== 'number' || !Number.isInteger(block)) {
      throw new Error(`inode-points-blocks: contents[${i}].block 이 정수가 아니다`);
    }
    if (typeof letter !== 'string' || letter === '') {
      throw new Error(`inode-points-blocks: contents[${i}].letter 가 비었다`);
    }
    return { block, letter };
  });
  return {
    type: 'inode-points-blocks',
    stepMs,
    diskSize,
    otherBlocks: intArray(r.otherBlocks, 'otherBlocks'),
    file,
    slots: intArray(r.slots, 'slots'),
    contents,
  };
}

/**
 * 디스크의 블록마다 주인과 담긴 글자를 셈한다. 알고리즘과 장면이 이 함수 하나를 부른다.
 * inode 가 가리키는 블록이 파일의 것, `otherBlocks` 가 다른 파일의 것, 나머지는 빈 블록이다.
 */
export function diskOf(data: InodePointsBlocksFacetData): DiskBlock[] {
  const disk: DiskBlock[] = Array.from({ length: data.diskSize }, () => ({ owner: 'free', letter: null }));
  const inRange = (b: number, what: string): void => {
    if (b < 0 || b >= data.diskSize) throw new Error(`inode-points-blocks: ${what} ${b} 가 디스크 밖이다`);
  };
  for (const b of data.otherBlocks) {
    inRange(b, '다른 파일의 블록');
    if (disk[b]!.owner !== 'free') throw new Error(`inode-points-blocks: 블록 ${b} 가 두 번 적혔다`);
    disk[b] = { owner: 'other', letter: null };
  }
  for (const b of data.slots) {
    inRange(b, 'inode 칸의 번호');
    const cur = disk[b]!;
    if (cur.owner === 'other') throw new Error(`inode-points-blocks: 블록 ${b} 는 다른 파일의 것이다`);
    if (cur.owner === 'file') throw new Error(`inode-points-blocks: 블록 ${b} 를 두 번 가리킨다`);
    disk[b] = { owner: 'file', letter: null };
  }
  for (const c of data.contents) {
    inRange(c.block, '내용의 블록');
    const cur = disk[c.block]!;
    if (cur.owner !== 'file') throw new Error(`inode-points-blocks: 블록 ${c.block} 는 이 파일의 것이 아니다`);
    if (cur.letter !== null) throw new Error(`inode-points-blocks: 블록 ${c.block} 의 내용이 두 번 적혔다`);
    disk[c.block] = { owner: 'file', letter: c.letter };
  }
  for (const b of data.slots) {
    if (disk[b]!.letter === null) throw new Error(`inode-points-blocks: 블록 ${b} 의 내용이 없다`);
  }
  return disk;
}

export async function inodePointsBlocks(
  ctx: FacetContext<InodePointsBlocksFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<InodePointsBlocksFacetData>;
  const data = readInodeData(ctx.data);
  const disk = diskOf(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  for (let slot = 0; slot < data.slots.length; slot += 1) {
    if (!(await pause())) return;
    const block = data.slots[slot]!;
    const letter = disk[block]!.letter;
    if (letter === null) throw new Error(`inode-points-blocks: 칸 ${slot} 가 내용 없는 블록 ${block} 에 닿았다`);
    await ctx.emit({ type: 'read', payload: { slot, block, letter } });
  }
}
