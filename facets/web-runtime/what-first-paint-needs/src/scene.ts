import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type {
  HeadKind,
  WhatFirstPaintHeadLine,
  WhatFirstPaintNeedsFacetData,
  WhatFirstPaintResource,
} from './algorithm.js';

export type Lane = {
  id: string;
  src: string;
  kind: HeadKind;
  tag: string;
  media?: 'screen' | 'print';
  attr?: 'async' | 'defer';
};

export type WhatFirstPaintNeedsScene = {
  base: {
    parseMs: number;
    lanes: Lane[];
    bodyCount: number;
    resources: Record<string, WhatFirstPaintResource>;
  };
  trace: {
    requested: Record<string, { at: number; blocking: boolean }>;
    bodyParsedAt: number | null;
    arrived: Record<string, number>;
    scriptRuns: Record<string, { start: number; end: number | null }>;
    paint: { at: number; blockedBy: string[]; unfinished: string[] } | null;
  };
  step:
    | { kind: 'start' }
    | {
        kind: 'headParsed';
        entries: { id: string; src: string; requestedAt: number; blocking: boolean }[];
      }
    | { kind: 'bodyParsed'; at: number; lineCount: number }
    | { kind: 'resourceArrived'; src: string; at: number; afterPaintMs: number | null }
    | { kind: 'firstPaint'; at: number; blockedBy: string[]; unfinished: string[] }
    | { kind: 'scriptStarted'; src: string; at: number; afterPaintMs: number | null }
    | {
        kind: 'scriptFinished';
        src: string;
        at: number;
        domContentLoaded: boolean;
        afterPaintMs: number | null;
      };
};

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}
function isHeadKind(v: unknown): v is HeadKind {
  return v === 'css' || v === 'script';
}

function toHeadEntry(v: unknown): { id: string; src: string; kind: HeadKind; requestedAt: number; blocking: boolean } {
  if (typeof v !== 'object' || v === null) throw new Error('headParsed.entries 항목이 객체가 아니다');
  const o = v as Record<string, unknown>;
  if (!isString(o.id) || !isString(o.src) || !isHeadKind(o.kind) || !isNumber(o.requestedAt) || !isBoolean(o.blocking)) {
    throw new Error('headParsed.entries 항목 모양이 다르다');
  }
  return { id: o.id, src: o.src, kind: o.kind, requestedAt: o.requestedAt, blocking: o.blocking };
}

function afterPaint(
  paint: { at: number; blockedBy: string[]; unfinished: string[] } | null,
  at: number,
): number | null {
  return paint === null ? null : at - paint.at;
}

function isFacetData(v: unknown): v is WhatFirstPaintNeedsFacetData {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>).type === 'what-first-paint-needs'
  );
}

function toLane(line: WhatFirstPaintHeadLine): Lane {
  return {
    id: line.id,
    src: line.src,
    kind: line.kind,
    tag: line.tag,
    media: line.media,
    attr: line.attr,
  };
}

