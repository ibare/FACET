/**
 * 컨텍스트 스위칭 facet projector — algorithm 이벤트를
 * context-switching-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 단일 무대의 단일 점유 — 한 시점의 한 색.
 *   2. 외부 보관소의 자기 자리 — 좌우 두 박스.
 *   3. 저장과 복원의 비대칭 운동 — 다른 무게의 두 동작.
 *   4. 사이의 빈 시간 — 회색이 자라는 폭.
 *   5. 세 박자로 펼쳐진 한 사건 — 점이 아니라 운동.
 *   6. 외부 트리거의 외래성 — 천장에서 내려온다.
 *   7. 컨텍스트 양의 차이 — 보관소 부피의 토글.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { Flow, TriggerKind, Mode } from './algorithm.js';

type CtxStage = {
  reset(): void;
  init(payload: {
    occupant: Flow;
    mode: Mode;
    triggerKind: TriggerKind;
    timings: {
      triggerPulseMs: number;
      saveDurationMs: number;
      emptyDurationMs: number;
      restoreDurationMs: number;
    };
    modeMultipliers: { thread: number; process: number };
    strip: { capacity: number; tickMs: number };
    occupySegmentMs: number;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  signalTriggerArrived(payload: { kind: TriggerKind; from: Flow }): Promise<void>;
  signalSaveBegin(payload: { from: Flow; kind: TriggerKind; mode: Mode }): Promise<void>;
  signalSaveEnd(payload: { from: Flow; mode: Mode }): Promise<void>;
  signalRestoreBegin(payload: { to: Flow; mode: Mode }): Promise<void>;
  signalRestoreEnd(payload: { to: Flow; mode: Mode }): Promise<void>;
  applyModeChanged(mode: Mode, segmentIndex: number): void;
  applyTriggerKindChanged(kind: TriggerKind, segmentIndex: number): void;
  signalReset(): void;
};

const BASE_CAPTION =
  '컨텍스트 스위칭 — 단 하나의 CPU 무대 위에서 한 흐름의 상태 일습이 자기 보관소로 떠내지고, 다른 흐름의 상태 일습이 그 자리에 되돌려 들어가, 두 흐름이 멈춘 지점에서 정확히 이어 실행된다.';

function asFlow(v: unknown): Flow {
  return v === 'b' ? 'b' : 'a';
}

function asTriggerKind(v: unknown): TriggerKind {
  if (v === 'syscall' || v === 'io' || v === 'interrupt') return v;
  return 'timer';
}

function asMode(v: unknown): Mode {
  return v === 'process' ? 'process' : 'thread';
}

export const contextSwitchingProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as CtxStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            occupant: Flow;
            mode: Mode;
            triggerKind: TriggerKind;
            timings: {
              triggerPulseMs: number;
              saveDurationMs: number;
              emptyDurationMs: number;
              restoreDurationMs: number;
            };
            modeMultipliers: { thread: number; process: number };
            strip: { capacity: number; tickMs: number };
            occupySegmentMs: number;
          }>;
          stage.init({
            occupant: asFlow(p.occupant),
            mode: asMode(p.mode),
            triggerKind: asTriggerKind(p.triggerKind),
            timings: {
              triggerPulseMs: p.timings?.triggerPulseMs ?? 240,
              saveDurationMs: p.timings?.saveDurationMs ?? 700,
              emptyDurationMs: p.timings?.emptyDurationMs ?? 400,
              restoreDurationMs: p.timings?.restoreDurationMs ?? 800,
            },
            modeMultipliers: {
              thread: p.modeMultipliers?.thread ?? 1.0,
              process: p.modeMultipliers?.process ?? 1.6,
            },
            strip: {
              capacity: p.strip?.capacity ?? 80,
              tickMs: p.strip?.tickMs ?? 80,
            },
            occupySegmentMs: typeof p.occupySegmentMs === 'number' ? p.occupySegmentMs : 1500,
          });
          break;
        }

        case 'trigger-arrived': {
          const p = (event.payload ?? {}) as Partial<{ kind: TriggerKind; from: Flow }>;
          await stage.signalTriggerArrived({
            kind: asTriggerKind(p.kind),
            from: asFlow(p.from),
          });
          break;
        }

        case 'save-begin': {
          const p = (event.payload ?? {}) as Partial<{
            from: Flow;
            kind: TriggerKind;
            mode: Mode;
          }>;
          await stage.signalSaveBegin({
            from: asFlow(p.from),
            kind: asTriggerKind(p.kind),
            mode: asMode(p.mode),
          });
          break;
        }

        case 'save-end': {
          const p = (event.payload ?? {}) as Partial<{ from: Flow; mode: Mode }>;
          await stage.signalSaveEnd({
            from: asFlow(p.from),
            mode: asMode(p.mode),
          });
          break;
        }

        case 'restore-begin': {
          const p = (event.payload ?? {}) as Partial<{ to: Flow; mode: Mode }>;
          await stage.signalRestoreBegin({
            to: asFlow(p.to),
            mode: asMode(p.mode),
          });
          break;
        }

        case 'restore-end': {
          const p = (event.payload ?? {}) as Partial<{ to: Flow; mode: Mode }>;
          await stage.signalRestoreEnd({
            to: asFlow(p.to),
            mode: asMode(p.mode),
          });
          break;
        }

        case 'mode-changed': {
          const p = (event.payload ?? {}) as Partial<{ mode: Mode; segmentIndex: number }>;
          stage.applyModeChanged(
            asMode(p.mode),
            typeof p.segmentIndex === 'number' ? p.segmentIndex : 0,
          );
          break;
        }

        case 'trigger-kind-changed': {
          const p = (event.payload ?? {}) as Partial<{
            kind: TriggerKind;
            segmentIndex: number;
          }>;
          stage.applyTriggerKindChanged(
            asTriggerKind(p.kind),
            typeof p.segmentIndex === 'number' ? p.segmentIndex : 0,
          );
          break;
        }

        default:
          // mode / phase / reset-state 등 silent 메타 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
      stage.signalReset();
    },
  };
};
