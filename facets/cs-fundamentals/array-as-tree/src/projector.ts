/**
 * arrayAsTreeProjector — algorithm 의 `jump` / `leaf-miss` / `conclude` 이벤트를
 * stage view 호출로 옮긴다. 캡션 en 원본은 여기, 오직 여기에만 리터럴로 있다
 * (C10) — algorithm 은 키와 값만 보낸다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
  ProjectorRuntime,
  Translate,
  ViewInstance,
} from '@ffacet/core/runtime';

type ArrayAsTreeStage = ViewInstance & {
  init(values: number[]): void;
  jumpTo(toIndex: number, caption: string): Promise<void>;
  showLeafMiss(atIndex: number, leftIndex: number, rightIndex: number, caption: string): Promise<void>;
  showConclude(caption: string): Promise<void>;
  clearCursor(): void;
};

type Vars = Record<string, string | number>;

function isVars(v: unknown): v is Vars {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v as Record<string, unknown>).every(
    (x) => typeof x === 'string' || typeof x === 'number',
  );
}

type JumpPayload = { toIndex: number; textKey: string; vars: Vars; rewind?: boolean };
type LeafMissPayload = { atIndex: number; leftIndex: number; rightIndex: number; textKey: string; vars: Vars };
type ConcludePayload = { textKey: string; vars: Vars };

function asJumpPayload(payload: unknown): JumpPayload | undefined {
  const p = payload as Partial<JumpPayload> | undefined;
  if (typeof p?.toIndex !== 'number' || typeof p.textKey !== 'string' || !isVars(p.vars)) return undefined;
  return { toIndex: p.toIndex, textKey: p.textKey, vars: p.vars, rewind: p.rewind === true };
}

function asLeafMissPayload(payload: unknown): LeafMissPayload | undefined {
  const p = payload as Partial<LeafMissPayload> | undefined;
  if (
    typeof p?.atIndex !== 'number' ||
    typeof p.leftIndex !== 'number' ||
    typeof p.rightIndex !== 'number' ||
    typeof p.textKey !== 'string' ||
    !isVars(p.vars)
  ) {
    return undefined;
  }
  return { atIndex: p.atIndex, leftIndex: p.leftIndex, rightIndex: p.rightIndex, textKey: p.textKey, vars: p.vars };
}

function asConcludePayload(payload: unknown): ConcludePayload | undefined {
  const p = payload as Partial<ConcludePayload> | undefined;
  if (typeof p?.textKey !== 'string' || !isVars(p.vars)) return undefined;
  return { textKey: p.textKey, vars: p.vars };
}

/** jump 캡션 — textKey 별로 en 원본이 호출부에 리터럴로 있어야 추출기가 잡는다. */
function jumpCaption(t: Translate, key: string, vars: Vars): string {
  switch (key) {
    case 'caption.start':
      return t('caption.start', 'Index {i} — the root of the tree.', vars);
    case 'caption.descendLeft':
      return t('caption.descendLeft', 'Left child: 2 × {from} + 1 = {to}.', vars);
    case 'caption.descendRight':
      return t('caption.descendRight', 'Right child: 2 × {from} + 2 = {to}.', vars);
    case 'caption.ascend':
      return t('caption.ascend', 'Parent: ⌊({from} − 1) / 2⌋ = {to}.', vars);
    case 'caption.root':
      return t('caption.root', 'Parent: ⌊({from} − 1) / 2⌋ = {to} — back at the root.', vars);
    default:
      return '';
  }
}

function leafCaption(t: Translate, vars: Vars): string {
  return t(
    'caption.leaf',
    '{l} and {r} both fall past the last cell ({n} of them) — {at} has no child. It is a leaf.',
    vars,
  );
}

function concludeCaption(t: Translate, vars: Vars): string {
  return t(
    'caption.saved',
    '{n} cells hold {n} values and {links} stored links. The same shape as linked nodes would need {hypo}.',
    vars,
  );
}

export const arrayAsTreeProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as ArrayAsTreeStage | undefined;
  const t: Translate = runtime?.t ?? ((_key, fallback) => fallback);

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { values?: unknown } | undefined;
      const values = Array.isArray(data?.values) && data.values.every((v) => typeof v === 'number')
        ? (data.values as number[])
        : [];
      stage?.init(values);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'jump': {
          const p = asJumpPayload(event.payload);
          if (!p) return;
          if (p.rewind) stage?.clearCursor();
          await stage?.jumpTo(p.toIndex, jumpCaption(t, p.textKey, p.vars));
          return;
        }
        case 'leaf-miss': {
          const p = asLeafMissPayload(event.payload);
          if (!p) return;
          await stage?.showLeafMiss(p.atIndex, p.leftIndex, p.rightIndex, leafCaption(t, p.vars));
          return;
        }
        case 'conclude': {
          const p = asConcludePayload(event.payload);
          if (!p) return;
          await stage?.showConclude(concludeCaption(t, p.vars));
          return;
        }
        default:
          // 이 알고리즘이 발신하는 이벤트는 셋뿐이다. 그 외는 조용히 버린다.
          return;
      }
    },

    onReset(): void {
      stage?.clearCursor();
    },
  };
};
