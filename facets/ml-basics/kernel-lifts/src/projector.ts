/**
 * 커널 트릭 조각 — projector.
 *
 * 알고리즘이 내는 것을 stage 의 메서드 호출로 옮긴다. 화면 문안은 코드에 없다 —
 * 키와 en 원본만 두고 문안은 `facet.ts` 의 `messages` 에 있다 (C10). en 원본은
 * 선언과 글자까지 같아야 한다. 어긋나도 화면은 멀쩡해서 호출부 리터럴이 조용히
 * 죽은 문안이 되기 때문이다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다. stage 는 `unknown` 을 받지 않는다 (C9).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

import {
  readKernelLiftsPoints,
  type KernelLiftsPoint,
  type KernelLiftsStage,
} from './kernel-lifts-stage.js';

type CutTried = {
  cut: number;
  leftLabels: string[];
  leftMixed: boolean;
  rightLabels: string[];
  rightMixed: boolean;
  tried: number;
  total: number;
};

type Raised = { xs: number[]; height: number };
type Split = { belowLabel: string; aboveLabel: string };

function numbersOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function readCutTried(payload: unknown): CutTried | null {
  const p = payload as
    | {
        cut?: unknown;
        leftMixed?: unknown;
        rightMixed?: unknown;
        tried?: unknown;
        total?: unknown;
        leftLabels?: unknown;
        rightLabels?: unknown;
      }
    | undefined;
  if (typeof p?.cut !== 'number') return null;
  if (typeof p.tried !== 'number' || typeof p.total !== 'number') return null;
  return {
    cut: p.cut,
    leftLabels: stringsOf(p.leftLabels),
    leftMixed: p.leftMixed === true,
    rightLabels: stringsOf(p.rightLabels),
    rightMixed: p.rightMixed === true,
    tried: p.tried,
    total: p.total,
  };
}

function readRaised(payload: unknown): Raised | null {
  const p = payload as { xs?: unknown; height?: unknown } | undefined;
  if (typeof p?.height !== 'number') return null;
  return { xs: numbersOf(p.xs), height: p.height };
}

function readSplit(payload: unknown): Split | null {
  const p = payload as { belowLabel?: unknown; aboveLabel?: unknown } | undefined;
  if (typeof p?.belowLabel !== 'string' || typeof p.aboveLabel !== 'string') return null;
  return { belowLabel: p.belowLabel, aboveLabel: p.aboveLabel };
}

function readHeight(payload: unknown): number | null {
  const p = payload as { height?: unknown } | undefined;
  return typeof p?.height === 'number' ? p.height : null;
}

/** 화면에 새기는 수 — 정수는 정수로, 반은 반으로. */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export const kernelLiftsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as KernelLiftsStage;
  const tr = runtime?.t ?? makeTranslator();

  let points: KernelLiftsPoint[] = [];

  return {
    onInit(initialData: unknown): void {
      points = readKernelLiftsPoints(initialData);
      stage.setScene(points);
    },

    onReset(): void {
      stage.setScene(points);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'line-shown': {
          stage.setCaption(
            tr('caption.line', 'They all sit on one line — A in the middle, B outside.'),
          );
          await stage.showLine();
          return;
        }

        case 'cut-tried': {
          const p = readCutTried(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.cut', 'Cut here — one side still holds both. ({k}/{n})', {
              k: p.tried,
              n: p.total,
            }),
          );
          await stage.tryCut({
            cut: p.cut,
            leftLabels: p.leftLabels,
            leftMixed: p.leftMixed,
            rightLabels: p.rightLabels,
            rightMixed: p.rightMixed,
          });
          return;
        }

        case 'cut-exhausted': {
          stage.setCaption(
            tr('caption.noCut', 'Every cut on the line has been tried. None works.'),
          );
          await stage.dropKnife();
          return;
        }

        case 'height-opened': {
          const ticks = numbersOf((event.payload as { ticks?: unknown } | undefined)?.ticks);
          stage.setCaption(
            tr('caption.open', 'So open a direction that was not there — up.'),
          );
          await stage.openHeight(ticks);
          return;
        }

        case 'point-raised': {
          const p = readRaised(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.rise', 'Each rises by its own value squared — height {h}.', {
              h: num(p.height),
            }),
          );
          await stage.raise(p.xs, p.height);
          return;
        }

        case 'curve-traced': {
          stage.setCaption(
            tr('caption.curve', 'Where they landed is not flat. It curves.'),
          );
          await stage.traceCurve();
          return;
        }

        case 'cut-placed': {
          const h = readHeight(event.payload);
          if (h === null) return;
          stage.setCaption(
            tr('caption.place', 'Now one straight line comes down — height {h}.', {
              h: num(h),
            }),
          );
          await stage.placeCut(h);
          return;
        }

        case 'split-verified': {
          const p = readSplit(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.verify', 'All {below} below, all {above} above — nothing mixed.', {
              below: p.belowLabel,
              above: p.aboveLabel,
            }),
          );
          await stage.markSplit(p.belowLabel, p.aboveLabel);
          return;
        }

        case 'rewind': {
          stage.setScene(points);
          return;
        }

        case 'done': {
          stage.setCaption(
            tr('caption.done', 'It was never unsplittable. The room was too small.'),
          );
          await stage.settle();
          return;
        }

        default:
          // 이 조각이 내는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
