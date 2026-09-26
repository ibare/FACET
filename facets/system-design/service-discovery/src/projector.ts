/**
 * 서비스 디스커버리 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   init  (silent) → stage.init  (만료 선을 옮기고 막대를 0 으로) · 코드 패널 강조를 끈다
 *   phase (silent) → codePanel.highlightPhase
 *   tick           → stage.tick  (소식 · 만료 · 요청의 운동)
 *
 * 운동 길이는 init 이 실어 온 motionMs 를 재생 속도로 나눈 값 — 이벤트마다 getSpeed() 를 읽는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  ServiceDiscoveryInitView,
  ServiceDiscoveryStage,
  ServiceDiscoveryTickView,
} from './service-discovery-stage.js';

type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`service-discovery projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`service-discovery projector: ${what} 가 정수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`service-discovery projector: ${what} 가 문자열이 아니다`);
  return v;
}
function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`service-discovery projector: ${what} 가 참거짓이 아니다`);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`service-discovery projector: ${what} 가 배열이 아니다`);
  return v;
}

function readInit(payload: unknown): ServiceDiscoveryInitView & { motionMs: number } {
  const p = obj(payload, 'init payload');
  return {
    expiry: int(p.expiry, 'init.expiry'),
    service: str(p.service, 'init.service'),
    instances: arr(p.instances, 'init.instances').map((x, i) => {
      const o = obj(x, `init.instances[${i}]`);
      return { id: str(o.id, `init.instances[${i}].id`), addr: str(o.addr, `init.instances[${i}].addr`) };
    }),
    scaleMax: int(p.scaleMax, 'init.scaleMax'),
    lastTick: int(p.lastTick, 'init.lastTick'),
    motionMs: int(p.motionMs, 'init.motionMs'),
  };
}

function readTick(payload: unknown): ServiceDiscoveryTickView {
  const p = obj(payload, 'tick payload');
  const stopped = p.stopped === null ? null : str(p.stopped, 'tick.stopped');
  return {
    tick: int(p.tick, 'tick.tick'),
    expiry: int(p.expiry, 'tick.expiry'),
    stopped,
    beats: arr(p.beats, 'tick.beats').map((x, i) => {
      const o = obj(x, `tick.beats[${i}]`);
      return {
        instance: str(o.instance, `tick.beats[${i}].instance`),
        lost: bool(o.lost, `tick.beats[${i}].lost`),
        rejoined: bool(o.rejoined, `tick.beats[${i}].rejoined`),
      };
    }),
    drops: arr(p.drops, 'tick.drops').map((x, i) => {
      const o = obj(x, `tick.drops[${i}]`);
      return { instance: str(o.instance, `tick.drops[${i}].instance`), alive: bool(o.alive, `tick.drops[${i}].alive`) };
    }),
    picks: arr(p.picks, 'tick.picks').map((x, i) => {
      const o = obj(x, `tick.picks[${i}]`);
      return { instance: str(o.instance, `tick.picks[${i}].instance`), dead: bool(o.dead, `tick.picks[${i}].dead`) };
    }),
    quiet: arr(p.quiet, 'tick.quiet').map((x, i) => int(x, `tick.quiet[${i}]`)),
    listed: arr(p.listed, 'tick.listed').map((x, i) => bool(x, `tick.listed[${i}]`)),
    alive: arr(p.alive, 'tick.alive').map((x, i) => bool(x, `tick.alive[${i}]`)),
  };
}

export const serviceDiscoveryProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ServiceDiscoveryStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const need = (): ServiceDiscoveryStage => {
    if (!stage) throw new Error('service-discovery projector: stage 가 없다');
    return stage;
  };
  const duration = (): number => {
    if (motionMs === null) throw new Error('service-discovery projector: init 전에 tick 이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'init': {
          const view = readInit(event.payload);
          motionMs = view.motionMs;
          code?.highlightPhase?.(null);
          need().init(view, duration());
          return;
        }
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase?.(str(p.phase, 'phase.phase'));
          return;
        }
        case 'tick': {
          need().tick(readTick(event.payload), duration());
          return;
        }
        default:
          throw new Error(`service-discovery projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
