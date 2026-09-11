/**
 * aho-corasick 의 projector — 알고리즘이 셈한 것을 stage 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만든 뒤 넘긴다 (C9). 문안은 키로만 다루고
 * 문장 자체는 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type WireNode = { id: number; parent: number; ch: string; depth: number; ends: string | null };
type WireLink = { from: number; to: number; word: string; suffix: string };
type WireHit = { pattern: string; start: number; end: number };
type ReadStep = { index: number; char: string; from: number; to: number; slides: number[] };

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type AhoStage = {
  setup?(spec: { patterns: string[]; used: number; text: string; separate: number }): void;
  showTrie?(nodes: WireNode[]): void;
  showFails?(links: WireLink[]): void;
  readChar?(step: ReadStep): void;
  catchMatch?(batch: { nodeId: number; hits: WireHit[] }): void;
  finish?(summary: { charsRead: number; separate: number }): void;
  setCaption?(body: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** 패턴 이름을 늘어놓을 때 쓰는 기호. 문장이 아니라 구분 표식이다. */
const NAME_SEP = ' · ';

/** 뿌리의 마디 번호. algorithm.ts 와 같은 약속이다. */
const ROOT = 0;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

function readNodes(value: unknown): WireNode[] {
  if (!Array.isArray(value)) return [];
  const out: WireNode[] = [];
  for (const raw of value) {
    const node = asRecord(raw);
    if (!node || typeof node.id !== 'number') continue;
    out.push({
      id: node.id,
      parent: num(node.parent, -1),
      ch: str(node.ch),
      depth: num(node.depth),
      ends: typeof node.ends === 'string' ? node.ends : null,
    });
  }
  return out;
}

function readLinks(value: unknown): WireLink[] {
  if (!Array.isArray(value)) return [];
  const out: WireLink[] = [];
  for (const raw of value) {
    const link = asRecord(raw);
    if (!link || typeof link.from !== 'number' || typeof link.to !== 'number') continue;
    out.push({
      from: link.from,
      to: link.to,
      word: str(link.word),
      suffix: str(link.suffix),
    });
  }
  return out;
}

function readHits(value: unknown): WireHit[] {
  if (!Array.isArray(value)) return [];
  const out: WireHit[] = [];
  for (const raw of value) {
    const hit = asRecord(raw);
    if (!hit || typeof hit.pattern !== 'string') continue;
    out.push({ pattern: hit.pattern, start: num(hit.start), end: num(hit.end) });
  }
  return out;
}

export const ahoCorasickProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as AhoStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 이번 판의 몫. `done` 은 패턴 개수를 다시 싣지 않으므로 (같은 판의 `setup`
   * 이 이미 말했다) projector 가 조금 따라 둔다 — 원칙 5 가 허용하는 만큼이고,
   * 인스턴스마다 따로 가져야 하므로 팩토리 안에 둔다.
   */
  let used = 0;

  return {
    onInit() {
      used = 0;
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = asRecord(event.payload);
      switch (event.type) {
        case 'setup': {
          const patterns = strList(p?.patterns);
          used = num(p?.patternCount, patterns.length);
          const body = str(p?.text);
          stage?.setup?.({ patterns, used, text: body, separate: num(p?.separate) });
          stage?.setCaption?.(
            tr('caption.setup', 'Folding {k} patterns into one tree over {n} characters of text.', {
              k: used,
              n: body.length,
            }),
          );
          return;
        }

        case 'trie-built': {
          const nodes = readNodes(p?.nodes);
          stage?.showTrie?.(nodes);
          stage?.setCaption?.(
            tr('caption.built', 'One tree, {n} nodes. A shared prefix is a single node.', {
              n: nodes.length,
            }),
          );
          return;
        }

        case 'fails-linked': {
          const links = readLinks(p?.links);
          stage?.showFails?.(links);
          stage?.setCaption?.(
            tr(
              'caption.linked',
              '{n} fail links. On a mismatch it jumps to the longest overlap already read.',
              { n: links.length },
            ),
          );
          return;
        }

        case 'read': {
          const step: ReadStep = {
            index: num(p?.index),
            char: str(p?.char),
            from: num(p?.from),
            to: num(p?.to),
            slides: numList(p?.slides),
          };
          const word = str(p?.word);
          stage?.readChar?.(step);
          if (step.to === ROOT) {
            stage?.setCaption?.(
              tr(
                'caption.restart',
                '"{char}" — nothing continues here, so it starts again at the root. Even so the text never rewinds.',
                { char: step.char },
              ),
            );
          } else if (step.slides.length > 0) {
            stage?.setCaption?.(
              tr(
                'caption.slide',
                '"{char}" — the path ended, so it slid back and went on to "{word}". The reading spot never moved.',
                { char: step.char, word },
              ),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.read', '"{char}" — one step down to "{word}". Characters read: {n}.', {
                char: step.char,
                word,
                n: step.index + 1,
              }),
            );
          }
          return;
        }

        case 'match': {
          const hits = readHits(p?.hits);
          stage?.catchMatch?.({ nodeId: num(p?.nodeId), hits });
          const names = hits.map((hit) => hit.pattern).join(NAME_SEP);
          if (hits.length > 1) {
            // 개수를 문안에 박지 않는다 — 갈림은 `> 1` 인데 문안이 "둘" 이라 적으면
            // 셋이 걸리는 자료에서 화면이 조용히 거짓을 말한다.
            stage?.setCaption?.(
              tr(
                'caption.hitMany',
                '{count} patterns end at this one node, caught in the same step: {names}.',
                { count: hits.length, names },
              ),
            );
          } else {
            stage?.setCaption?.(tr('caption.hit', 'A pattern ends here: {names}.', { names }));
          }
          return;
        }

        case 'done': {
          const charsRead = num(p?.charsRead);
          const separate = num(p?.separate);
          stage?.finish?.({ charsRead, separate });
          stage?.setCaption?.(
            tr(
              'caption.done',
              'Read {read} characters for {k} patterns. One at a time it would have been {separate}.',
              { read: charsRead, k: used, separate },
            ),
          );
          return;
        }

        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }

        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      used = 0;
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
