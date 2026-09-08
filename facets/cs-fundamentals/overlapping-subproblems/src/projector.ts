/**
 * overlappingSubproblems Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 `typeof` / `Array.isArray` 가드로 정형 객체를
 * 조립해 넘기고, stage 는 필수 필드 타입으로 받는다 (C9). 캡션 문안은 키로만
 * 들고 있고 실제 문장은 `FacetJson.messages` 에서 온다 (C10).
 */

import { makeTranslator, parseTarget } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

type PlanNode = { id: string; n: number; depth: number; parentId: string | null };
type SproutNode = { id: string; n: number; ordinal: number; repeat: boolean };
type CallSummary = {
  calls: number;
  distinct: number;
  worstN: number;
  worstCount: number;
  value: number;
};

type Stage = {
  plan?: (nodes: PlanNode[]) => void;
  sprout?: (node: SproutNode) => void;
  rewind?: () => void;
  finish?: (summary: CallSummary) => void;
  setCaption?: (text: string) => void;
};

function toPlanNodes(payload: unknown): PlanNode[] {
  const p = payload as { nodes?: unknown } | undefined;
  if (!Array.isArray(p?.nodes)) return [];
  const out: PlanNode[] = [];
  for (const raw of p.nodes) {
    const nd = raw as { id?: unknown; n?: unknown; depth?: unknown; parentId?: unknown };
    if (typeof nd?.id !== 'string') continue;
    if (typeof nd.n !== 'number' || typeof nd.depth !== 'number') continue;
    const parentId = typeof nd.parentId === 'string' ? nd.parentId : null;
    out.push({ id: nd.id, n: nd.n, depth: nd.depth, parentId });
  }
  return out;
}

/**
 * `sprout` payload 를 좁힌다. id 는 payload 를 정본으로 삼되, 없으면 target 의
 * `node:<id>` 에서 읽는다 (식별자 파싱은 parseTarget 경유, C1).
 */
function toSproutNode(event: FacetRuntimeEvent): SproutNode | null {
  const p = event.payload as
    | { id?: unknown; n?: unknown; ordinal?: unknown; repeat?: unknown }
    | undefined;
  let id = typeof p?.id === 'string' ? p.id : '';
  if (!id && typeof event.target === 'string') {
    const parsed = parseTarget(event.target);
    if (parsed?.prefix === 'node') id = parsed.id;
  }
  if (!id) return null;
  if (typeof p?.n !== 'number' || typeof p.ordinal !== 'number') return null;
  return { id, n: p.n, ordinal: p.ordinal, repeat: p.repeat === true };
}

function toSummary(payload: unknown): CallSummary | null {
  const p = payload as
    | {
        calls?: unknown;
        distinct?: unknown;
        worstN?: unknown;
        worstCount?: unknown;
        value?: unknown;
      }
    | undefined;
  if (typeof p?.calls !== 'number' || typeof p.distinct !== 'number') return null;
  if (typeof p.worstN !== 'number' || typeof p.worstCount !== 'number') return null;
  if (typeof p.value !== 'number') return null;
  return {
    calls: p.calls,
    distinct: p.distinct,
    worstN: p.worstN,
    worstCount: p.worstCount,
    value: p.value,
  };
}

export const overlappingSubproblemsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const instance: ProjectorInstance = {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'tree-planned': {
          stage?.plan?.(toPlanNodes(event.payload));
          stage?.setCaption?.('');
          break;
        }
        case 'sprout': {
          const node = toSproutNode(event);
          if (!node) break;
          stage?.sprout?.(node);
          stage?.setCaption?.(
            node.repeat
              ? tr('caption.repeatTerm', 'f({n}) turns up again — that is {count} times now', {
                  n: node.n,
                  count: node.ordinal,
                })
              : tr('caption.newTerm', 'f({n}) — solving this term for the first time', {
                  n: node.n,
                }),
          );
          break;
        }
        case 'rewind': {
          stage?.rewind?.();
          stage?.setCaption?.('');
          break;
        }
        case 'done': {
          const summary = toSummary(event.payload);
          if (!summary) break;
          stage?.finish?.(summary);
          stage?.setCaption?.(
            tr(
              'caption.summary',
              '{calls} calls to reach {value}, yet only {distinct} different terms — f({worst}) alone was solved {count} times',
              {
                calls: summary.calls,
                value: summary.value,
                distinct: summary.distinct,
                worst: summary.worstN,
                count: summary.worstCount,
              },
            ),
          );
          break;
        }
        default:
          // 이 facet 이 발신하는 이벤트는 위 넷뿐이다. 그 밖은 silently drop (C2).
          break;
      }
    },

    onReset(): void {
      stage?.rewind?.();
      stage?.setCaption?.('');
    },
  };

  return instance;
};
