/**
 * fail-link projector — 걸음을 그림의 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다. stage 는 `unknown` 을 받지 않는다 (C9).
 * 화면 문안은 키로만 다루고 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type WireNode = {
  id: number;
  parent: number;
  ch: string;
  word: string;
  depth: number;
  terminal: string | null;
};

type FailLinkStage = {
  prepareTree?(nodes: WireNode[]): void;
  rewind?(): void;
  growPattern?(nodeIds: number[]): Promise<void>;
  linkFail?(from: number, to: number): Promise<void>;
  advanceScan?(step: {
    index: number;
    ch: string;
    from: number;
    to: number;
    matched: string | null;
  }): Promise<void>;
  slideToFail?(step: { index: number; from: number; to: number }): Promise<void>;
  showNaiveRestart?(step: { from: number; missed: string }): Promise<void>;
  finish?(): Promise<void>;
  setCaption?(text: string): void;
};

/** 단언 뒤에 반드시 필드별 검사가 따른다 (C9). */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNodes(value: unknown): WireNode[] {
  if (!Array.isArray(value)) return [];
  const out: WireNode[] = [];
  for (const raw of value) {
    const n = asRecord(raw);
    if (typeof n.id !== 'number') continue;
    out.push({
      id: n.id,
      parent: num(n.parent),
      ch: str(n.ch),
      word: str(n.word),
      depth: num(n.depth),
      terminal: nullableStr(n.terminal),
    });
  }
  return out;
}

function readIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export const failLinkProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as FailLinkStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const caption = (key: string, source: string, vars?: Record<string, string>): void => {
    stage?.setCaption?.(tr(key, source, vars));
  };

  return {
    onReset(): void {
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'tree-ready': {
          stage?.prepareTree?.(readNodes(p.nodes));
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'pattern-inserted': {
          caption('caption.insert', 'Four patterns share one tree: {pattern}.', {
            pattern: str(p.pattern),
          });
          await stage?.growPattern?.(readIds(p.nodeIds));
          return;
        }

        case 'fail-linked': {
          caption(
            'caption.failLink',
            '"{word}" falls back to "{suffix}" — the longest suffix of it that the tree still has.',
            { word: str(p.word), suffix: str(p.suffix) },
          );
          await stage?.linkFail?.(num(p.from), num(p.to));
          return;
        }

        case 'scan-advanced': {
          const matched = nullableStr(p.matched);
          if (matched !== null) {
            caption('caption.match', '"{ch}" completes a pattern: {word}.', {
              ch: str(p.ch),
              word: matched,
            });
          } else if (num(p.to) === 0) {
            caption('caption.rootStay', 'The root has no "{ch}": nothing starts here.', {
              ch: str(p.ch),
            });
          } else {
            caption('caption.step', '"{ch}" continues the path — now at "{word}".', {
              ch: str(p.ch),
              word: str(p.word),
            });
          }
          await stage?.advanceScan?.({
            index: num(p.index),
            ch: str(p.ch),
            from: num(p.from),
            to: num(p.to),
            matched,
          });
          return;
        }

        case 'fail-slid': {
          caption(
            'caption.slide',
            'No "{ch}" after "{word}". Instead of starting over, slide to "{suffix}", which was already read.',
            { ch: str(p.ch), word: str(p.word), suffix: str(p.suffix) },
          );
          await stage?.slideToFail?.({
            index: num(p.index),
            from: num(p.from),
            to: num(p.to),
          });
          return;
        }

        case 'naive-restart': {
          caption(
            'caption.naive',
            'Going back to the root instead, the rest reads as a fresh start: {missed} is never found.',
            { missed: str(p.missed) },
          );
          await stage?.showNaiveRestart?.({ from: num(p.from), missed: str(p.missed) });
          return;
        }

        case 'done': {
          caption('caption.done', 'Sliding to the overlap is why {rescued} was not missed.', {
            rescued: str(p.rescued),
          });
          await stage?.finish?.();
          return;
        }

        default:
          // 이 algorithm 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
