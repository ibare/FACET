/**
 * reranking projector — 알고리즘 이벤트를 stage 호출과 코드 패널 짚기로 옮긴다.
 *
 * 운동 길이는 걸음 간격(`stepMs`)과 지금 재생 속도에서 그때그때 셈한다 — 속도를 올리면
 * 운동도 짧아져 걸음 경계를 넘지 않는다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 의 구조적 표면 — mountView 반환형이 오픈 타입이라 여기서 좁힌다. */
type Stage = {
  setRound(n: number, order: number[], dur: number): void;
  readDoc(doc: number, score: number, dur: number): void;
  reorder(order: number[], dur: number): void;
  showTop(top: number[], dur: number): void;
  setCaption(line1: string, line2: string): void;
};

type CodePanel = { highlightPhase(phase: string | null): void };

const numArr = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export const rerankingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let stepMs = 700;
  let total = 0;
  let shortlist = 0;

  const dur = (share: number): number => (stepMs * share) / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(initialData: unknown) {
      total = 0;
      if (initialData && typeof initialData === 'object') {
        const s = (initialData as { stepMs?: unknown }).stepMs;
        if (typeof s === 'number' && s > 0) stepMs = s;
        const ds = (initialData as { docs?: unknown }).docs;
        if (Array.isArray(ds)) {
          for (const d of ds) {
            if (!d || typeof d !== 'object') continue;
            const id = (d as { id?: unknown }).id;
            if (typeof id !== 'number') continue;
            total += 1;
          }
        }
      }
      code?.highlightPhase(null);
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = (event.payload ?? {}) as Record<string, unknown>;
      switch (event.type) {
        case 'phase': {
          const ph = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase(ph);
          return;
        }
        case 'shortlist': {
          const n = num(p.n);
          const order = numArr(p.order);
          if (n === null || !order) return;
          shortlist = n;
          stage?.setRound(n, order, dur(0.8));
          stage?.setCaption(
            t('caption.shortlist', 'The first stage has lined up every document. Passed to the reranker: the top {n}.', { n }),
            '',
          );
          return;
        }
        case 'score': {
          const doc = num(p.doc);
          const score = num(p.score);
          const calls = num(p.calls);
          if (doc === null || score === null || calls === null) return;
          stage?.readDoc(doc, score, dur(0.7));
          stage?.setCaption(
            t('caption.score', 'The reranker reads document {doc} together with the query. Score: {score}.', { doc, score }),
            t('caption.calls', 'Reranker calls so far: {calls} of {n}.', { calls, n: shortlist }),
          );
          return;
        }
        case 'reorder': {
          const order = numArr(p.order);
          const moved = num(p.moved);
          const n = num(p.n);
          if (!order || moved === null || n === null) return;
          stage?.reorder(order, dur(0.85));
          stage?.setCaption(
            t('caption.reorder', 'Only the {n} passed over change places, by reranker score. Documents moved: {moved}.', {
              n,
              moved,
            }),
            n < total
              ? t('caption.stay', 'Below the line nothing was read, so first-stage order stays.')
              : t('caption.stayNone', 'Every document was passed over, so every one could move.'),
          );
          return;
        }
        case 'answer': {
          const top = numArr(p.top);
          const hits = num(p.hits);
          const calls = num(p.calls);
          const left = numArr(p.leftRelevant);
          if (!top || hits === null || calls === null || !left) return;
          stage?.showTop(top, dur(0.6));
          stage?.setCaption(
            t('caption.answer', 'Relevant in the top 3: {hits} of 3. Reranker calls: {calls}.', { hits, calls }),
            left.length > 0
              ? t('caption.left', 'Relevant documents left below the line: {docs}. The reranker never saw them.', {
                  docs: left.join(t('label.listSep', ', ')),
                })
              : t('caption.noneLeft', 'No relevant document is left below the line.'),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.highlightPhase(null);
    },
  };
};
