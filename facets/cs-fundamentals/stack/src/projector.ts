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

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

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

/**
 * Projector 가 문안을 정하는 캡션. 키와 en 원본을 함께 둔다 — 원본이 소스에
 * 남아 있어야 추출기가 번역 대상을 모을 수 있고, 번들이 없어도 en 으로 동작한다.
 * View 고정 라벨은 View 가 params.locale 로 직접 해석한다 (S-view).
 */
const K = {
  base: 'stack.caption.base',
  feedInput: 'stack.caption.feedInput',
  push: 'stack.caption.push',
  pop: 'stack.caption.pop',
  peek: 'stack.caption.peek',
  overflow: 'stack.caption.overflow',
  underflow: 'stack.caption.underflow',
  handover: 'stack.caption.handover',
} as const;

function isStackTop(target: unknown): boolean {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return false;
  const parsed = parseTarget(t);
  return parsed?.prefix === 'stack' && parsed.id === 'top';
}

export const stackProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StackStage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(
        tr(K.base, 'A stack hands back the most recently added element first — every change happens at one single place, the top.'),
      );
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'feed-input': {
          if (!isStackTop(event.target)) break;
          const items = (event.payload as { items?: Array<{ stamp: number; label: string }> } | undefined)?.items ?? [];
          stage.feedInput(items);
          stage.setCaption(
            tr(K.feedInput, 'Boxes are waiting on the input track — they will be stacked on top one by one.'),
          );
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
          stage.setCaption(tr(K.push, 'Placed a new box on top — {value}', { value: label }));
          break;
        }

        case 'pop': {
          if (!isStackTop(event.target)) break;
          const p = (event.payload ?? {}) as { label?: string; value?: string };
          const label = typeof p.label === 'string' ? p.label : String(p.value ?? '');
          const duration = 400 / speed;
          await stage.pop({ duration });
          stage.setCaption(tr(K.pop, 'Took the top box off — {value}', { value: label }));
          break;
        }

        case 'peek': {
          if (!isStackTop(event.target)) break;
          const duration = 250 / speed;
          await stage.pulseTop({ duration });
          stage.setCaption(tr(K.peek, 'Looked at the top value — the pile is unchanged.'));
          break;
        }

        case 'overflow': {
          if (!isStackTop(event.target)) break;
          const p = (event.payload ?? {}) as { attempted?: string };
          const label = typeof p.attempted === 'string' ? p.attempted : '';
          const duration = 300 / speed;
          await stage.signalOverflow(label, { duration });
          stage.setCaption(tr(K.overflow, 'No room left to stack.'));
          break;
        }

        case 'underflow': {
          if (!isStackTop(event.target)) break;
          const duration = 300 / speed;
          await stage.signalUnderflow({ duration });
          stage.setCaption(tr(K.underflow, 'No box left to take off.'));
          break;
        }

        case 'demo-end': {
          stage.setCaption(tr(K.handover, 'Your turn — type a value and press Push, Pop or Peek.'), {
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
      stage.setBaseCaption(
        tr(K.base, 'A stack hands back the most recently added element first — every change happens at one single place, the top.'),
      );
    },
  };
};
