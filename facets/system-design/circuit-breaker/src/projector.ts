/**
 * 서킷 브레이커 projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * - `breaker-init` → 무대 `init` (판 머리 · 멱등), 코드 패널 강조를 끈다
 * - `phase` → 코드 패널 `highlightPhase`
 * - `call` → 무대 `call` — 운동 길이는 부를 때마다 `getSpeed()` 로 나눈다
 * payload 는 typeof 가드로 읽고, 없거나 어긋나면 무엇이 없는지 담아 던진다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { CircuitBreakerStage, StageCall, StageHealth, StageInit, StageState } from './circuit-breaker-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`circuit-breaker projector: ${what} payload 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function int(r: Record<string, unknown>, k: string): number {
  const v = r[k];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`circuit-breaker projector: ${k} 가 정수가 아니다`);
  return v;
}
function bool(r: Record<string, unknown>, k: string): boolean {
  const v = r[k];
  if (typeof v !== 'boolean') throw new Error(`circuit-breaker projector: ${k} 가 참거짓이 아니다`);
  return v;
}
function health(v: unknown): StageHealth {
  if (v === 'up' || v === 'blip' || v === 'down') return v;
  throw new Error(`circuit-breaker projector: 모르는 건강 ${String(v)}`);
}
function state(v: unknown): StageState {
  if (v === 'closed' || v === 'open' || v === 'half_open') return v;
  throw new Error(`circuit-breaker projector: 모르는 상태 ${String(v)}`);
}

export const circuitBreakerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CircuitBreakerStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('circuit-breaker projector: stage 블록이 없다');
  let motionMs: number | null = null;

  return {
    onEvent(event) {
      switch (event.type) {
        case 'breaker-init': {
          const r = obj(event.payload, 'breaker-init');
          if (typeof r.service !== 'string') throw new Error('circuit-breaker projector: service 가 없다');
          if (!Array.isArray(r.health)) throw new Error('circuit-breaker projector: health 가 목록이 아니다');
          const init: StageInit = {
            service: r.service,
            ticks: int(r, 'ticks'),
            health: r.health.map(health),
            back: int(r, 'back'),
            threshold: int(r, 'threshold'),
            wait: int(r, 'wait'),
            maxWait: int(r, 'maxWait'),
          };
          if (init.health.length !== init.ticks) throw new Error('circuit-breaker projector: health 길이가 ticks 와 다르다');
          motionMs = int(r, 'motionMs');
          codePanel?.highlightPhase(null);
          stage.init(init);
          return;
        }
        case 'phase': {
          const r = obj(event.payload, 'phase');
          if (typeof r.phase !== 'string') throw new Error('circuit-breaker projector: phase 이름이 없다');
          codePanel?.highlightPhase(r.phase);
          return;
        }
        case 'call': {
          const r = obj(event.payload, 'call');
          const outcome = r.outcome;
          if (outcome !== 'answered' && outcome !== 'timeout' && outcome !== 'blocked') {
            throw new Error(`circuit-breaker projector: 모르는 결과 ${String(outcome)}`);
          }
          const c: StageCall = {
            tick: int(r, 'tick'),
            health: health(r.health),
            halfOpened: bool(r, 'halfOpened'),
            probe: bool(r, 'probe'),
            outcome,
            state: state(r.state),
            fails: int(r, 'fails'),
            fill: int(r, 'fill'),
            back: int(r, 'back'),
            closedAgain: bool(r, 'closedAgain'),
            recovered: bool(r, 'recovered'),
          };
          if (motionMs === null) throw new Error('circuit-breaker projector: breaker-init 없이 부름이 왔다');
          const speed = runtime?.getSpeed() ?? 1;
          if (!(speed > 0)) throw new Error(`circuit-breaker projector: 재생 속도 ${speed} 가 양수가 아니다`);
          stage.call(c, motionMs / speed);
          return;
        }
        default:
          throw new Error(`circuit-breaker projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      codePanel?.highlightPhase(null);
      motionMs = null;
    },
    onDestroy() {
      stage.reset();
    },
  };
};
