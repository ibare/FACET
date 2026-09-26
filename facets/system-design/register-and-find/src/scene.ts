/**
 * register-and-find 의 장면 — 등록부의 줄 · 인스턴스의 처지 · 부르는 쪽이 받은 명단을 잇는다.
 *
 * 셈(만료 판정 · 하트비트 틱 · 명단)은 알고리즘이 하고 이벤트에 싣는다. 장면은 잇기만 하며,
 * 이벤트가 가리키는 인스턴스 · 줄이 바탕 · 앞 장면과 맞는지 보고 어긋나면 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRegisterAndFindData, type Happening, type LookupEntry } from './algorithm.js';

export type InstanceState = 'down' | 'up' | 'stopped';

export type RegistryRow = { id: string; addr: string; last: number; end: number };

export type Answer = { now: number; entries: LookupEntry[] };

/** 이번 걸음 — 그 틱의 사건 전부와, 만료로 빠진 줄이 있던 자리 */
export type RegisterAndFindStep = {
  now: number;
  happenings: Happening[];
  gone: { row: RegistryRow; slot: number }[];
};

export type RegisterAndFindScene = {
  // 바탕
  service: string;
  instances: { id: string; addr: string }[];
  /** 부르는 쪽이 묻는 틱 — 명단 칸의 자리 */
  lookupTicks: number[];
  /** 임대 축의 끝 틱 — silent init 이 채운다 */
  axisEnd: number | null;
  // 자취
  now: number | null;
  states: InstanceState[];
  rows: RegistryRow[];
  answers: Answer[];
  // 이번 걸음
  step: RegisterAndFindStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`registerAndFindScene: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, '문자열이 아니다');
  return v;
}

function field(o: object, key: string): unknown {
  return (o as Record<string, unknown>)[key];
}

function readHappening(v: unknown, path: string): Happening {
  if (typeof v !== 'object' || v === null) fail(path, '객체가 아니다');
  const kind = field(v, 'kind');
  switch (kind) {
    case 'stop':
      return { kind, id: str(field(v, 'id'), `${path}.id`), last: num(field(v, 'last'), `${path}.last`) };
    case 'register':
      return {
        kind,
        id: str(field(v, 'id'), `${path}.id`),
        last: num(field(v, 'last'), `${path}.last`),
        end: num(field(v, 'end'), `${path}.end`),
      };
    case 'heartbeat':
      return {
        kind,
        id: str(field(v, 'id'), `${path}.id`),
        from: num(field(v, 'from'), `${path}.from`),
        last: num(field(v, 'last'), `${path}.last`),
        end: num(field(v, 'end'), `${path}.end`),
      };
    case 'expire':
      return {
        kind,
        id: str(field(v, 'id'), `${path}.id`),
        last: num(field(v, 'last'), `${path}.last`),
        quiet: num(field(v, 'quiet'), `${path}.quiet`),
      };
    case 'lookup': {
      const entries = field(v, 'entries');
      if (!Array.isArray(entries)) fail(`${path}.entries`, '배열이 아니다');
      return {
        kind,
        service: str(field(v, 'service'), `${path}.service`),
        entries: entries.map((e: unknown, i): LookupEntry => {
          const p = `${path}.entries[${i}]`;
          if (typeof e !== 'object' || e === null) fail(p, '객체가 아니다');
          const stopped = field(e, 'stopped');
          if (typeof stopped !== 'boolean') fail(`${p}.stopped`, '참거짓이 아니다');
          return { id: str(field(e, 'id'), `${p}.id`), addr: str(field(e, 'addr'), `${p}.addr`), stopped };
        }),
      };
    }
    default:
      return fail(`${path}.kind`, `모르는 사건 ${String(kind)}`);
  }
}

function instanceIndex(scene: RegisterAndFindScene, id: string, path: string): number {
  const i = scene.instances.findIndex((x) => x.id === id);
  if (i < 0) fail(path, `바탕에 없는 인스턴스 ${id}`);
  return i;
}

function applyTick(scene: RegisterAndFindScene, payload: unknown): RegisterAndFindScene {
  if (typeof payload !== 'object' || payload === null) fail('tick.payload', '객체가 아니다');
  const now = num(field(payload, 'now'), 'tick.payload.now');
  const expected = scene.now === null ? 0 : scene.now + 1;
  if (now !== expected) fail('tick.payload.now', `${expected} 이어야 하는데 ${now}`);
  const raw = field(payload, 'happenings');
  if (!Array.isArray(raw)) fail('tick.payload.happenings', '배열이 아니다');
  const happenings = raw.map((h: unknown, i) => readHappening(h, `tick.payload.happenings[${i}]`));

  const states = [...scene.states];
  let rows = scene.rows.map((r) => ({ ...r }));
  const answers = scene.answers.map((a) => ({ now: a.now, entries: a.entries.map((e) => ({ ...e })) }));
  const gone: RegisterAndFindStep['gone'] = [];

  happenings.forEach((h, i) => {
    const path = `tick.payload.happenings[${i}]`;
    switch (h.kind) {
      case 'stop': {
        const k = instanceIndex(scene, h.id, `${path}.id`);
        if (states[k] !== 'up') fail(path, `${h.id} 가 떠 있지 않은데 멈춘다`);
        const row = rows.find((r) => r.id === h.id);
        if (!row || row.last !== h.last) fail(`${path}.last`, `등록부의 ${h.id} 줄과 맞지 않는다`);
        states[k] = 'stopped';
        return;
      }
      case 'register': {
        const k = instanceIndex(scene, h.id, `${path}.id`);
        if (states[k] !== 'down') fail(path, `${h.id} 가 이미 떠 있다`);
        if (h.last !== now) fail(`${path}.last`, '지금 틱이 아니다');
        states[k] = 'up';
        const inst = scene.instances[k]!;
        rows = [...rows, { id: h.id, addr: inst.addr, last: h.last, end: h.end }];
        return;
      }
      case 'heartbeat': {
        const k = instanceIndex(scene, h.id, `${path}.id`);
        if (states[k] !== 'up') fail(path, `${h.id} 가 떠 있지 않은데 하트비트를 보낸다`);
        const at = rows.findIndex((r) => r.id === h.id);
        if (at < 0 || rows[at]!.last !== h.from) fail(`${path}.from`, `등록부의 ${h.id} 줄과 맞지 않는다`);
        if (h.last !== now) fail(`${path}.last`, '지금 틱이 아니다');
        rows = rows.map((r, j) => (j === at ? { ...r, last: h.last, end: h.end } : r));
        return;
      }
      case 'expire': {
        const k = instanceIndex(scene, h.id, `${path}.id`);
        if (states[k] !== 'stopped') fail(path, `멈추지 않은 ${h.id} 가 만료된다`);
        const at = rows.findIndex((r) => r.id === h.id);
        if (at < 0 || rows[at]!.last !== h.last) fail(`${path}.last`, `등록부의 ${h.id} 줄과 맞지 않는다`);
        gone.push({ row: { ...rows[at]! }, slot: at });
        rows = rows.filter((_, j) => j !== at);
        return;
      }
      case 'lookup': {
        if (h.service !== scene.service) fail(`${path}.service`, `바탕의 서비스 ${scene.service} 가 아니다`);
        if (h.entries.length !== rows.length || h.entries.some((e, j) => e.id !== rows[j]!.id || e.addr !== rows[j]!.addr)) {
          fail(`${path}.entries`, '등록부의 지금 줄과 맞지 않는다');
        }
        if (scene.lookupTicks[answers.length] !== now) fail(path, `틱 ${now} 은 조회 틱 차례가 아니다`);
        answers.push({ now, entries: h.entries.map((e) => ({ ...e })) });
        return;
      }
    }
  });

  return { ...scene, instances: scene.instances.map((x) => ({ ...x })), now, states, rows, answers, step: { now, happenings, gone } };
}

export const registerAndFindScene: ScenePlan<RegisterAndFindScene> = {
  initial(initialData: unknown): RegisterAndFindScene {
    const data = narrowRegisterAndFindData(initialData);
    return {
      service: data.service,
      instances: data.instances.map((x) => ({ id: x.id, addr: x.addr })),
      lookupTicks: [...data.lookups],
      axisEnd: null,
      now: null,
      // 등록부는 비어 있고 인스턴스는 아직 뜨지 않았다 — 모형의 처음이다
      states: data.instances.map((): InstanceState => 'down'),
      rows: [],
      answers: [],
      step: null,
    };
  },
  reduce(scene: RegisterAndFindScene, event: FacetRuntimeEvent): RegisterAndFindScene {
    switch (event.type) {
      case 'init': {
        const p = event.payload;
        if (typeof p !== 'object' || p === null) fail('init.payload', '객체가 아니다');
        const axisEnd = num(field(p, 'axisEnd'), 'init.payload.axisEnd');
        if (scene.now !== null) fail('init', '틱이 이미 흘렀다');
        return { ...scene, instances: scene.instances.map((x) => ({ ...x })), states: [...scene.states], axisEnd };
      }
      case 'tick':
        if (scene.axisEnd === null) fail('tick', 'init 이 오지 않았다');
        return applyTick(scene, event.payload);
      default:
        return fail('event.type', `모르는 이벤트 ${event.type}`);
    }
  },
};
