/**
 * 랜덤 포레스트 projector — 알고리즘 이벤트를 stage 와 코드 패널의 메서드
 * 호출로 옮긴다. 시각 상태는 stage 가 들고, 여기서는 payload 를 좁혀 넘기는
 * 일만 한다.
 *
 * 문안은 알고리즘이 **키로만** 보낸다. 그 키를 화면 글자로 바꾸는 것이 여기의
 * 일이고, en 원본은 호출부에 리터럴로 둔다 (C10 — 추출기가 리터럴만 읽는다).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator, type Translate } from '@ffacet/core/runtime';

/** stage view 의 호출 표면. 구체형은 여기 한 곳에 모은다 (C9). */
type ForestStage = {
  setGrown?(index: number, leaves: number, distinct: number, outOfBag: number): void;
  setField?(votesA: number[], size: number, splitCells: number, correct: number): void;
  setTally?(votesA: number, votesB: number, size: number): void;
  setWalk?(tree: number, x0: number, x1: number, y0: number, y1: number): void;
  setLeaf?(tree: number, x0: number, x1: number, y0: number, y1: number, label: number): void;
  setVerdict?(label: number | null, votesA: number, votesB: number, size: number): void;
  setCaption?(text: string): void;
  resetScene?(): void;
};

/** code-view 의 호출 표면. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
};

type Num = number | undefined;

function num(v: unknown): Num {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 알고리즘이 보낸 문안 키를 화면 글자로 바꾼다. en 원본은 여기 리터럴로 둔다. */
function captionText(
  tr: Translate,
  key: string,
  vars: Record<string, string | number>,
): string | null {
  switch (key) {
    case 'caption.start':
      return tr('caption.start', 'Growing {total} trees, one at a time.', vars);
    case 'caption.grown':
      return tr(
        'caption.grown',
        'Tree {t} of {total} — {leaves} leaves, right on {correct} of {points} training points.',
        vars,
      );
    case 'caption.slide':
      return tr(
        'caption.slide',
        'Now drag the forest size. At 1 the plane is one flat colour; the band appears only once trees disagree.',
        vars,
      );
    case 'caption.oneTree':
      return tr(
        'caption.oneTree',
        'One tree — sure everywhere. Split cells: {split} of {cells}. Right on {correct} of {points}.',
        vars,
      );
    case 'caption.size':
      return tr(
        'caption.size',
        'Forest of {n} — split cells: {split} of {cells}. Right on {correct} of {points}.',
        vars,
      );
    default:
      // 알 수 없는 키는 화면에 키를 노출하느니 그대로 흘린다.
      return null;
  }
}

export const randomForestProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as ForestStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          panel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }
        case 'tree-grown': {
          const p = event.payload as
            | { index?: unknown; leaves?: unknown; distinct?: unknown; outOfBag?: unknown }
            | undefined;
          const index = num(p?.index);
          if (index === undefined) return;
          stage?.setGrown?.(index, num(p?.leaves) ?? 0, num(p?.distinct) ?? 0, num(p?.outOfBag) ?? 0);
          return;
        }
        case 'field-changed': {
          const p = event.payload as
            | { votesA?: unknown; size?: unknown; splitCells?: unknown; correct?: unknown }
            | undefined;
          if (!Array.isArray(p?.votesA)) return;
          const votes = p.votesA.filter((v): v is number => typeof v === 'number');
          if (votes.length !== p.votesA.length) return;
          stage?.setField?.(votes, num(p?.size) ?? 0, num(p?.splitCells) ?? 0, num(p?.correct) ?? 0);
          return;
        }
        case 'tally-reset': {
          const p = event.payload as { size?: unknown } | undefined;
          stage?.setTally?.(0, 0, num(p?.size) ?? 0);
          stage?.setVerdict?.(null, 0, 0, num(p?.size) ?? 0);
          stage?.setLeaf?.(-1, 0, 0, 0, 0, -1);
          return;
        }
        case 'walk-begin':
        case 'walk-narrow': {
          const p = event.payload as
            | { tree?: unknown; x0?: unknown; x1?: unknown; y0?: unknown; y1?: unknown }
            | undefined;
          const tree = num(p?.tree);
          const x0 = num(p?.x0);
          const x1 = num(p?.x1);
          const y0 = num(p?.y0);
          const y1 = num(p?.y1);
          if (tree === undefined || x0 === undefined || x1 === undefined) return;
          if (y0 === undefined || y1 === undefined) return;
          if (event.type === 'walk-begin') stage?.setLeaf?.(-1, 0, 0, 0, 0, -1);
          stage?.setWalk?.(tree, x0, x1, y0, y1);
          return;
        }
        case 'walk-leaf': {
          const p = event.payload as
            | {
                tree?: unknown;
                x0?: unknown;
                x1?: unknown;
                y0?: unknown;
                y1?: unknown;
                label?: unknown;
                votesA?: unknown;
                votesB?: unknown;
              }
            | undefined;
          const tree = num(p?.tree);
          const x0 = num(p?.x0);
          const x1 = num(p?.x1);
          const y0 = num(p?.y0);
          const y1 = num(p?.y1);
          const label = num(p?.label);
          if (tree === undefined || label === undefined) return;
          if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) return;
          stage?.setLeaf?.(tree, x0, x1, y0, y1, label);
          const a = num(p?.votesA) ?? 0;
          const b = num(p?.votesB) ?? 0;
          stage?.setTally?.(a, b, a + b);
          return;
        }
        case 'vote-result': {
          const p = event.payload as
            | { label?: unknown; votesA?: unknown; votesB?: unknown; size?: unknown }
            | undefined;
          const label = num(p?.label);
          if (label === undefined) return;
          stage?.setWalk?.(-1, 0, 0, 0, 0);
          stage?.setVerdict?.(label, num(p?.votesA) ?? 0, num(p?.votesB) ?? 0, num(p?.size) ?? 0);
          return;
        }
        case 'caption': {
          const p = event.payload as { textKey?: unknown; vars?: unknown } | undefined;
          if (typeof p?.textKey !== 'string') return;
          // vars 는 알고리즘이 보낸 것이라 값 하나하나를 거른다 — 문안에 끼워
          // 넣을 수 있는 것은 수와 글자뿐이다.
          const vars: Record<string, string | number> = {};
          if (typeof p.vars === 'object' && p.vars !== null) {
            for (const [k, v] of Object.entries(p.vars as Record<string, unknown>)) {
              if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
            }
          }
          const text = captionText(tr, p.textKey, vars);
          if (text !== null) stage?.setCaption?.(text);
          return;
        }
        default:
          // 그 밖의 어휘는 이 facet 이 쓰지 않는다. 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      panel?.highlightPhase?.(null);
      stage?.resetScene?.();
    },
  };
};
