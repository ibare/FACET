/**
 * 장면 — parser-stops.
 *
 * 바탕(init 이 한 번 정하는 것): `lines` — 문서 줄의 id · 코드 글자. 걸음이 지나도 바뀌지 않는다.
 * 자취(걸음이 쌓는 것): `statuses` · `atMs` · `stall` · `parseEnded` — 지금까지 읽은 결과.
 * 이번 걸음: `step` — 방금 일어난 일의 종류와 인자. 문안은 stage 가 이것을 보고 고른다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LineStatus = 'pending' | 'active' | 'done';

export interface ParserStopsLineScene {
  readonly id: string;
  readonly code: string;
}

export interface ParserStopsStall {
  readonly src: string;
  readonly dur: number;
  readonly exec: number;
  readonly received: number;
  readonly stoppedAtMs: number;
  readonly arrived: boolean;
}

export type ParserStopsStep =
  | { readonly kind: 'start' }
  | { readonly kind: 'read'; readonly id: string; readonly final: boolean }
  | { readonly kind: 'stop'; readonly id: string; readonly src: string }
  | { readonly kind: 'wait'; readonly received: number; readonly total: number }
  | { readonly kind: 'arrive'; readonly src: string }
  | { readonly kind: 'resume'; readonly src: string; readonly stalledForMs: number };

export interface ParserStopsScene {
  readonly lines: readonly ParserStopsLineScene[];
  readonly statuses: readonly LineStatus[];
  readonly atMs: number;
  readonly stall: ParserStopsStall | null;
  readonly parseEnded: boolean;
  readonly step: ParserStopsStep;
}

function readLines(initialData: unknown): ParserStopsLineScene[] {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('parser-stops: initialData 가 객체가 아니다');
  }
  const data = initialData as { lines?: unknown };
  if (!Array.isArray(data.lines)) throw new Error('parser-stops: initialData.lines 가 배열이 아니다');
  return data.lines.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`parser-stops: lines[${i}] 가 객체가 아니다`);
    const line = raw as { id?: unknown; code?: unknown };
    if (typeof line.id !== 'string') throw new Error(`parser-stops: lines[${i}].id 가 문자열이 아니다`);
    if (typeof line.code !== 'string') throw new Error(`parser-stops: lines[${i}].code 가 문자열이 아니다`);
    return { id: line.id, code: line.code };
  });
}

function indexOfLine(scene: ParserStopsScene, id: string): number {
  const i = scene.lines.findIndex((l) => l.id === id);
  if (i < 0) throw new Error(`parser-stops: 장면에 없는 줄 id — ${id}`);
  return i;
}

function asRecord(payload: unknown, where: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`parser-stops: ${where} 의 payload 가 객체가 아니다`);
  }
  return payload as Record<string, unknown>;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`parser-stops: ${where} 가 문자열이 아니다`);
  return v;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number') throw new Error(`parser-stops: ${where} 가 수가 아니다`);
  return v;
}

function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`parser-stops: ${where} 가 불리언이 아니다`);
  return v;
}

export const parserStopsScene: ScenePlan<ParserStopsScene> = {
  initial(initialData) {
    const lines = readLines(initialData);
    return {
      lines,
      statuses: lines.map(() => 'pending' as const),
      atMs: 0,
      stall: null,
      parseEnded: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): ParserStopsScene {
    switch (event.type) {
      case 'line-read': {
        const p = asRecord(event.payload, 'line-read');
        const id = str(p.id, 'line-read.id');
        const atMs = num(p.atMs, 'line-read.atMs');
        const final = bool(p.final, 'line-read.final');
        const idx = indexOfLine(scene, id);
        const statuses = scene.statuses.slice();
        statuses[idx] = 'done';
        return { ...scene, statuses, atMs, parseEnded: final, step: { kind: 'read', id, final } };
      }
      case 'script-stop': {
        const p = asRecord(event.payload, 'script-stop');
        const id = str(p.id, 'script-stop.id');
        const atMs = num(p.atMs, 'script-stop.atMs');
        const src = str(p.src, 'script-stop.src');
        const dur = num(p.dur, 'script-stop.dur');
        const exec = num(p.exec, 'script-stop.exec');
        const idx = indexOfLine(scene, id);
        const statuses = scene.statuses.slice();
        statuses[idx] = 'active';
        return {
          ...scene,
          statuses,
          atMs,
          stall: { src, dur, exec, received: 0, stoppedAtMs: atMs, arrived: false },
          step: { kind: 'stop', id, src },
        };
      }
      case 'receiving': {
        const p = asRecord(event.payload, 'receiving');
        const atMs = num(p.atMs, 'receiving.atMs');
        const received = num(p.received, 'receiving.received');
        const total = num(p.total, 'receiving.total');
        if (scene.stall === null) throw new Error('parser-stops: receiving 이 멎지 않은 장면에 왔다');
        return { ...scene, atMs, stall: { ...scene.stall, received }, step: { kind: 'wait', received, total } };
      }
      case 'script-arrive': {
        const p = asRecord(event.payload, 'script-arrive');
        const atMs = num(p.atMs, 'script-arrive.atMs');
        const src = str(p.src, 'script-arrive.src');
        if (scene.stall === null) throw new Error('parser-stops: script-arrive 가 멎지 않은 장면에 왔다');
        return {
          ...scene,
          atMs,
          stall: { ...scene.stall, received: scene.stall.dur, arrived: true },
          step: { kind: 'arrive', src },
        };
      }
      case 'script-resume': {
        const p = asRecord(event.payload, 'script-resume');
        const atMs = num(p.atMs, 'script-resume.atMs');
        const src = str(p.src, 'script-resume.src');
        const stalledForMs = num(p.stalledForMs, 'script-resume.stalledForMs');
        if (scene.stall === null) throw new Error('parser-stops: script-resume 가 멎지 않은 장면에 왔다');
        const idx = scene.statuses.findIndex((s) => s === 'active');
        if (idx < 0) throw new Error('parser-stops: 멎은 줄을 찾지 못했다');
        const statuses = scene.statuses.slice();
        statuses[idx] = 'done';
        return { ...scene, statuses, atMs, stall: null, step: { kind: 'resume', src, stalledForMs } };
      }
      default:
        throw new Error(`parser-stops: 모르는 이벤트 — ${event.type}`);
    }
  },
};
