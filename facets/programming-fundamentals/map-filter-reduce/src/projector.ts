/**
 * map-filter-reduce 의 번역기 — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 움직임의 길이는 걸음 간격(stepMs)을 **그때의** 재생 속도로 나눈 것의 일부 — 속도를 올려도 움직임이 걸음
 * 경계를 넘지 않게 이벤트마다 `getSpeed()` 를 다시 읽는다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { MapFilterReduceStage } from './map-filter-reduce-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const mapFilterReduceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MapFilterReduceStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let stepMs = 600;

  const dur = (share: number): number => {
    const speed = Math.max(0.1, runtime?.getSpeed() ?? 1);
    return (stepMs * share) / speed;
  };
  const verdict = (ok: boolean): string => (ok ? t('verdict.true', 'true') : t('verdict.false', 'false'));

  return {
    onInit(data) {
      const d = data as { stepMs?: unknown } | undefined;
      const s = num(d?.stepMs);
      if (s !== null && s > 0) stepMs = s;
    },
    onEvent(e) {
      const p = (typeof e.payload === 'object' && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
      switch (e.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'round-start': {
          const threshold = num(p.threshold);
          const start = num(p.start);
          const maxResult = num(p.maxResult);
          const marks = Array.isArray(p.marks) ? p.marks.filter((m): m is number => typeof m === 'number') : [];
          if (threshold === null || start === null || maxResult === null) return;
          code?.clearHighlight?.();
          stage?.startRound({
            marks,
            threshold,
            start,
            maxResult,
            caption: t('caption.start', 'Threshold: {threshold}', { threshold }),
            dur: dur(0.8),
          });
          return;
        }
        case 'filter-keep': {
          const index = num(p.index);
          const x = num(p.x);
          const threshold = num(p.threshold);
          const slot = num(p.slot);
          if (index === null || x === null || threshold === null || slot === null) return;
          stage?.filterKeep({
            index,
            slot,
            revived: p.revived === true,
            caption: t('caption.test', '{x} > {threshold}: {verdict}', { x, threshold, verdict: verdict(true) }),
            tag: t('tag.revived', 'dropped last time'),
            dur: dur(0.8),
          });
          return;
        }
        case 'filter-drop': {
          const index = num(p.index);
          const x = num(p.x);
          const threshold = num(p.threshold);
          const dropSlot = num(p.dropSlot);
          if (index === null || x === null || threshold === null || dropSlot === null) return;
          stage?.filterDrop({
            index,
            dropSlot,
            lost: p.lost === true,
            caption: t('caption.test', '{x} > {threshold}: {verdict}', { x, threshold, verdict: verdict(false) }),
            tag: t('tag.lost', 'passed last time'),
            dur: dur(0.8),
          });
          return;
        }
        case 'map-step': {
          const index = num(p.index);
          const slot = num(p.slot);
          const x = num(p.x);
          const y = num(p.y);
          if (index === null || slot === null || x === null || y === null) return;
          stage?.mapStep({ index, slot, y, caption: t('caption.map', '{x} → {y}', { x, y }), dur: dur(0.7) });
          return;
        }
        case 'fold-step': {
          const index = num(p.index);
          const slot = num(p.slot);
          const acc = num(p.acc);
          const y = num(p.y);
          const next = num(p.next);
          if (index === null || slot === null || acc === null || y === null || next === null) return;
          stage?.foldStep({ index, slot, y, next, caption: t('caption.fold', '{acc} + {y} = {next}', { acc, y, next }), dur: dur(0.7) });
          return;
        }
        case 'answer': {
          const sum = num(p.sum);
          if (sum === null) return;
          stage?.answer({ sum, caption: t('caption.answer', 'Result: {sum}', { sum }), dur: dur(1) });
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight?.();
      stage?.reset();
    },
  };
};
