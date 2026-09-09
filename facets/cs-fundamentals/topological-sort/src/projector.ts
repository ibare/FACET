/**
 * 위상 정렬 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 이 facet 이 그리는 문안은 전부 여기서 조회한다 (C10). algorithm 은 수와
 * 식별자만 보내고, "무엇이라 말하는가" 는 표현 계층의 일이다.
 *
 * 화살에 색을 되돌릴 때 두 갈래가 있어 지금 phase 를 기억한다 — 화살을 세는
 * 동안에는 원래 색으로 돌아가고, 하나를 꺼낸 뒤 줄이는 동안에는 "다 쓴 화살"
 * 로 흐려진다. 그것이 이 알고리즘에서 화살이 한 번만 쓰인다는 사실이다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { TopologicalSortEdgeState, TopologicalSortNodeState } from './topological-sort-stage.js';

/** stage view 의 구조적 계약 (C9). 없는 메서드는 조용히 건너뛴다. */
type TopologicalSortStage = {
  setGraph?(data: unknown): void;
  setIndegree?(vertex: number, value: number): void;
  setNodeState?(vertex: number, state: TopologicalSortNodeState): void;
  setEdgeState?(from: number, to: number, state: TopologicalSortEdgeState): void;
  enqueueVertex?(vertex: number, tail: number): void;
  dequeueVertex?(vertex: number, head: number): void;
  placeInOrder?(vertex: number, slot: number): void;
  setCaption?(text: string): void;
  setTally?(text: string, tone: 'neutral' | 'good' | 'bad'): void;
};

type EdgePayload = { from?: unknown; to?: unknown };
type IndegreePayload = { vertex?: unknown; value?: unknown; delta?: unknown };
type QueuePayload = { vertex?: unknown; tail?: unknown; head?: unknown; slot?: unknown };
type PhasePayload = { phase?: unknown };
type DonePayload = { taken?: unknown; total?: unknown; cyclic?: unknown; order?: unknown };

const num = (x: unknown): number | undefined => (typeof x === 'number' ? x : undefined);

export const topologicalSortProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as TopologicalSortStage | undefined;
  /**
   * `phase` 는 `silent: true` 로 온다. 그 뜻은 **걸음의 경계가 아니다** 이지
   * projector 에 오지 않는다는 것이 아니다 — mechanism 은 projector 갱신을 마친
   * 뒤에야 silent 를 보고 후처리를 건너뛴다. 코드 패널의 줄은 이 이벤트로만
   * 짚힌다 (C3).
   */
  const codePanel = views.codePanel as unknown as
    | { highlightPhase?(p: string | null): void; clearHighlight?(): void }
    | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let total = 0;
  let phase = '';
  /** 방금 꺼낸 정점 — 화살을 줄일 때 "누가 빠져서" 인지 말하려면 필요하다. */
  let popped: number | undefined;
  let placed = 0;

  const tally = (taken: number, tone: 'neutral' | 'good' | 'bad'): void => {
    stage?.setTally?.(
      tr('label.tally', 'out {taken} / {total}', { taken, total }),
      tone,
    );
  };

  const say = (key: string, source: string, vars?: Record<string, string | number>): void => {
    stage?.setCaption?.(tr(key, source, vars));
  };

  const start = (initialData: unknown): void => {
    const d = initialData as { vertexCount?: unknown } | undefined;
    total = num(d?.vertexCount) ?? 0;
    phase = '';
    popped = undefined;
    placed = 0;
    stage?.setGraph?.(initialData);
    tally(0, 'neutral');
    say('caption.start', 'Nothing has come out yet. First, count the arrows.');
  };

  return {
    onInit(initialData: unknown): void {
      start(initialData);
    },

    onReset(): void {
      // 러너가 onInit 을 다시 부르지 않는 경로를 위해 셈만 되돌린다.
      phase = '';
      popped = undefined;
      placed = 0;
      tally(0, 'neutral');
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as PhasePayload | undefined;
          if (typeof p?.phase !== 'string') return;
          phase = p.phase;
          codePanel?.highlightPhase?.(phase);
          if (phase === 'count-indegree') {
            say('caption.count', 'Count how many arrows come into each vertex.');
          } else if (phase === 'seed-queue') {
            say('caption.seed', 'Whatever has no incoming arrow can go first.');
          } else if (phase === 'cycle-check') {
            say('caption.cycleCheck', 'Compare what came out against the number of vertices.');
          }
          return;
        }

        case 'highlight': {
          const p = event.payload as EdgePayload | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          if (from === undefined || to === undefined) return;
          stage?.setEdgeState?.(from, to, 'active');
          return;
        }

        case 'unhighlight': {
          const p = event.payload as EdgePayload | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          if (from === undefined || to === undefined) return;
          // 세는 동안에는 되돌리고, 줄이는 동안에는 다 쓴 화살로 남긴다.
          stage?.setEdgeState?.(from, to, phase === 'relax' ? 'spent' : 'idle');
          return;
        }

        case 'indegree-changed': {
          const p = event.payload as IndegreePayload | undefined;
          const vertex = num(p?.vertex);
          const value = num(p?.value);
          const delta = num(p?.delta);
          if (vertex === undefined || value === undefined) return;
          stage?.setIndegree?.(vertex, value);
          if (value === 0) stage?.setNodeState?.(vertex, 'ready');
          if (delta !== undefined && delta < 0) {
            say('caption.relax', '{u} is gone, so {v} now has {value} arrows left.', {
              u: popped ?? vertex,
              v: vertex,
              value,
            });
          } else {
            say('caption.countEdge', 'One more arrow reaches {v} — the count is now {value}.', {
              v: vertex,
              value,
            });
          }
          return;
        }

        case 'enqueue': {
          const p = event.payload as QueuePayload | undefined;
          const vertex = num(p?.vertex);
          const tail = num(p?.tail);
          if (vertex === undefined || tail === undefined) return;
          stage?.enqueueVertex?.(vertex, tail);
          stage?.setNodeState?.(vertex, 'gone');
          say('caption.enqueue', 'Nothing points at {v} any more — it drops into the queue.', {
            v: vertex,
          });
          return;
        }

        case 'dequeue': {
          const p = event.payload as QueuePayload | undefined;
          const vertex = num(p?.vertex);
          const head = num(p?.head);
          if (vertex === undefined || head === undefined) return;
          popped = vertex;
          stage?.dequeueVertex?.(vertex, head);
          say('caption.pop', 'Take {v} from the head of the queue.', { v: vertex });
          return;
        }

        case 'append': {
          const p = event.payload as QueuePayload | undefined;
          const vertex = num(p?.vertex);
          const slot = num(p?.slot);
          if (vertex === undefined || slot === undefined) return;
          stage?.placeInOrder?.(vertex, slot);
          placed = slot + 1;
          tally(placed, 'neutral');
          say('caption.emitOrder', 'Write {v} into the order at place {slot}.', {
            v: vertex,
            slot,
          });
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const taken = num(p?.taken) ?? placed;
          const cyclic = p?.cyclic === true;
          const order = Array.isArray(p?.order) ? p.order.filter((x) => typeof x === 'number') : [];
          tally(taken, cyclic ? 'bad' : 'good');
          if (cyclic) {
            say('caption.doneCycle', 'Only {taken} of {total} came out — the rest hold each other back.', {
              taken,
              total,
            });
          } else {
            say('caption.doneOk', 'All {total} came out. The order is {order}.', {
              total,
              order: order.join(' · '),
            });
          }
          return;
        }

        default:
          // 이 algorithm 은 위 어휘 밖의 이벤트를 보내지 않는다. 다른 어휘가
          // 들어오면 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
