/**
 * scc projector — 타잔 이벤트를 stage 메서드 호출과 코드 패널 줄 강조로 옮긴다.
 *
 * 번역기는 이 한 곳뿐이다 (원칙 5). stage 는 알고리즘을 모르고, 알고리즘은
 * stage 를 모른다. 화면에 뜨는 말은 전부 `tr` 로 조회하며 문안 자체는
 * `facet.ts` 의 `messages` 에 있다 (C10) — 여기 남는 것은 키와 en 원본뿐이다.
 */

import type { ProjectorFactory, ProjectorInstance, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 오픈 타입인 ViewInstance 를 여기서 한 번만 좁힌다 (C9). */
type SccStage = {
  setGraph?(adjacency: number[][]): void;
  setCaption?(text: string): void;
  probe?(v: number): void;
  visit?(v: number, num: number, low: number): void;
  updateLow?(v: number, num: number, low: number, changed: boolean): void;
  focus?(v: number): void;
  markEdge?(from: number, to: number, kind: string): void;
  push?(v: number): void;
  closeGroup?(groupIndex: number, members: number[]): void;
  pop?(v: number, groupIndex: number, isRoot: boolean): void;
  finish?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** 이벤트 payload 는 unknown 이라 쓰기 전에 한 번에 좁힌다 (C9). */
type SccPayload = {
  phase?: unknown;
  state?: unknown;
  numbered?: unknown;
  num?: unknown;
  low?: unknown;
  source?: unknown;
  via?: unknown;
  changed?: unknown;
  from?: unknown;
  to?: unknown;
  kind?: unknown;
  groupIndex?: unknown;
  members?: unknown;
  root?: unknown;
  groupCount?: unknown;
  vertexCount?: unknown;
};

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** `node:3` → 3. 식별자 파싱은 parseTarget 을 경유한다 (원칙 4). */
const nodeIdOf = (target: FacetRuntimeEvent['target']): number | null => {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (parsed?.prefix !== 'node') return null;
  const id = Number(parsed.id);
  return Number.isNaN(id) ? null : id;
};

export const sccProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as SccStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 정점 수 — 첫 캡션이 쓴다. */
  let vertexCount = 0;

  const say = (text: string): void => stage?.setCaption?.(text);

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { adjacency?: unknown } | undefined;
      const adjacency = Array.isArray(data?.adjacency) ? (data.adjacency as number[][]) : [];
      vertexCount = adjacency.length;
      stage?.setGraph?.(adjacency);
      codePanel?.clearHighlight?.();
      say(tr('caption.start', 'Vertices: {n}. None of them has a number yet.', { n: vertexCount }));
    },

    onEvent(event: FacetRuntimeEvent): void {
      const p = (event.payload ?? {}) as SccPayload;

      switch (event.type) {
        case 'phase': {
          if (typeof p.phase === 'string') codePanel?.highlightPhase?.(p.phase);
          return;
        }

        case 'state-changed': {
          if (p.state === 'idle') {
            say(tr('caption.start', 'Vertices: {n}. None of them has a number yet.', { n: vertexCount }));
            return;
          }
          const v = nodeIdOf(event.target);
          if (v === null) return;

          if (p.state === 'probe') {
            stage?.probe?.(v);
            say(
              p.numbered === true
                ? tr('caption.probeDone', 'Vertex {v} already has a number — skip it.', { v })
                : tr('caption.probeNew', 'Vertex {v} has no number. Start a walk there.', { v }),
            );
            return;
          }

          const n = num(p.num);
          const l = num(p.low);
          if (n === null || l === null) return;

          if (p.source === undefined) {
            stage?.visit?.(v, n, l);
            say(tr('caption.visit', 'Vertex {v} takes number {n}. Its low starts at the same place.', { v, n }));
            return;
          }

          const via = num(p.via);
          const changed = p.changed === true;
          stage?.updateLow?.(v, n, l, changed);
          if (p.source === 'child') {
            say(
              changed
                ? tr('caption.liftTake', 'The walk under {w} reached {l}. Vertex {v} takes that low.', { v, w: via ?? '', l })
                : tr('caption.liftKeep', 'The walk under {w} reached no higher. Vertex {v} keeps low {l}.', { v, w: via ?? '', l }),
            );
          } else {
            say(
              changed
                ? tr('caption.backTake', 'Vertex {w} is on the stack, so {v} lowers its low to num[{w}], which is {l}.', { v, w: via ?? '', l })
                : tr('caption.backKeep', 'Vertex {v} already reaches {l} — nothing lower to take from {w}.', { v, w: via ?? '', l }),
            );
          }
          return;
        }

        case 'stack-push': {
          const v = nodeIdOf(event.target);
          if (v === null) return;
          stage?.push?.(v);
          say(tr('caption.push', 'Vertex {v} goes on the stack and stays until its group is settled.', { v }));
          return;
        }

        case 'mark': {
          const from = num(p.from);
          const to = num(p.to);
          const kind = typeof p.kind === 'string' ? p.kind : 'idle';
          if (from === null || to === null) return;
          stage?.markEdge?.(from, to, kind);
          if (kind === 'scan') {
            say(tr('caption.scan', 'Vertex {v} looks at the edge to {w}.', { v: from, w: to }));
          } else if (kind === 'tree') {
            say(tr('caption.descend', 'Vertex {w} is new ground. Go down into it.', { w: to }));
          } else if (kind === 'back') {
            say(tr('caption.backEdge', 'The edge {v} → {w} runs back to a vertex still on the stack.', { v: from, w: to }));
          } else if (kind === 'skip') {
            say(tr('caption.skipEdge', 'Vertex {w} left the stack with a settled group. This edge gives nothing.', { w: to }));
          }
          return;
        }

        case 'group-closed': {
          const groupIndex = num(p.groupIndex);
          const root = num(p.root);
          const members = Array.isArray(p.members) ? (p.members as number[]) : [];
          if (groupIndex === null || root === null) return;
          stage?.focus?.(root);
          stage?.closeGroup?.(groupIndex, members);
          say(
            tr('caption.closeGroup', 'low equals num at {v}. The stack from {v} up is one whole group — size {k}.', {
              v: root,
              k: members.length,
            }),
          );
          return;
        }

        case 'stack-pop': {
          const v = nodeIdOf(event.target);
          const groupIndex = num(p.groupIndex);
          const root = num(p.root);
          if (v === null || groupIndex === null) return;
          stage?.pop?.(v, groupIndex, v === root);
          say(tr('caption.pop', 'Vertex {v} leaves the stack and joins the group.', { v }));
          return;
        }

        case 'done': {
          const groupCount = num(p.groupCount) ?? 0;
          stage?.finish?.();
          say(tr('caption.done', 'One walk, {n} groups. Every vertex belongs to exactly one.', { n: groupCount }));
          return;
        }

        // 그 밖의 표준 어휘는 이 facet 이 발신하지 않는다 — 조용히 흘린다 (C2).
        default:
          return;
      }
    },

    onReset(): void {
      codePanel?.clearHighlight?.();
    },
  };
};
