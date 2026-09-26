/**
 * dml projector — algorithm 의 `order-set` · `statement` · `phase` 를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 로 읽고, 모양이 어긋나면 던진다 (C9 · C6). 줄의 값은 무대가 그릴 글자로 바꿔 넘긴다.
 * 운동의 길이는 재생 속도를 그때그때 읽어 정한다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { DmlRowView, DmlSetupView, DmlStatementView } from './dml-stage.js';

/** 한 걸음의 운동 길이 (속도 1 에서) */
const MOTION_MS = 800;

type DmlStage = {
  setup(view: DmlSetupView, ms: number): Promise<void>;
  runStatement(view: DmlStatementView, ms: number): Promise<void>;
  setCaption(text: string): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type Obj = Record<string, unknown>;

function obj(x: unknown, what: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`dml: ${what} 가 객체가 아니다`);
  return x as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`dml: ${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`dml: ${key} 가 글자가 아니다`);
  return v;
}
function arr(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`dml: ${key} 가 목록이 아니다`);
  return v;
}
function strs(o: Obj, key: string): string[] {
  return arr(o, key).map((x) => {
    if (typeof x !== 'string') throw new Error(`dml: ${key} 에 글자가 아닌 것이 있다`);
    return x;
  });
}
function nums(o: Obj, key: string): number[] {
  return arr(o, key).map((x) => {
    if (typeof x !== 'number') throw new Error(`dml: ${key} 에 수가 아닌 것이 있다`);
    return x;
  });
}
function cellText(x: unknown): string {
  if (typeof x === 'number') return String(x);
  if (typeof x === 'string') return x;
  if (x === null) return 'NULL';
  throw new Error('dml: 칸의 값이 수도 글자도 아니다');
}
function row(x: unknown): DmlRowView {
  const o = obj(x, 'row');
  return { slot: num(o, 'slot'), values: arr(o, 'values').map(cellText) };
}

export const dmlProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DmlStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime ? runtime.getSpeed() : 1);

  return {
    async onEvent(e) {
      switch (e.type) {
      case 'phase': {
        const p = obj(e.payload, 'phase payload');
        code?.highlightPhase?.(str(p, 'phase'));
        return;
      }
      case 'order-set': {
        const p = obj(e.payload, 'order-set payload');
        const view: DmlSetupView = {
          order: str(p, 'order'),
          statements: arr(p, 'statements').map((x) => {
            const s = obj(x, 'statement');
            return { position: num(s, 'position'), key: str(s, 'key'), kind: str(s, 'kind'), sql: strs(s, 'sql') };
          }),
          schemaSql: strs(p, 'schemaSql'),
          table: str(p, 'table'),
          columns: strs(p, 'columns'),
          rows: arr(p, 'rows').map(row),
        };
        const rowCount = num(p, 'rowCount');
        code?.clearHighlight?.();
        stage?.setCaption(t('caption.start', 'Order {order} · starting rows: {rows}', { order: view.order, rows: rowCount }));
        await stage?.setup(view, motion());
        return;
      }
      case 'statement': {
        const p = obj(e.payload, 'statement payload');
        const inserted = p.inserted === null ? null : row(p.inserted);
        const view: DmlStatementView = {
          step: num(p, 'step'),
          key: str(p, 'key'),
          kind: str(p, 'kind'),
          whereColumn: num(p, 'whereColumn'),
          hits: nums(p, 'hits'),
          changes: arr(p, 'changes').map((x) => {
            const c = obj(x, 'change');
            return { slot: num(c, 'slot'), column: num(c, 'column'), from: cellText(c.from), to: cellText(c.to) };
          }),
          inserted,
          removed: nums(p, 'removed'),
          rows: arr(p, 'rows').map(row),
          affected: num(p, 'affected'),
        };
        const rowCount = num(p, 'rowCount');
        const seen = num(p, 'seen');
        const text =
          view.kind === 'INSERT'
            ? t('caption.insert', 'Statement {k} {kind} · affected rows: {affected} · rows now: {rows}', {
                k: view.step,
                kind: view.kind,
                affected: view.affected,
                rows: rowCount,
              })
            : t(
                'caption.where',
                'Statement {k} {kind} · rows its WHERE checked: {seen} · affected rows: {affected} · rows now: {rows}',
                { k: view.step, kind: view.kind, seen, affected: view.affected, rows: rowCount },
              );
        stage?.setCaption(text);
        await stage?.runStatement(view, motion());
        return;
      }
      default:
        return;
      }
    },
  };
};
