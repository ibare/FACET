/**
 * bagging-sample projector — 뽑기 이벤트를 무대의 왕복 동작으로 옮긴다.
 *
 * 문안은 여기서 키로만 조회하고 (`runtime.t`), 실제 글은 `facet.ts` 의
 * `messages` 가 가진다 (C10). payload 는 여기서 좁혀 stage 로 넘긴다 (C9).
 */

import {
  makeTranslator,
  toIndexArray,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

import {
  readBaggingSetup,
  type BaggingDrawInput,
  type BaggingLeftOutInput,
  type BaggingSetup,
} from './bagging-sample-stage.js';

type BaggingStage = {
  setup(setup: BaggingSetup): void;
  draw(p: BaggingDrawInput): Promise<void>;
  leftOut(p: BaggingLeftOutInput): Promise<void>;
  finish(caption: string): void;
  rewind(): void;
};

type DrawPayload = {
  set?: unknown;
  slot?: unknown;
  value?: unknown;
  count?: unknown;
  first?: unknown;
};

type LeftOutPayload = {
  set?: unknown;
  values?: unknown;
  ratio?: unknown;
};

type DonePayload = {
  theoretical?: unknown;
};

/** 비율을 백분율 표기로. 0.25 → "25", 0.34360891 → "34.4". */
function percent(x: number): string {
  return String(Math.round(x * 1000) / 10);
}

export const baggingSampleProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as BaggingStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 화면이 말하는 수는 전부 여기서 온다 — 지어내지 않는다. */
  let setup: BaggingSetup = { pool: [], sets: [] };

  return {
    onInit(initialData: unknown): void {
      setup = readBaggingSetup(initialData);
      stage?.setup(setup);
    },

    async onEvent(event): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'draw': {
          const p = event.payload as DrawPayload | undefined;
          const poolIndex = toIndexArray(event.target)[0];
          if (
            typeof p?.set !== 'number' ||
            typeof p.slot !== 'number' ||
            typeof p.value !== 'number' ||
            typeof p.count !== 'number' ||
            typeof poolIndex !== 'number'
          ) {
            return;
          }
          const first = p.first === true;
          let caption: string;
          if (first) {
            caption = tr(
              'caption.setBegin',
              'Bag {set}: draw one and put it back, {k} times.',
              { set: p.set + 1, k: setup.sets[p.set]?.length ?? 0 },
            );
          } else if (p.count > 1) {
            caption = tr('caption.drawAgain', 'Put back, so out it comes again: {value}', {
              value: p.value,
            });
          } else {
            caption = tr(
              'caption.draw',
              'Drawn, copied into the bag, then put back: {value}',
              { value: p.value },
            );
          }
          await stage.draw({
            set: p.set,
            slot: p.slot,
            value: p.value,
            poolIndex,
            count: p.count,
            first,
            caption,
          });
          return;
        }

        case 'left-out': {
          const p = event.payload as LeftOutPayload | undefined;
          if (typeof p?.set !== 'number' || typeof p.ratio !== 'number') return;
          const values = Array.isArray(p.values)
            ? p.values.filter((v): v is number => typeof v === 'number')
            : [];
          await stage.leftOut({
            set: p.set,
            values,
            indices: toIndexArray(event.target),
            ratioLabel: `${percent(p.ratio)}%`,
            caption: tr('caption.leftOut', 'What never came out stays behind: {values}', {
              values: values.join(', '),
            }),
          });
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const theoretical = typeof p?.theoretical === 'number' ? p.theoretical : 0;
          stage.finish(
            tr(
              'caption.done',
              'Every bag leaves out something different. The chance of never being drawn is {theory}%.',
              { theory: percent(theoretical) },
            ),
          );
          return;
        }

        case 'rewind': {
          stage.rewind();
          return;
        }

        default:
          // 이 알고리즘은 위 넷만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
