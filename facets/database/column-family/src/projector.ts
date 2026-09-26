/**
 * 컬럼 패밀리 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 재생 속도를 따라간다 — 걸음마다 `runtime.getSpeed()` 를 그때그때 읽는다.
 * 새 판의 걸음 0 에서 코드 패널 강조를 지운다.
 */
import { makeTranslator, type ProjectorFactory, type ProjectorViews } from '@ffacet/core/runtime';
import type { ColumnFamilyStage, StageBar, StageCell, StageCellState, StageFamily } from './column-family-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

/** 운동의 기본 길이 (ms, 배속 1) */
const MOTION = { round: 400, store: 1000, lift: 600, count: 800 } as const;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`columnFamilyProjector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`columnFamilyProjector: ${what} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`columnFamilyProjector: ${what} 가 글자가 아니다`);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`columnFamilyProjector: ${what} 가 배열이 아니다`);
  return v;
}

function readCell(v: unknown): StageCell {
  const o = obj(v, 'cell');
  return { row: str(o.row, 'cell.row'), column: str(o.column, 'cell.column'), value: str(o.value, 'cell.value') };
}

function readState(v: unknown): StageCellState {
  const o = obj(v, 'cell');
  const state = o.state;
  if (state !== 'used' && state !== 'fetched' && state !== 'unread') throw new Error(`columnFamilyProjector: 모르는 칸 상태 ${String(state)}`);
  return { row: str(o.row, 'cell.row'), column: str(o.column, 'cell.column'), state };
}

function readBar(v: unknown): StageBar {
  const o = obj(v, 'bar');
  return { grouping: num(o.grouping, 'bar.grouping'), pages: num(o.pages, 'bar.pages') };
}

export const columnFamilyProjector: ProjectorFactory = (views: ProjectorViews, runtime) => {
  const stage = views.stage as unknown as ColumnFamilyStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const ms = (base: number) => base / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onReset() {
      stage?.reset();
      codePanel?.highlightPhase?.(null);
    },

    async onEvent(e) {
      const p = e.payload;
      switch (e.type) {
        case 'phase': {
          codePanel?.highlightPhase?.(str(obj(p, 'phase').phase, 'phase'));
          return;
        }
        case 'round': {
          const o = obj(p, 'round');
          codePanel?.highlightPhase?.(null);
          await stage?.startRound({
            sql: str(o.sql, 'sql'),
            grouping: num(o.grouping, 'grouping'),
            caption: t('caption.start', 'Table {table} · rows: {rows} · columns: {cols} · columns asked: {asked}', {
              table: str(o.table, 'table'),
              rows: num(o.rowCount, 'rowCount'),
              cols: num(o.columnCount, 'columnCount'),
              asked: num(o.askedCount, 'askedCount'),
            }),
            ms: ms(MOTION.round),
          });
          return;
        }
        case 'store': {
          const o = obj(p, 'store');
          const families: StageFamily[] = arr(o.families, 'families').map((f) => {
            const fam = obj(f, 'family');
            const name = str(fam.name, 'family.name');
            return {
              name,
              label: t('label.family', '{name} · pages: {n}', { name, n: num(fam.pageCount, 'family.pageCount') }),
              pages: arr(fam.pages, 'family.pages').map((pg) => ({ cells: arr(obj(pg, 'page').cells, 'page.cells').map(readCell) })),
            };
          });
          await stage?.store({
            families,
            caption: t('caption.store', 'Families: {names} · pages: {pages}', {
              names: families.map((f) => f.name).join(', '),
              pages: num(o.pageCount, 'pageCount'),
            }),
            ms: ms(MOTION.store),
          });
          return;
        }
        case 'lift': {
          const o = obj(p, 'lift');
          const lifted = arr(o.lifted, 'lifted').map((n) => str(n, 'lifted[]'));
          await stage?.lift({
            lifted,
            cells: arr(o.cells, 'cells').map(readState),
            caption: t('caption.lift', 'Families lifted: {names} · pages read: {pages}', {
              names: lifted.join(', '),
              pages: num(o.pagesRead, 'pagesRead'),
            }),
            ms: ms(MOTION.lift),
          });
          return;
        }
        case 'count': {
          const o = obj(p, 'count');
          await stage?.count({
            bars: arr(o.bars, 'bars').map(readBar),
            fewest: num(o.fewest, 'fewest'),
            scale: num(o.scale, 'scale'),
            caption: t('caption.count', 'Cells fetched: {fetched} · cells used: {used}', {
              fetched: num(o.cellsFetched, 'cellsFetched'),
              used: num(o.cellsUsed, 'cellsUsed'),
            }),
            ms: ms(MOTION.count),
          });
          return;
        }
        default:
          return;
      }
    },
  };
};
