/**
 * 저널링 — 블록 셋(bitmap · inode · data)을 바꾸는 일이 몇 번째 쓰기 뒤에 끊기느냐에 따라,
 * 다시 켠 뒤의 디스크가 어떻게 되는가를 두 줄(저널 없음 · 저널)로 나란히 보인다.
 *
 * 규약
 *   - 쓰기 하나 = 블록 하나(또는 표식 하나)를 디스크에 적는 일. 끊기면 그 뒤의 쓰기는 하나도
 *     적히지 않는다 (반쯤 적힌 쓰기는 없다).
 *   - 두 줄은 같은 시각 축을 쓴다 — 쓰기 하나 = 한 걸음. 끊는 때 c 는 두 줄에 같은 자리에 걸린다.
 *     저널 없는 줄은 쓰기가 셋뿐이라 c ≥ 3 이면 다 쓴 뒤다.
 *   - 다시 켜면 저널을 훑는다. 끝 표식이 있으면 저널에 적힌 블록을 적힌 차례로 제자리에 다시
 *     쓴다 — 이미 new 여도 건너뛰지 않는다. 끝 표식이 없으면 저널을 버린다.
 *   - 저널 없는 줄은 고칠 단서가 없다 — 끊긴 그대로가 다시 켠 뒤다.
 *   - 판정: 제자리 셋이 모두 old 면 'old'(온전 · 옛것), 모두 new 면 'new'(온전 · 새것), 섞였으면
 *     'torn'(어긋남). 동률 규칙은 없다 — 판정은 세 칸의 상태만으로 갈린다.
 *   - 모르는 쓰기 종류 · 사다리 밖 c 는 던진다.
 *
 * 걸음 (판 하나, 두 줄이 한 걸음에 함께 나아간다)
 *   0        처음 — 두 줄 제자리 모두 old, 저널 빔
 *   1..c     쓰기 하나씩 (저널 줄은 쓰기 i, 저널 없는 줄은 i ≤ 3 이면 제자리 쓰기 i)
 *   c+1      끊김 → 다시 켜서 저널을 훑는다
 *   (+3)     끝 표식이 있었으면 다시 쓰기 bitmap · inode · data
 *   끝       두 줄의 판정
 *
 * 이벤트
 *   round    { crashAfter: number }                                    걸음 0
 *   write    { index: number(1..), journal: WriteView, plain: WriteView | null,
 *              journalHome: BlockState[], plainHome: BlockState[] }
 *              WriteView = { area: 'home' | 'journal', item: string }
 *   restart  { committed: boolean, scanned: number }
 *   replay   { block: string, slot: number(1.., 저널 줄 쓰기 칸 번호), wasNew: boolean,
 *              journalHome: BlockState[] }
 *   verdict  { plain: { home: BlockState[], verdict: Verdict }, journal: { home: BlockState[], verdict: Verdict } }
 *   phase    { phase: string }   silent: true
 *   BlockState = 'old' | 'new', Verdict = 'old' | 'new' | 'torn'
 *
 * phase 어휘 (코드 패널은 저널 줄을 따른다)
 *   journal-write · journal-commit · write-home · check-commit · replay · verdict
 *
 * 계기
 *   plain-writes     저널 없는 줄이 끊기기 전 적은 쓰기
 *   journal-writes   저널 줄이 끊기기 전 적은 쓰기
 *   replayed-blocks  다시 켠 뒤 다시 쓴 블록
 *   판 시작에 0 으로 되돌리고 걸음마다 차이만 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type JournalingWrite = { area: 'home' | 'journal'; item: string };
export type BlockState = 'old' | 'new';
export type Verdict = 'old' | 'new' | 'torn';

export type JournalingData = {
  type: 'journaling';
  stepMs: number;
  motionMs: number;
  blocks: string[];
  startMark: string;
  endMark: string;
  plainWrites: JournalingWrite[];
  journalWrites: JournalingWrite[];
  crashLadder: number[];
  crashAfter: number;
};

/** 한 쓰기가 무엇인지 — 모르는 종류는 던진다. */
export type WriteKind =
  | { kind: 'home'; block: number }
  | { kind: 'journal-block'; block: number }
  | { kind: 'start' }
  | { kind: 'end' };

export function classifyWrite(data: JournalingData, w: JournalingWrite): WriteKind {
  const block = data.blocks.indexOf(w.item);
  if (w.area === 'home') {
    if (block < 0) throw new Error(`제자리에 모르는 블록: ${w.item}`);
    return { kind: 'home', block };
  }
  if (w.area === 'journal') {
    if (w.item === data.startMark) return { kind: 'start' };
    if (w.item === data.endMark) return { kind: 'end' };
    if (block < 0) throw new Error(`저널에 모르는 항목: ${w.item}`);
    return { kind: 'journal-block', block };
  }
  throw new Error(`모르는 쓰기 자리: ${String((w as { area: unknown }).area)}`);
}

export function judge(home: BlockState[]): Verdict {
  let fresh = 0;
  for (const s of home) if (s === 'new') fresh += 1;
  if (fresh === 0) return 'old';
  if (fresh === home.length) return 'new';
  return 'torn';
}

