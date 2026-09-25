/**
 * 저널링 projector — algorithm 이벤트를 stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동의 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 (재생 속도를 따라간다).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { BlockState, JournalingStage, Verdict } from './journaling-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}
function states(v: unknown, key: string): BlockState[] {
  if (!Array.isArray(v)) throw new Error(`payload.${key} 가 목록이 아니다`);
  return v.map((s) => {
    if (s !== 'old' && s !== 'new') throw new Error(`payload.${key} 에 모르는 상태: ${String(s)}`);
    return s;
  });
}
function verdictOf(v: unknown): Verdict {
  if (v !== 'old' && v !== 'new' && v !== 'torn') throw new Error(`모르는 판정: ${String(v)}`);
  return v;
}
function writeOf(v: unknown): { area: 'home' | 'journal'; item: string } | null {
  if (v === null) return null;
  if (typeof v !== 'object') throw new Error('쓰기 모양이 틀렸다');
  const area = (v as { area?: unknown }).area;
  const item = (v as { item?: unknown }).item;
  if ((area !== 'home' && area !== 'journal') || typeof item !== 'string') throw new Error('쓰기 모양이 틀렸다');
  return { area, item };
}
function lineOf(v: unknown): { home: BlockState[]; verdict: Verdict } {
  if (typeof v !== 'object' || v === null) throw new Error('판정 줄 모양이 틀렸다');
  return { home: states((v as { home?: unknown }).home, 'home'), verdict: verdictOf((v as { verdict?: unknown }).verdict) };
}

export const journalingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as JournalingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let blocks: string[] = [];
  let motionMs = 0;
  let endMark = '';

  const motion = () => {
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };
  const stateWord = (s: BlockState) => (s === 'new' ? t('label.stateNew', 'new') : t('label.stateOld', 'old'));
  const verdictWord = (v: Verdict) =>
    v === 'old'
      ? t('label.verdictOld', 'intact · old')
      : v === 'new'
        ? t('label.verdictNew', 'intact · new')
        : t('label.verdictTorn', 'torn');
  const writeWord = (w: { area: 'home' | 'journal'; item: string }) =>
    w.area === 'journal'
      ? t('label.writeToJournal', '{item} → journal', { item: w.item })
      : t('label.writeToHome', '{item} → in place', { item: w.item });

  return {
    onInit(data) {
      if (typeof data !== 'object' || data === null) throw new Error('initialData 가 없다');
      const d = data as Record<string, unknown>;
      const b = d.blocks;
      if (!Array.isArray(b) || !b.every((x): x is string => typeof x === 'string')) throw new Error('initialData.blocks 가 틀렸다');
      blocks = b;
      if (typeof d.motionMs !== 'number') throw new Error('initialData.motionMs 가 없다');
      motionMs = d.motionMs;
      if (typeof d.endMark !== 'string') throw new Error('initialData.endMark 가 없다');
      endMark = d.endMark;
    },
    async onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('phase 가 글자가 아니다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'round': {
          const crash = num(p, 'crashAfter');
          code?.clearHighlight?.();
          await stage?.setRound(crash, t('caption.round', 'Start · writes before the crash: {c}', { c: crash }), motion());
          return;
        }
        case 'write': {
          const index = num(p, 'index');
          const jw = writeOf(p.journal);
          if (!jw) throw new Error('저널 줄 쓰기가 없다');
          const pw = writeOf(p.plain);
          const plainText = pw ? writeWord(pw) : t('label.plainDone', 'all written');
          await stage?.showWrite(
            index,
            states(p.journalHome, 'journalHome'),
            states(p.plainHome, 'plainHome'),
            pw !== null,
            t('caption.write', 'Write {i} · journal row: {j} · no-journal row: {p}', { i: index, j: writeWord(jw), p: plainText }),
            motion(),
          );
          return;
        }
        case 'restart': {
          const committed = p.committed;
          if (typeof committed !== 'boolean') throw new Error('payload.committed 가 참거짓이 아니다');
          const scanned = num(p, 'scanned');
          const cap = committed
            ? t('caption.restartCommit', 'Crash · restart, scan the journal: {mark} found → write again · no-journal row has nothing to scan', {
                mark: endMark,
              })
            : t('caption.restartDrop', 'Crash · restart, scan the journal: no {mark} → drop it · no-journal row has nothing to scan', {
                mark: endMark,
              });
          await stage?.showRestart(committed, scanned, cap, motion());
          return;
        }
        case 'replay': {
          const name = p.block;
          if (typeof name !== 'string') throw new Error('payload.block 이 글자가 아니다');
          const block = blocks.indexOf(name);
          if (block < 0) throw new Error(`모르는 블록: ${name}`);
          const wasNew = p.wasNew;
          if (typeof wasNew !== 'boolean') throw new Error('payload.wasNew 가 참거짓이 아니다');
          await stage?.showReplay(
            block,
            num(p, 'slot'),
            states(p.journalHome, 'journalHome'),
            t('caption.replay', 'Write again: {block} → in place · before: {state}', {
              block: name,
              state: stateWord(wasNew ? 'new' : 'old'),
            }),
            motion(),
          );
          return;
        }
        case 'verdict': {
          const plain = lineOf(p.plain);
          const journal = lineOf(p.journal);
          await stage?.showVerdict(
            plain,
            journal,
            t('caption.verdict', 'After restart · no-journal row: {p} · journal row: {j}', {
              p: verdictWord(plain.verdict),
              j: verdictWord(journal.verdict),
            }),
            motion(),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight?.();
    },
  };
};
