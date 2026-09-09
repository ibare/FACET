/**
 * 분기 한정 Projector — 알고리즘 이벤트를 stage(branch-and-bound-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

type BranchNodeState = 'open' | 'current' | 'best' | 'overflow' | 'cut' | 'closed';

type BranchAndBoundStage = {
  setItems(values: number[], weights: number[], labels: number[], capacity: number): void;
  setCaption(text: string): void;
  setFocusItem(index: number | null): void;
  setBest(value: number, nodeId: string | null): void;
  addNode(node: {
    id: string;
    parentId: string | null;
    depth: number;
    taken: boolean | null;
    w: number;
    v: number;
  }): void;
  setNodeState(id: string, state: BranchNodeState): void;
  beginBound(base: number): void;
  addBoundPart(kind: 'full' | 'frac', amount: number, total: number): void;
  endBound(value: number): void;
  setVerdict(verdict: 'keep' | 'cut' | null): void;
  clearBound(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** 화면에 뜨는 수는 표식이다 — 정수면 정수로, 아니면 소수 한 자리로 (C10). */
const fmt = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** `node:<id>` 만 쓴다. 식별자 파싱은 parseTarget 경유 (C1). */
const nodeIdOf = (target: string | string[] | undefined): string | undefined => {
  const first = Array.isArray(target) ? target[0] : target;
  if (typeof first !== 'string') return undefined;
  const parsed = parseTarget(first);
  return parsed?.prefix === 'node' && parsed.id !== '' ? parsed.id : undefined;
};

