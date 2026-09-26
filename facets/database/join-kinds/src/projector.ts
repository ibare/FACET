/**
 * join-kinds projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 그때그때 읽어 나눈다 (짝 맞춤 · 짝 없는 줄 800ms, CROSS 의 모든 짝 1200ms).
 */
import { makeTranslator, type ProjectorFactory, type ViewInstance } from '@ffacet/core/runtime';
import type { JoinKindsStage, StageRow, StageSpec, StageTable } from './join-kinds-stage.js';

const MOTION_MS = 800;
const CROSS_MOTION_MS = 1200;

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`join-kinds: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`join-kinds: ${what} 이 글이 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`join-kinds: ${what} 이 수가 아니다`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`join-kinds: ${what} 이 참거짓이 아니다`);
  return v;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`join-kinds: ${what} 이 목록이 아니다`);
  return v;
}

function readRows(v: unknown): StageRow[] {
  return list(v, 'rows').map((raw, i) => {
    const r = obj(raw, `rows[${i}]`);
    return {
      l: num(r.l, 'rows.l'),
      r: num(r.r, 'rows.r'),
      slot: num(r.slot, 'rows.slot'),
      leftText: str(r.leftText, 'rows.leftText'),
      rightText: str(r.rightText, 'rows.rightText'),
      held: bool(r.held, 'rows.held'),
    };
  });
}

function readTable(v: unknown, sourceCol: string, what: string): StageTable & { alias: string } {
  const tb = obj(v, what);
  const name = str(tb.name, `${what}.name`);
  const alias = str(tb.alias, `${what}.alias`);
  const cols = list(tb.cols, `${what}.cols`).map((c) => str(c, `${what}.cols`));
  const rows = list(tb.rows, `${what}.rows`).map((row) =>
    list(row, `${what}.rows`).map((cell) => {
      if (typeof cell === 'number') return String(cell);
      return str(cell, `${what} 칸`);
    }),
  );
  const source = cols.indexOf(sourceCol);
  if (source < 0) throw new Error(`join-kinds: ${name} 에 열 ${sourceCol} 이 없다`);
  return { title: `${name} ${alias}`, alias, cols, rows, source };
}

export const joinKindsProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as (JoinKindsStage & ViewInstance) | undefined;
  const code = views.codePanel as unknown as (CodePanel & ViewInstance) | undefined;
  const motion = (ms: number) => ms / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(initialData: unknown) {
      if (!stage) return;
      const d = obj(initialData, 'initialData');
      const select = obj(d.select, 'select');
      const left = readTable(d.left, str(select.left, 'select.left'), 'left');
      const right = readTable(d.right, str(select.right, 'select.right'), 'right');
      const spec: StageSpec = {
        sqlHead: list(d.sqlHead, 'sqlHead').map((s) => str(s, 'sqlHead')),
        left,
        right,
        resultCols: [`${left.alias}.${str(select.left, 'select.left')}`, `${right.alias}.${str(select.right, 'select.right')}`],
      };
      stage.init(spec);
      stage.setCaption(t('caption.ready', 'Two tables and one query'));
    },

    async onEvent(e) {
      const p = typeof e.payload === 'object' && e.payload !== null ? (e.payload as Record<string, unknown>) : {};
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        case 'round': {
          code?.clearHighlight();
          if (!stage) return;
          const held = num(p.held, 'held');
          const keyword = str(p.keyword, 'keyword');
          stage.clearMarks();
          stage.setCaption(
            held > 0
              ? t('caption.roundHeld', '{keyword} JOIN · previous result rows to sort out: {n}', { keyword, n: held })
              : t('caption.round', '{keyword} JOIN · two tables and one query', { keyword }),
          );
          const onLine = p.onLine === null ? null : str(p.onLine, 'onLine');
          await Promise.all([
            stage.setQuery({ keyword, joinTail: str(p.joinTail, 'joinTail'), onLine }, motion(MOTION_MS)),
            stage.setRows(readRows(p.rows), motion(MOTION_MS)),
          ]);
          return;
        }
        case 'pairs': {
          if (!stage) return;
          const cross = bool(p.cross, 'cross');
          const n = num(p.matched, 'matched');
          stage.setCaption(
            cross
              ? t('caption.cross', 'No condition · {left} {nl} × {right} {nr} = result rows: {n}', {
                  left: str(p.leftName, 'leftName'),
                  nl: num(p.nLeft, 'nLeft'),
                  right: str(p.rightName, 'rightName'),
                  nr: num(p.nRight, 'nRight'),
                  n,
                })
              : t('caption.pairs', 'Matched rows: {n} · key compares: {c}', { n, c: num(p.compares, 'compares') }),
          );
          await stage.setRows(readRows(p.rows), motion(cross ? CROSS_MOTION_MS : MOTION_MS));
          return;
        }
        case 'left-side':
        case 'right-side': {
          if (!stage) return;
          const side = e.type === 'left-side' ? 'left' : 'right';
          const unmatched = list(p.unmatched, 'unmatched').map((x) => num(x, 'unmatched'));
          const names = list(p.names, 'names')
            .map((x) => str(x, 'names'))
            .join(', ');
          const kept = bool(p.kept, 'kept');
          const nullText = str(p.nullText, 'nullText');
          stage.markUnmatched(side, unmatched);
          const n = unmatched.length;
          if (side === 'left') {
            stage.setCaption(
              kept
                ? t('caption.keepLeft', 'Unmatched on the left: {n} · kept, right side {null}: {names}', { n, null: nullText, names })
                : t('caption.dropLeft', 'Unmatched on the left: {n} · dropped from the result: {names}', { n, names }),
            );
          } else {
            stage.setCaption(
              kept
                ? t('caption.keepRight', 'Unmatched on the right: {n} · kept, left side {null}: {names}', { n, null: nullText, names })
                : t('caption.dropRight', 'Unmatched on the right: {n} · dropped from the result: {names}', { n, names }),
            );
          }
          await stage.setRows(readRows(p.rows), motion(MOTION_MS));
          return;
        }
        default:
          return;
      }
    },

    onReset() {
      code?.clearHighlight();
    },
  };
};
