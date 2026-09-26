import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { StyleBlocksPaintLine, StyleBlocksPaintLineKind } from './algorithm.js';

export interface StyleBlocksPaintSceneLine {
  id: string;
  kind: StyleBlocksPaintLineKind;
  code: string;
  text?: string;
  heading?: boolean;
  src?: string;
}

/** 이번 걸음 — 걸음마다 갈아 끼운다. 문안·좌표가 아니라 종류와 인자만 (S-scene). */
export type StyleBlocksPaintStep =
  | { kind: 'lineRead'; index: number; domComplete: boolean }
  | { kind: 'arrived' }
  | { kind: 'firstPaint' }
  | null;

export interface StyleBlocksPaintScene {
  /** 바탕 — 문서의 줄과 site.css 받는 시간. initialData 에서 한 번 채운다. */
  readonly lines: readonly StyleBlocksPaintSceneLine[];
  readonly cssDurationMs: number;
  /** 자취 — 몇 줄까지 읽혔는가. */
  readonly readCount: number;
  /** 자취 — site.css 를 요청한 ms. 아직이면 null. */
  readonly cssRequestedAt: number | null;
  /** 자취 — site.css 가 도착한 ms. 아직이면 null. */
  readonly cssArrivedAt: number | null;
  /** 자취 — DOM 이 다 된 ms(파싱 끝). 아직이면 null. */
  readonly domCompleteAt: number | null;
  /** 자취 — 첫 장이 선 ms. 아직이면 null. */
  readonly paintedAt: number | null;
  /** 자취 — 첫 장까지 다 된 DOM 이 그려지지 않은 채 기다린 길이. 아직이면 null. */
  readonly waitedMs: number | null;
  /** 자취 — 가장 최근에 알려진 시각. 시계 표시에 쓴다. */
  readonly nowMs: number;
  readonly step: StyleBlocksPaintStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toLines(v: unknown): StyleBlocksPaintLine[] {
  if (!Array.isArray(v)) throw new Error('initialData.lines 가 배열이 아니다');
  return v.map((raw, i) => {
    if (!isRecord(raw)) throw new Error(`initialData.lines[${i}] 가 객체가 아니다`);
    const { id, kind, code, text, heading, src } = raw;
    if (typeof id !== 'string') throw new Error(`initialData.lines[${i}].id 가 문자열이 아니다`);
    if (kind !== 'link' && kind !== 'text') throw new Error(`initialData.lines[${i}].kind 를 모른다: ${String(kind)}`);
    if (typeof code !== 'string') throw new Error(`initialData.lines[${i}].code 가 문자열이 아니다`);
    if (text !== undefined && typeof text !== 'string') throw new Error(`initialData.lines[${i}].text 가 문자열이 아니다`);
    if (heading !== undefined && typeof heading !== 'boolean') throw new Error(`initialData.lines[${i}].heading 이 불리언이 아니다`);
    if (src !== undefined && typeof src !== 'string') throw new Error(`initialData.lines[${i}].src 가 문자열이 아니다`);
    return { id, kind, code, text, heading, src };
  });
}

export const styleBlocksPaintScene: ScenePlan<StyleBlocksPaintScene> = {
  initial(initialData: unknown): StyleBlocksPaintScene {
    if (!isRecord(initialData)) throw new Error('initialData 가 객체가 아니다');
    const { lines: rawLines, cssDurationMs } = initialData;
    if (typeof cssDurationMs !== 'number') throw new Error('initialData.cssDurationMs 가 수가 아니다');
    const lines = toLines(rawLines).map((l) => ({ ...l }));
    return {
      lines,
      cssDurationMs,
      readCount: 0,
      cssRequestedAt: null,
      cssArrivedAt: null,
      domCompleteAt: null,
      paintedAt: null,
      waitedMs: null,
      nowMs: 0,
      step: null,
    };
  },

  reduce(scene: StyleBlocksPaintScene, event: FacetRuntimeEvent): StyleBlocksPaintScene {
    if (event.type === 'line:read') {
      const p = event.payload;
      if (!isRecord(p) || typeof p.index !== 'number' || typeof p.at !== 'number' || typeof p.domComplete !== 'boolean') {
        throw new Error(`line:read 의 payload 모양을 모른다: ${JSON.stringify(p)}`);
      }
      const line = scene.lines[p.index];
      if (!line) throw new Error(`line:read 가 모르는 자리를 가리킨다: ${p.index}`);
      return {
        ...scene,
        readCount: Math.max(scene.readCount, p.index + 1),
        cssRequestedAt: line.kind === 'link' ? p.at : scene.cssRequestedAt,
        domCompleteAt: p.domComplete ? p.at : scene.domCompleteAt,
        nowMs: p.at,
        step: { kind: 'lineRead', index: p.index, domComplete: p.domComplete },
      };
    }
    if (event.type === 'resource:arrived') {
      const p = event.payload;
      if (!isRecord(p) || typeof p.id !== 'string' || typeof p.at !== 'number') {
        throw new Error(`resource:arrived 의 payload 모양을 모른다: ${JSON.stringify(p)}`);
      }
      const cssLine = scene.lines.find((l) => l.kind === 'link');
      if (!cssLine || cssLine.src !== p.id) {
        throw new Error(`resource:arrived 가 모르는 자원을 가리킨다: ${p.id}`);
      }
      return { ...scene, cssArrivedAt: p.at, nowMs: p.at, step: { kind: 'arrived' } };
    }
    if (event.type === 'first-paint') {
      const p = event.payload;
      if (!isRecord(p) || typeof p.at !== 'number' || typeof p.waitedMs !== 'number') {
        throw new Error(`first-paint 의 payload 모양을 모른다: ${JSON.stringify(p)}`);
      }
      return { ...scene, paintedAt: p.at, waitedMs: p.waitedMs, nowMs: p.at, step: { kind: 'firstPaint' } };
    }
    return scene;
  },
};
