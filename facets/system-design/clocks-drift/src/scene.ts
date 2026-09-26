/**
 * clocks-drift 장면.
 *
 * 바탕: 시간 서버 · 시계 둘(식별자 · 빠르기) · 끝 시각 · 축 범위(init 이 싣는다)
 * 자취: 시계마다 (참 시각, 어긋남) 점들 — 맞추기는 같은 참 시각에 점 하나를 더 얹어 톱니가 된다.
 *       맞춘 뒤 남은 어긋남.
 * 이번 걸음: 처음 · 한 시간 · 맞추기
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowClocksDriftData } from './algorithm.js';

export type DriftPoint = { hour: number; ms: number };
export type DriftTrail = { clock: string; ppm: number; points: DriftPoint[] };
export type Residual = { clock: string; ms: number };

export type DriftStep =
  | { kind: 'start' }
  | { kind: 'hour'; hour: number }
  | { kind: 'sync'; clock: string; server: string; thetaMs: number; beforeMs: number; afterMs: number };

export type ClocksDriftScene = {
  server: string;
  endHour: number;
  /** 세로 축 범위 · 확대 범위. 알고리즘의 silent init 이 싣는다. */
  yMaxMs: number | null;
  residMaxMs: number | null;
  trails: DriftTrail[];
  residuals: Residual[];
  /** 지금 참 시각(시간 단위)과 두 시계 사이 벌어짐 */
  nowHour: number | null;
  gapMs: number | null;
  step: DriftStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`clocksDriftScene: ${path} — ${why}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '문자열이 아니다');
  return v;
}

/** offsets 가 바탕의 시계 둘을 같은 차례로 빠짐없이 가리키는지 보고 ms 를 꺼낸다. */
function readOffsets(scene: ClocksDriftScene, v: unknown, path: string): number[] {
  if (!Array.isArray(v)) fail(path, '배열이 아니다');
  if (v.length !== scene.trails.length) fail(path, '시계 수가 바탕과 다르다');
  return v.map((o, i) => {
    const r = rec(o, `${path}[${i}]`);
    const clock = str(r.clock, `${path}[${i}].clock`);
    const trail = scene.trails[i];
    if (trail === undefined || trail.clock !== clock) fail(`${path}[${i}].clock`, `바탕에 없는 시계 ${clock}`);
    return num(r.ms, `${path}[${i}].ms`);
  });
}

export const clocksDriftScene: ScenePlan<ClocksDriftScene> = {
  initial(initialData: unknown): ClocksDriftScene {
    const data = narrowClocksDriftData(initialData);
    return {
      server: data.server,
      endHour: data.endHour,
      yMaxMs: null,
      residMaxMs: null,
      trails: data.clocks.map((c) => ({ clock: c.id, ppm: c.ppm, points: [] })),
      residuals: [],
      nowHour: null,
      gapMs: null,
      step: null,
    };
  },

  reduce(scene: ClocksDriftScene, event: FacetRuntimeEvent): ClocksDriftScene {
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (scene.step !== null) fail('init', '처음이 아닌 걸음에 왔다');
        const hour = num(p.hour, 'init.payload.hour');
        const ms = readOffsets(scene, p.offsets, 'init.payload.offsets');
        const yMaxMs = num(p.yMaxMs, 'init.payload.yMaxMs');
        if (yMaxMs <= 0) fail('init.payload.yMaxMs', '0 이하다');
        const residMaxMs = p.residMaxMs === null ? null : num(p.residMaxMs, 'init.payload.residMaxMs');
        return {
          ...scene,
          yMaxMs,
          residMaxMs,
          trails: scene.trails.map((t, i) => ({ ...t, points: [{ hour, ms: ms[i] as number }] })),
          nowHour: hour,
          gapMs: num(p.gapMs, 'init.payload.gapMs'),
          step: { kind: 'start' },
        };
      }
      case 'hour': {
        if (scene.nowHour === null) fail('hour', 'init 앞에 왔다');
        const hour = num(p.hour, 'hour.payload.hour');
        if (hour <= scene.nowHour) fail('hour.payload.hour', '참 시각이 나아가지 않았다');
        if (hour > scene.endHour) fail('hour.payload.hour', '끝 시각을 넘었다');
        const ms = readOffsets(scene, p.offsets, 'hour.payload.offsets');
        return {
          ...scene,
          trails: scene.trails.map((t, i) => ({
            ...t,
            points: [...t.points, { hour, ms: ms[i] as number }],
          })),
          nowHour: hour,
          gapMs: num(p.gapMs, 'hour.payload.gapMs'),
          step: { kind: 'hour', hour },
        };
      }
      case 'sync': {
        if (scene.nowHour === null) fail('sync', 'init 앞에 왔다');
        const clock = str(p.clock, 'sync.payload.clock');
        const server = str(p.server, 'sync.payload.server');
        if (server !== scene.server) fail('sync.payload.server', `바탕의 서버가 아니다: ${server}`);
        const idx = scene.trails.findIndex((t) => t.clock === clock);
        if (idx < 0) fail('sync.payload.clock', `바탕에 없는 시계 ${clock}`);
        const atHour = num(p.atHour, 'sync.payload.atHour');
        if (atHour < scene.nowHour) fail('sync.payload.atHour', '참 시각이 거꾸로 갔다');
        const beforeMs = num(p.beforeMs, 'sync.payload.beforeMs');
        const afterMs = num(p.afterMs, 'sync.payload.afterMs');
        const thetaMs = num(p.thetaMs, 'sync.payload.thetaMs');
        return {
          ...scene,
          trails: scene.trails.map((t, i) =>
            i === idx ? { ...t, points: [...t.points, { hour: atHour, ms: afterMs }] } : t,
          ),
          residuals: [...scene.residuals, { clock, ms: afterMs }],
          gapMs: num(p.gapMs, 'sync.payload.gapMs'),
          step: { kind: 'sync', clock, server, thetaMs, beforeMs, afterMs },
        };
      }
      default:
        throw new Error(`clocksDriftScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
