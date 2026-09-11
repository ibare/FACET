/**
 * space-error-tradeoff projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. `typeof` / `Array.isArray` 로 정형 객체를
 * 조립해 넘기고 stage 는 필수 필드 타입으로 받는다 (C9).
 * 문안은 키와 en 원본만 여기 있고 정본은 `facet.ts` 의 messages 다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';

type SpaceErrorTradeoffStage = {
  setCaption?(text: string): void;
  showStage?(args: { index: number; width: number; counts: number[][] }): Promise<void> | void;
  showReads?(args: { estimates: number[]; truth: number }): Promise<void> | void;
  rewind?(): void;
};

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((v) => num(v, 0)) : [];
}

function numMatrix(value: unknown): number[][] {
  return Array.isArray(value) ? value.map((row) => numArray(row)) : [];
}

/** payload 는 설계상 열린 타입이라 좁히개를 거친다. 뒤따르는 검사가 본체다 (C9). */
function fields(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function fillVars(text: string, vars?: Record<string, string | number>): string {
  if (vars === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

export const spaceErrorTradeoffProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as SpaceErrorTradeoffStage | undefined;
  // 러너 밖에서 projector 만 돌려 보는 경우를 위한 fallback. 러너 안에서는
  // 언제나 runtime.t 가 오고, 거기에는 저작자 오버라이드가 이미 얹혀 있다.
  const tr: Translate = runtime?.t ?? ((_key, fallback, vars) => fillVars(fallback, vars));

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (stage === undefined) return;
      const p = fields(event.payload);

      switch (event.type) {
        case 'stage-begin': {
          const width = num(p.width, 1);
          stage.setCaption?.(
            tr(
              'caption.stage',
              'Width {width}: {depth} rows x {width} columns = {cells} cells. Items counted: {total}.',
              {
                width,
                depth: num(p.depth, 0),
                cells: num(p.cells, 0),
                total: num(p.total, 0),
              },
            ),
          );
          await stage.showStage?.({
            index: num(p.index, 0),
            width,
            counts: numMatrix(p.counts),
          });
          return;
        }

        case 'reads-taken': {
          stage.setCaption?.(
            tr(
              'caption.reads',
              'Reading all {keyCount} keys back. Overshoot total: {errorSum}. Exact hits: {exact}.',
              {
                keyCount: num(p.keyCount, 0),
                errorSum: num(p.errorSum, 0),
                exact: num(p.exact, 0),
              },
            ),
          );
          await stage.showReads?.({
            estimates: numArray(p.estimates),
            truth: num(p.truth, 0),
          });
          return;
        }

        case 'done': {
          stage.setCaption?.(
            tr(
              'caption.done',
              'Narrower table, more swollen reads. Overshoot at {cellsMin} cells: {errorMax}. At {cellsMax} cells: {errorMin}.',
              {
                cellsMin: num(p.cellsMin, 0),
                errorMax: num(p.errorMax, 0),
                cellsMax: num(p.cellsMax, 0),
                errorMin: num(p.errorMin, 0),
              },
            ),
          );
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다. 조용히 버린다.
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