export const whatFirstPaintNeedsScene: ScenePlan<WhatFirstPaintNeedsScene> = {
  initial(initialData: unknown): WhatFirstPaintNeedsScene {
    if (!isFacetData(initialData)) throw new Error('what-first-paint-needs 초기 자료 모양이 다르다');
    return {
      base: {
        parseMs: initialData.parseMs,
        lanes: initialData.head.map(toLane),
        bodyCount: initialData.body.length,
        resources: { ...initialData.resources },
      },
      trace: {
        requested: {},
        bodyParsedAt: null,
        arrived: {},
        scriptRuns: {},
        paint: null,
      },
      step: { kind: 'start' },
    };
  },

  reduce(scene: WhatFirstPaintNeedsScene, event: FacetRuntimeEvent): WhatFirstPaintNeedsScene {
    const payload = event.payload;

    if (event.type === 'headParsed') {
      if (typeof payload !== 'object' || payload === null) throw new Error('headParsed payload 가 없다');
      const raw = (payload as Record<string, unknown>).entries;
      if (!Array.isArray(raw)) throw new Error('headParsed.entries 가 배열이 아니다');
      const entries = raw.map(toHeadEntry);
      const requested = { ...scene.trace.requested };
      for (const e of entries) requested[e.src] = { at: e.requestedAt, blocking: e.blocking };
      return {
        ...scene,
        trace: { ...scene.trace, requested },
        step: { kind: 'headParsed', entries },
      };
    }

    if (event.type === 'bodyParsed') {
      if (typeof payload !== 'object' || payload === null) throw new Error('bodyParsed payload 가 없다');
      const o = payload as Record<string, unknown>;
      if (!isNumber(o.at) || !isNumber(o.lineCount)) throw new Error('bodyParsed payload 모양이 다르다');
      return {
        ...scene,
        trace: { ...scene.trace, bodyParsedAt: o.at },
        step: { kind: 'bodyParsed', at: o.at, lineCount: o.lineCount },
      };
    }

    if (event.type === 'resourceArrived') {
      if (typeof payload !== 'object' || payload === null) throw new Error('resourceArrived payload 가 없다');
      const o = payload as Record<string, unknown>;
      if (!isString(o.src) || !isNumber(o.at)) throw new Error('resourceArrived payload 모양이 다르다');
      const arrived = { ...scene.trace.arrived, [o.src]: o.at };
      return {
        ...scene,
        trace: { ...scene.trace, arrived },
        step: { kind: 'resourceArrived', src: o.src, at: o.at, afterPaintMs: afterPaint(scene.trace.paint, o.at) },
      };
    }

    if (event.type === 'firstPaint') {
      if (typeof payload !== 'object' || payload === null) throw new Error('firstPaint payload 가 없다');
      const o = payload as Record<string, unknown>;
      if (!isNumber(o.at) || !isStringArray(o.blockedBy) || !isStringArray(o.unfinished)) {
        throw new Error('firstPaint payload 모양이 다르다');
      }
      const paint = { at: o.at, blockedBy: o.blockedBy, unfinished: o.unfinished };
      return {
        ...scene,
        trace: { ...scene.trace, paint },
        step: { kind: 'firstPaint', at: paint.at, blockedBy: paint.blockedBy, unfinished: paint.unfinished },
      };
    }

    if (event.type === 'scriptStarted') {
      if (typeof payload !== 'object' || payload === null) throw new Error('scriptStarted payload 가 없다');
      const o = payload as Record<string, unknown>;
      if (!isString(o.src) || !isNumber(o.at)) throw new Error('scriptStarted payload 모양이 다르다');
      const scriptRuns = { ...scene.trace.scriptRuns, [o.src]: { start: o.at, end: null } };
      return {
        ...scene,
        trace: { ...scene.trace, scriptRuns },
        step: { kind: 'scriptStarted', src: o.src, at: o.at, afterPaintMs: afterPaint(scene.trace.paint, o.at) },
      };
    }

    if (event.type === 'scriptFinished') {
      if (typeof payload !== 'object' || payload === null) throw new Error('scriptFinished payload 가 없다');
      const o = payload as Record<string, unknown>;
      if (!isString(o.src) || !isNumber(o.at) || !isBoolean(o.domContentLoaded)) {
        throw new Error('scriptFinished payload 모양이 다르다');
      }
      const prevRun = scene.trace.scriptRuns[o.src];
      const start = prevRun ? prevRun.start : o.at;
      const scriptRuns = { ...scene.trace.scriptRuns, [o.src]: { start, end: o.at } };
      return {
        ...scene,
        trace: { ...scene.trace, scriptRuns },
        step: {
          kind: 'scriptFinished',
          src: o.src,
          at: o.at,
          domContentLoaded: o.domContentLoaded,
          afterPaintMs: afterPaint(scene.trace.paint, o.at),
        },
      };
    }

    throw new Error(`알 수 없는 이벤트 종류 "${event.type}"`);
  },
};
