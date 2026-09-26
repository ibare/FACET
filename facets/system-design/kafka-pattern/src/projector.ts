/**
 * Kafka 패턴 projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 * 운동 길이는 init 이 실어 준 motionMs 를 그때그때의 재생 속도로 나눈다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { KafkaStage, KafkaStageInit, KafkaStageRewind, KafkaStageTick } from './kafka-pattern-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

const rec = (payload: unknown, what: string): Record<string, unknown> => {
  if (typeof payload !== 'object' || payload === null) throw new Error(`kafkaPattern projector: ${what} payload 가 객체가 아니다`);
  return payload as Record<string, unknown>;
};
const int = (p: Record<string, unknown>, key: string, what: string): number => {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`kafkaPattern projector: ${what}.${key} 가 정수가 아니다`);
  return v;
};
const str = (p: Record<string, unknown>, key: string, what: string): string => {
  const v = p[key];
  if (typeof v !== 'string' || v === '') throw new Error(`kafkaPattern projector: ${what}.${key} 가 비었다`);
  return v;
};
const bool = (p: Record<string, unknown>, key: string, what: string): boolean => {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`kafkaPattern projector: ${what}.${key} 가 참거짓이 아니다`);
  return v;
};

export const kafkaPatternProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as KafkaStage | undefined;
  if (!stage) throw new Error('kafkaPattern projector: stage 가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs = -1;

  const duration = (): number => {
    if (motionMs < 0) throw new Error('kafkaPattern projector: init 전에 걸음이 왔다');
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? motionMs / speed : motionMs;
  };

  return {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const phase = p.phase;
          if (phase !== null && typeof phase !== 'string') throw new Error('kafkaPattern projector: phase 가 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          const values = p.values;
          if (!Array.isArray(values) || !values.every((v) => typeof v === 'number')) {
            throw new Error('kafkaPattern projector: init.values 가 수 배열이 아니다');
          }
          motionMs = int(p, 'motionMs', 'init');
          const init: KafkaStageInit = {
            ticks: int(p, 'ticks', 'init'),
            values: values as number[],
            fastId: str(p, 'fastId', 'init'),
            slowId: str(p, 'slowId', 'init'),
            window: int(p, 'window', 'init'),
          };
          // 판 머리 — 앞 판의 코드 줄 강조를 걷는다
          code?.highlightPhase(null);
          stage.init(init, duration());
          return;
        }
        case 'tick': {
          const p = rec(event.payload, 'tick');
          const tick: KafkaStageTick = {
            tick: int(p, 'tick', 'tick'),
            offset: int(p, 'offset', 'tick'),
            value: int(p, 'value', 'tick'),
            start: int(p, 'start', 'tick'),
            end: int(p, 'end', 'tick'),
            trimmed: int(p, 'trimmed', 'tick'),
            live: int(p, 'live', 'tick'),
            batch: int(p, 'batch', 'tick'),
            skipFrom: int(p, 'skipFrom', 'tick'),
            skipped: int(p, 'skipped', 'tick'),
            read: bool(p, 'read', 'tick'),
          };
          stage.tick(tick, duration());
          return;
        }
        case 'rewind': {
          const p = rec(event.payload, 'rewind');
          const rewind: KafkaStageRewind = {
            requested: int(p, 'requested', 'rewind'),
            offset: int(p, 'offset', 'rewind'),
            from: int(p, 'from', 'rewind'),
            end: int(p, 'end', 'rewind'),
          };
          stage.rewind(rewind, duration());
          return;
        }
        default:
          throw new Error(`kafkaPattern projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      motionMs = -1;
      code?.highlightPhase(null);
      stage.reset();
    },
  };
};
