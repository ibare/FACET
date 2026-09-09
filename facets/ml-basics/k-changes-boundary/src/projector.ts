/**
 * k-changes-boundary projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번에 좁힌다 (C9). stage 는 이미 좁혀진
 * 값만 받고, 화면 문안은 `runtime.t` 로 조회해 stage 에 넘긴다 (C10) — algorithm
 * 은 수와 이름표만 보내고 무엇이라 말할지는 이 층이 정한다.
 */

import {
  makeTranslator,
  toIndexArray,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';
import { readScene, type Scene } from './k-changes-boundary-stage.js';

type Stage = {
  setScene?(scene: Scene): void;
  setCaption?(text: string): void;
  pose?(): Promise<void>;
  growRing?(k: number, radius: number): Promise<void>;
  capture?(index: number, label: string): Promise<void>;
  settle?(tally: {
    labels: string[];
    counts: number[];
    verdict: string;
    flipped: boolean;
  }): Promise<void>;
  conclude?(index: number): Promise<void>;
  reset?(): void;
};

function readStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function readNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number') return null;
    out.push(item);
  }
  return out;
}

export const kChangesBoundaryProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const scene = readScene(initialData);
      if (!scene) return;
      stage?.setScene?.(scene);
    },

    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'question-posed': {
          stage?.setCaption?.(
            tr('caption.start', 'The point in the middle has no label. Its neighbours will vote.'),
          );
          await stage?.pose?.();
          return;
        }

        case 'ring-grow': {
          const p = event.payload as { k?: unknown; radius?: unknown } | undefined;
          if (typeof p?.k !== 'number' || typeof p?.radius !== 'number') return;
          stage?.setCaption?.(
            tr('caption.grow', 'The boundary grows until it holds the nearest {k}.', { k: p.k }),
          );
          await stage?.growRing?.(p.k, p.radius);
          return;
        }

        case 'neighbor-captured': {
          const index = toIndexArray(event.target)[0];
          const p = event.payload as { label?: unknown } | undefined;
          if (typeof index !== 'number' || typeof p?.label !== 'string') return;
          await stage?.capture?.(index, p.label);
          return;
        }

        case 'tally-settled': {
          const p = event.payload as
            | { labels?: unknown; counts?: unknown; verdict?: unknown; previous?: unknown }
            | undefined;
          const labels = readStrings(p?.labels);
          const counts = readNumbers(p?.counts);
          if (!labels || !counts || typeof p?.verdict !== 'string') return;
          const previous = typeof p.previous === 'string' ? p.previous : null;
          const flipped = previous !== null && previous !== p.verdict;
          await stage?.settle?.({ labels, counts, verdict: p.verdict, flipped });
          if (labels.length < 2 || counts.length < 2) return;
          const vars = {
            la: labels[0],
            ca: counts[0],
            lb: labels[1],
            cb: counts[1],
            verdict: p.verdict,
          };
          if (previous === null) {
            stage?.setCaption?.(
              tr('caption.first', 'Votes {la} {ca} : {lb} {cb} — the answer reads {verdict}.', vars),
            );
            return;
          }
          stage?.setCaption?.(
            flipped
              ? tr('caption.flip', 'Votes {la} {ca} : {lb} {cb} — the answer flips to {verdict}.', vars)
              : tr('caption.hold', 'Votes {la} {ca} : {lb} {cb} — the answer stays {verdict}.', vars),
          );
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        case 'done': {
          const p = event.payload as { nearest?: unknown; verdict?: unknown } | undefined;
          if (typeof p?.nearest !== 'string' || typeof p?.verdict !== 'string') return;
          stage?.setCaption?.(
            tr(
              'caption.done',
              'The nearest one is {nearest}. Ask a few more and the answer becomes {verdict}.',
              { nearest: p.nearest, verdict: p.verdict },
            ),
          );
          const nearestIndex = toIndexArray(event.target)[0];
          if (typeof nearestIndex === 'number') await stage?.conclude?.(nearestIndex);
          return;
        }

        // 위에 없는 type 은 이 조각이 내보내지 않는다 — 조용히 흘린다 (C2).
        default:
          return;
      }
    },
  };
};
