/**
 * Array Projector — algorithm 이벤트를 array-stage view 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 연속 셀 띠 + 인덱스 라벨 — view init 이 capacity 띠 + 채색/회색 분리 그림.
 *   2. size/capacity 색 분리 + resize 사건 — view resize() 가 3 단계 운동.
 *   3. 인덱스 → 셀 직접 점프 + 산술 라벨 — view read() 가 호 곡선 + 산술 라벨.
 *   4. 시프트 도미노 + 누적 막대 — view insert/remove 가 한 프레임 시차로 도미노 + bumpTally.
 *   5. 검색 vs 호명 운동 대비 — view searchStep() 한 칸씩 + read() 단일 호 곡선.
 *
 * 운동 시간(ms) 은 기획 §9 기준 + runtime.getSpeed() 로 보정.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';

type ArrayStage = {
  reset(): void;
  init(values: string[], capacity: number): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  read(index: number, opts?: { duration?: number }): Promise<void>;
  write(
    index: number,
    oldValue: string,
    newValue: string,
    opts?: { duration?: number },
  ): Promise<void>;
  insert(
    index: number,
    value: string,
    shifted: number,
    size: number,
    capacity: number,
    opts?: { duration?: number },
  ): Promise<void>;
  remove(
    index: number,
    value: string,
    shifted: number,
    size: number,
    opts?: { duration?: number },
  ): Promise<void>;
  append(
    index: number,
    value: string,
    size: number,
    capacity: number,
    opts?: { duration?: number },
  ): Promise<void>;
  resize(
    oldCapacity: number,
    newCapacity: number,
    values: string[],
    opts?: { duration?: number },
  ): Promise<void>;
  searchStep(
    index: number,
    isMatch: boolean,
    isFinal: boolean,
    opts?: { duration?: number },
  ): Promise<void>;
  searchResult(found: boolean, index: number | undefined, value: string): void;
  signalOutOfRange(opts?: { duration?: number }): void;
};

const BASE_CAPTION =
  '배열은 같은 너비의 칸을 옆자리끼리 빈틈 없이 붙여 놓고 0 부터 매긴 번호로 호명한다 — 번호만 알면 한 번에, 가운데를 건드리면 옆 칸이 줄줄이 밀린다.';

function indexFromTarget(target: unknown): number | null {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return null;
  const parsed = parseTarget(t);
  if (!parsed || parsed.prefix !== 'index') return null;
  const n = Number(parsed.id);
  return Number.isFinite(n) ? n : null;
}

export const arrayProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ArrayStage | undefined;

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
          const p = (event.payload ?? {}) as { values?: string[]; capacity?: number };
          const values = Array.isArray(p.values) ? p.values.map(String) : [];
          const capacity = typeof p.capacity === 'number' ? p.capacity : values.length;
          stage.init(values, capacity);
          break;
        }

        case 'read': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { value?: string };
          const duration = 200 / speed;
          await stage.read(idx, { duration });
          stage.setCaption(
            `번호 ${idx} 칸으로 곧장 점프 — 시작 + ${idx} 한 번이면 ${p.value ?? ''} 에 도달`,
          );
          break;
        }

        case 'write': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { oldValue?: string; newValue?: string };
          const duration = 200 / speed;
          await stage.write(idx, String(p.oldValue ?? ''), String(p.newValue ?? ''), {
            duration,
          });
          stage.setCaption(`${idx} 번 칸의 값을 바꾸었다 — 옆 칸은 그대로다`);
          break;
        }

        case 'insert': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as {
            value?: string;
            shifted?: number;
            size?: number;
            capacity?: number;
          };
          const duration = 400 / speed;
          await stage.insert(
            idx,
            String(p.value ?? ''),
            typeof p.shifted === 'number' ? p.shifted : 0,
            typeof p.size === 'number' ? p.size : 0,
            typeof p.capacity === 'number' ? p.capacity : 0,
            { duration },
          );
          stage.setCaption(`${idx} 자리에 끼웠다 — 뒤의 ${p.shifted ?? 0} 칸이 한 자리씩 밀렸다`);
          break;
        }

        case 'remove': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as {
            value?: string;
            shifted?: number;
            size?: number;
          };
          const duration = 400 / speed;
          await stage.remove(
            idx,
            String(p.value ?? ''),
            typeof p.shifted === 'number' ? p.shifted : 0,
            typeof p.size === 'number' ? p.size : 0,
            { duration },
          );
          stage.setCaption(`${idx} 자리를 비웠다 — 뒤의 ${p.shifted ?? 0} 칸이 한 자리씩 당겨졌다`);
          break;
        }

        case 'append': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { value?: string; size?: number; capacity?: number };
          const duration = 200 / speed;
          await stage.append(
            idx,
            String(p.value ?? ''),
            typeof p.size === 'number' ? p.size : 0,
            typeof p.capacity === 'number' ? p.capacity : 0,
            { duration },
          );
          stage.setCaption('끝 자리에 얹었다 — 옆 칸이 밀리지 않았다');
          break;
        }

        case 'resize': {
          const p = (event.payload ?? {}) as {
            oldCapacity?: number;
            newCapacity?: number;
            copied?: number;
            values?: string[];
          };
          const duration = 800 / speed;
          stage.setCaption(
            `칸이 다 찼다 — 두 배 큰 새 띠로 ${p.copied ?? 0} 칸을 옮긴다`,
            { duration: 1400 },
          );
          await stage.resize(
            typeof p.oldCapacity === 'number' ? p.oldCapacity : 0,
            typeof p.newCapacity === 'number' ? p.newCapacity : 0,
            Array.isArray(p.values) ? p.values.map(String) : [],
            { duration },
          );
          break;
        }

        case 'search-step': {
          const idx = indexFromTarget(event.target);
          if (idx === null) break;
          const p = (event.payload ?? {}) as { isMatch?: boolean; isFinal?: boolean };
          const duration = 120 / speed;
          await stage.searchStep(idx, p.isMatch === true, p.isFinal === true, { duration });
          break;
        }

        case 'search-result': {
          const p = (event.payload ?? {}) as { found?: boolean; index?: number; value?: string };
          stage.searchResult(p.found === true, p.index, String(p.value ?? ''));
          break;
        }

        case 'out-of-range': {
          const p = (event.payload ?? {}) as { index?: string; op?: string };
          stage.signalOutOfRange();
          stage.setCaption(`범위를 벗어난 자리 (${p.op ?? ''} ${p.index ?? ''}) — 띠 위에서 일어나는 일은 없다`);
          break;
        }

        case 'limit-reached': {
          const p = (event.payload ?? {}) as { op?: string; maxSize?: number };
          stage.signalOutOfRange();
          stage.setCaption(
            `학습 한도 ${p.maxSize ?? 0} 개 도달 — 더 이상 ${p.op ?? '추가'} 할 수 없다`,
            { duration: 1800 },
          );
          break;
        }

        case 'demo-end': {
          stage.setCaption(
            '이제 직접 — 인덱스와 값을 입력하고 호명·쓰기·삽입·삭제·뒤에 추가·검색을 눌러보세요',
            { duration: 2400 },
          );
          break;
        }

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
