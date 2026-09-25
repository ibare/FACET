/**
 * replay-after-crash — 전원이 끊긴 뒤 저널을 다시 밟는다.
 *
 * 1차 데이터는 묶음(번호와 블록) 과 **끊기기 전까지 일어난 쓰기의 열** 이다.
 * 끊긴 상태(저널에 남은 기록 · 제자리의 old/new)는 이 알고리즘이 그 열을 끝까지 돌려 얻는다.
 *
 * 규약 (사양 그대로)
 *   - 처음엔 제자리 블록이 모두 old. 저널 쓰기는 기록 하나를 덧붙이고, 제자리 쓰기는 그 블록을 new 로 한다.
 *     제자리 쓰기는 제 묶음의 끝 표식이 저널에 이미 있을 때만 일어난다 (없으면 던진다).
 *   - 복구는 두 차례 — 훑기 다음 다시 쓰기.
 *     훑기: 시작 표식의 차례로 묶음마다 한 걸음. 같은 번호의 끝 표식이 저널에 있으면 "다시 쓴다", 없으면 "버린다".
 *     다시 쓰기: "다시 쓴다" 묶음의 블록을 저널에 적힌 차례로 한 걸음에 하나씩 제자리에 쓴다.
 *                제자리가 이미 new 여도 건너뛰지 않는다 (저널은 어디까지 옮겼는지 적지 않는다).
 *     마지막 걸음: 저널을 비운다.
 *   - 버린 묶음의 블록은 제자리에 쓰지 않는다.
 *
 * 이벤트
 *   init    (silent) { journal: { kind: 'begin'|'block'|'end'; tx: number; block: string | null }[];
 *                      homes: { block: string; tx: number; state: 'old'|'new' }[] }
 *           끊긴 상태. 걸음 0 을 갈아 끼운다.
 *   scan    { tx: number; keep: boolean; from: number; to: number; blocks: string[] }
 *           묶음 하나를 훑었다. from · to 는 그 묶음의 첫 · 끝 기록 번호(저널 안 자리).
 *           keep 이 거짓이면 to 는 그 묶음의 마지막 기록이고, 그 뒤가 끊긴 자리다.
 *   replay  { block: string; rec: number; before: 'old'|'new'; after: 'new' }
 *           저널의 기록 rec 을 제자리 block 에 다시 썼다.
 *   clear   {}  저널을 비웠다.
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BlockState = 'old' | 'new';

export type TxSpec = { id: number; blocks: string[] };

export type WriteSpec =
  | { to: 'journal'; rec: 'begin' | 'end'; tx: number }
  | { to: 'journal'; rec: 'block'; tx: number; block: string }
  | { to: 'home'; block: string };

export type ReplayAfterCrashFacetData = {
  type: 'replay-after-crash';
  stepMs: number;
  txs: TxSpec[];
  writes: WriteSpec[];
};

export type JournalRecord = { kind: 'begin' | 'block' | 'end'; tx: number; block: string | null };
export type HomeBlock = { block: string; tx: number; state: BlockState };

/** 끊긴 상태 — 쓰기 열을 끝까지 적용한 것. */
export function crashState(data: ReplayAfterCrashFacetData): {
  journal: JournalRecord[];
  homes: HomeBlock[];
} {
  const owner = new Map<string, number>();
  const homes: HomeBlock[] = [];
  for (const tx of data.txs) {
    for (const b of tx.blocks) {
      if (owner.has(b)) throw new Error(`블록 ${b} 가 두 묶음에 있다`);
      owner.set(b, tx.id);
      homes.push({ block: b, tx: tx.id, state: 'old' });
    }
  }
  const journal: JournalRecord[] = [];
  const hasRecord = (kind: JournalRecord['kind'], tx: number): boolean =>
    journal.some((r) => r.kind === kind && r.tx === tx);

  data.writes.forEach((w, i) => {
    if (w.to === 'journal') {
      if (!data.txs.some((t) => t.id === w.tx)) {
        throw new Error(`쓰기 ${i}: 없는 묶음 ${w.tx}`);
      }
      if (w.rec === 'begin') {
        if (hasRecord('begin', w.tx)) throw new Error(`쓰기 ${i}: 묶음 ${w.tx} 시작 표식이 두 번`);
        journal.push({ kind: 'begin', tx: w.tx, block: null });
      } else if (w.rec === 'end') {
        if (!hasRecord('begin', w.tx)) throw new Error(`쓰기 ${i}: 묶음 ${w.tx} 시작 전 끝 표식`);
        journal.push({ kind: 'end', tx: w.tx, block: null });
      } else if (w.rec === 'block') {
        if (owner.get(w.block) !== w.tx) throw new Error(`쓰기 ${i}: 블록 ${w.block} 는 묶음 ${w.tx} 의 것이 아니다`);
        if (!hasRecord('begin', w.tx)) throw new Error(`쓰기 ${i}: 묶음 ${w.tx} 시작 전 블록 기록`);
        journal.push({ kind: 'block', tx: w.tx, block: w.block });
      } else {
        throw new Error(`쓰기 ${i}: 모르는 저널 기록`);
      }
    } else if (w.to === 'home') {
      const tx = owner.get(w.block);
      if (tx === undefined) throw new Error(`쓰기 ${i}: 없는 블록 ${w.block}`);
      if (!hasRecord('end', tx)) throw new Error(`쓰기 ${i}: 끝 표식 전 제자리 쓰기 ${w.block}`);
      const home = homes.find((h) => h.block === w.block);
      if (!home) throw new Error(`쓰기 ${i}: 없는 블록 ${w.block}`);
      home.state = 'new';
    } else {
      throw new Error(`쓰기 ${i}: 모르는 쓰기`);
    }
  });
  return { journal, homes };
}

