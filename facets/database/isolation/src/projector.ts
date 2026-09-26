/**
 * 격리 수준과 잠금 — projector.
 *
 * 알고리즘의 `step` 하나를 무대의 `showStep` 하나로 옮긴다. payload 는 typeof 가드로 읽어 무대의 모양으로 옮기고,
 * 빈 자리를 지어내지 않고 던진다 (C6 · C9). 운동의 길이는 그때그때 재생 속도를 읽어 정한다.
 * phase 이벤트는 없다 — 코드 패널을 두지 않는다 (irs.ts).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { IsolationStageApi, StageEffect, StageFrame, StageHolder } from './isolation-stage.js';

/** 걸음 안 운동의 길이 (1 배속). 사양의 "운동 400 이하". */
const MOTION_MS = 380;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`[isolation] ${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[isolation] ${k} 가 수가 아니다`);
  return v;
}
function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`[isolation] ${k} 가 글자가 아니다`);
  return v;
}
function bool(o: Obj, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`[isolation] ${k} 가 참거짓이 아니다`);
  return v;
}
function strOrNull(o: Obj, k: string): string | null {
  const v = o[k];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`[isolation] ${k} 가 글자도 null 도 아니다`);
  return v;
}
function list(o: Obj, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`[isolation] ${k} 가 배열이 아니다`);
  return v;
}
function nums(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`[isolation] ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`[isolation] ${what} 에 수가 아닌 것이 있다`);
    return x;
  });
}
function strs(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`[isolation] ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`[isolation] ${what} 에 글자가 아닌 것이 있다`);
    return x;
  });
}
function lockMode(o: Obj, k: string): 'S' | 'X' {
  const v = str(o, k);
  if (v !== 'S' && v !== 'X') throw new Error(`[isolation] 모르는 잠금: ${v}`);
  return v;
}
function holders(v: unknown): StageHolder[] {
  if (!Array.isArray(v)) throw new Error('[isolation] holders 가 배열이 아니다');
  return v.map((h) => {
    const o = obj(h, 'holder');
    return { tx: str(o, 'tx'), mode: lockMode(o, 'mode') };
  });
}
function effect(v: unknown): StageEffect | null {
  if (v === null) return null;
  const o = obj(v, 'effect');
  const kind = str(o, 'kind');
  switch (kind) {
    case 'read':
      return { kind, value: num(o, 'value') };
    case 'query':
      return { kind, ids: nums(o.ids, 'ids') };
    case 'lock':
      return { kind, target: str(o, 'target') };
    case 'commit':
    case 'abort':
      return { kind };
    default:
      throw new Error(`[isolation] 모르는 효과: ${kind}`);
  }
}

/** `step` payload → 무대의 걸음 모습. */
export function readStepPayload(payload: unknown): StageFrame {
  const p = obj(payload, 'payload');
  const table = obj(p.table, 'table');
  const anomalies = obj(p.anomalies, 'anomalies');
  return {
    step: num(p, 'step'),
    levelName: str(p, 'levelName'),
    observer: str(p, 'observer'),
    txs: strs(p.txs, 'txs'),
    ops: list(p, 'ops').map((x) => {
      const o = obj(x, 'op');
      return { label: str(o, 'label'), tx: str(o, 'tx') };
    }),
    order: nums(p.order, 'order'),
    ran: num(p, 'ran'),
    effects: list(p, 'effects').map(effect),
    waiting: list(p, 'waiting').map((x) => {
      const o = obj(x, 'waiting');
      const mode = str(o, 'mode');
      if (mode !== 'S' && mode !== 'X' && mode !== 'range') throw new Error(`[isolation] 모르는 막힘: ${mode}`);
      return { op: num(o, 'op'), blocker: str(o, 'blocker'), mode, key: str(o, 'key'), target: str(o, 'target') };
    }),
    spans: list(p, 'spans').map((x) => {
      const o = obj(x, 'span');
      return { key: str(o, 'key'), label: str(o, 'label'), from: num(o, 'from'), to: num(o, 'to'), momentary: bool(o, 'momentary') };
    }),
    held: num(p, 'held'),
    rows: list(p, 'rows').map((x) => {
      const o = obj(x, 'row');
      return {
        name: str(o, 'name'),
        value: num(o, 'value'),
        pendingTx: strOrNull(o, 'pendingTx'),
        pendingValue: num(o, 'pendingValue'),
        holders: holders(o.holders),
      };
    }),
    table: {
      name: str(table, 'name'),
      columns: strs(table.columns, 'columns'),
      rows: list(table, 'rows').map((x) => {
        const o = obj(x, 'table row');
        return {
          id: num(o, 'id'),
          amount: num(o, 'amount'),
          pendingTx: strOrNull(o, 'pendingTx'),
          inRange: bool(o, 'inRange'),
          holders: holders(o.holders),
        };
      }),
    },
    rangeHolder: strOrNull(p, 'rangeHolder'),
    touched: strs(p.touched, 'touched'),
    anomalies: {
      dirty: bool(anomalies, 'dirty'),
      nonRepeatable: bool(anomalies, 'nonRepeatable'),
      phantom: bool(anomalies, 'phantom'),
    },
    reads: list(p, 'reads').map((x) => {
      const o = obj(x, 'read');
      return { target: str(o, 'target'), values: nums(o.values, 'values') };
    }),
    queries: list(p, 'queries').map((q) => nums(q, 'query')),
    sql: str(p, 'sql'),
    queryLabel: strOrNull(p, 'queryLabel'),
  };
}

export const isolationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IsolationStageApi | undefined;
  const motion = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return Math.round(MOTION_MS / Math.max(0.25, speed));
  };
  return {
    onEvent(event) {
      if (event.type !== 'step') throw new Error(`[isolation] 모르는 이벤트: ${event.type}`);
      if (!stage) throw new Error('[isolation] stage 가 없다');
      stage.showStep(readStepPayload(event.payload), motion());
    },
    onReset() {
      stage?.reset();
    },
  };
};
