/**
 * queueing-model projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   phase    → 코드 패널 highlightPhase
 *   init     → 코드 패널 끔 · 무대 setRound (점이 새 도착 시각으로 옮겨 간다)
 *   request  → 무대 showRequest
 *   sum-up   → 무대 sumUp
 *
 * 운동 길이는 motionMs / 재생 속도 — 걸음마다 그때의 속도를 읽는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { readQueueingModelData } from './algorithm.js';
import type {
  QueueingRequestView,
  QueueingRoundView,
  QueueingStage,
  QueueingSumView,
} from './queueing-model-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

function record(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`queueing-model: ${type} 의 payload 가 없다`);
  return payload as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`queueing-model: ${type}.${key} 가 수가 아니다`);
  return x;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const x = p[key];
  if (typeof x !== 'string' || x === '') throw new Error(`queueing-model: ${type}.${key} 가 글자가 아니다`);
  return x;
}

function bool(p: Record<string, unknown>, key: string, type: string): boolean {
  const x = p[key];
  if (typeof x !== 'boolean') throw new Error(`queueing-model: ${type}.${key} 가 참거짓이 아니다`);
  return x;
}

export function readRound(payload: unknown): QueueingRoundView {
  const p = record(payload, 'init');
  const list = p.requests;
  if (!Array.isArray(list) || list.length === 0) throw new Error('queueing-model: init.requests 가 비었다');
  const requests = list.map((item, i) => {
    const q = record(item, `init.requests[${i}]`);
    return {
      id: str(q, 'id', 'init.requests'),
      arrive: num(q, 'arrive', 'init.requests'),
      service: num(q, 'service', 'init.requests'),
    };
  });
  const round: QueueingRoundView = {
    variability: num(p, 'variability', 'init'),
    load: num(p, 'load', 'init'),
    axisEnd: num(p, 'axisEnd', 'init'),
    waitTop: num(p, 'waitTop', 'init'),
    lineTop: num(p, 'lineTop', 'init'),
    requests,
  };
  if (round.axisEnd <= 0 || round.waitTop <= 0) throw new Error('queueing-model: init 의 축 범위가 0 이하다');
  return round;
}

export function readRequest(payload: unknown): QueueingRequestView {
  const p = record(payload, 'request');
  return {
    index: num(p, 'index', 'request'),
    id: str(p, 'id', 'request'),
    arrive: num(p, 'arrive', 'request'),
    service: num(p, 'service', 'request'),
    wait: num(p, 'wait', 'request'),
    start: num(p, 'start', 'request'),
    depart: num(p, 'depart', 'request'),
    line: num(p, 'line', 'request'),
    busy: bool(p, 'busy', 'request'),
  };
}

export function readSum(payload: unknown): QueueingSumView {
  const p = record(payload, 'sum-up');
  return {
    variability: num(p, 'variability', 'sum-up'),
    load: num(p, 'load', 'sum-up'),
    meanWait: num(p, 'meanWait', 'sum-up'),
    maxWait: num(p, 'maxWait', 'sum-up'),
    waited: num(p, 'waited', 'sum-up'),
    longestLine: num(p, 'longestLine', 'sum-up'),
  };
}

export const queueingModelProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as QueueingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const needStage = (): QueueingStage => {
    if (!stage) throw new Error('queueing-model: 무대(stage)가 없다');
    return stage;
  };
  const ms = (): number => {
    if (motionMs === null) throw new Error('queueing-model: onInit 전에 이벤트가 왔다 (motionMs 모름)');
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? motionMs / speed : motionMs;
  };

  return {
    onInit(data) {
      motionMs = readQueueingModelData(data).motionMs;
    },
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase', 'phase'));
          return;
        }
        case 'init':
          code?.highlightPhase(null);
          needStage().setRound(readRound(event.payload), ms());
          return;
        case 'request':
          needStage().showRequest(readRequest(event.payload), ms());
          return;
        case 'sum-up':
          needStage().sumUp(readSum(event.payload), ms());
          return;
        default:
          throw new Error(`queueing-model: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.clearHighlight();
      stage?.reset();
    },
    onDestroy() {
      stage?.destroy();
    },
  };
};