/** 한 줄의 결과 — 끊긴 때 제자리 · 끝 표식 · 다시 쓴 블록 · 다시 켠 뒤 · 판정. */
export type LineOutcome = {
  written: number;
  atCrash: BlockState[];
  committed: boolean;
  replayed: { block: number; slot: number; wasNew: boolean }[];
  after: BlockState[];
  verdict: Verdict;
};

export function runLine(data: JournalingData, writes: JournalingWrite[], crash: number): LineOutcome {
  if (!data.crashLadder.includes(crash)) throw new Error(`사다리 밖 끊는 때: ${crash}`);
  const home: BlockState[] = data.blocks.map(() => 'old');
  const written = Math.min(crash, writes.length);
  let committed = false;
  for (let i = 0; i < written; i++) {
    const k = classifyWrite(data, writes[i]!);
    if (k.kind === 'home') home[k.block] = 'new';
    else if (k.kind === 'end') committed = true;
  }
  const atCrash = [...home];
  const replayed: LineOutcome['replayed'] = [];
  if (committed) {
    for (let i = 0; i < written; i++) {
      const k = classifyWrite(data, writes[i]!);
      if (k.kind !== 'journal-block') continue; // 표식과 제자리 쓰기는 다시 쓸 것이 아니다
      replayed.push({ block: k.block, slot: i + 1, wasNew: home[k.block] === 'new' });
      home[k.block] = 'new';
    }
  }
  return { written, atCrash, committed, replayed, after: [...home], verdict: judge(home) };
}

export async function journalingAlgorithm(baseCtx: FacetContext<JournalingData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<JournalingData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = { plain: 0, journal: 0, replayed: 0 };
  let first = true;
  const setPlainWrites = (v: number) => {
    const d = v - shown.plain;
    if (d !== 0 || first) ctx.metric('plain-writes', d);
    shown.plain = v;
  };
  const setJournalWrites = (v: number) => {
    const d = v - shown.journal;
    if (d !== 0 || first) ctx.metric('journal-writes', d);
    shown.journal = v;
  };
  const setReplayed = (v: number) => {
    const d = v - shown.replayed;
    if (d !== 0 || first) ctx.metric('replayed-blocks', d);
    shown.replayed = v;
  };

  let crash = data.crashAfter;
  if (!data.crashLadder.includes(crash)) throw new Error(`사다리 밖 첫 끊는 때: ${crash}`);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const plain = runLine(data, data.plainWrites, crash);
      const journal = runLine(data, data.journalWrites, crash);

      setPlainWrites(0);
      setJournalWrites(0);
      setReplayed(0);
      first = false;
      await ctx.emit({ type: 'round', payload: { crashAfter: crash } });
      if (!(await ctx.sleep(data.stepMs))) return;

      const plainHome: BlockState[] = data.blocks.map(() => 'old');
      const journalHome: BlockState[] = data.blocks.map(() => 'old');
      for (let i = 1; i <= journal.written; i++) {
        if (ctx.cancelled) return;
        const jw = data.journalWrites[i - 1]!;
        const jk = classifyWrite(data, jw);
        if (jk.kind === 'home') journalHome[jk.block] = 'new';
        const pw = i <= plain.written ? data.plainWrites[i - 1]! : null;
        if (pw) {
          const pk = classifyWrite(data, pw);
          if (pk.kind !== 'home') throw new Error(`저널 없는 줄에 저널 쓰기: ${pw.item}`);
          plainHome[pk.block] = 'new';
        }
        if (jk.kind === 'home') await phase('write-home');
        else if (jk.kind === 'end') await phase('journal-commit');
        else await phase('journal-write');
        await ctx.emit({
          type: 'write',
          payload: {
            index: i,
            journal: { area: jw.area, item: jw.item },
            plain: pw ? { area: pw.area, item: pw.item } : null,
            journalHome: [...journalHome],
            plainHome: [...plainHome],
          },
        });
        setJournalWrites(i);
        setPlainWrites(Math.min(i, plain.written));
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      if (ctx.cancelled) return;
      await phase('check-commit');
      await ctx.emit({ type: 'restart', payload: { committed: journal.committed, scanned: journal.written } });
      if (!(await ctx.sleep(data.stepMs))) return;

      let count = 0;
      for (const r of journal.replayed) {
        if (ctx.cancelled) return;
        journalHome[r.block] = 'new';
        count += 1;
        await phase('replay');
        await ctx.emit({
          type: 'replay',
          payload: { block: data.blocks[r.block]!, slot: r.slot, wasNew: r.wasNew, journalHome: [...journalHome] },
        });
        setReplayed(count);
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      if (ctx.cancelled) return;
      await phase('verdict');
      await ctx.emit({
        type: 'verdict',
        payload: {
          plain: { home: plain.after, verdict: plain.verdict },
          journal: { home: journal.after, verdict: journal.verdict },
        },
      });

      // 판정 걸음의 경계는 입력 대기다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'crashAfter') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.crashLadder.includes(value)) continue;
        crash = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
