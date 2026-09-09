/**
 * separateComponents Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다 (C9). stage 는 필수 필드만 있는 정형 객체를 받고
 * `event.payload` 를 그대로 보지 않는다.
 *
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 있고 문안은 `facet.ts` 의 messages 에
 * 있다 (C10). 어느 키를 띄울지 정하는 것은 표현 계층의 일이라 여기서 판단한다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type ComponentStage = {
  setGraph(graph: { nodes: string[]; edges: { a: string; b: string }[] }): void;
  reset(): void;
  setCaption(text: string): void;
  seed(step: { node: string; round: number; component: number }): Promise<void>;
  spread(step: { from: string; to: string; component: number }): Promise<void>;
  sweepEnd(): Promise<void>;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const separateComponentsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ComponentStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { nodes?: unknown; edges?: unknown } | undefined;
      const rawNodes = data?.nodes;
      const nodes = Array.isArray(rawNodes)
        ? rawNodes.filter((v): v is string => typeof v === 'string')
        : [];
      const edges: { a: string; b: string }[] = [];
      const rawEdges = data?.edges;
      if (Array.isArray(rawEdges)) {
        for (const raw of rawEdges) {
          if (!Array.isArray(raw)) continue;
          const a = readString(raw[0]);
          const b = readString(raw[1]);
          if (a && b) edges.push({ a, b });
        }
      }
      stage?.setGraph({ nodes, edges });
      // 처음 화면은 아무 말도 하지 않는다. 그림을 설명하는 상시 캡션을 두지 않는다.
      stage?.setCaption('');
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'seed': {
          const p = event.payload as
            | { node?: unknown; round?: unknown; component?: unknown }
            | undefined;
          const node = readString(p?.node);
          if (!node) return;
          const round = readNumber(p?.round, 1);
          const component = readNumber(p?.component, 0);
          stage?.setCaption(
            round <= 1
              ? tr('caption.start', 'The search starts at {node} and lights up whatever it reaches.', { node })
              : tr('caption.restart', 'It cannot cross over — only a fresh start reaches what is left.'),
          );
          await stage?.seed({ node, round, component });
          return;
        }

        case 'spread': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; component?: unknown }
            | undefined;
          const from = readString(p?.from);
          const to = readString(p?.to);
          if (!from || !to) return;
          await stage?.spread({ from, to, component: readNumber(p?.component, 0) });
          return;
        }

        case 'sweep-end': {
          const p = event.payload as { lit?: unknown; remaining?: unknown } | undefined;
          const remaining = readNumber(p?.remaining, 0);
          const lit = readNumber(p?.lit, 0);
          // 남은 것이 있을 때만 말한다. 그것이 이 조각의 주장이다.
          if (remaining > 0) {
            stage?.setCaption(
              tr('caption.remains', 'The search is over — {lit} lit, and {remaining} stay dark.', {
                lit,
                remaining,
              }),
            );
          }
          await stage?.sweepEnd();
          return;
        }

        case 'done': {
          const p = event.payload as { starts?: unknown; sizes?: unknown } | undefined;
          const starts = readNumber(p?.starts, 0);
          const rawSizes = p?.sizes;
          const sizes = Array.isArray(rawSizes)
            ? rawSizes.filter((v): v is number => typeof v === 'number')
            : [];
          stage?.setCaption(
            tr('caption.done', '{starts} starts were needed — {starts} separate groups, sized {sizes}.', {
              starts,
              sizes: sizes.join(' · '),
            }),
          );
          return;
        }

        case 'rewind': {
          stage?.reset();
          stage?.setCaption('');
          return;
        }

        default:
          // 이 facet 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.reset();
      stage?.setCaption('');
    },
  };
};
