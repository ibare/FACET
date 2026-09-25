/**
 * 저널 선기록 — 한 번의 변경에 드는 블록들을 어떤 차례로 디스크에 쓰는가.
 *
 * 모형: 데이터 블록까지 저널에 적는 방식. 블록 내용은 old · new 두 상태로만 본다.
 * 한 걸음 = 디스크 쓰기 하나 (마지막 비우기만 쓰기가 아니라 표시 — 걸음 하나로 친다).
 *
 * 규약 (사양 그대로):
 *   저널:   시작 표식 → 바꿀 블록들(데이터에 적힌 차례) → 끝 표식
 *   제자리: 같은 차례로, 끝 표식이 저널에 적힌 **뒤에만** — 앞이면 던진다
 *   마지막: 저널의 그 묶음을 비운다
 *
 * 이벤트 (전부 silent 아님, 걸음 하나씩):
 *   journal-begin  { tx: number, write: number }                 저널에 시작 표식을 쓴다
 *   journal-block  { block: string, write: number }              저널에 그 블록의 new 내용을 쓴다
 *   journal-end    { tx: number, write: number }                 저널에 끝 표식을 쓴다
 *   home-write     { block: string, slot: number, write: number } 저널 slot 자리의 new 내용을 제자리에 쓴다
 *   journal-clear  { tx: number, home: number }                  저널의 묶음 tx 를 비운다. home = new 가 된 제자리 블록 수
 *                                                                (바꿀 블록 전부가 아니면 던진다)
 *
 * `write` 는 몇 번째 디스크 쓰기인가 (1 부터). `slot` 은 저널 안 자리 (0 부터).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WriteIntentFirstFacetData = {
  type: 'write-intent-first';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 이 변경이 바꾸는 블록의 식별자, 쓰는 차례대로 */
  blocks: string[];
  /** 묶음(transaction) 번호 */
  tx: number;
};

type JournalRecord = { kind: 'begin'; tx: number } | { kind: 'block'; block: string } | { kind: 'end'; tx: number };

/** 자료를 좁힌다. 셈할 수 없는 모양이면 던진다. */
export function readWriteIntentFirstData(raw: unknown): WriteIntentFirstFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('write-intent-first: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'write-intent-first') throw new Error(`write-intent-first: 모르는 type ${String(r.type)}`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('write-intent-first: stepMs 가 양수가 아니다');
  if (typeof r.tx !== 'number' || !Number.isInteger(r.tx)) throw new Error('write-intent-first: tx 가 정수가 아니다');
  if (!Array.isArray(r.blocks) || r.blocks.length === 0) throw new Error('write-intent-first: blocks 가 비었다');
  const blocks: string[] = [];
  for (const b of r.blocks) {
    if (typeof b !== 'string' || b === '') throw new Error('write-intent-first: 블록 식별자가 문자열이 아니다');
    if (blocks.includes(b)) throw new Error(`write-intent-first: 블록 ${b} 가 두 번 나온다`);
    blocks.push(b);
  }
  return { type: 'write-intent-first', stepMs: r.stepMs, blocks, tx: r.tx };
}

export async function writeIntentFirst(ctx0: FacetContext<WriteIntentFirstFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<WriteIntentFirstFacetData>;
  const { stepMs, blocks, tx } = readWriteIntentFirstData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const journal: JournalRecord[] = [];
  const homeNew = new Set<string>();
  let write = 0;

  // 걸음 0 은 이미 읽을 것이 있다 (제자리 블록 셋, 빈 저널) — 첫 쓰기 앞에도 틈을 둔다
  if (!(await pause())) return;
  journal.push({ kind: 'begin', tx });
  write += 1;
  await ctx.emit({ type: 'journal-begin', payload: { tx, write } });

  for (const block of blocks) {
    if (!(await pause())) return;
    journal.push({ kind: 'block', block });
    write += 1;
    await ctx.emit({ type: 'journal-block', payload: { block, write } });
  }

  if (!(await pause())) return;
  journal.push({ kind: 'end', tx });
  write += 1;
  await ctx.emit({ type: 'journal-end', payload: { tx, write } });

  for (const block of blocks) {
    if (!(await pause())) return;
    const last = journal[journal.length - 1];
    if (last === undefined || last.kind !== 'end') {
      throw new Error(`write-intent-first: 끝 표식 전에 제자리 쓰기 (${block})`);
    }
    const slot = journal.findIndex((r) => r.kind === 'block' && r.block === block);
    if (slot < 0) throw new Error(`write-intent-first: 저널에 없는 블록 ${block} 를 옮기려 했다`);
    write += 1;
    homeNew.add(block);
    await ctx.emit({ type: 'home-write', payload: { block, slot, write } });
  }

  if (!(await pause())) return;
  const missing = blocks.filter((b) => !homeNew.has(b));
  if (missing.length > 0) {
    throw new Error(`write-intent-first: 제자리에 옮기지 않은 블록이 있는데 저널을 비우려 했다 (${missing.join(', ')})`);
  }
  journal.length = 0;
  await ctx.emit({ type: 'journal-clear', payload: { tx, home: homeNew.size } });
}
