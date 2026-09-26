/**
 * bitmap-index projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   round    → 코드 패널 강조를 지우고 stage.round (새 판의 걸음 0)
 *   load     → stage.load
 *   combine  → stage.combine
 *   fetch    → stage.fetch
 *   phase    → codePanel.highlightPhase
 *
 * 움직임 길이는 재생 속도를 그때그때 읽어 정한다 — 빠르게 돌리면 짧아진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { BitmapIndexStage, CombineView, FetchView, LoadView, RoundView } from './bitmap-index-stage.js';

/** 속도 1 에서의 움직임 길이. 걸음 간격(stepMs 1500) 안에 끝난다 */
const MOTION_MS = 700;
const MOTION_MAX_MS = 900;

type CodePanel = { highlightPhase(phase: string | null): void };

function record(payload: unknown, kind: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`bitmap-index: ${kind} payload 가 없다`);
  return payload as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`bitmap-index: payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`bitmap-index: payload.${key} 가 글자가 아니다`);
  return v;
}

function strList(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`bitmap-index: payload.${key} 가 글자 목록이 아니다`);
  }
  return v;
}

function numList(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number')) {
    throw new Error(`bitmap-index: payload.${key} 가 수 목록이 아니다`);
  }
  return v;
}

function rowList(p: Record<string, unknown>, key: string): string[][] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`bitmap-index: payload.${key} 가 목록이 아니다`);
  return v.map((row) => {
    if (!Array.isArray(row) || !row.every((x): x is string => typeof x === 'string')) {
      throw new Error(`bitmap-index: payload.${key} 의 줄이 글자 목록이 아니다`);
    }
    return row;
  });
}

function readRound(p: Record<string, unknown>): RoundView {
  return {
    table: str(p, 'table'),
    columns: strList(p, 'columns'),
    rows: rowList(p, 'rows'),
    clauses: strList(p, 'clauses'),
    bitRows: strList(p, 'bitRows'),
    conditionCount: num(p, 'conditionCount'),
    combineWord: str(p, 'combineWord'),
    sql: str(p, 'sql'),
  };
}

function readLoad(p: Record<string, unknown>): LoadView {
  return { condition: num(p, 'condition'), result: str(p, 'result'), bitsRead: num(p, 'bitsRead'), ones: num(p, 'ones') };
}

function readCombine(p: Record<string, unknown>): CombineView {
  return {
    condition: num(p, 'condition'),
    combineWord: str(p, 'combineWord'),
    result: str(p, 'result'),
    changed: numList(p, 'changed'),
    bitsRead: num(p, 'bitsRead'),
    ones: num(p, 'ones'),
  };
}

function readFetch(p: Record<string, unknown>): FetchView {
  return { rows: numList(p, 'rows'), rowsRead: num(p, 'rowsRead'), bitsRead: num(p, 'bitsRead') };
}

export const bitmapIndexProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BitmapIndexStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;

  const motionMs = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    if (!(speed > 0)) return MOTION_MS;
    return Math.min(MOTION_MAX_MS, Math.round(MOTION_MS / speed));
  };

  return {
    onEvent(e: FacetRuntimeEvent) {
      switch (e.type) {
        case 'phase': {
          const p = record(e.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round':
          code?.highlightPhase(null);
          stage?.round(readRound(record(e.payload, 'round')), motionMs());
          return;
        case 'load':
          stage?.load(readLoad(record(e.payload, 'load')), motionMs());
          return;
        case 'combine':
          stage?.combine(readCombine(record(e.payload, 'combine')), motionMs());
          return;
        case 'fetch':
          stage?.fetch(readFetch(record(e.payload, 'fetch')), motionMs());
          return;
        default:
          return;
      }
    },
    onReset() {
      code?.highlightPhase(null);
    },
  };
};
