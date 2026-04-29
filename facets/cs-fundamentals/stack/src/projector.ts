/**
 * Stack Projector — algorithm 이벤트를 stack-stage view 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 꼭대기 표지        — view 의 updateTopMarker 가 자동 추적.
 *   2. 깊이별 명도         — view layoutStack 이 박스 깊이로 veil opacity 갱신.
 *   3. 두 트랙 직교 운동   — pushFromInput / pop 이 곡선 운동 발행.
 *   4. 색·번호 정체성       — stamp 가 view 의 6색 순환 계산에 사용.
 *   5. peek vs pop          — pulseTop (형상 불변) vs pop (꼭대기 한 칸 사라짐).
 *   6. 빈/가득 거부 반응     — signalUnderflow / signalOverflow.
 *
 * 자동 시연: feed-input 이 입력 트랙에 박스 일괄 배치 → push(fromInput:true) 순차.
 * 사용자 인터랙션: push(fromInput:false) → pushFresh, pop → pop, peek → pulseTop.
 *
 * 운동 시간(ms) 은 기획 §9 기준 + runtime.getSpeed() 로 보정.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';

type StackStage = {
  reset(): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  feedInput(items: Array<{ stamp: number; label: string }>): void;
  pushFromInput(opts?: { duration?: number }): Promise<void>;
  pushFresh(item: { stamp: number; label: string }, opts?: { duration?: number }): Promise<void>;
  pop(opts?: { duration?: number }): Promise<void>;
  pulseTop(opts?: { duration?: number }): Promise<void>;
  signalUnderflow(opts?: { duration?: number }): Promise<void>;
  signalOverflow(label: string, opts?: { duration?: number }): Promise<void>;
};

const BASE_CAPTION =
  '스택은 가장 최근에 들어온 원소를 가장 먼저 꺼내는 자료구조다 — 모든 변화는 꼭대기 한 자리에서만 일어난다.';

function isStackTop(target: unknown): boolean {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return false;
  const parsed = parseTarget(t);
  return parsed?.prefix === 'stack' && parsed.id === 'top';
}

export const stackProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StackStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'feed-input': {
          if (!isStackTop(event.target)) break;
          const items = (event.payload as { items?: Array<{ stamp: number; label: string }> } | undefined)?.items ?? [];
          stage.feedInput(items);
          stage.setCaption('입력 트랙에 박스가 대기 중 — 차례로 꼭대기에 쌓인다');
          break;
        }

        case 'push': {
          if (!isStackTop(event.target)) break;
          const p = (event.payload ?? {}) as {
            stamp?: number;
            label?: string;
            value?: string;
            fromInput?: boolean;
          };
          const stamp = typeof p.stamp === 'number' ? p.stamp : 0;
          const label = typeof p.label === 'string' ? p.label : String(p.value ?? '');
          const duration = 400 / speed;
          if (p.fromInput) {
            await stage.pushFromInput({ duration });
          } else {
            await stage.pushFresh({ stamp, label }, { duration });
          }
          stage.setCaption(`꼭대기 위에 새 박스를 얹었다 — ${label}`);
          break;
        }

        case 'pop': {
          if (!isStackTop(event.target)) break;
          const p = (event.payload ?? {}) as { label?: string; value?: string };
          const label = typeof p.label === 'string' ? p.label : String(p.value ?? '');
          const duration = 400 / speed;
          await stage.pop({ duration });
          stage.setCaption(`꼭대기의 박스를 떼어냈다 — ${label}`);
          break;
        }

        case 'peek': {
          if (!isStackTop(event.target)) break;
          const duration = 250 / speed;
          await stage.pulseTop({ duration });
          stage.setCaption('꼭대기 값을 보았다 — 더미는 그대로다');
          break;
        }

        case 'overflow': {
          if (!isStackTop(event.target)) break;
          const p = (event.payload ?? {}) as { attempted?: string };
          const label = typeof p.attempted === 'string' ? p.attempted : '';
          const duration = 300 / speed;
          await stage.signalOverflow(label, { duration });
          stage.setCaption('더 쌓을 자리가 없다');
          break;
        }

        case 'underflow': {
          if (!isStackTop(event.target)) break;
          const duration = 300 / speed;
          await stage.signalUnderflow({ duration });
          stage.setCaption('떼어낼 박스가 없다');
          break;
        }

        case 'demo-end': {
          stage.setCaption('이제 직접 — 값을 입력하고 쌓기·떼기·보기를 눌러보세요', {
            duration: 2400,
          });
          break;
        }

        // phase / done / 미지원 이벤트는 silently drop.
        default:
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};
