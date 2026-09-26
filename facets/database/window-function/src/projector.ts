/**
 * window-function projector — algorithm 의 걸음 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * payload 는 typeof 로 좁혀 읽는다. 빠진 값은 지어내지 않고 던진다 (C6 · C9).
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 로 나눈다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { WindowFunctionStage, WindowFunctionStageRow } from './window-function-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const fail = (what: string): never => {
  throw new Error(`window-function projector: ${what}`);
};

const rec = (x: unknown, what: string): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : fail(what);
const num = (x: unknown, what: string): number => (typeof x === 'number' && Number.isFinite(x) ? x : fail(what));
const str = (x: unknown, what: string): string => (typeof x === 'string' ? x : fail(what));
const arr = (x: unknown, what: string): unknown[] => (Array.isArray(x) ? x : fail(what));
const strs = (x: unknown, what: string): string[] => arr(x, what).map((s) => str(s, what));

export const windowFunctionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as WindowFunctionStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;
  let aliases: { alias: string; groupAlias: string } | null = null;

  const dur = (): number => {
    if (motionMs === null) return fail('motionMs 를 받기 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onInit(data) {
      motionMs = num(rec(data, 'data').motionMs, 'motionMs');
      code?.clearHighlight?.();
    },

    onEvent(e) {
      const p = e.payload;
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase?.(str(rec(p, 'phase').phase, 'phase'));
          return;
        }
        case 'table': {
          const o = rec(p, 'table');
          const rows: WindowFunctionStageRow[] = arr(o.rows, 'rows').map((r) => {
            const x = rec(r, 'row');
            return { id: num(x.id, 'id'), team: str(x.team, 'team'), km: num(x.km, 'km') };
          });
          const sql = rec(o.windowSql, 'windowSql');
          aliases = { alias: str(o.alias, 'alias'), groupAlias: str(o.groupAlias, 'groupAlias') };
          code?.highlightPhase?.(null);
          stage?.showTable(
            {
              clause: str(o.clause, 'clause'),
              rows,
              columns: strs(o.columns, 'columns'),
              alias: str(o.alias, 'alias'),
              groupAlias: str(o.groupAlias, 'groupAlias'),
              windowSql: { head: strs(sql.head, 'head'), close: str(sql.close, 'close'), tail: strs(sql.tail, 'tail') },
              groupSql: strs(o.groupSql, 'groupSql'),
            },
            dur(),
          );
          stage?.setCaption(
            t('caption.start', 'Frame rows back and ahead: {reach} · window result rows: {rows}', {
              reach: str(o.reach, 'reach'),
              rows: num(o.windowRows, 'windowRows'),
            }),
          );
          return;
        }
        case 'gather': {
          const o = rec(p, 'gather');
          const slots = arr(o.slots, 'slots').map((s) => {
            const x = rec(s, 'slot');
            return { row: num(x.row, 'row'), part: num(x.part, 'part'), pos: num(x.pos, 'pos') };
          });
          const parts = arr(o.parts, 'parts').map((s) => {
            const x = rec(s, 'part');
            return { team: str(x.team, 'team'), size: num(x.size, 'size') };
          });
          const widest = num(o.widest, 'widest');
          stage?.gather({ slots, parts, widest }, dur());
          stage?.setCaption(
            t('caption.gather', 'Rows line up by team, then by id · partitions: {parts} · rows in the largest: {widest}', {
              parts: parts.length,
              widest,
            }),
          );
          return;
        }
        case 'frames': {
          const o = rec(p, 'frames');
          const rows = arr(o.rows, 'rows').map((s) => {
            const x = rec(s, 'frame');
            return { row: num(x.row, 'row'), lo: num(x.lo, 'lo'), hi: num(x.hi, 'hi'), near: num(x.near, 'near') };
          });
          stage?.showFrames({ part: num(o.part, 'part'), rows }, dur());
          stage?.setCaption(
            t('caption.frames', 'Partition {team} · rows in partition: {size} · rows in the widest frame: {widest}', {
              team: str(o.team, 'team'),
              size: num(o.size, 'size'),
              widest: num(o.widest, 'widest'),
            }),
          );
          return;
        }
        case 'fold': {
          const o = rec(p, 'fold');
          const groups = arr(o.groups, 'groups').map((s) => {
            const x = rec(s, 'group');
            return {
              team: str(x.team, 'team'),
              total: num(x.total, 'total'),
              rows: arr(x.rows, 'rows').map((r) => num(r, 'row')),
            };
          });
          stage?.fold({ groups }, dur());
          stage?.setCaption(
            t('caption.fold', 'GROUP BY folds the rows · rows before: {from} · rows after: {to}', {
              from: num(o.from, 'from'),
              to: num(o.to, 'to'),
            }),
          );
          return;
        }
        case 'same': {
          const o = rec(p, 'same');
          const links = arr(o.links, 'links').map((s) => {
            const x = rec(s, 'link');
            return { row: num(x.row, 'row'), part: num(x.part, 'part') };
          });
          if (aliases === null) return fail('열 이름을 받기 전에 같은 줄이 왔다');
          stage?.link({ links }, dur());
          stage?.setCaption(
            t(
              'caption.same',
              'Rows where {alias} equals {groupAlias}: {same} of {rows} · distinct {alias} values: {distinct} · GROUP BY rows: {groups}',
              {
                alias: aliases.alias,
                groupAlias: aliases.groupAlias,
                same: num(o.same, 'same'),
                rows: num(o.rows, 'rows'),
                distinct: num(o.distinct, 'distinct'),
                groups: num(o.groups, 'groups'),
              },
            ),
          );
          return;
        }
        default:
          return;
      }
    },

    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
