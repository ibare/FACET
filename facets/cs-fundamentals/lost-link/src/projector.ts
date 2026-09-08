/**
 * lost-link projector — 이벤트를 stage 의 동작으로 옮긴다.
 *
 * payload 는 `unknown` 이므로 좁은 인라인 단언 + 런타임 가드로 정형 객체를 만든
 * 뒤에만 stage 로 넘긴다 (C9). 문안은 키로 받아 여기서 조회한다 — algorithm 은
 * 무엇이라 말할지 정하지 않는다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage view 의 계약. 없는 메서드가 있어도 견디도록 전부 optional 로 받는다 (C9). */
type LostLinkStage = {
  init?(spec: { nodes: { id: string; value: number }[] }): void;
  setCaption?(text: string): void;
  setNote?(text: string): void;
  setBandLabels?(above: string, below: string): void;
  stageNode?(id: string, value: number, after: string): Promise<void>;
  addLink?(from: string, to: string): Promise<void>;
  moveLink?(from: string, to: string): Promise<void>;
  detach?(ids: string[]): Promise<void>;
  settle?(id: string, after: string): Promise<void>;
  rewind?(): Promise<void>;
};

type StepPayload = {
  id?: unknown;
  value?: unknown;
  after?: unknown;
  from?: unknown;
  to?: unknown;
  ids?: unknown;
  textKey?: unknown;
};

type InitNodes = { nodes?: unknown };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s) out.push(s);
  }
  return out;
}

export const lostLinkProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as LostLinkStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 걸음마다의 문안. en 원본은 여기 리터럴로 있고 (조회 3층), 저작자가 고친
   * 문안은 `facet.ts` 의 `messages` 가 이긴다 (C10).
   */
  function captionFor(key: string, vars: Record<string, string | number>): string {
    switch (key) {
      case 'caption.start':
        return tr('caption.start', 'Every node is reachable from head.', vars);
      case 'caption.staged':
        return tr('caption.staged', 'New node {node}({value}) is ready. Nothing points to it yet.', vars);
      case 'caption.wrongMove':
        return tr('caption.wrongMove', 'Wrong order — move {from}.next to {to} first.', vars);
      case 'caption.detached':
        return tr(
          'caption.detached',
          'Nothing points to {first} any more, so {count} nodes drop out of reach.',
          vars,
        );
      case 'caption.rewind':
        return tr('caption.rewind', 'Undo. Same insertion, other order.', vars);
      case 'caption.stagedAgain':
        return tr('caption.stagedAgain', '{node}({value}) is ready again.', vars);
      case 'caption.rightAdd':
        return tr('caption.rightAdd', 'Right order — attach {from}.next to {to} first. Now two arrows reach {to}.', vars);
      case 'caption.rightMove':
        return tr('caption.rightMove', 'Now move {from}.next to {to}. The tail is still held from the other side.', vars);
      case 'caption.settled':
        return tr('caption.settled', '{node} takes its place in the chain.', vars);
      case 'caption.done':
        return tr('caption.done', 'No arrow into the tail was ever cut. Nothing fell off.', vars);
      default:
        return '';
    }
  }

  function say(payload: StepPayload, vars: Record<string, string | number>): void {
    const key = str(payload.textKey);
    if (!key) return;
    stage?.setCaption?.(captionFor(key, vars));
  }

  // onReset 을 두지 않는다 — ReactiveMechanism.reset() 이 onReset 다음에
  // onInit 을 부르고, 아래 onInit 이 화면 전체를 다시 세운다.
  return {
    onInit(initialData: unknown): void {
      const data = initialData as InitNodes | undefined;
      const raw = Array.isArray(data?.nodes) ? data.nodes : [];
      const nodes: { id: string; value: number }[] = [];
      for (const item of raw) {
        const n = item as { id?: unknown; value?: unknown };
        const id = str(n?.id);
        const value = num(n?.value);
        if (id !== null && value !== null) nodes.push({ id, value });
      }
      stage?.init?.({ nodes });
      stage?.setBandLabels?.(
        tr('label.reachable', 'reachable from head'),
        tr('label.unreachable', 'still in memory, no way in'),
      );
      stage?.setNote?.(
        tr('label.note', 'Dropping below the line means unreachable, not moved.'),
      );
      stage?.setCaption?.(captionFor('caption.start', {}));
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = (event.payload ?? {}) as StepPayload;

      switch (event.type) {
        case 'node-staged': {
          const id = str(p.id);
          const value = num(p.value);
          const after = str(p.after);
          if (id === null || value === null || after === null) return;
          say(p, { node: id, value, after });
          await stage?.stageNode?.(id, value, after);
          return;
        }
        case 'link-added': {
          const from = str(p.from);
          const to = str(p.to);
          if (from === null || to === null) return;
          say(p, { from, to });
          await stage?.addLink?.(from, to);
          return;
        }
        case 'link-moved': {
          const from = str(p.from);
          const to = str(p.to);
          if (from === null || to === null) return;
          say(p, { from, to });
          await stage?.moveLink?.(from, to);
          return;
        }
        case 'detached': {
          const ids = idList(p.ids);
          if (ids.length === 0) return;
          say(p, { count: ids.length, first: ids[0] });
          await stage?.detach?.(ids);
          return;
        }
        case 'settled': {
          const id = str(p.id);
          const after = str(p.after);
          if (id === null || after === null) return;
          say(p, { node: id, after });
          await stage?.settle?.(id, after);
          return;
        }
        case 'rewind': {
          say(p, {});
          await stage?.rewind?.();
          return;
        }
        case 'done': {
          say(p, {});
          return;
        }
        default:
          // 이 facet 이 발신하는 이벤트는 위가 전부다. 나머지는 조용히 버린다 (C2).
          return;
      }
    },
  };
};
