/**
 * LinkedList Projector — algorithm 이벤트를 linked-list-stage view 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 두 칸 노드 카드 — view init 이 카드 그룹을 그린다.
 *   2. head 의 단일 입구 표지 — view init / repositionHead 가 항상 활성.
 *   3. NULL 종료 표식 — view init / repositionNull 이 마지막 카드 옆에 그림.
 *   4. 재배선의 시간 순서 — view insertAt 이 1단계 호 + 휴지기 + 2단계 활주 운동을 한 사건으로 묶음.
 *   5. 변화 화살표의 강조 색 — view 가 강조 호를 itemActive 색으로 그리고 600ms 잔상 후 회수.
 *   6. 순차 접근의 거리 체감 — view searchStep 이 발자국 동심원 + "n 칸 걸었다" 캡션 누적.
 *
 * 운동 시간 (ms) 은 기획 §9 기준 + runtime.getSpeed() 로 보정.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';

type LinkedListStage = {
  reset(): void;
  init(values: string[]): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  setStage(n: 0 | 1 | 2): void;
  insertAt(idx: number, value: string, opts?: { duration?: number }): Promise<void>;
  insertHead(value: string, opts?: { duration?: number }): Promise<void>;
  removeAt(idx: number, opts?: { duration?: number }): Promise<void>;
  removeHead(opts?: { duration?: number }): Promise<void>;
  searchPrepare(): void;
  searchStep(
    idx: number,
    isMatch: boolean,
    isFinal: boolean,
    opts?: { duration?: number },
  ): Promise<void>;
  searchResult(found: boolean, idx: number | undefined, value: string, walked: number): void;
  signalOutOfRange(opts?: { duration?: number }): void;
  signalEmpty(opts?: { duration?: number }): void;
};

const BASE_CAPTION =
  '연결 리스트는 노드 각각이 자기 다음 한 명만 가리키는 단 하나의 손가락을 갖는다 — 끼우거나 빼는 일은 카드를 옮기는 게 아니라 두세 개의 손가락을 끊고 다시 잇는 일이다.';

function indexFromTarget(target: unknown): number | null {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return null;
  const parsed = parseTarget(t);
  if (!parsed || parsed.prefix !== 'index') return null;
  const n = Number(parsed.id);
  return Number.isFinite(n) ? n : null;
}

export const linkedListProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LinkedListStage | undefined;

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
        case 'init': {
          const p = (event.payload ?? {}) as { values?: string[] };
          const values = Array.isArray(p.values) ? p.values.map(String) : [];
          stage.init(values);
          break;
        }

        case 'insert': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { value?: string; isHead?: boolean };
          const totalDur = 900 / speed;
          if (p.isHead === true) {
            await stage.insertHead(String(p.value ?? ''), { duration: totalDur });
          } else {
            await stage.insertAt(idx, String(p.value ?? ''), { duration: totalDur });
          }
          break;
        }

        case 'remove': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { isHead?: boolean };
          const dur = 500 / speed;
          if (p.isHead === true) {
            await stage.removeHead({ duration: dur });
          } else {
            await stage.removeAt(idx, { duration: dur });
          }
          break;
        }

        case 'search-prepare': {
          stage.searchPrepare();
          stage.setCaption('머리에서 출발 — 손가락을 한 칸씩 따라간다.', { duration: 1400 });
          break;
        }

        case 'search-step': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { isMatch?: boolean; isFinal?: boolean };
          const dur = 280 / speed;
          await stage.searchStep(idx, p.isMatch === true, p.isFinal === true, { duration: dur });
          break;
        }

        case 'search-result': {
          const p = (event.payload ?? {}) as {
            found?: boolean;
            index?: number;
            value?: string;
            walked?: number;
          };
          stage.searchResult(
            p.found === true,
            p.index,
            String(p.value ?? ''),
            typeof p.walked === 'number' ? p.walked : 0,
          );
          break;
        }

        case 'out-of-range': {
          const p = (event.payload ?? {}) as { index?: string; op?: string };
          stage.signalOutOfRange();
          if (p.op === 'insert-limit') {
            stage.setCaption('학습 한도 도달 — 더 이상 새 카드를 끼울 수 없다.', { duration: 1800 });
          } else {
            stage.setCaption(
              `그 자리에 닿을 수 없다 (${p.op ?? ''} ${p.index ?? ''}).`,
              { duration: 1600 },
            );
          }
          break;
        }

        case 'empty-list': {
          stage.signalEmpty();
          stage.setCaption('리스트가 비어 있다.', { duration: 1600 });
          break;
        }

        case 'demo-end': {
          stage.setCaption(
            '이제 직접 — 인덱스와 값을 입력하고 삽입·삭제·검색을 눌러보세요.',
            { duration: 2400 },
          );
          break;
        }

        default:
          // phase 등 silent 메타 이벤트는 시각 변화 없음 — 의도적 drop.
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
