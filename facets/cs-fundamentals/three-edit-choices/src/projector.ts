/**
 * three-edit-choices 의 번역기.
 *
 * algorithm 이 내보내는 값(이웃 셋 · 세 후보 · 이긴 것)을 stage 의 메서드 호출로
 * 옮기고, 지금 무슨 일이 일어나는지를 말하는 캡션을 조회해 얹는다. 문안은 선언에
 * 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

import type {
  Branch,
  OffersView,
  OpenCellView,
  SettleView,
  WeighView,
} from './three-edit-choices-stage.js';

/** stage 의 계약. 열린 타입(ViewInstance) 을 여기서 한 번만 좁힌다 (C9). */
type Stage = {
  setCaption?(value: string): void;
  openCell?(v: OpenCellView): Promise<void>;
  offer?(v: OffersView): Promise<void>;
  weigh?(v: WeighView): Promise<void>;
  settle?(v: SettleView): Promise<void>;
  finish?(): Promise<void>;
  rewind?(): void;
};

const BRANCHES: readonly string[] = ['delete', 'insert', 'diag'];

/** 오픈 타입인 payload 를 좁히는 자리. 단언 뒤에 반드시 검사가 온다 (C9). */
function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOpenCell(payload: unknown): OpenCellView | null {
  const p = fields(payload);
  if (!p) return null;
  const i = num(p.i);
  const j = num(p.j);
  const up = num(p.up);
  const left = num(p.left);
  const diag = num(p.diag);
  const levels = num(p.levels);
  if (i === null || j === null || up === null || left === null || diag === null || levels === null) {
    return null;
  }
  return {
    i,
    j,
    rowChar: typeof p.rowChar === 'string' ? p.rowChar : '',
    colChar: typeof p.colChar === 'string' ? p.colChar : '',
    same: p.same === true,
    up,
    left,
    diag,
    levels,
  };
}

function readOffers(payload: unknown): OffersView | null {
  const p = fields(payload);
  if (!p) return null;
  const del = num(p.del);
  const ins = num(p.ins);
  const sub = num(p.sub);
  const subCost = num(p.subCost);
  if (del === null || ins === null || sub === null || subCost === null) return null;
  return { del, ins, sub, subCost };
}

function readWeigh(payload: unknown): WeighView | null {
  const p = fields(payload);
  if (!p) return null;
  const best = num(p.best);
  if (best === null || !Array.isArray(p.winners)) return null;
  const winners = p.winners.filter(
    (v): v is Branch => typeof v === 'string' && BRANCHES.includes(v),
  );
  return { best, winners };
}

function readSettle(payload: unknown): SettleView | null {
  const p = fields(payload);
  if (!p) return null;
  const i = num(p.i);
  const j = num(p.j);
  const value = num(p.value);
  if (i === null || j === null || value === null) return null;
  return { i, j, value };
}

export const threeEditChoicesProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'cell-open': {
          const v = readOpenCell(event.payload);
          if (!v) return;
          stage.setCaption?.(
            tr('caption.open', 'Cell ({i},{j}) — the two letters that meet here: {a} and {b}.', {
              i: v.i,
              j: v.j,
              a: v.rowChar,
              b: v.colChar,
            }),
          );
          await stage.openCell?.(v);
          return;
        }
        case 'offers': {
          const v = readOffers(event.payload);
          if (!v) return;
          stage.setCaption?.(
            v.subCost === 0
              ? tr('caption.offerFree', 'The two letters are the same, so the diagonal adds nothing.')
              : tr('caption.offer', 'Each neighbour hands over its value plus its own cost.'),
          );
          await stage.offer?.(v);
          return;
        }
        case 'weigh': {
          const v = readWeigh(event.payload);
          if (!v) return;
          stage.setCaption?.(
            v.winners.length > 1
              ? tr('caption.weighTie', 'Two offers are level at {v} — either path gives the same answer.', {
                  v: v.best,
                })
              : tr('caption.weigh', 'The cheapest offer settles at {v}.', { v: v.best }),
          );
          await stage.weigh?.(v);
          return;
        }
        case 'settle': {
          const v = readSettle(event.payload);
          if (!v) return;
          stage.setCaption?.(
            tr('caption.settle', 'The winner moves in. Cell ({i},{j}) holds {v}.', {
              i: v.i,
              j: v.j,
              v: v.value,
            }),
          );
          await stage.settle?.(v);
          return;
        }
        case 'done': {
          stage.setCaption?.(
            tr('caption.done', 'Every cell in the table is decided by this contest.'),
          );
          await stage.finish?.();
          return;
        }
        case 'rewind': {
          stage.rewind?.();
          return;
        }
        default:
          // 위 여섯 말고는 이 facet 에서 오지 않는다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
