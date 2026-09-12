/**
 * 거짓 공유 조각의 projector — algorithm 이벤트를 그림의 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 좁혀 넘긴다 (C9). 그대로 전달하지 않는다.
 * 문안도 여기서 정해진다 — algorithm 은 키만 싣고, 키를 문장으로 푸는 것은
 * 표현 계층의 일이다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';

import type {
  FalseSharingArrange,
  FalseSharingRound,
  FalseSharingSettle,
} from './false-sharing-stage.js';

/** 그림이 내주는 표면. optional 로 잡고 `?.()` 로 부른다 (C9). */
type Stage = {
  arrange?(input: FalseSharingArrange): Promise<void> | void;
  writeRound?(input: FalseSharingRound): Promise<void> | void;
  settle?(input: FalseSharingSettle): Promise<void> | void;
  finish?(input: FalseSharingSettle): Promise<void> | void;
  rewind?(): void;
};

type Raw = Record<string, unknown>;

/** 단언 뒤에 검사가 따라오는 좁히개다 (C9). */
function raw(payload: unknown): Raw {
  return typeof payload === 'object' && payload !== null ? (payload as Raw) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * 키를 문장으로 푼다.
 *
 * en 원본은 호출부에 리터럴로 둔다 — 추출기가 리터럴만 알아본다 (C10).
 */
function caption(tr: Translate, key: string, vars: Record<string, string | number>): string {
  switch (key) {
    case 'caption.together':
      return tr(
        'caption.together',
        'Core A writes a[{a}], core B writes a[{b}] — two different cells, and one line holds them both: {line}.',
        vars,
      );
    case 'caption.apart':
      return tr(
        'caption.apart',
        'Give core B a line of its own — a[{b}]. Its address: {addr}. That puts it on another line: {line}.',
        vars,
      );
    case 'caption.collide':
      return tr(
        'caption.collide',
        'A drags the line over to change a[{a}]; B drags it back for a[{b}]. Writes: {writes}. Invalidations: {inval}.',
        vars,
      );
    case 'caption.quiet':
      return tr(
        'caption.quiet',
        'Each core holds a line of its own, and nothing is dragged away. Writes: {writes}.',
        vars,
      );
    case 'caption.tally':
      return tr(
        'caption.tally',
        'Writes: {writes}. Invalidations: {inval}. Values both cores use: {shared}.',
        vars,
      );
    case 'caption.tallyApart':
      return tr('caption.tallyApart', 'The same count of writes: {writes}. Invalidations: {inval}.', vars);
    case 'caption.done':
      return tr(
        'caption.done',
        'One thing changed — whether the two values sit on the same line. Values they truly share: {shared}.',
        vars,
      );
    default:
      return '';
  }
}

export const falseSharingProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = raw(event.payload);

      switch (event.type) {
        case 'arrange': {
          const aIndex = num(p.aIndex, 0);
          const bIndex = num(p.bIndex, 0);
          const sameLine = p.sameLine === true;
          const text = caption(tr, str(p.textKey, ''), {
            a: aIndex,
            b: bIndex,
            addr: num(p.bAddr, 0),
            line: sameLine ? num(p.aLine, 0) : num(p.bLine, 0),
          });
          await stage?.arrange?.({ aIndex, bIndex, caption: text });
          return;
        }

        case 'write-round': {
          const text = caption(tr, str(p.textKey, ''), {
            a: num(p.aIndex, 0),
            b: num(p.bIndex, 0),
            writes: num(p.writes, 0),
            inval: num(p.invalidations, 0),
          });
          await stage?.writeRound?.({
            cores: strList(p.cores),
            indices: numList(p.indices),
            values: numList(p.values),
            caption: text,
          });
          return;
        }

        case 'settle': {
          const text = caption(tr, str(p.textKey, ''), {
            writes: num(p.writes, 0),
            inval: num(p.invalidations, 0),
            shared: num(p.sharedCount, 0),
          });
          await stage?.settle?.({ caption: text });
          return;
        }

        case 'done': {
          const text = caption(tr, str(p.textKey, ''), { shared: num(p.sharedCount, 0) });
          await stage?.finish?.({ caption: text });
          return;
        }

        case 'rewind':
          stage?.rewind?.();
          return;

        default:
          // 이 조각이 내보내는 것은 위 다섯뿐이다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
