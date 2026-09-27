/**
 * 광선 추적 projector — 알고리즘의 걸음 이벤트를 무대 메서드로 옮기고 캡션을 짓는다.
 *
 * payload 는 typeof 로 좁힌다. 무대가 모르는 이벤트 · 없는 값은 지어내지 않고 던진다.
 * 수의 표시(반올림 · 자릿수)는 여기서만 한다 — 좌표 · 각은 소수 첫째(각) · 셋째(비), 절반은 0 에서 먼 쪽.
 * 운동 길이는 판 머리의 motionMs 를 재생 속도로 나눠 **그때그때** 셈한다.
 */
import { type ProjectorFactory, makeTranslator } from '@ffacet/core/runtime';
import type {
  RayTracingBaseStage,
  StageCell,
  StageExit,
  StageScene,
  StageSegment,
  StageShadow,
  StageShot,
  StageVec,
} from './ray-tracing-base-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function fail(what: string): never {
  throw new Error(`ray-tracing-base projector: ${what}`);
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where} 가 수가 아니다`);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(`${where} 가 배열이 아니다`);
  return v;
}

function vec(v: unknown, where: string): StageVec {
  const o = rec(v, where);
  return { x: num(o.x, `${where}.x`), y: num(o.y, `${where}.y`) };
}

function rgb(v: unknown, where: string): [number, number, number] {
  const a = list(v, where);
  if (a.length !== 3) fail(`${where} 가 [r,g,b] 가 아니다`);
  return [num(a[0], `${where}[0]`), num(a[1], `${where}[1]`), num(a[2], `${where}[2]`)];
}

/** 표시 반올림 — 절반은 0 에서 먼 쪽, −0 은 0 */
export function fmt(x: number, digits: number): string {
  const p = 10 ** digits;
  const v = Math.floor(Math.abs(x) * p + 0.5 + 1e-9) / p;
  return v === 0 ? (0).toFixed(digits) : (Math.sign(x) * v).toFixed(digits);
}

export const rayTracingBaseProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RayTracingBaseStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;

  const need = (): RayTracingBaseStage => {
    if (!stage) fail('무대(stage)가 없다');
    return stage;
  };
  const dur = (): number => {
    if (motionMs === null) fail('판 머리(scene-set) 전에 걸음이 왔다');
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const phase = rec(p, 'phase payload').phase;
          if (typeof phase !== 'string') fail('phase 가 문자열이 아니다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'scene-set': {
          const o = rec(p, 'scene-set');
          motionMs = num(o.motionMs, 'motionMs');
          const row = rec(o.row, 'row');
          const glass = rec(o.glass, 'glass');
          const wall = rec(o.wall, 'wall');
          const n = num(o.n, 'n');
          const scene: StageScene = {
            n: fmt(n, 1),
            eye: vec(o.eye, 'eye'),
            row: { y: num(row.y, 'row.y'), left: num(row.left, 'row.left'), right: num(row.right, 'row.right'), count: num(row.count, 'row.count') },
            glass: { cx: num(glass.cx, 'glass.cx'), cy: num(glass.cy, 'glass.cy'), r: num(glass.r, 'glass.r') },
            light: vec(o.light, 'light'),
            wall: {
              y: num(wall.y, 'wall.y'),
              left: num(wall.left, 'wall.left'),
              right: num(wall.right, 'wall.right'),
              bandWidth: num(wall.bandWidth, 'wall.bandWidth'),
              bands: list(wall.bands, 'wall.bands').map((b, i) => rgb(b, `wall.bands[${i}]`)),
            },
            pixels: list(o.pixels, 'pixels').map((q, i) => {
              const r = rec(q, `pixels[${i}]`);
              return { k: num(r.k, `pixels[${i}].k`), x: num(r.x, `pixels[${i}].x`), straightX: num(r.straightX, `pixels[${i}].straightX`) };
            }),
          };
          code?.highlightPhase?.(null);
          const s = need();
          s.setScene(scene, dur());
          s.setCaption(t('caption.init', 'The glass takes its refractive index; the rays are next'), '');
          return;
        }
        case 'rays-shot': {
          const o = rec(p, 'rays-shot');
          const rays: StageShot[] = list(o.rays, 'rays').map((q, i) => {
            const r = rec(q, `rays[${i}]`);
            if (r.hit !== 'glass' && r.hit !== 'wall') fail(`rays[${i}].hit 이 '${String(r.hit)}'`);
            return { k: num(r.k, `rays[${i}].k`), from: vec(r.from, `rays[${i}].from`), to: vec(r.to, `rays[${i}].to`), hit: r.hit };
          });
          const s = need();
          s.shoot(rays, dur());
          s.setCaption(
            t('caption.shoot', 'One ray per pixel travels to the first thing it hits'),
            t('stat.shoot', 'rays {rays} · glass {glass} · wall {wall}', {
              rays: rays.length,
              glass: num(o.glass, 'glass'),
              wall: num(o.wall, 'wall'),
            }),
          );
          return;
        }
        case 'rays-entered': {
          const o = rec(p, 'rays-entered');
          const rays: StageSegment[] = list(o.rays, 'rays').map((q, i) => {
            const r = rec(q, `rays[${i}]`);
            return { k: num(r.k, `rays[${i}].k`), to: vec(r.to, `rays[${i}].to`) };
          });
          const focus = rec(o.focus, 'focus');
          const k = num(focus.k, 'focus.k');
          const s = need();
          if (typeof o.bent !== 'boolean') fail('rays-entered.bent 가 불리언이 아니다');
          s.enter(rays, k, dur());
          s.setCaption(
            o.bent
              ? t('caption.enter', 'Entering the glass, each ray bends toward the normal')
              : t('caption.enterStraight', 'Entering the glass, the rays go straight on without bending'),
            t('stat.enter', 'pixel {pixel}: incidence {in}° → refraction {out}°', {
              pixel: k + 1,
              in: fmt(num(focus.angleIn, 'focus.angleIn'), 1),
              out: fmt(num(focus.angleOut, 'focus.angleOut'), 1),
            }),
          );
          return;
        }
        case 'rays-exited': {
          const o = rec(p, 'rays-exited');
          const rays: StageExit[] = list(o.rays, 'rays').map((q, i) => {
            const r = rec(q, `rays[${i}]`);
            return { k: num(r.k, `rays[${i}].k`), straightX: num(r.straightX, `rays[${i}].straightX`), wallX: num(r.wallX, `rays[${i}].wallX`) };
          });
          const s = need();
          if (typeof o.bent !== 'boolean') fail('rays-exited.bent 가 불리언이 아니다');
          s.exit(rays, dur());
          s.setCaption(
            o.bent
              ? t('caption.exit', 'Leaving the glass, each ray bends away from the normal and slides along the wall')
              : t('caption.exitStraight', 'Leaving the glass without bending, the rays land on their straight-line spots'),
            t('stat.exit', 'largest bend {bend}° · flipped neighbour pairs {pairs}', {
              bend: fmt(num(o.maxBend, 'maxBend'), 1),
              pairs: num(o.flippedPairs, 'flippedPairs'),
            }),
          );
          return;
        }
        case 'shadow-rays': {
          const o = rec(p, 'shadow-rays');
          const rays: StageShadow[] = list(o.rays, 'rays').map((q, i) => {
            const r = rec(q, `rays[${i}]`);
            if (typeof r.blocked !== 'boolean') fail(`rays[${i}].blocked 가 불리언이 아니다`);
            return { k: num(r.k, `rays[${i}].k`), from: vec(r.from, `rays[${i}].from`), to: vec(r.to, `rays[${i}].to`), blocked: r.blocked };
          });
          const s = need();
          s.shadow(rays, dur());
          s.setCaption(
            t('caption.shadow', 'From each point on the wall a shadow ray heads for the light'),
            t('stat.shadow', 'blocked by the glass {blocked} / {total}', {
              blocked: num(o.shadowed, 'shadowed'),
              total: num(o.total, 'total'),
            }),
          );
          return;
        }
        case 'cells-shaded': {
          const o = rec(p, 'cells-shaded');
          const raw = list(o.cells, 'cells').map((q, i) => rec(q, `cells[${i}]`));
          const cells: StageCell[] = raw.map((r, i) => ({ k: num(r.k, `cells[${i}].k`), color: rgb(r.color, `cells[${i}].color`) }));
          const bands = raw.map((r, i) => String(num(r.band, `cells[${i}].band`) + 1)).join(' ');
          const s = need();
          s.shade(cells, dur());
          s.setCaption(
            t('caption.shade', 'Each cell takes the colour of the band its ray hit, dimmed in shadow'),
            t('stat.shade', 'bands {bands} · shadow × {scale}', {
              bands,
              scale: fmt(num(o.shadowScale, 'shadowScale'), 3),
            }),
          );
          return;
        }
        default:
          fail(`모르는 이벤트 '${event.type}'`);
      }
    },
    onReset() {
      motionMs = null;
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
