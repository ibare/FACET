/**
 * 경로 압축 Projector — algorithm.ts 의 리터럴 이벤트를 stage 메서드 호출로 번역한다.
 *
 * 캡션 문안은 여기서 `runtime.t` 로 해석해 완성 문자열을 stage 에 넘긴다.
 * stage 는 문안을 모르고 받은 문자열을 그릴 뿐이다 (C10 · 원칙 5).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ViewInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type StageInit = { parent: number[]; query: number };

type Stage = ViewInstance & {
  init(data: StageInit): void;
  beginQuery(node: number, caption: string): void;
  climb(from: number, to: number, caption: string): void | Promise<void>;
  rootFound(
    root: number,
    queriedNode: number,
    hops: number,
    hopsBefore: number | undefined,
    caption: string,
  ): void;
  compress(root: number, nodes: number[], caption: string): void | Promise<void>;
  done(totalBefore: number, totalAfter: number, caption: string): void;
  rewind(caption: string): void;
};

function asStage(views: ProjectorViews): Stage | undefined {
  const v = views.stage;
  if (!v) return undefined;
  return v as unknown as Stage;
}

export const pathCompressionProjector: ProjectorFactory = (views, runtime) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = asStage(views);

  const instance: ProjectorInstance = {
    onInit(initialData) {
      if (!stage) return;
      const d = initialData as Partial<StageInit> | undefined;
      const parent = Array.isArray(d?.parent) ? (d?.parent as number[]) : [];
      const query = typeof d?.query === 'number' ? d.query : 0;
      stage.init({ parent, query });
    },

    onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'query-begin': {
          const p = event.payload as { node?: number } | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const caption = tr('caption.queryBegin', 'Ask where {node} leads, all the way to the root', {
            node,
          });
          stage.beginQuery(node, caption);
          return;
        }
        case 'climb': {
          const p = event.payload as { from?: number; to?: number } | undefined;
          const from = typeof p?.from === 'number' ? p.from : 0;
          const to = typeof p?.to === 'number' ? p.to : 0;
          const caption = tr('caption.climb', '{from} points up to {to}', { from, to });
          return stage.climb(from, to, caption) as void | Promise<void>;
        }
        case 'root-found': {
          const p = event.payload as
            | { root?: number; queriedNode?: number; hops?: number; hopsBefore?: number }
            | undefined;
          const root = typeof p?.root === 'number' ? p.root : 0;
          const queriedNode = typeof p?.queriedNode === 'number' ? p.queriedNode : 0;
          const hops = typeof p?.hops === 'number' ? p.hops : 0;
          const hopsBefore = typeof p?.hopsBefore === 'number' ? p.hopsBefore : undefined;
          const caption =
            hopsBefore === undefined
              ? tr('caption.rootFirst', '{node} reached root {root} after {hops} hops', {
                  node: queriedNode,
                  root,
                  hops,
                })
              : tr(
                  'caption.rootAfter',
                  '{node} now reaches {root} in {hops} hop — it used to take {hopsBefore}',
                  { node: queriedNode, root, hops, hopsBefore },
                );
          stage.rootFound(root, queriedNode, hops, hopsBefore, caption);
          return;
        }
        case 'compress': {
          const p = event.payload as { root?: number; nodes?: unknown } | undefined;
          const root = typeof p?.root === 'number' ? p.root : 0;
          const nodes = Array.isArray(p?.nodes) ? (p?.nodes as unknown[]).filter((x): x is number => typeof x === 'number') : [];
          const caption = tr(
            'caption.compress',
            'Compressing — every node on the path now points straight to {root}',
            { root },
          );
          return stage.compress(root, nodes, caption) as void | Promise<void>;
        }
        case 'done': {
          const p = event.payload as { totalBefore?: number; totalAfter?: number } | undefined;
          const totalBefore = typeof p?.totalBefore === 'number' ? p.totalBefore : 0;
          const totalAfter = typeof p?.totalAfter === 'number' ? p.totalAfter : 0;
          const caption = tr('caption.summary', '{before} hops become {after}', {
            before: totalBefore,
            after: totalAfter,
          });
          stage.done(totalBefore, totalAfter, caption);
          return;
        }
        case 'rewind': {
          const caption = tr('caption.rewind', 'Replaying from the start', {});
          stage.rewind(caption);
          return;
        }
        default:
          // 다른 이벤트는 이 facet 에서 발신하지 않는다 — 조용히 무시.
          return;
      }
    },
  };

  return instance;
};
