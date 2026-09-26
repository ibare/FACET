/**
 * subquery projector — algorithm 이벤트를 subquery-stage 호출과 캡션으로 옮긴다.
 *
 * 셈은 하지 않는다. payload 를 typeof 로 좁혀 무대에 넘기고, 캡션 문안은 messages 의 키로 짓는다.
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 — 속도를 바꾸면 곧바로 따라간다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { SubqueryStage, SubqueryStageRow } from './subquery-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

type Payload = Record<string, unknown>;

function num(p: Payload, key: string): number {
  const value = p[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`subquery projector: '${key}' 가 수가 아니다`);
  return value;
}

function str(p: Payload, key: string): string {
  const value = p[key];
  if (typeof value !== 'string') throw new Error(`subquery projector: '${key}' 가 글자가 아니다`);
  return value;
}

function bool(p: Payload, key: string): boolean {
  const value = p[key];
  if (typeof value !== 'boolean') throw new Error(`subquery projector: '${key}' 가 참거짓이 아니다`);
  return value;
}

function strList(p: Payload, key: string): string[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`subquery projector: '${key}' 가 목록이 아니다`);
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error(`subquery projector: '${key}' 에 글자 아닌 것이 있다`);
    return item;
  });
}

function numList(p: Payload, key: string): number[] {
  const value = p[key];
  if (!Array.isArray(value)) throw new Error(`subquery projector: '${key}' 가 목록이 아니다`);
  return value.map((item) => {
    if (typeof item !== 'number') throw new Error(`subquery projector: '${key}' 에 수 아닌 것이 있다`);
    return item;
  });
}

function rowList(p: Payload): SubqueryStageRow[] {
  const value = p.rows;
  if (!Array.isArray(value)) throw new Error("subquery projector: 'rows' 가 목록이 아니다");
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('subquery projector: 줄이 객체가 아니다');
    const row = item as Payload;
    return { cells: strList(row, 'cells'), group: num(row, 'group') };
  });
}

function asPayload(value: unknown): Payload {
  if (typeof value !== 'object' || value === null) throw new Error('subquery projector: payload 가 없다');
  return value as Payload;
}

export const subqueryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SubqueryStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs = 0;
  const dur = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onInit(data) {
      const value = (data as Payload).motionMs;
      if (typeof value !== 'number') throw new Error('subquery projector: initialData.motionMs 가 수가 아니다');
      motionMs = value;
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase(str(asPayload(event.payload), 'phase'));
          return;
        }
        case 'round': {
          if (stage === undefined) return;
          const p = asPayload(event.payload);
          const n = num(p, 'n');
          const table = str(p, 'table');
          code?.clearHighlight();
          stage.setRound({
            correlated: bool(p, 'correlated'),
            n,
            table,
            columns: strList(p, 'columns'),
            sql: strList(p, 'sql'),
            rows: rowList(p),
            caption: t('caption.start', 'Table {table}: {n} rows. The inner query has not run yet.', { table, n }),
            dur: dur(),
          });
          return;
        }
        case 'inner': {
          if (stage === undefined) return;
          const p = asPayload(event.payload);
          const outer = num(p, 'outer');
          const vars = {
            run: num(p, 'run'),
            read: num(p, 'read'),
            total: num(p, 'total'),
            count: num(p, 'count'),
            value: num(p, 'value'),
          };
          const caption =
            outer < 0
              ? t(
                  'caption.innerOnce',
                  'Inner run {run}: reads {read} rows, AVG(pay) = {total} / {count} = {value}',
                  vars,
                )
              : t(
                  'caption.innerAgain',
                  'Inner run {run} for outer row {name} (dept {key}): reads {read} rows, keeps {count}, AVG(pay) = {total} / {count} = {value}',
                  { ...vars, name: str(p, 'outerName'), key: str(p, 'key') },
                );
          stage.innerRun({
            run: vars.run,
            outer,
            group: num(p, 'group'),
            picked: numList(p, 'picked'),
            value: vars.value,
            caption,
            dur: dur(),
          });
          return;
        }
        case 'compare': {
          if (stage === undefined) return;
          const p = asPayload(event.payload);
          const passed = bool(p, 'passed');
          const vars = {
            name: str(p, 'name'),
            pay: num(p, 'pay'),
            value: num(p, 'value'),
            kept: num(p, 'kept'),
          };
          const caption = passed
            ? t('caption.pass', '{name}: pay {pay} > {value} is true. Result rows so far: {kept}', vars)
            : t('caption.fail', '{name}: pay {pay} > {value} is false. Result rows so far: {kept}', vars);
          stage.compare({
            index: num(p, 'index'),
            name: vars.name,
            value: vars.value,
            passed,
            kept: vars.kept,
            caption,
            dur: dur(),
          });
          return;
        }
        default:
          return;
      }
    },
  };
};
