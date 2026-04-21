/**
 * Queue Projector — 알고리즘 이벤트를 conveyor-queue view 로 번역한다.
 *
 * 시각적 정체성 (기획 섹션 5, v2 재설계 기준):
 *   1. 양끝 비대칭 캡 — enqueue 는 IN 캡 섬광, dequeue 는 OUT 캡 섬광.
 *      conveyor-queue 내부에서 방향별 애니메이션과 섬광을 처리.
 *   2. 입장 스탬프 #n    — enqueue payload.stamp 를 블록에 불변 고정.
 *   3. 나이 그라디언트    — view 내부 자동 (aging-gradient feature).
 *   4. 동기 시프트        — dequeue() 메서드가 단일 transition 으로 묶어 발행.
 *   5. 꼬리 로그          — view 내부 자동 (tail-log feature).
 *   6. overflow / underflow — signalOverflow / signalUnderflow 로 에러 섬광.
 *   7. peek               — pulseFront 로 2 회 pulse.
 *
 * v2 에서 "연산 로그 패널" 은 꼬리 로그 + phase 하이라이트 + 메트릭 카운터의
 * 3 중 표현으로 대체되어 폐기됨 (extension-plan §7).
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';

type ConveyorQueue = {
  enqueue(
    item: { stamp: number; label: string; tint?: string },
    opts?: { duration?: number },
  ): Promise<void>;
  dequeue(opts?: { duration?: number }): Promise<void>;
  pulseFront(opts?: { duration?: number }): Promise<void>;
  signalOverflow(opts?: { duration?: number }): Promise<void>;
  signalUnderflow(opts?: { duration?: number }): Promise<void>;
  setTotalEnqueued(n: number): void;
  setSize(n: number, capacity?: number | null): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

type EnqueuePayload = {
  stamp?: number;
  label?: string;
  value?: string;
  totalEnqueued?: number;
  initial?: boolean;
};

function isQueueTarget(target: unknown, id: 'front' | 'rear'): boolean {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return false;
  const parsed = parseTarget(t);
  return parsed?.prefix === 'queue' && parsed.id === id;
}

export const queueProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ConveyorQueue | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit(_initialData) {
      // 데이터 자체는 algorithm 이 enqueue 이벤트로 다시 전달하므로
      // 여기서는 시각 상태만 초기화한다.
      stage?.reset();
    },

    async onEvent(event) {
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'enqueue': {
          if (!stage) break;
          if (!isQueueTarget(event.target, 'rear')) break;
          const p = (event.payload ?? {}) as EnqueuePayload;
          const stamp = typeof p.stamp === 'number' ? p.stamp : 0;
          const label = typeof p.label === 'string' ? p.label : String(p.value ?? '');
          const duration = (p.initial ? 120 : 220) / speed;
          await stage.enqueue({ stamp, label }, { duration });
          if (typeof p.totalEnqueued === 'number') stage.setTotalEnqueued(p.totalEnqueued);
          break;
        }

        case 'dequeue': {
          if (!stage) break;
          if (!isQueueTarget(event.target, 'front')) break;
          const duration = 260 / speed;
          await stage.dequeue({ duration });
          break;
        }

        case 'peek': {
          if (!stage) break;
          if (!isQueueTarget(event.target, 'front')) break;
          const duration = 260 / speed;
          await stage.pulseFront({ duration });
          break;
        }

        case 'overflow': {
          if (!stage) break;
          if (!isQueueTarget(event.target, 'rear')) break;
          const duration = 360 / speed;
          await stage.signalOverflow({ duration });
          break;
        }

        case 'underflow': {
          if (!stage) break;
          if (!isQueueTarget(event.target, 'front')) break;
          const duration = 360 / speed;
          await stage.signalUnderflow({ duration });
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          codePanel?.clearHighlight();
          break;
        }

        // 표준 어휘 이외는 silently drop (C2).
        default:
          break;
      }
    },

    onReset() {
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
