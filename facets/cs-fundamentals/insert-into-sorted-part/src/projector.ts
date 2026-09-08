/**
 * 정렬부 삽입 Projector — 이벤트를 무대 동작으로 옮긴다.
 *
 * 무대는 알고리즘을 모르고 알고리즘은 무대를 모른다. 둘 사이를 잇는 유일한
 * 번역기가 여기다 (원칙 5). payload 는 `unknown` 이므로 좁힌 뒤에만 쓴다 (C9).
 * 캡션 문안은 코드에 리터럴로 박지 않고 키로 조회한다 (C10) — 실제 문안은
 * `facet.ts` 의 `messages` 에 있다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** 무대가 노출하는 계약. `views.stage` 는 오픈 타입이라 여기서 한 번만 좁힌다. */
type SortedInsertStage = {
  init?(cells: number[], keyIndex: number): void;
  setCaption?(text: string): void;
  lift?(index: number): Promise<void>;
  compare?(hole: number, probe: number): Promise<void>;
  stepAside?(from: number, to: number): Promise<void>;
  stop?(probe: number, hole: number): Promise<void>;
  settle?(index: number): Promise<void>;
  finish?(): void;
  rewind?(): void;
};

type LiftPayload = { index?: unknown; value?: unknown };
type ComparePayload = { hole?: unknown; probe?: unknown; key?: unknown; other?: unknown };
type AsidePayload = { from?: unknown; to?: unknown; value?: unknown };
type SettlePayload = { index?: unknown; value?: unknown };
type DonePayload = { compares?: unknown; shifts?: unknown };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const item of v) {
    const n = num(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

export const insertIntoSortedPartProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SortedInsertStage | undefined;
  // 러너는 언제나 runtime.t 를 준다 (FacetJson.messages 오버라이드가 얹혀 있다).
  // 뒤의 것은 러너 밖에서 projector 를 만들 때를 위한 fallback 이다 (C10).
  const t = runtime?.t ?? makeTranslator();

  let sorted: number[] = [];
  let incoming = 0;

  const begin = (): void => {
    stage?.setCaption?.(
      t('caption.begin', 'The left side is already in order. {value} goes in next.', {
        value: incoming,
      }),
    );
  };

  const restage = (): void => {
    stage?.init?.([...sorted, incoming], sorted.length);
    begin();
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { sorted?: unknown; incoming?: unknown } | undefined;
      sorted = numArray(d?.sorted) ?? [];
      incoming = num(d?.incoming) ?? 0;
      restage();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'lift': {
          const p = event.payload as LiftPayload | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          if (index === null || value === null) return;
          stage?.setCaption?.(
            t('caption.lift', 'Lift {value} out of the row. That slot is empty now.', { value }),
          );
          await stage?.lift?.(index);
          return;
        }

        case 'compare': {
          const p = event.payload as ComparePayload | undefined;
          const hole = num(p?.hole);
          const probe = num(p?.probe);
          const key = num(p?.key);
          const other = num(p?.other);
          if (hole === null || probe === null || key === null || other === null) return;
          stage?.setCaption?.(
            other > key
              ? t('caption.compareYields', '{other} > {value} — {other} has to step aside.', {
                  other,
                  value: key,
                })
              : t('caption.compareHolds', '{other} is not greater than {value}.', {
                  other,
                  value: key,
                }),
          );
          await stage?.compare?.(hole, probe);
          return;
        }

        case 'step-aside': {
          const p = event.payload as AsidePayload | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          const value = num(p?.value);
          if (from === null || to === null || value === null) return;
          stage?.setCaption?.(
            t(
              'caption.stepAside',
              '{value} moves one slot to the right. The gap comes one slot closer.',
              { value },
            ),
          );
          await stage?.stepAside?.(from, to);
          return;
        }

        case 'stop': {
          const p = event.payload as ComparePayload | undefined;
          const hole = num(p?.hole);
          const probe = num(p?.probe);
          const other = num(p?.other);
          if (hole === null || probe === null || other === null) return;
          stage?.setCaption?.(
            t('caption.stop', '{other} stays put — the walk stops here, short of the left end.', {
              other,
            }),
          );
          await stage?.stop?.(probe, hole);
          return;
        }

        case 'settle': {
          const p = event.payload as SettlePayload | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          if (index === null || value === null) return;
          stage?.setCaption?.(
            t('caption.settle', 'The gap is the slot {value} belongs in. It comes down.', { value }),
          );
          await stage?.settle?.(index);
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const compares = num(p?.compares);
          const shifts = num(p?.shifts);
          if (compares === null || shifts === null) return;
          stage?.setCaption?.(
            t(
              'caption.done',
              '{compares} comparisons, {shifts} step-asides — the walk never reached the left end.',
              { compares, shifts },
            ),
          );
          stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          begin();
          return;
        }

        // 이 알고리즘은 위 일곱 가지만 발신한다. 다른 것이 들어오면 조용히 흘린다.
        default:
          return;
      }
    },

    onReset(): void {
      restage();
    },
  };
};
