/**
 * send-to-idlest 장면 — 이벤트를 잇기만 한다. 고름 · 열린 수 · 받은 수는 알고리즘이 셈해 싣는다.
 *
 * 바탕: servers (자료) · slots (init)
 * 자취: rows (서버마다 지금 열린 연결) · queue (아직 안 온 요청) · got · tick
 * 이번 걸음: step — 빠진 연결 · 고를 때 본 열린 수 · 고른 서버, 그리고 운동의 출발점(before)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSendToIdlestData } from './algorithm';

export type IdlestConn = { id: string; request: string | null };
export type IdlestRow = { server: string; conns: IdlestConn[] };

export type IdlestStep = {
  tick: number;
  /** 이 틱이 시작할 때의 줄 — 운동의 출발점 */
  before: IdlestRow[];
  left: { server: string; conn: IdlestConn }[];
  readings: { server: string; open: number }[];
  request: string;
  to: string;
};

export type SendToIdlestScene = {
  servers: string[];
  /** 아직 도착하지 않은 요청 (앞이 다음) */
  queue: string[];
  /** init 이 채운다. 그 전(걸음 0 이 갈아 끼워지기 전)에는 null */
  rows: IdlestRow[] | null;
  slots: number | null;
  got: { server: string; n: number }[] | null;
  tick: number;
  step: IdlestStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`send-to-idlest scene: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(path, '문자열이 아니다');
  return v;
}

function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(path, '0 이상의 정수가 아니다');
  return v;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '배열이 아니다');
  return v;
}

function copyRows(rows: readonly IdlestRow[]): IdlestRow[] {
  return rows.map((r) => ({ server: r.server, conns: r.conns.map((c) => ({ id: c.id, request: c.request })) }));
}

function reduceInit(scene: SendToIdlestScene, payload: unknown): SendToIdlestScene {
  if (!isRecord(payload)) fail('init.payload', '객체가 아니다');
  const rows = arr(payload.rows, 'init.payload.rows').map((r, i): IdlestRow => {
    const p = `init.payload.rows[${i}]`;
    if (!isRecord(r)) fail(p, '객체가 아니다');
    const server = str(r.server, `${p}.server`);
    if (server !== scene.servers[i]) fail(`${p}.server`, `서버 목록의 ${i} 번째가 아니다`);
    const conns = arr(r.conns, `${p}.conns`).map((c, k): IdlestConn => {
      if (!isRecord(c)) fail(`${p}.conns[${k}]`, '객체가 아니다');
      const request = c.request === null ? null : str(c.request, `${p}.conns[${k}].request`);
      return { id: str(c.id, `${p}.conns[${k}].id`), request };
    });
    return { server, conns };
  });
  if (rows.length !== scene.servers.length) fail('init.payload.rows', '서버 수와 다르다');
  const slots = int(payload.slots, 'init.payload.slots');
  if (slots < 1) fail('init.payload.slots', '1 보다 작다');
  const got = arr(payload.got, 'init.payload.got').map((g, i) => {
    if (!isRecord(g)) fail(`init.payload.got[${i}]`, '객체가 아니다');
    const server = str(g.server, `init.payload.got[${i}].server`);
    if (server !== scene.servers[i]) fail(`init.payload.got[${i}].server`, `서버 목록의 ${i} 번째가 아니다`);
    return { server, n: int(g.n, `init.payload.got[${i}].n`) };
  });
  if (got.length !== scene.servers.length) fail('init.payload.got', '서버 수와 다르다');
  return { ...scene, queue: [...scene.queue], rows, slots, got, tick: 0, step: null };
}

function reduceTick(scene: SendToIdlestScene, payload: unknown): SendToIdlestScene {
  if (scene.rows === null || scene.got === null) fail('tick', 'init 앞에 왔다');
  if (!isRecord(payload)) fail('tick.payload', '객체가 아니다');
  const tick = int(payload.tick, 'tick.payload.tick');
  if (tick !== scene.tick + 1) fail('tick.payload.tick', `다음 틱 ${scene.tick + 1} 이 아니다`);
  const request = str(payload.request, 'tick.payload.request');
  if (scene.queue[0] !== request) fail('tick.payload.request', '도착 차례의 맨 앞이 아니다');
  const to = str(payload.to, 'tick.payload.to');
  if (!scene.servers.includes(to)) fail('tick.payload.to', '서버 목록에 없다');

  const before = copyRows(scene.rows);
  const rows = copyRows(scene.rows);
  const rowOf = (s: string, path: string): IdlestRow => rows.find((r) => r.server === s) ?? fail(path, '서버 목록에 없다');

  const left = arr(payload.left, 'tick.payload.left').map((l, i) => {
    const p = `tick.payload.left[${i}]`;
    if (!isRecord(l)) fail(p, '객체가 아니다');
    const server = str(l.server, `${p}.server`);
    const connId = str(l.conn, `${p}.conn`);
    const row = rowOf(server, `${p}.server`);
    const at = row.conns.findIndex((c) => c.id === connId);
    if (at < 0) fail(`${p}.conn`, `${server} 에 열린 연결이 아니다`);
    const [conn] = row.conns.splice(at, 1);
    if (conn === undefined) fail(`${p}.conn`, '뺄 수 없다');
    return { server, conn };
  });

  const readings = arr(payload.readings, 'tick.payload.readings').map((r, i) => {
    const p = `tick.payload.readings[${i}]`;
    if (!isRecord(r)) fail(p, '객체가 아니다');
    const server = str(r.server, `${p}.server`);
    if (server !== scene.servers[i]) fail(`${p}.server`, `서버 목록의 ${i} 번째가 아니다`);
    const open = int(r.open, `${p}.open`);
    if (open !== rowOf(server, `${p}.server`).conns.length) fail(`${p}.open`, '빠진 뒤의 줄과 맞지 않는다');
    return { server, open };
  });
  if (readings.length !== scene.servers.length) fail('tick.payload.readings', '서버 수와 다르다');

  rowOf(to, 'tick.payload.to').conns.push({ id: request, request });
  const n = int(payload.got, 'tick.payload.got');
  const got = scene.got.map((g) => ({ server: g.server, n: g.n }));
  const mine = got.find((g) => g.server === to) ?? fail('tick.payload.to', '받은 수에 없다');
  if (n !== mine.n + 1) fail('tick.payload.got', `앞 장면의 받은 수 ${mine.n} 에 하나를 더한 값이 아니다`);
  mine.n = n;

  return {
    servers: [...scene.servers],
    queue: scene.queue.slice(1),
    rows,
    slots: scene.slots,
    got,
    tick,
    step: { tick, before, left, readings, request, to },
  };
}

export const sendToIdlestScene: ScenePlan<SendToIdlestScene> = {
  initial(initialData: unknown): SendToIdlestScene {
    const data = narrowSendToIdlestData(initialData);
    return {
      servers: [...data.servers],
      queue: data.requests.map((r) => r.id),
      rows: null,
      slots: null,
      got: null,
      tick: 0,
      step: null,
    };
  },
  reduce(scene: SendToIdlestScene, event: FacetRuntimeEvent): SendToIdlestScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'tick':
        return reduceTick(scene, event.payload);
      default:
        throw new Error(`send-to-idlest scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
