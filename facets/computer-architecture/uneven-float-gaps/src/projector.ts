/**
 * 고르지 않은 눈금 — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). `event.payload` 를 그대로 흘리지 않는다.
 * 화면 문안은 키로만 들고 있고 문장은 facet.ts 에 있다 (C10).
 *
 * 걸음마다 캡션을 먼저 세우고 그 다음에 움직임을 기다린다 — 움직이는 동안
 * 읽을 수 있어야 한다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type GapStage = {
  showAnchor?(p: { value: number; next: number; gap: number; gapExp: number }): Promise<void> | void;
  widen?(p: {
    value: number;
    next: number;
    gap: number;
    gapExp: number;
    k: number;
    cumulative: number;
  }): Promise<void> | void;
  showOctave?(p: { count: number; from: number; to: number }): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

/** 자리 구분은 쉼표로 — 빈칸으로 묶으면 언어에 따라 다르게 읽힌다. */
function group(n: number): string {
  return n.toLocaleString('en-US');
}

/** 오픈 타입인 payload 를 좁히는 자리. 꺼낸 값은 아래에서 하나씩 거른다 (C9). */
function fieldsOf(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function numberAt(rec: Record<string, unknown>, key: string): number | null {
  const v = rec[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const unevenFloatGapsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as GapStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onReset(): void {
      stage.rewind?.();
      stage.setCaption?.('');
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const f = fieldsOf(event.payload);

      switch (event.type) {
        case 'anchor': {
          if (!f) return;
          const value = numberAt(f, 'value');
          const next = numberAt(f, 'next');
          const gap = numberAt(f, 'gap');
          const gapExp = numberAt(f, 'gapExp');
          if (value === null || next === null || gap === null || gapExp === null) return;
          stage.setCaption?.(
            tr('caption.anchor', 'The next float32 after 1 lands here. Call this gap one notch.'),
          );
          await stage.showAnchor?.({ value, next, gap, gapExp });
          return;
        }

        case 'widen': {
          if (!f) return;
          const value = numberAt(f, 'value');
          const next = numberAt(f, 'next');
          const gap = numberAt(f, 'gap');
          const gapExp = numberAt(f, 'gapExp');
          const k = numberAt(f, 'k');
          const cumulative = numberAt(f, 'cumulative');
          if (
            value === null ||
            next === null ||
            gap === null ||
            gapExp === null ||
            k === null ||
            cumulative === null
          ) {
            return;
          }
          stage.setCaption?.(
            tr('caption.widen', 'At {value}: the neighbour is {k} notches away.', {
              value: group(value),
              k: group(k),
            }),
          );
          await stage.widen?.({ value, next, gap, gapExp, k, cumulative });
          return;
        }

        case 'count': {
          if (!f) return;
          const count = numberAt(f, 'count');
          const from = numberAt(f, 'from');
          const to = numberAt(f, 'to');
          if (count === null || from === null || to === null) return;
          stage.setCaption?.(
            tr(
              'caption.count',
              'Every span from a number to its double holds the same count: {count}.',
              { count: group(count) },
            ),
          );
          await stage.showOctave?.({ count, from, to });
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          stage.setCaption?.('');
          return;
        }

        case 'done': {
          stage.setCaption?.(
            tr(
              'caption.done',
              'The bigger the number, the farther its neighbour. The notches are not even.',
            ),
          );
          return;
        }

        default:
          // 이 조각은 위 다섯 밖의 이벤트를 내보내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