export async function replayAfterCrash(
  ctx0: FacetContext<ReplayAfterCrashFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ReplayAfterCrashFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { journal, homes } = crashState(data);
  await ctx.emit({
    type: 'init',
    payload: { journal: journal.map((r) => ({ ...r })), homes: homes.map((h) => ({ ...h })) },
    silent: true,
  });

  // 훑기 — 시작 표식의 차례로
  const kept: number[] = [];
  const begins = journal.filter((r) => r.kind === 'begin');
  for (const b of begins) {
    if (!(await pause())) return;
    const idx: number[] = [];
    journal.forEach((r, i) => {
      if (r.tx === b.tx) idx.push(i);
    });
    if (idx.length === 0) throw new Error(`묶음 ${b.tx} 기록이 없다`);
    const keep = journal.some((r) => r.kind === 'end' && r.tx === b.tx);
    if (keep) kept.push(b.tx);
    const blocks = journal
      .filter((r) => r.tx === b.tx && r.kind === 'block')
      .map((r) => {
        if (r.block === null) throw new Error(`묶음 ${b.tx} 블록 기록에 이름이 없다`);
        return r.block;
      });
    await ctx.emit({
      type: 'scan',
      payload: { tx: b.tx, keep, from: idx[0], to: idx[idx.length - 1], blocks },
    });
  }

  // 다시 쓰기 — 다시 쓴다 묶음의 블록을 저널에 적힌 차례로. 이미 new 여도 쓴다
  for (const tx of kept) {
    if (ctx.cancelled) return;
    for (let i = 0; i < journal.length; i += 1) {
      if (ctx.cancelled) return;
      const r = journal[i];
      if (r.tx !== tx || r.kind !== 'block') continue;
      if (!(await pause())) return;
      const home = homes.find((h) => h.block === r.block);
      if (!home) throw new Error(`저널 기록 ${i}: 없는 블록 ${String(r.block)}`);
      const before = home.state;
      home.state = 'new';
      await ctx.emit({
        type: 'replay',
        payload: { block: home.block, rec: i, before, after: home.state },
      });
    }
  }

  if (!(await pause())) return;
  journal.length = 0;
  await ctx.emit({ type: 'clear', payload: {} });
}
