/**
 * cache-ttl 의 장면 — 알고리즘 이벤트를 이어 "지금 화면이 무엇인가" 를 만든다.
 *
 * 바탕: 이름 · 레코드 · TTL · 시간축 끝 · 주소 목록 (initial 이 initialData 에서 정한다)
 * 자취: 원본 주소의 바뀜 · 버린 답 · 준 답
 * 이번 걸음: step — 앞 걸음의 시각(from)을 계기값으로 싣는다
 *
 * 셈(남은 TTL · 적중 여부 · 옛 답 여부)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CacheTtlHeld = { addr: string; from: number; expiry: number };

export type CacheTtlAnswer = {
  t: number;
  addr: string;
  kind: 'fetch' | 'hit';
  remaining: number;
  stale: boolean;
  /** 그 시각의 원본 주소 */
  origin: string;
};

export type CacheTtlStep =
  | { kind: 'fetch'; from: number }
  | { kind: 'hit'; from: number }
  | { kind: 'change'; from: number }
  | { kind: 'expire'; from: number };

export type CacheTtlScene = {
  name: string;
  record: string;
  ttl: number;
  /** 시간축 끝 (초) — 마지막 질문 + TTL */
  horizon: number;
  /** 데이터에 나오는 주소들, 나오는 차례. 색의 정체성에 쓴다 */
  addrs: string[];
  now: number;
  /** 원본 주소의 바뀜 — 지금까지 일어난 것만 */
  origin: { t: number; addr: string }[];
  held: CacheTtlHeld | null;
  /** 들고 있는 답의 남은 TTL (알고리즘이 셈한 값) */
  remaining: number | null;
  dropped: CacheTtlHeld[];
  answers: CacheTtlAnswer[];
  step: CacheTtlStep | null;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`cache-ttl scene: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`cache-ttl scene: ${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`cache-ttl scene: ${k} 가 글자가 아니다`);
  return v;
}

function numOrNull(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`cache-ttl scene: ${k} 가 수나 null 이 아니다`);
  return v;
}

function lastOrigin(s: CacheTtlScene): string {
  const o = s.origin[s.origin.length - 1];
  if (o === undefined) throw new Error('cache-ttl scene: 원본 주소가 없다');
  return o.addr;
}

export const cacheTtlScene: ScenePlan<CacheTtlScene> = {
  initial(initialData: unknown): CacheTtlScene {
    const d = rec(initialData, 'initialData');
    const ttl = num(d, 'ttl');
    const originAddr = str(d, 'origin');
    const queries = d['queries'];
    const changes = d['changes'];
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('cache-ttl scene: 질문 시각이 없다');
    if (!Array.isArray(changes)) throw new Error('cache-ttl scene: 바뀜 목록이 없다');
    let lastQuery = 0;
    for (const q of queries) {
      if (typeof q !== 'number') throw new Error('cache-ttl scene: 질문 시각이 수가 아니다');
      lastQuery = Math.max(lastQuery, q);
    }
    const addrs = [originAddr];
    for (const c of changes) {
      const addr = str(rec(c, 'change'), 'addr');
      if (!addrs.includes(addr)) addrs.push(addr);
    }
    return {
      name: str(d, 'name'),
      record: str(d, 'record'),
      ttl,
      horizon: lastQuery + ttl,
      addrs,
      now: 0,
      origin: [{ t: 0, addr: originAddr }],
      held: null,
      remaining: null,
      dropped: [],
      answers: [],
      step: null,
    };
  },

  reduce(scene: CacheTtlScene, event: FacetRuntimeEvent): CacheTtlScene {
    if (event.type === 'fetch') {
      const p = rec(event.payload, 'fetch payload');
      const t = num(p, 't');
      const addr = str(p, 'addr');
      const remaining = num(p, 'remaining');
      return {
        ...scene,
        now: t,
        held: { addr, from: t, expiry: num(p, 'expiry') },
        remaining,
        answers: [...scene.answers, { t, addr, kind: 'fetch', remaining, stale: false, origin: lastOrigin(scene) }],
        step: { kind: 'fetch', from: scene.now },
      };
    }
    if (event.type === 'hit') {
      const p = rec(event.payload, 'hit payload');
      const t = num(p, 't');
      const addr = str(p, 'addr');
      const remaining = num(p, 'remaining');
      const stale = p['stale'];
      if (typeof stale !== 'boolean') throw new Error('cache-ttl scene: stale 가 참거짓이 아니다');
      if (scene.held === null || scene.held.addr !== addr) {
        throw new Error(`cache-ttl scene: 들고 있지 않은 답이 적중했다 (${addr})`);
      }
      return {
        ...scene,
        now: t,
        remaining,
        answers: [...scene.answers, { t, addr, kind: 'hit', remaining, stale, origin: str(p, 'origin') }],
        step: { kind: 'hit', from: scene.now },
      };
    }
    if (event.type === 'change') {
      const p = rec(event.payload, 'change payload');
      const t = num(p, 't');
      return {
        ...scene,
        now: t,
        origin: [...scene.origin, { t, addr: str(p, 'addr') }],
        remaining: numOrNull(p, 'remaining'),
        step: { kind: 'change', from: scene.now },
      };
    }
    if (event.type === 'expire') {
      const p = rec(event.payload, 'expire payload');
      const t = num(p, 't');
      const addr = str(p, 'addr');
      if (scene.held === null || scene.held.addr !== addr) {
        throw new Error(`cache-ttl scene: 들고 있지 않은 답이 만료됐다 (${addr})`);
      }
      return {
        ...scene,
        now: t,
        held: null,
        remaining: null,
        dropped: [...scene.dropped, { ...scene.held }],
        step: { kind: 'expire', from: scene.now },
      };
    }
    return scene;
  },
};
