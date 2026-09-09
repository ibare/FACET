/**
 * dfs Projector — algorithm 이벤트를 stage 메서드와 코드 패널 하이라이트로 옮긴다.
 *
 * ── 돌아오는 순간에 코드 패널이 무엇을 짚는가
 *
 * 이 완제품에서 판단이 필요했던 자리다. 파고드는 걸음은 코드에 줄이 있다
 * (`dfs(adj, visited, nb)`). 물러나는 걸음은 원래 없다 — void 함수는 본문이 끝날
 * 뿐이라 소스에 아무 줄도 남기지 않는다. 그런데 화면에서는 프레임이 빠지고
 * 정점이 굳는 뚜렷한 사건이다.
 *
 * 아무 줄도 짚지 않는 길을 고르지 않았다. 재생 중 가장 극적인 순간에 코드 패널만
 * 꺼져 있으면 "코드의 어디에서 일어난 일인가" 라는 물음에 화면이 답을 못 한다.
 * 대신 `irs.ts` 가 함수 끝에 `return` 한 줄을 명시로 두었고 (그 판단의 근거는
 * 거기 머리말에 있다), 이 projector 는 `ascend` 앞에 온 `phase('ascend')` 를 그
 * 줄로 넘긴다. 즉 **물러남에도 짚을 줄이 있다** — 없어도 도는 줄이지만 그 줄이
 * 가리키는 뜻은 정확히 "이 부름이 끝나고 부른 쪽으로 돌아간다" 이다.
 *
 * ── shadow copy
 *
 * 이웃 수는 `mark` payload 에 없고 `initialData` 에 있다. 데이터 원본은 algorithm
 * 이고 projector 는 필요한 만큼만 베껴 둔다 (원칙 5).
 */

import type {
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  FacetRuntimeEvent,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드 (C9 — 오픈 타입을 한 곳에서만 좁힌다). */
type DfsStage = {
  setGraph?(adjacency: number[][], start: number): void;
  pushFrame?(node: number, seq: number, neighborCount: number): void;
  setFrameCursor?(index: number, total: number): void;
  popFrame?(node: number): void;
  setActiveEdge?(from: number, to: number, kind: 'look' | 'dive' | 'back'): void;
  clearActiveEdge?(): void;
  settleEdge?(from: number, to: number, kind: 'tree' | 'skip'): void;
  setCaption?(value: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

const isNum = (v: unknown): v is number => typeof v === 'number';

export const dfsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DfsStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** algorithm 의 ctx.data 를 필요한 만큼만 베낀 것. */
  let adjacency: number[][] = [];

  const caption = (value: string): void => stage?.setCaption?.(value);

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { adjacency?: unknown; start?: unknown } | undefined;
      adjacency = Array.isArray(d?.adjacency)
        ? (d.adjacency as unknown[]).map((row) =>
            Array.isArray(row) ? row.filter(isNum) : [],
          )
        : [];
      stage?.setGraph?.(adjacency, isNum(d?.start) ? d.start : 0);
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') codePanel?.highlightPhase?.(p.phase);
          return;
        }

        case 'mark': {
          const p = event.payload as
            | { node?: unknown; parent?: unknown; depth?: unknown; seq?: unknown }
            | undefined;
          if (!isNum(p?.node) || !isNum(p.seq)) return;
          const node = p.node;
          stage?.clearActiveEdge?.();
          stage?.pushFrame?.(node, p.seq, (adjacency[node] ?? []).length);
          if (p.parent === null) {
            caption(tr('caption.start', 'Start at {node}. Follow one branch as far as it goes.', { node }));
          } else if (isNum(p.depth)) {
            caption(tr('caption.mark', 'Enter {node} and mark it seen. Stack depth {depth}.', { node, depth: p.depth }));
          }
          return;
        }

        case 'scan': {
          const p = event.payload as
            | { node?: unknown; index?: unknown; total?: unknown; neighbor?: unknown }
            | undefined;
          if (!isNum(p?.node) || !isNum(p.index) || !isNum(p.total) || !isNum(p.neighbor)) return;
          stage?.setFrameCursor?.(p.index, p.total);
          stage?.setActiveEdge?.(p.node, p.neighbor, 'look');
          caption(
            tr('caption.scan', 'Neighbors of {node} — {i} of {total} is {neighbor}.', {
              node: p.node,
              i: p.index + 1,
              total: p.total,
              neighbor: p.neighbor,
            }),
          );
          return;
        }

        case 'edge-open': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (!isNum(p?.from) || !isNum(p.to)) return;
          stage?.setActiveEdge?.(p.from, p.to, 'look');
          caption(tr('caption.open', '{neighbor} is not seen yet. Dive in.', { neighbor: p.to }));
          return;
        }

        case 'edge-skipped': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (!isNum(p?.from) || !isNum(p.to)) return;
          stage?.settleEdge?.(p.from, p.to, 'skip');
          stage?.setActiveEdge?.(p.from, p.to, 'look');
          caption(tr('caption.skip', '{neighbor} is already seen. Do not go in.', { neighbor: p.to }));
          return;
        }

        case 'descend': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          if (!isNum(p?.from) || !isNum(p.to)) return;
          stage?.settleEdge?.(p.from, p.to, 'tree');
          stage?.setActiveEdge?.(p.from, p.to, 'dive');
          caption(
            tr('caption.descend', 'Dive from {from} into {to}. One more frame on the stack.', {
              from: p.from,
              to: p.to,
            }),
          );
          return;
        }

        case 'ascend': {
          const p = event.payload as { node?: unknown; parent?: unknown } | undefined;
          if (!isNum(p?.node)) return;
          stage?.popFrame?.(p.node);
          if (isNum(p.parent)) {
            stage?.setActiveEdge?.(p.parent, p.node, 'back');
            caption(
              tr('caption.ascend', 'No neighbors left at {node}. Come back out to {parent}.', {
                node: p.node,
                parent: p.parent,
              }),
            );
          } else {
            stage?.clearActiveEdge?.();
            caption(
              tr('caption.ascendRoot', 'No neighbors left at {node}. The first call returns and the walk ends.', {
                node: p.node,
              }),
            );
          }
          return;
        }

        case 'done': {
          const p = event.payload as
            | { count?: unknown; depth?: unknown; skipped?: unknown }
            | undefined;
          stage?.clearActiveEdge?.();
          codePanel?.clearHighlight?.();
          if (isNum(p?.count) && isNum(p.depth) && isNum(p.skipped)) {
            caption(
              tr('caption.done', 'All {count} vertices seen. Deepest stack {depth}. Edges refused {skipped}.', {
                count: p.count,
                depth: p.depth,
                skipped: p.skipped,
              }),
            );
          }
          return;
        }

        default:
          // 위에 없는 type 은 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
