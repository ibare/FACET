/**
 * interface-slot 의 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 *  - 바탕(`base`) — init 이 한 번 정한다. 줄 글자 · 약속 · 구현 · 함수 · 맨 바깥 줄
 *  - 자취 — 지금 칸에 꽂힌 클래스(`plugged`) · 밟는 중인 맨 바깥 줄(`site`) · 지금까지의 출력 · 돈 몸
 *  - 이번 걸음(`step`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SlotLine = { indent: number; text: string };
export type SlotSig = { name: string; line: number };
export type SlotMethod = { sig: string; line: number; body: number[] };
export type SlotImpl = { cls: string; line: number; methods: SlotMethod[] };

export type SlotBase = {
  lines: SlotLine[];
  iface: { name: string; line: number; sigs: SlotSig[] };
  impls: SlotImpl[];
  fn: { name: string; line: number; params: string[]; body: number[] };
  sites: number[];
};

export type SlotStep =
  | { kind: 'start' }
  | { kind: 'plug'; cls: string; was: string | null; site: number }
  | { kind: 'call'; line: number; method: string; cls: string; body: number[]; outs: string[] };

export type InterfaceSlotScene = {
  base: SlotBase | null;
  plugged: string | null;
  site: number | null;
  outputs: string[];
  ran: number[];
  step: SlotStep | null;
};

// ---- 좁히개 (payload 를 이름 붙은 타입으로 통째 단언하지 않는다)
function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function nums(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    const n = num(x);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}
function strs(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    const s = str(x);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}
function list<T>(v: unknown, each: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const x of v) {
    const y = each(x);
    if (y === null) return null;
    out.push(y);
  }
  return out;
}

function readBase(p: unknown): SlotBase | null {
  const r = rec(p);
  if (r === null) return null;
  const lines = list(r.lines, (x) => {
    const o = rec(x);
    const indent = num(o?.indent);
    const text = str(o?.text);
    return indent === null || text === null ? null : { indent, text };
  });
  const ifr = rec(r.iface);
  const ifName = str(ifr?.name);
  const ifLine = num(ifr?.line);
  const sigs = list(ifr?.sigs, (x) => {
    const o = rec(x);
    const name = str(o?.name);
    const line = num(o?.line);
    return name === null || line === null ? null : { name, line };
  });
  const impls = list(r.impls, (x) => {
    const o = rec(x);
    const cls = str(o?.cls);
    const line = num(o?.line);
    const methods = list(o?.methods, (y) => {
      const m = rec(y);
      const sig = str(m?.sig);
      const ml = num(m?.line);
      const body = nums(m?.body);
      return sig === null || ml === null || body === null ? null : { sig, line: ml, body };
    });
    return cls === null || line === null || methods === null ? null : { cls, line, methods };
  });
  const fr = rec(r.fn);
  const fnName = str(fr?.name);
  const fnLine = num(fr?.line);
  const fnBody = nums(fr?.body);
  const fnParams = strs(fr?.params);
  const sites = nums(r.sites);
  if (
    lines === null || ifName === null || ifLine === null || sigs === null || impls === null ||
    fnName === null || fnLine === null || fnBody === null || fnParams === null || sites === null
  ) {
    return null;
  }
  return {
    lines,
    iface: { name: ifName, line: ifLine, sigs },
    impls,
    fn: { name: fnName, line: fnLine, params: fnParams, body: fnBody },
    sites,
  };
}

export const interfaceSlotScene: ScenePlan<InterfaceSlotScene> = {
  initial(): InterfaceSlotScene {
    return { base: null, plugged: null, site: null, outputs: [], ran: [], step: null };
  },

  reduce(scene: InterfaceSlotScene, event: FacetRuntimeEvent): InterfaceSlotScene {
    if (event.type === 'init') {
      const base = readBase(event.payload);
      if (base === null) return scene;
      return { base, plugged: null, site: null, outputs: [], ran: [], step: { kind: 'start' } };
    }
    const p = rec(event.payload);
    if (p === null) return scene;
    if (event.type === 'plug') {
      const cls = str(p.cls);
      const site = num(p.site);
      if (cls === null || site === null) return scene;
      return { ...scene, plugged: cls, site, step: { kind: 'plug', cls, was: scene.plugged, site } };
    }
    if (event.type === 'call') {
      const line = num(p.line);
      const method = str(p.method);
      const cls = str(p.cls);
      const body = nums(p.body);
      const outs = strs(p.outs);
      if (line === null || method === null || cls === null || body === null || outs === null) return scene;
      const ran = [...scene.ran];
      for (const b of body) if (!ran.includes(b)) ran.push(b);
      return {
        ...scene,
        outputs: [...scene.outputs, ...outs],
        ran,
        step: { kind: 'call', line, method, cls, body, outs },
      };
    }
    return scene;
  },
};
