/**
 * recolor-then-rotate projector — algorithm.ts 의 확장 이벤트를 stage view
 * 호출로 번역한다. 데이터 원본은 algorithm 의 ctx.data 이며, 이 파일은 구조를
 * 얼마나 shadow-copy 해야 stage 가 다시 그릴 수 있는지 (id → value/color/
 * parentId/side) 만큼만 들고 있는다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Color = 'red' | 'black';
type Side = 'L' | 'R' | null;

type ShadowNode = { value: number; color: Color; parentId: string | null; side: Side };

type StageNode = { id: string; value: number; color: Color; parentId: string | null; path: string; depth: number };

type UncleInfo =
  | { kind: 'node'; id: string; value: number; color: Color }
  | { kind: 'nil'; path: string; depth: number };

/** 이 facet 전용 stage 의 메서드 계약 — C9: 오픈 타입(ViewInstance)을 여기서 좁힌다. */
type StageInstance = {
  render(nodes: StageNode[]): Promise<void> | void;
  recolor(changes: Array<{ id: string; color: Color }>): Promise<void> | void;
  markViolation(info: { childId: string; parentId: string; uncle: UncleInfo }): void;
  clearMarks(): void;
  setCaption(text: string): void;
  reset(): void;
  destroy(): void;
};

export const recolorThenRotateProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as StageInstance;
  const t: Translate = runtime?.t ?? makeTranslator();

  const shadow = new Map<string, ShadowNode>();

  function valueOf(id: string): number {
    return shadow.get(id)?.value ?? 0;
  }

  /** id 에서 뿌리까지 사이드(L/R) 를 위→아래 순서로 이어 붙인 경로. 뿌리는 ''. */
  function pathOf(id: string): string {
    const bits: string[] = [];
    let cur = shadow.get(id);
    while (cur && cur.parentId) {
      bits.unshift(cur.side ?? '');
      cur = shadow.get(cur.parentId);
    }
    return bits.join('');
  }

  function currentNodes(): StageNode[] {
    const nodes: StageNode[] = [];
    for (const [id, n] of shadow) {
      const path = pathOf(id);
      nodes.push({ id, value: n.value, color: n.color, parentId: n.parentId, path, depth: path.length });
    }
    return nodes;
  }

  return {
    onEvent: async (event: FacetRuntimeEvent) => {
      switch (event.type) {
        case 'insert-node': {
          const p = event.payload as
            | { id?: unknown; value?: unknown; color?: unknown; parentId?: unknown; side?: unknown }
            | undefined;
          if (
            typeof p?.id !== 'string' ||
            typeof p.value !== 'number' ||
            (p.color !== 'red' && p.color !== 'black')
          ) {
            break;
          }
          const parentId = typeof p.parentId === 'string' ? p.parentId : null;
          const side: Side = p.side === 'L' || p.side === 'R' ? p.side : null;
          shadow.set(p.id, { value: p.value, color: p.color, parentId, side });
          await stage.render(currentNodes());
          if (parentId === null) {
            stage.setCaption(t('caption.insertRoot', '{value} starts the tree — the root is always black.', { value: p.value }));
          } else {
            stage.setCaption(
              t('caption.insertRed', '{value} enters red, under {parent}.', { value: p.value, parent: valueOf(parentId) }),
            );
          }
          break;
        }

        case 'violation-found': {
          const p = event.payload as
            | {
                childId?: unknown;
                parentId?: unknown;
                grandparentId?: unknown;
                uncleId?: unknown;
                uncleSide?: unknown;
                uncleColor?: unknown;
              }
            | undefined;
          if (
            typeof p?.childId !== 'string' ||
            typeof p.parentId !== 'string' ||
            typeof p.grandparentId !== 'string' ||
            (p.uncleSide !== 'L' && p.uncleSide !== 'R') ||
            (p.uncleColor !== 'red' && p.uncleColor !== 'black')
          ) {
            break;
          }
          const uncleId = typeof p.uncleId === 'string' ? p.uncleId : null;
          const grandparentPath = pathOf(p.grandparentId);
          const uncle: UncleInfo = uncleId
            ? { kind: 'node', id: uncleId, value: valueOf(uncleId), color: p.uncleColor }
            : { kind: 'nil', path: grandparentPath + p.uncleSide, depth: grandparentPath.length + 1 };
          stage.markViolation({ childId: p.childId, parentId: p.parentId, uncle });
          const vars = { child: valueOf(p.childId), parent: valueOf(p.parentId) };
          if (p.uncleColor === 'red') {
            stage.setCaption(
              t(
                'caption.violationRed',
                '{child} lands red under red {parent}. Its sibling {uncle} is red too — recoloring will settle it.',
                { ...vars, uncle: uncleId ? valueOf(uncleId) : '' },
              ),
            );
          } else {
            stage.setCaption(
              t(
                'caption.violationNil',
                '{child} lands red under red {parent}, and the empty spot beside {parent} counts as black — recoloring alone will not fix this.',
                vars,
              ),
            );
          }
          break;
        }

        case 'recolor': {
          const p = event.payload as { changes?: unknown; reason?: unknown } | undefined;
          if (!Array.isArray(p?.changes)) break;
          const changes = p.changes.filter(
            (c): c is { id: string; color: Color } =>
              !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string' &&
              ((c as { color?: unknown }).color === 'red' || (c as { color?: unknown }).color === 'black'),
          );
          if (changes.length === 0) break;
          for (const c of changes) {
            const existing = shadow.get(c.id);
            if (existing) existing.color = c.color;
          }
          stage.clearMarks();
          await stage.recolor(changes);
          if (p.reason === 'siblingRecolor' && changes.length === 3) {
            stage.setCaption(
              t('caption.recolorApplied', '{parent} and {uncle} turn black, {grandparent} turns red.', {
                parent: valueOf(changes[0].id),
                uncle: valueOf(changes[1].id),
                grandparent: valueOf(changes[2].id),
              }),
            );
          } else if (p.reason === 'rootFix' && changes.length === 1) {
            stage.setCaption(t('caption.rootFixApplied', '{root} is the root, so it turns back to black.', { root: valueOf(changes[0].id) }));
          } else if (p.reason === 'rotationSwap' && changes.length === 2) {
            stage.setCaption(
              t('caption.rotateSwapApplied', '{parent} turns black, {grandparent} turns red.', {
                parent: valueOf(changes[0].id),
                grandparent: valueOf(changes[1].id),
              }),
            );
          }
          break;
        }

        case 'rotate': {
          const p = event.payload as { pivot?: unknown; edges?: unknown } | undefined;
          if (typeof p?.pivot !== 'string' || !Array.isArray(p.edges)) break;
          const edges = p.edges.filter(
            (e): e is { id: string; parentId: string | null; side: Side } =>
              !!e &&
              typeof e === 'object' &&
              typeof (e as { id?: unknown }).id === 'string' &&
              (typeof (e as { parentId?: unknown }).parentId === 'string' || (e as { parentId?: unknown }).parentId === null) &&
              ((e as { side?: unknown }).side === 'L' || (e as { side?: unknown }).side === 'R' || (e as { side?: unknown }).side === null),
          );
          if (edges.length === 0) break;
          for (const e of edges) {
            const existing = shadow.get(e.id);
            if (existing) {
              existing.parentId = e.parentId;
              existing.side = e.side;
            }
          }
          stage.clearMarks();
          await stage.render(currentNodes());
          stage.setCaption(
            t('caption.rotateApplied', '{grandparent} rotates — {parent} moves up in its place.', {
              parent: valueOf(edges[0].id),
              grandparent: valueOf(p.pivot),
            }),
          );
          break;
        }

        case 'rewind': {
          shadow.clear();
          stage.reset();
          break;
        }

        default:
          // 이 조각은 위 다섯 타입만 발신한다. 그 외는 조용히 무시한다 (C2).
          break;
      }
    },
  };
};
