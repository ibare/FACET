/**
 * relink-insert projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 두 가지를 여기서 좁힌다.
 *  - payload (C9) — `event.payload` 를 그대로 넘기지 않는다. typeof 가드로 정형
 *    값만 뽑아 stage 에 넘기고, 하나라도 어긋나면 아무것도 부르지 않는다.
 *  - 문안 (C10) — algorithm 은 키만 보낸다. en 원본 리터럴은 이 파일의 호출부에
 *    있고, 저작자 문안은 facet.ts 의 messages 가 이긴다.
 */

import {
  makeTranslator,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
  type FacetRuntimeEvent,
} from '@ffacet/core/runtime';

/** stage view 의 구조적 계약. optional 메서드는 `?.()` 로만 부른다 (C9). */
type RelinkStage = {
  init?(spec: {
    nodes: { id: string; value: number }[];
    incoming: { id: string; value: number };
    insertAfter: string;
    note: string;
  }): void;
  showChain?(text: string): void;
  stageNode?(text: string): Promise<void>;
  growStageEdge?(text: string): Promise<void>;
  detachEdge?(text: string): Promise<void>;
  landEdge?(text: string): Promise<void>;
  finish?(text: string, tally: string): Promise<void>;
  rewind?(): void;
};

type StepPayload = {
  textKey?: unknown;
  value?: unknown;
  from?: unknown;
  to?: unknown;
  was?: unknown;
  rewires?: unknown;
  moves?: unknown;
};

type RawNode = { id?: unknown; value?: unknown };

function asText(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function asCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asNode(v: unknown): { id: string; value: number } | null {
  if (typeof v !== 'object' || v === null) return null;
  const raw = v as RawNode;
  const id = asText(raw.id);
  const value = asCount(raw.value);
  return id === null || value === null ? null : { id, value };
}

export const relinkInsertProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as RelinkStage | undefined;
  const tr = runtime?.t ?? makeTranslator();
  /** 줄 밖에서 들어오는 노드의 id. onInit 에서 정해진다 — 몸짓을 가르는 기준이다. */
  let incomingId: string | null = null;

  /**
   * 걸음마다의 캡션. algorithm 이 고른 키를 문안으로 편다.
   * en 원본은 반드시 이 호출부에 리터럴로 있어야 추출기가 본다 (C10).
   */
  function caption(key: string, vars?: Record<string, string | number>): string {
    switch (key) {
      case 'caption.chain':
        return tr('caption.chain', 'Three boxes in a row. The arrows, not the boxes, set the order.');
      case 'caption.staged':
        return tr('caption.staged', 'A new box holding {value} waits below, linked to nothing yet.', vars);
      case 'caption.attachNew':
        return tr('caption.attachNew', "First, point {source}'s next at {target}.", vars);
      case 'caption.detach':
        return tr('caption.detach', "Now unhook {source}'s next from {target}. For a moment it points nowhere.", vars);
      case 'caption.attachBack':
        return tr('caption.attachBack', 'Drop that same arrow onto {target}. The tail never left {source}.', vars);
      case 'caption.done':
        return tr('caption.done', 'Inserted — and every box sits exactly where it sat.');
      default:
        return '';
    }
  }

  return {
    onInit(initialData: unknown) {
      const d = (initialData ?? {}) as { nodes?: unknown; incoming?: unknown; insertAfter?: unknown };
      const rawNodes = Array.isArray(d.nodes) ? d.nodes : [];
      const nodes: { id: string; value: number }[] = [];
      for (const raw of rawNodes) {
        const node = asNode(raw);
        if (node !== null) nodes.push(node);
      }
      const incoming = asNode(d.incoming);
      const insertAfter = asText(d.insertAfter);
      if (nodes.length < 2 || incoming === null || insertAfter === null) return;
      incomingId = incoming.id;
      stage?.init?.({
        nodes,
        incoming,
        insertAfter,
        // 전제를 화면이 스스로 말한다 (S-piece). 아래 줄은 그림의 사정일 뿐이다.
        note: tr(
          'label.note',
          'The new box is drawn on a lower row on purpose: where a node sits means nothing. Only the arrows say what comes next.',
        ),
      });
    },

    async onEvent(event: FacetRuntimeEvent) {
      const p = (event.payload ?? {}) as StepPayload;
      const key = asText(p.textKey) ?? '';

      switch (event.type) {
        case 'chain-shown': {
          stage?.showChain?.(caption(key));
          return;
        }
        case 'node-staged': {
          const value = asCount(p.value);
          if (value === null) return;
          await stage?.stageNode?.(caption(key, { value }));
          return;
        }
        case 'link-attached': {
          const source = asText(p.from);
          const target = asText(p.to);
          if (source === null || target === null) return;
          const text = caption(key, { source, target });
          // 새로 들어온 노드가 내미는 화살표는 자라나고, 줄에 있던 노드의 화살표는
          // 허공에서 내려앉는다. 같은 이벤트지만 누가 내미느냐로 몸짓이 갈린다.
          if (source === incomingId) await stage?.growStageEdge?.(text);
          else await stage?.landEdge?.(text);
          return;
        }
        case 'link-detached': {
          const source = asText(p.from);
          const target = asText(p.was);
          if (source === null || target === null) return;
          await stage?.detachEdge?.(caption(key, { source, target }));
          return;
        }
        case 'done': {
          const rewires = asCount(p.rewires);
          const moves = asCount(p.moves);
          if (rewires === null || moves === null) return;
          await stage?.finish?.(
            caption(key),
            tr('label.tally', 'Arrows rewritten: {rewires} · Boxes moved: {moves}', { rewires, moves }),
          );
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 이 조각의 어휘가 아닌 이벤트는 조용히 버린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.rewind?.();
    },
  };
};
