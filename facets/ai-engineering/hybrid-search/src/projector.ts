/**
 * hybrid-search projector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 합친 줄의 **보이는 차례**를 여기서 쥔다. 판이 바뀌면 앞 판의 차례에서 출발해, 한 걸음에
 * 한 문서씩 새 자리로 옮긴다. 자리를 받은 문서는 앞에, 아직 못 받은 문서는 앞 판의 차례대로
 * 그 뒤에 선다 — 그래서 옮겨 가는 문서가 남은 문서들을 지나친다.
 */

import { makeTranslator, type ProjectorFactory, type ViewInstance } from '@ffacet/core/runtime';
import type { HybridStage, HybridStageDoc } from './hybrid-search-stage.js';

type CodePanel = ViewInstance & { highlightPhase?: (phase: string | null) => void };

type DocMeta = { id: string; text: string; similarity: number };

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function readMeta(initialData: unknown): { query: string; docs: DocMeta[]; stepMs: number; rrfK: number } {
  const out = { query: '', docs: [] as DocMeta[], stepMs: 900, rrfK: 60 };
  if (!initialData || typeof initialData !== 'object') return out;
  const d = initialData as Record<string, unknown>;
  if (typeof d.query === 'string') out.query = d.query;
  out.stepMs = num(d.stepMs, 900);
  out.rrfK = num(d.rrfK, 60);
  if (Array.isArray(d.docs)) {
    for (const raw of d.docs) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      out.docs.push({
        id: typeof r.id === 'string' ? r.id : '',
        text: typeof r.text === 'string' ? r.text : '',
        similarity: num(r.similarity, 0),
      });
    }
  }
  return out;
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => num(x, 0)) : [];
}

/** 백분율 — 반올림 `(x·100 + n//2) // n`. algorithm 과 같은 식. */
const pct = (x: number, n: number): number => Math.floor((x * 100 + Math.floor(n / 2)) / n);

export const hybridSearchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HybridStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();

  let meta = readMeta(undefined);
  /** 앞 판이 끝났을 때의 차례. 첫 판은 번호 차례. */
  let prevOrder: number[] = [];
  /** 이번 판의 차례. */
  let nextOrder: number[] = [];

  const ms = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return (meta.stepMs * 0.7) / Math.max(0.01, speed);
  };

  return {
    onInit(initialData: unknown) {
      meta = readMeta(initialData);
      prevOrder = meta.docs.map((_, i) => i);
      nextOrder = [];
      stage?.clear?.();
    },
    onEvent(event) {
      const p = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
      switch (event.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'ladders': {
          const rows = Array.isArray(p.docs) ? p.docs : [];
          const docs: HybridStageDoc[] = [];
          rows.forEach((raw, i) => {
            const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
            const m = meta.docs[i];
            const doc: HybridStageDoc = {
              id: m?.id ?? `d${i + 1}`,
              text: m?.text ?? '',
              similarity: m?.similarity ?? 0,
              lexScore: num(r.lexScore, 0),
              lexRank: num(r.lexRank, i + 1),
              vecRank: num(r.vecRank, i + 1),
              relevant: r.relevant === true,
              noShared: r.noShared === true,
            };
            docs.push(doc);
          });
          if (prevOrder.length !== docs.length) prevOrder = docs.map((_, i) => i);
          stage?.setDocs?.(meta.query, docs, num(p.top, 3));
          return;
        }
        case 'weigh': {
          const w = num(p.weight, 0);
          const parts = Math.max(1, num(p.parts, 4));
          nextOrder = numbers(p.order);
          const fused = Array.isArray(p.fused) ? p.fused : [];
          const scores = fused.map((raw) => {
            const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
            const den = num(r.den, 1);
            return den === 0 ? 0 : num(r.num, 0) / den;
          });
          stage?.weigh?.(numbers(p.lexShare), numbers(p.vecShare), scores, ms());
          stage?.arrange?.(prevOrder, 0, null, ms());
          stage?.caption?.(
            t('caption.weigh', 'Words get {lex}%, meaning gets {vec}%. Each document now leaves both lines.', {
              lex: pct(w, parts),
              vec: pct(parts - w, parts),
            }),
            '',
          );
          return;
        }
        case 'seat': {
          const doc = num(p.doc, -1);
          const place = num(p.place, 0);
          const seated = nextOrder.slice(0, place + 1);
          const rest = prevOrder.filter((d) => !seated.includes(d));
          stage?.arrange?.([...seated, ...rest], seated.length, doc, ms());
          const m = meta.docs[doc];
          stage?.caption?.(
            t('caption.seat', 'Place {place}: {doc}', { place: place + 1, doc: m?.id ?? '' }),
            m?.text ?? '',
          );
          return;
        }
        case 'settle': {
          prevOrder = nextOrder.slice();
          stage?.arrange?.(nextOrder, nextOrder.length, null, ms());
          stage?.caption?.(
            t('caption.settle', 'Relevant in the top {top}: {hits}. Of those {top}, sharing no word with the query: {none}.', {
              top: num(p.top, 3),
              hits: num(p.relevantTop, 0),
              none: num(p.noSharedTop, 0),
            }),
            '',
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      prevOrder = meta.docs.map((_, i) => i);
      nextOrder = [];
      stage?.clear?.();
      code?.highlightPhase?.(null);
    },
  };
};