export const branchAndBoundProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BranchAndBoundStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 물건 이름(원래 번호)을 문안에 넣어야 해서 그림자로 들고 있는다. */
  let labels: number[] = [];

  const itemAt = (k: number): number => labels[k] ?? k + 1;

  return {
    onInit(initialData) {
      const data = initialData as
        | { values?: number[]; weights?: number[]; capacity?: number; labels?: number[] }
        | undefined;
      const values = Array.isArray(data?.values) ? data.values : [];
      const weights = Array.isArray(data?.weights) ? data.weights : [];
      labels = Array.isArray(data?.labels) ? [...data.labels] : [];
      const capacity = num(data?.capacity) ?? 0;
      stage?.setItems(values, weights, labels, capacity);
      stage?.setCaption(
        tr(
          'caption.start',
          'Items are sorted by value per weight. Branch, measure a limit, cut what cannot win.',
        ),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'branch-enter': {
          const p = event.payload as
            | {
                id?: string;
                parentId?: string | null;
                depth?: number;
                taken?: boolean | null;
                w?: number;
                v?: number;
              }
            | undefined;
          const id = nodeIdOf(event.target) ?? (typeof p?.id === 'string' ? p.id : undefined);
          const depth = num(p?.depth);
          const w = num(p?.w);
          const v = num(p?.v);
          if (id === undefined || depth === undefined || w === undefined || v === undefined) break;
          const parentId = typeof p?.parentId === 'string' ? p.parentId : null;
          const taken = typeof p?.taken === 'boolean' ? p.taken : null;
          stage?.addNode({ id, parentId, depth, taken, w, v });
          stage?.clearBound();
          stage?.setFocusItem(depth);
          if (taken === null) {
            stage?.setCaption(
              tr('caption.enterRoot', 'Start with an empty bag — nothing packed yet.'),
            );
          } else if (taken) {
            stage?.setCaption(
              tr('caption.enterTake', 'Packed item #{item}: value {v}, weight {w}.', {
                item: itemAt(depth - 1),
                v,
                w,
              }),
            );
          } else {
            stage?.setCaption(
              tr('caption.enterSkip', 'Left item #{item} behind: value {v}, weight {w}.', {
                item: itemAt(depth - 1),
                v,
                w,
              }),
            );
          }
          break;
        }

        case 'weight-overflow': {
          const p = event.payload as { w?: number; capacity?: number } | undefined;
          const id = nodeIdOf(event.target);
          const w = num(p?.w);
          const capacity = num(p?.capacity);
          if (id !== undefined) stage?.setNodeState(id, 'overflow');
          if (w !== undefined && capacity !== undefined) {
            stage?.setCaption(
              tr('caption.overflow', 'Weight {w} is over the limit {cap} — turn back.', {
                w,
                cap: capacity,
              }),
            );
          }
          break;
        }

        case 'best-updated': {
          const p = event.payload as { best?: number; prevBest?: number } | undefined;
          const id = nodeIdOf(event.target) ?? null;
          const best = num(p?.best);
          const prevBest = num(p?.prevBest);
          if (best === undefined) break;
          stage?.setBest(best, id);
          stage?.setCaption(
            tr('caption.newBest', 'Value {best} beats {prev} — this is the new best.', {
              best,
              prev: prevBest ?? 0,
            }),
          );
          break;
        }

        case 'items-exhausted': {
          const p = event.payload as { v?: number } | undefined;
          const id = nodeIdOf(event.target);
          const v = num(p?.v);
          if (id !== undefined) stage?.setNodeState(id, 'closed');
          if (v !== undefined) {
            stage?.setCaption(
              tr('caption.exhausted', 'No item left — this branch ends at {v}.', { v }),
            );
          }
          break;
        }

        case 'bound-begin': {
          const p = event.payload as { from?: number; room?: number; total?: number } | undefined;
          const from = num(p?.from);
          const room = num(p?.room);
          const total = num(p?.total);
          if (total === undefined) break;
          stage?.beginBound(total);
          if (from !== undefined) stage?.setFocusItem(from);
          if (room !== undefined) {
            stage?.setCaption(
              tr('caption.boundBegin', 'Measure the limit: {v} packed, room {room} left.', {
                v: total,
                room,
              }),
            );
          }
          break;
        }

        case 'bound-add': {
          const p = event.payload as
            | { k?: number; value?: number; total?: number; room?: number }
            | undefined;
          const k = num(p?.k);
          const value = num(p?.value);
          const total = num(p?.total);
          const room = num(p?.room);
          if (value === undefined || total === undefined) break;
          if (k !== undefined) stage?.setFocusItem(k);
          stage?.addBoundPart('full', value, total);
          stage?.setCaption(
            tr('caption.boundFit', 'Item #{item} fits whole — add {value}, room {room} left.', {
              item: itemAt(k ?? 0),
              value,
              room: room ?? 0,
            }),
          );
          break;
        }

        case 'bound-fraction': {
          const p = event.payload as
            | {
                k?: number;
                value?: number;
                weight?: number;
                room?: number;
                part?: number;
                total?: number;
              }
            | undefined;
          const k = num(p?.k);
          const weight = num(p?.weight);
          const room = num(p?.room);
          const part = num(p?.part);
          const total = num(p?.total);
          if (part === undefined || total === undefined) break;
          if (k !== undefined) stage?.setFocusItem(k);
          stage?.addBoundPart('frac', part, total);
          stage?.setCaption(
            tr(
              'caption.boundSplit',
              'Item #{item} will not fit — take {room} of its {weight} as a slice: +{part}.',
              {
                item: itemAt(k ?? 0),
                room: room ?? 0,
                weight: weight ?? 0,
                part: fmt(part),
              },
            ),
          );
          break;
        }

        case 'bound-end': {
          const bound = num((event.payload as { bound?: number } | undefined)?.bound);
          if (bound === undefined) break;
          stage?.endBound(bound);
          stage?.setCaption(
            tr('caption.boundEnd', 'At best this branch reaches {bound}.', { bound: fmt(bound) }),
          );
          break;
        }

        case 'branch-cut': {
          const p = event.payload as { bound?: number; best?: number } | undefined;
          const id = nodeIdOf(event.target);
          const bound = num(p?.bound);
          const best = num(p?.best);
          stage?.setVerdict('cut');
          if (id !== undefined) stage?.setNodeState(id, 'cut');
          if (bound !== undefined && best !== undefined) {
            stage?.setCaption(
              tr('caption.cut', '{bound} cannot beat {best} — cut the whole branch.', {
                bound: fmt(bound),
                best,
              }),
            );
          }
          break;
        }

        case 'branch-keep': {
          const p = event.payload as { bound?: number; best?: number } | undefined;
          const bound = num(p?.bound);
          const best = num(p?.best);
          stage?.setVerdict('keep');
          if (bound !== undefined && best !== undefined) {
            stage?.setCaption(
              tr('caption.keep', '{bound} beats {best} — this branch is worth opening.', {
                bound: fmt(bound),
                best,
              }),
            );
          }
          break;
        }

        case 'branch-return': {
          const best = num((event.payload as { best?: number } | undefined)?.best);
          const id = nodeIdOf(event.target);
          if (id !== undefined) stage?.setNodeState(id, 'closed');
          stage?.clearBound();
          if (best !== undefined) {
            stage?.setCaption(
              tr('caption.returnBest', 'Both sides done — the best from here is {best}.', { best }),
            );
          }
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as
            | { best?: number; visits?: number; subsets?: number }
            | undefined;
          const best = num(p?.best);
          const visits = num(p?.visits);
          const subsets = num(p?.subsets);
          codePanel?.clearHighlight();
          stage?.clearBound();
          stage?.setFocusItem(null);
          if (best !== undefined && visits !== undefined && subsets !== undefined) {
            stage?.setCaption(
              tr(
                'caption.done',
                'Best {best}, reached by opening {visits} branches out of {subsets} possible packings.',
                { best, visits, subsets },
              ),
            );
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      labels = [];
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
