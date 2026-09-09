/**
 * 서로 오갈 수 있는 무리 — Projector.
 *
 * algorithm 의 이벤트를 stage 메서드 호출로 옮기고, 캡션 문안을 `messages` 에서
 * 꺼내 붙인다. algorithm 은 문안을 모르고 (C10), stage 는 이벤트를 모른다 (원칙 5).
 *
 * payload 는 여기서 좁힌다 — `event.payload` 를 그대로 넘기지 않고 정형 값만
 * 골라 stage 로 준다 (C9).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** stage 가 노출하는 표면. 없는 메서드는 `?.()` 로 견딘다 (C9). */
type Stage = {
  setGraph?(nodes: string[], edges: { from: string; to: string }[]): void;
  setCaption?(text: string): void;
  askPair?(u: string, v: string): void;
  showReached?(from: string, to: string, path: string[]): Promise<void> | void;
  showBlocked?(from: string, to: string, region: string[]): Promise<void> | void;
  resolvePair?(mutual: boolean): Promise<void> | void;
  settleGroup?(group: number, members: string[]): Promise<void> | void;
  splitApart?(
    groups: string[][],
    bridges: { from: string; to: string }[],
  ): Promise<void> | void;
  finish?(): void;
  resetAll?(): void;
};

type Payload = Record<string, unknown> | undefined;

function asPayload(value: unknown): Payload {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asTextMatrix(value: unknown): string[][] {
  return Array.isArray(value) ? value.map(asTextList) : [];
}

function asEdgeList(value: unknown): { from: string; to: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { from: string; to: string }[] = [];
  for (const row of value) {
    const e = asPayload(row);
    if (e === undefined) continue;
    const from = asText(e.from);
    const to = asText(e.to);
    if (from !== '' && to !== '') out.push({ from, to });
  }
  return out;
}

export const mutuallyReachableProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  // 러너 밖 mount 를 위한 fallback 은 이 형태여야 한다 — 손수 만든 조회기는
  // registerMessages 로 주입된 번들을 못 읽는다 (C10).
  const tr = runtime?.t ?? makeTranslator();

  const intro = (): string =>
    tr('caption.intro', 'Pick two vertices and ask: can each one reach the other?');

  return {
    onInit(initialData: unknown) {
      const data = asPayload(initialData);
      stage?.setGraph?.(asTextList(data?.nodes), asEdgeList(data?.edges));
      stage?.setCaption?.(intro());
    },

    async onEvent(event: FacetRuntimeEvent) {
      const p = asPayload(event.payload);

      switch (event.type) {
        case 'probe-begin': {
          const u = asText(p?.u);
          const v = asText(p?.v);
          stage?.askPair?.(u, v);
          stage?.setCaption?.(tr('caption.ask', 'Take {u} and {v}.', { u, v }));
          return;
        }

        case 'reach-found': {
          const from = asText(p?.from);
          const to = asText(p?.to);
          const path = asTextList(p?.path);
          stage?.setCaption?.(
            tr('caption.reached', '{from} to {to}: there is a way, and this is it.', {
              from,
              to,
            }),
          );
          await stage?.showReached?.(from, to, path);
          return;
        }

        case 'reach-blocked': {
          const from = asText(p?.from);
          const to = asText(p?.to);
          const region = asTextList(p?.region);
          stage?.setCaption?.(
            tr(
              'caption.blocked',
              'No way from {from} to {to}. From {from} you only ever reach {region}.',
              { from, to, region: region.join(', ') },
            ),
          );
          await stage?.showBlocked?.(from, to, region);
          return;
        }

        case 'pair-verdict': {
          const u = asText(p?.u);
          const v = asText(p?.v);
          const mutual = p?.mutual === true;
          stage?.setCaption?.(
            mutual
              ? tr('caption.mutual', 'Both ways work, so {u} and {v} belong together.', { u, v })
              : tr('caption.oneWay', 'Only one way, so {u} and {v} are not one group.', { u, v }),
          );
          await stage?.resolvePair?.(mutual);
          return;
        }

        case 'group-settled': {
          const members = asTextList(p?.members);
          stage?.setCaption?.(
            tr('caption.settled', '{members} form one group of {count}.', {
              members: members.join(', '),
              count: members.length,
            }),
          );
          await stage?.settleGroup?.(asCount(p?.group), members);
          return;
        }

        case 'split': {
          const groups = asTextMatrix(p?.groups);
          const bridges = asEdgeList(p?.bridges);
          stage?.setCaption?.(
            tr(
              'caption.split',
              '{groupCount} groups. Links between them: {bridgeCount}, one way only: {oneWayCount}. Cross and there is no way back.',
              {
                groupCount: groups.length,
                bridgeCount: bridges.length,
                oneWayCount: asCount(p?.oneWayCount),
              },
            ),
          );
          await stage?.splitApart?.(groups, bridges);
          return;
        }

        case 'rewind': {
          stage?.resetAll?.();
          stage?.setCaption?.(intro());
          return;
        }

        case 'done': {
          stage?.finish?.();
          return;
        }

        default:
          // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.resetAll?.();
      stage?.setCaption?.(intro());
    },
  };
};
