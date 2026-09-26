/**
 * 문서와 키-값 projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 재생 속도를 따라간다 — `runtime.getSpeed()` 를 걸음마다 새로 읽는다.
 * 무대는 셈을 하지 않는다 — 읽기 · 쓰기 수, 가장 적은 쪽, 답은 모두 payload 에서 온다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { DocumentKvStage, StoreContent, TallyCell, Verdict } from './document-kv-stage.js';

/** 판 사이 · 걸음 안 옮김의 기본 길이 (재생 속도 1 일 때). */
const MOTION_MS = 600;

type Payload = Record<string, unknown>;

const KNOWN = new Set(['store', 'read-row', 'read-doc', 'get', 'write-row', 'write-doc', 'put', 'done']);

function asPayload(v: unknown): Payload {
  if (typeof v !== 'object' || v === null) throw new Error('document-kv: payload 가 객체가 아니다');
  return v as Payload;
}
function num(p: Payload, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`document-kv: payload.${k} 가 수가 아니다`);
  return v;
}
function str(p: Payload, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`document-kv: payload.${k} 가 글자가 아니다`);
  return v;
}
function strs(p: Payload, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`document-kv: payload.${k} 가 배열이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'string') throw new Error(`document-kv: payload.${k} 에 글자가 아닌 것이 있다`);
    return x;
  });
}
function list(p: Payload, k: string): Payload[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`document-kv: payload.${k} 가 배열이 아니다`);
  return v.map((x: unknown) => asPayload(x));
}

function storeOf(p: Payload): StoreContent {
  const layout = num(p, 'layout');
  const content: StoreContent = { layout, tables: [], docs: [], entries: [] };
  if (layout === 0) {
    content.tables = list(p, 'tables').map((tb) => ({
      name: str(tb, 'name'),
      columns: strs(tb, 'columns'),
      rows: list(tb, 'rows').map((r) => {
        const link = r.link;
        if (link !== null && typeof link !== 'number') throw new Error('document-kv: row.link 가 수도 null 도 아니다');
        return { id: str(r, 'id'), cells: strs(r, 'cells'), link };
      }),
    }));
  } else if (layout === 1) {
    content.docs = list(p, 'docs').map((d) => ({ id: str(d, 'id'), link: num(d, 'link'), lines: strs(d, 'lines') }));
  } else if (layout === 2) {
    content.entries = list(p, 'entries').map((e) => ({ id: str(e, 'id'), key: str(e, 'key'), link: num(e, 'link'), size: num(e, 'size') }));
  } else {
    throw new Error(`document-kv: 모르는 담는 법 ${layout}`);
  }
  return content;
}

function layoutName(t: Translate, layout: number): string {
  if (layout === 0) return t('label.layout.tables', 'Tables');
  if (layout === 1) return t('label.layout.documents', 'Documents');
  if (layout === 2) return t('label.layout.kv', 'Key-value');
  throw new Error(`document-kv: 모르는 담는 법 ${layout}`);
}

function queryName(t: Translate, p: Payload): string {
  const kind = str(p, 'queryKind');
  if (kind === 'whole') return t('label.query.whole', 'Order {order}, whole', { order: num(p, 'order') });
  if (kind === 'where') return t('label.query.where', 'Orders where {field} = {value}', { field: str(p, 'field'), value: str(p, 'value') });
  if (kind === 'update') {
    return t('label.query.update', '{field} of {name} → {value}', { name: str(p, 'name'), field: str(p, 'field'), value: str(p, 'value') });
  }
  throw new Error(`document-kv: 모르는 질의 ${kind}`);
}

export const documentKvProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DocumentKvStage | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const ms = (): number => MOTION_MS / Math.max(0.1, runtime?.getSpeed() ?? 1);

  const counts = (p: Payload): void => stage?.setCounts(num(p, 'reads'), num(p, 'writes'));

  return {
    onEvent(event) {
      if (!stage || !KNOWN.has(event.type)) return;
      const p = asPayload(event.payload);
      switch (event.type) {
        case 'store': {
          stage.setTitle(t('caption.start', 'Stored as: {layout} · Query: {query}', { layout: layoutName(t, num(p, 'layout')), query: queryName(t, p) }));
          stage.setCaption(t('caption.ready', 'Nothing taken out of the store yet'));
          stage.setCounts(0, 0);
          stage.dimTally();
          stage.setStore(storeOf(p), ms());
          return;
        }
        case 'read-row': {
          const table = str(p, 'table');
          const cells = strs(p, 'cells');
          stage.setCaption(t('caption.readRow', 'Read: row {pos} of {table} ({row})', { table, pos: num(p, 'pos'), row: cells.join(' · ') }));
          counts(p);
          stage.lift(str(p, 'id'), table, ms());
          return;
        }
        case 'read-doc': {
          stage.setCaption(t('caption.readDoc', 'Read: document {id}', { id: num(p, 'doc') }));
          counts(p);
          stage.lift(str(p, 'id'), null, ms());
          return;
        }
        case 'get': {
          const op = `GET ${str(p, 'key')}`;
          const hit = p.hit;
          let verdict: Verdict = null;
          if (hit === null) {
            stage.setCaption(t('caption.getWhole', '{op} — the whole value comes out', { op }));
          } else if (typeof hit === 'boolean') {
            verdict = { field: str(p, 'field'), found: str(p, 'found'), hit };
            const vars = { op, field: verdict.field, found: verdict.found };
            stage.setCaption(
              hit
                ? t('caption.getMatch', '{op} — opened outside: {field} = {found} · match', vars)
                : t('caption.getMiss', '{op} — opened outside: {field} = {found} · no match', vars),
            );
          } else {
            throw new Error('document-kv: get.hit 가 불리언도 null 도 아니다');
          }
          counts(p);
          stage.openValue(str(p, 'id'), strs(p, 'lines'), verdict, ms());
          return;
        }
        case 'write-row': {
          const column = str(p, 'column');
          const value = str(p, 'value');
          stage.setCaption(
            t('caption.writeRow', 'Write: row {pos} of {table} · {column} → {value}', { table: str(p, 'table'), pos: num(p, 'pos'), column, value }),
          );
          counts(p);
          stage.patch(str(p, 'id'), `${column} → ${value}`, strs(p, 'cells'), ms());
          return;
        }
        case 'write-doc': {
          const path = str(p, 'path');
          const value = str(p, 'value');
          stage.setCaption(t('caption.writeDoc', 'Write: document {id} · {path} → {value}', { id: num(p, 'doc'), path, value }));
          counts(p);
          stage.patch(str(p, 'id'), `${path} → ${value}`, strs(p, 'lines'), ms());
          return;
        }
        case 'put': {
          stage.setCaption(t('caption.put', '{op} — the whole value goes back in', { op: `PUT ${str(p, 'key')}` }));
          counts(p);
          stage.putBack(str(p, 'id'), strs(p, 'lines'), ms());
          return;
        }
        case 'done': {
          const kind = str(p, 'queryKind');
          if (kind === 'whole') {
            stage.setCaption(
              t('caption.doneWhole', 'Answer: order {order} · customer {name} · items: {n}', { order: num(p, 'order'), name: str(p, 'name'), n: num(p, 'itemCount') }),
            );
          } else if (kind === 'where') {
            const ids = p.ids;
            if (!Array.isArray(ids) || ids.some((x: unknown) => typeof x !== 'number')) throw new Error('document-kv: done.ids 가 수 배열이 아니다');
            stage.setCaption(t('caption.doneWhere', 'Answer: orders {ids}', { ids: `[${ids.join(', ')}]` }));
          } else if (kind === 'update') {
            stage.setCaption(t('caption.doneUpdate', 'Answer: copies changed: {n}', { n: num(p, 'copies') }));
          } else {
            throw new Error(`document-kv: 모르는 질의 ${kind}`);
          }
          counts(p);
          const tally: TallyCell[] = list(p, 'tally').map((x) => {
            const fewest = x.fewest;
            if (typeof fewest !== 'boolean') throw new Error('document-kv: tally.fewest 가 불리언이 아니다');
            return { layout: num(x, 'layout'), reads: num(x, 'reads'), writes: num(x, 'writes'), total: num(x, 'total'), fewest };
          });
          stage.setTally(tally, ms());
          return;
        }
        default:
          return;
      }
    },
  };
};
