/**
 * index-choice projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 운동의 길이는 `initialData.motionMs` 를 그때그때의 재생 속도로 나눈다 (속도를 올리면 운동도 짧아진다).
 * 캡션의 수는 모두 payload 에서 온다 — 여기서 셈하지 않는다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { IndexChoicePathId, IndexChoiceStage, IndexChoiceStructure, IndexChoiceWriteView } from './index-choice-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what}: 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${k}: 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`payload.${k}: 글자가 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`payload.${k}: 참거짓이 아니다`);
  return v;
}
function arr(o: Record<string, unknown>, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`payload.${k}: 배열이 아니다`);
  return v;
}
function strs(o: Record<string, unknown>, k: string): string[] {
  return arr(o, k).map((x) => {
    if (typeof x !== 'string') throw new Error(`payload.${k}: 글자 배열이 아니다`);
    return x;
  });
}
function nums(o: Record<string, unknown>, k: string): number[] {
  return arr(o, k).map((x) => {
    if (typeof x !== 'number') throw new Error(`payload.${k}: 수 배열이 아니다`);
    return x;
  });
}
function pathOf(o: Record<string, unknown>): IndexChoicePathId {
  const p = str(o, 'path');
  if (p !== 'seq' && p !== 'btree' && p !== 'hash') throw new Error(`모르는 길: ${p}`);
  return p;
}

function structureOf(p: Record<string, unknown>): IndexChoiceStructure {
  return {
    tableName: str(p, 'tableName'),
    tablePages: arr(p, 'tablePages').map((x) => {
      const o = obj(x, 'tablePages[]');
      return {
        id: str(o, 'id'),
        rows: arr(o, 'rows').map((r) => {
          const ro = obj(r, 'rows[]');
          return { row: str(ro, 'row'), key: num(ro, 'key') };
        }),
      };
    }),
    rowsPerPage: num(p, 'rowsPerPage'),
    btreeName: str(p, 'btreeName'),
    root: str(p, 'root'),
    leafCapacity: num(p, 'leafCapacity'),
    treePages: arr(p, 'treePages').map((x) => {
      const o = obj(x, 'treePages[]');
      const kind = str(o, 'kind');
      if (kind !== 'inner' && kind !== 'leaf') throw new Error(`모르는 페이지 종류: ${kind}`);
      const next = o.next;
      if (next !== null && typeof next !== 'string') throw new Error('payload.next: 글자도 null 도 아니다');
      return { id: str(o, 'id'), kind, keys: nums(o, 'keys'), children: strs(o, 'children'), next };
    }),
    hashName: str(p, 'hashName'),
    bucketCount: num(p, 'bucketCount'),
    buckets: arr(p, 'buckets').map((x) => {
      const o = obj(x, 'buckets[]');
      return { id: str(o, 'id'), keys: nums(o, 'keys') };
    }),
  };
}

function writesOf(p: Record<string, unknown>): IndexChoiceWriteView[] {
  return arr(p, 'writes').map((x) => {
    const o = obj(x, 'writes[]');
    const kind = str(o, 'kind');
    if (kind !== 'table' && kind !== 'leaf' && kind !== 'bucket') throw new Error(`모르는 쓰기 자리: ${kind}`);
    return {
      page: str(o, 'page'),
      kind,
      at: num(o, 'at'),
      entries: arr(o, 'entries').map((e) => {
        const eo = obj(e, 'entries[]');
        return { key: num(eo, 'key'), row: str(eo, 'row') };
      }),
    };
  });
}

export const indexChoiceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IndexChoiceStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;

  const need = (): IndexChoiceStage => {
    if (!stage) throw new Error('무대(stage)가 없다');
    return stage;
  };
  const dur = (): number => {
    if (motionMs === null) throw new Error('motionMs 를 받기 전에 운동이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };
  const pathLabel = (p: IndexChoicePathId): string =>
    p === 'seq' ? t('label.path.seq', 'Table scan') : p === 'btree' ? t('label.path.btree', 'B+ tree') : t('label.path.hash', 'Hash');

  let readText = '';

  return {
    onInit(data: unknown) {
      const d = obj(data, 'initialData');
      motionMs = num(d, 'motionMs');
    },
    onEvent(e: FacetRuntimeEvent) {
      const s = need();
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase?.(str(obj(e.payload, 'phase'), 'phase'));
          return;
        }
        case 'structure':
          s.build(structureOf(obj(e.payload, 'structure')));
          return;
        case 'round-start': {
          const p = obj(e.payload, 'round-start');
          code?.highlightPhase?.(null);
          s.startRound(
            { sql: str(p, 'sql'), insertSql: str(p, 'insertSql'), hasBtree: bool(p, 'hasBtree'), hasHash: bool(p, 'hasHash') },
            dur(),
          );
          s.setCaption(t('caption.start', 'Each path that exists is priced by the pages it would actually read.'));
          readText = '';
          s.setCounters('', '');
          return;
        }
        case 'cost': {
          const p = obj(e.payload, 'cost');
          const path = pathOf(p);
          const pages = num(p, 'pages');
          const rows = num(p, 'rowCount');
          s.showCost({ path, pages, descent: strs(p, 'descent'), leaves: strs(p, 'leaves') }, dur());
          if (path === 'seq') s.setCaption(t('caption.seq', 'Table scan reads every table page. Pages: {n}', { n: pages }));
          else if (path === 'btree') {
            s.setCaption(
              t('caption.btree', 'B+ tree: inner {inner} + leaves {leaves} + table pages {rows}. Pages: {n}', {
                inner: num(p, 'inner'),
                leaves: num(p, 'leafCount'),
                rows,
                n: pages,
              }),
            );
          } else {
            s.setCaption(
              t('caption.hash', 'Hash: buckets {buckets} + table pages {rows}. Pages: {n}', {
                buckets: num(p, 'leafCount'),
                rows,
                n: pages,
              }),
            );
          }
          return;
        }
        case 'pick': {
          const p = obj(e.payload, 'pick');
          const path = pathOf(p);
          const pages = num(p, 'pages');
          s.pick({ path, read: strs(p, 'read') }, dur());
          s.setCaption(t('caption.pick', 'Cheapest path: {path}. Pages read: {n}', { path: pathLabel(path), n: pages }));
          readText = t('label.pagesRead', 'Pages read: {n}', { n: pages });
          s.setCounters(readText, '');
          return;
        }
        case 'insert': {
          const p = obj(e.payload, 'insert');
          const pages = num(p, 'pages');
          s.insert({ writes: writesOf(p) }, dur());
          s.setCaption(t('caption.insert', 'INSERT writes one table page and one page per index. Pages written: {n}', { n: pages }));
          s.setCounters(readText, t('label.pagesWritten', 'Pages written: {n}', { n: pages }));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      readText = '';
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
