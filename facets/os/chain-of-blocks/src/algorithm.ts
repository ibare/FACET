/**
 * chain-of-blocks — FAT 사슬을 칸에서 칸으로 건너가며 한 파일의 조각 차례를 읽는다.
 *
 * 규약 (사양 그대로):
 * - 걸음 0 = 디렉터리에서 따라갈 파일의 첫 번호를 얻는다.
 * - 걸음마다 지금 칸 하나를 읽는다. 그 블록이 파일의 다음 조각이고, 칸 값이 END 면
 *   멈춘다(그 걸음이 끝), 번호면 다음 걸음에 그 칸으로 간다.
 * - 빈칸에 닿거나 이미 지난 칸으로 되돌아오거나, 없는 번호 · 모르는 값이면 던진다.
 * - 사슬을 읽기만 한다 — 새 블록을 잡거나 칸을 고치지 않는다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 걸음 하나):
 * - `start` payload `{ file: string; first: number }`
 *     디렉터리 항목 `file` 에서 첫 블록 번호 `first` 를 얻었다.
 * - `read`  payload `{ piece: number; block: number; next: number | 'END'; readBefore: number }`
 *     FAT 칸 `block` 을 읽었다. 블록 `block` 이 파일의 `piece` 번째 조각이고, 칸에 적힌 값이 `next`.
 *     `readBefore` 는 이 조각에 닿기 전에 읽은 FAT 칸 수 (= piece − 1).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** FAT 칸 하나의 값 — 다음 블록 번호, 끝 표식, 또는 빈칸(null). */
export type FatValue = number | 'END' | null;

export interface DirectoryEntry {
  /** 파일 식별자 (파일 이름은 번역하지 않는 자료다) */
  id: string;
  /** 첫 블록 번호 */
  first: number;
}

export interface ChainOfBlocksFacetData {
  type: 'chain-of-blocks';
  stepMs: number;
  /** 칸 i 는 블록 i 의 다음 번호를 쥔다. 길이 = 블록 수 */
  fat: FatValue[];
  directory: DirectoryEntry[];
  /** 따라갈 파일의 식별자 */
  follow: string;
}

export async function chainOfBlocks(ctx: FacetContext<ChainOfBlocksFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ChainOfBlocksFacetData>;
  const { fat, directory, follow, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const entry = directory.find((e) => e.id === follow);
  if (!entry) throw new Error(`chain-of-blocks: 디렉터리에 따라갈 파일 ${follow} 가 없다`);

  // 걸음 0 앞의 화면(표 · 디렉터리)은 이미 읽을 것이 있으니 한 번 머문다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'start', payload: { file: entry.id, first: entry.first } });

  const seen = new Set<number>();
  let cur = entry.first;
  for (;;) {
    if (!(await pause())) return;
    if (!Number.isInteger(cur) || cur < 0 || cur >= fat.length) {
      throw new Error(`chain-of-blocks: 없는 블록 번호 ${cur}`);
    }
    if (seen.has(cur)) throw new Error(`chain-of-blocks: 이미 지난 칸 ${cur} 로 되돌아왔다 (고리)`);
    seen.add(cur);
    const next = fat[cur];
    if (next === null || next === undefined) {
      throw new Error(`chain-of-blocks: 빈칸 ${cur} 에 닿았다`);
    }
    if (next !== 'END' && typeof next !== 'number') {
      throw new Error(`chain-of-blocks: 칸 ${cur} 의 모르는 값 ${String(next)}`);
    }
    const piece = seen.size;
    await ctx.emit({
      type: 'read',
      payload: { piece, block: cur, next, readBefore: piece - 1 },
    });
    if (next === 'END') return;
    cur = next;
  }
}
