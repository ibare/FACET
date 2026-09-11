/**
 * many-patterns-one-pass projector — algorithm 이 셈한 것을 stage 의 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만든 뒤 넘긴다 (C9). 화면 문안은 키로만
 * 다루며 문장 자체는 facet.ts 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type NodeWire = {
  id: string;
  parent: string | null;
  char: string;
  depth: number;
  terminal: boolean;
};

type PathWire = { pattern: string; nodeIds: string[] };

type ReadWire = {
  index: number;
  char: string;
  move: 'stay' | 'descend' | 'slide';
  from: string;
  to: string;
  via?: string;
};

type HitWire = { pattern: string; start: number; end: number };

type Stage = {
  layPatterns?(): Promise<void>;
  buildTrie?(spec: { nodes: NodeWire[]; paths: PathWire[] }): Promise<void>;
  readChar?(step: ReadWire): Promise<void>;
  catchMatches?(batch: { nodeId: string; hits: HitWire[] }): Promise<void>;
  finish?(): Promise<void>;
  rewind?(): void;
  setCaption?(text: string): void;
};

/** 패턴 이름을 늘어놓을 때 쓰는 기호. 문장이 아니라 구분 표식이다. */
const NAME_SEP = ' · ';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNodes(value: unknown): NodeWire[] {
  if (!Array.isArray(value)) return [];
  const out: NodeWire[] = [];
  for (const raw of value) {
    const node = asRecord(raw);
    if (!node) continue;
    if (typeof node.id !== 'string') continue;
    out.push({
      id: node.id,
      parent: typeof node.parent === 'string' ? node.parent : null,
      char: readString(node.char, ''),
      depth: readNumber(node.depth, 0),
      terminal: node.terminal === true,
    });
  }
  return out;
}

function readPaths(value: unknown): PathWire[] {
  if (!Array.isArray(value)) return [];
  const out: PathWire[] = [];
  for (const raw of value) {
    const path = asRecord(raw);
    if (!path) continue;
    if (typeof path.pattern !== 'string' || !Array.isArray(path.nodeIds)) continue;
    out.push({
      pattern: path.pattern,
      nodeIds: path.nodeIds.filter((id): id is string => typeof id === 'string'),
    });
  }
  return out;
}

function readHits(value: unknown): HitWire[] {
  if (!Array.isArray(value)) return [];
  const out: HitWire[] = [];
  for (const raw of value) {
    const hit = asRecord(raw);
    if (!hit) continue;
    if (typeof hit.pattern !== 'string') continue;
    out.push({
      pattern: hit.pattern,
      start: readNumber(hit.start, 0),
      end: readNumber(hit.end, 0),
    });
  }
  return out;
}

function readMove(value: unknown): ReadWire['move'] {
  return value === 'stay' || value === 'slide' ? value : 'descend';
}

export const manyPatternsOnePassProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'patterns-laid': {
          const payload = asRecord(event.payload);
          const passes = readNumber(payload?.passes, 0);
          stage.setCaption?.(
            tr('caption.separate', 'Searched one at a time, each pattern needs its own pass: {n}.', {
              n: passes,
            }),
          );
          await stage.layPatterns?.();
          return;
        }

        case 'trie-merged': {
          const payload = asRecord(event.payload);
          const nodes = readNodes(payload?.nodes);
          const paths = readPaths(payload?.paths);
          stage.setCaption?.(
            tr('caption.merge', 'Shared prefixes fold into one tree. Nodes in all: {n}.', {
              n: readNumber(payload?.nodeCount, nodes.length),
            }),
          );
          await stage.buildTrie?.({ nodes, paths });
          return;
        }

        case 'read': {
          const payload = asRecord(event.payload);
          const step: ReadWire = {
            index: readNumber(payload?.index, 0),
            char: readString(payload?.char, ''),
            move: readMove(payload?.move),
            from: readString(payload?.from, ''),
            to: readString(payload?.to, ''),
            via: typeof payload?.via === 'string' ? payload.via : undefined,
          };
          if (step.move === 'stay') {
            stage.setCaption?.(
              tr('caption.stay', '"{char}" — no path from the root, so the cursor stays.', {
                char: step.char,
              }),
            );
          } else if (step.move === 'slide') {
            stage.setCaption?.(
              tr(
                'caption.slide',
                '"{char}" — the path ends, so the cursor slips back and goes down again.',
                { char: step.char },
              ),
            );
          } else {
            stage.setCaption?.(
              tr('caption.descend', '"{char}" — one step down the tree.', { char: step.char }),
            );
          }
          await stage.readChar?.(step);
          return;
        }

        case 'match': {
          const payload = asRecord(event.payload);
          const hits = readHits(payload?.hits);
          const names = hits.map((hit) => hit.pattern).join(NAME_SEP);
          if (hits.length > 1) {
            stage.setCaption?.(
              tr(
                'caption.matchPair',
                'Two patterns end at this one node, caught together: {names}.',
                { names },
              ),
            );
          } else {
            stage.setCaption?.(tr('caption.matchOne', 'A pattern ends here: {names}.', { names }));
          }
          await stage.catchMatches?.({
            nodeId: readString(payload?.nodeId, ''),
            hits,
          });
          return;
        }

        case 'done': {
          const payload = asRecord(event.payload);
          stage.setCaption?.(
            tr('caption.done', 'One pass over the text, and the matches found: {n}.', {
              n: readNumber(payload?.found, 0),
            }),
          );
          await stage.finish?.();
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          stage.setCaption?.('');
          return;
        }

        default:
          // 위 어휘 밖의 이벤트는 이 조각에 없다. 들어오면 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
      stage.setCaption?.('');
    },
  };
};
