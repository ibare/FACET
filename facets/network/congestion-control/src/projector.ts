/**
 * congestion-control projector — 알고리즘 이벤트를 stage · 코드 패널 호출로 옮긴다.
 *
 * - `phase` → 코드 패널 highlightPhase
 * - `run-start` → stage.startRun (망 용량 선이 새 자리로, 앞 판은 자국으로)
 * - `round` → stage.showRound (점이 자국 자리에서 새 값으로, 표지가 새 줄로)
 * 운동 길이는 걸음마다 runtime.getSpeed() 를 읽어 정한다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  CongestionControlStage,
  Limiter,
  StageKind,
} from './congestion-control-stage.js';

/** 한 걸음의 운동 길이 (재생 속도 1 에서) */
const MOTION_MS = 300;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`payload.${key} 가 수가 아니다: ${String(v)}`);
  }
  return v;
}

function kindOf(v: unknown): StageKind {
  if (v === 'slow-start' || v === 'avoid' || v === 'receiver' || v === 'loss') return v;
  throw new Error(`모르는 왕복 종류: ${String(v)}`);
}

function limiterOf(v: unknown): Limiter {
  if (v === 'receiver' || v === 'network') return v;
  throw new Error(`모르는 조이는 쪽: ${String(v)}`);
}

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('payload 가 객체가 아니다');
  return payload as Record<string, unknown>;
}

export const congestionControlProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CongestionControlStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit() {
      stage?.clear();
      code?.clearHighlight?.();
    },
    async onEvent(e) {
      switch (e.type) {
      case 'phase': {
        const p = record(e.payload);
        const phase = p.phase;
        if (typeof phase !== 'string') throw new Error('phase 이름이 글자가 아니다');
        code?.highlightPhase?.(phase);
        return;
      }
      case 'run-start': {
        const p = record(e.payload);
        code?.clearHighlight?.();
        await stage?.startRun(
          {
            capacity: num(p, 'capacity'),
            cwnd: num(p, 'cwnd'),
            ssthresh: num(p, 'ssthresh'),
            window: num(p, 'window'),
          },
          motion(),
        );
        return;
      }
      case 'round': {
        const p = record(e.payload);
        await stage?.showRound(
          {
            round: num(p, 'round'),
            cwnd: num(p, 'cwnd'),
            ssthresh: num(p, 'ssthresh'),
            nextSsthresh: num(p, 'nextSsthresh'),
            window: num(p, 'window'),
            send: num(p, 'send'),
            delivered: num(p, 'delivered'),
            kind: kindOf(p.kind),
            limiter: limiterOf(p.limiter),
            nextCwnd: num(p, 'nextCwnd'),
            unreadBefore: num(p, 'unreadBefore'),
            unreadFilled: num(p, 'unreadFilled'),
            read: num(p, 'read'),
            unread: num(p, 'unread'),
          },
          motion(),
        );
        return;
      }
      default:
        return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
