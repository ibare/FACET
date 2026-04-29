/**
 * LruCache Projector — algorithm 이벤트를 lru-cache-stage view 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 두 좌표계 공유 — view 가 hash 슬롯과 list 노드를 같은 색·동선으로 묶는다.
 *   2. MRU↔LRU 가로축 — view 가 항시 라벨링.
 *   3. promotion 호 — emitGetHit / emitPutUpdate 가 unlink → arc → 재삽입을
 *      하나의 호로 처리한다.
 *   4. capacity 임계 게이지 — emitPutInsert / emitPutEvict 가 게이지 폭과 색을 갱신.
 *   5. 호출 트레이스 스트립 — 모든 emit* 호출이 한 줄씩 누적.
 *
 * 운동 시간 (ms) 은 기획 §3 / §9 기준 + runtime.getSpeed() 로 보정.
 */

import type { ProjectorFactory } from '@facet/core/runtime';

type LruCacheStage = {
  reset(): void;
  init(payload: { capacity: number }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  emitGetHit(
    payload: {
      key: string;
      value: string;
      fromListIndex: number;
      listOrder: string[];
      traceIndex: number;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  emitGetMiss(payload: { key: string; traceIndex: number }): Promise<void>;
  emitPutUpdate(
    payload: {
      key: string;
      oldValue: string;
      newValue: string;
      fromListIndex: number;
      listOrder: string[];
      traceIndex: number;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  emitPutInsert(
    payload: {
      key: string;
      value: string;
      listOrder: string[];
      hashSlot: number;
      size: number;
      capacity: number;
      traceIndex: number;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  emitPutEvict(payload: {
    newKey: string;
    newValue: string;
    evictedKey: string;
    evictedValue: string;
    evictedHashSlot: number;
    newHashSlot: number;
    listOrder: string[];
    size: number;
    capacity: number;
    traceIndex: number;
  }): Promise<void>;
  signalInvalid(op: string, raw: string): void;
  signalDemoEnd(): void;
};

const BASE_CAPTION =
  'LRU 캐시는 hash map (키 → 노드) 과 doubly linked list (사용 순서) 를 같은 노드로 공유한다 — 모든 호출이 노드를 MRU 끝으로 끌어올리고, 용량 초과면 LRU 끝이 두 영역에서 동시에 사라진다.';

export const lruCacheProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LruCacheStage | undefined;

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
          const p = (event.payload ?? {}) as { capacity?: number };
          stage.init({
            capacity: typeof p.capacity === 'number' ? p.capacity : 0,
          });
          break;
        }

        case 'get-hit': {
          const p = (event.payload ?? {}) as {
            key?: string;
            value?: string;
            fromListIndex?: number;
            listOrder?: string[];
            traceIndex?: number;
          };
          const dur = 520 / speed;
          await stage.emitGetHit(
            {
              key: String(p.key ?? ''),
              value: String(p.value ?? ''),
              fromListIndex: typeof p.fromListIndex === 'number' ? p.fromListIndex : 0,
              listOrder: Array.isArray(p.listOrder) ? p.listOrder.map(String) : [],
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            },
            { duration: dur },
          );
          break;
        }

        case 'get-miss': {
          const p = (event.payload ?? {}) as { key?: string; traceIndex?: number };
          await stage.emitGetMiss({
            key: String(p.key ?? ''),
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
          });
          break;
        }

        case 'put-update': {
          const p = (event.payload ?? {}) as {
            key?: string;
            oldValue?: string;
            newValue?: string;
            fromListIndex?: number;
            listOrder?: string[];
            traceIndex?: number;
          };
          const dur = 520 / speed;
          await stage.emitPutUpdate(
            {
              key: String(p.key ?? ''),
              oldValue: String(p.oldValue ?? ''),
              newValue: String(p.newValue ?? ''),
              fromListIndex: typeof p.fromListIndex === 'number' ? p.fromListIndex : 0,
              listOrder: Array.isArray(p.listOrder) ? p.listOrder.map(String) : [],
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            },
            { duration: dur },
          );
          break;
        }

        case 'put-insert': {
          const p = (event.payload ?? {}) as {
            key?: string;
            value?: string;
            listOrder?: string[];
            hashSlot?: number;
            size?: number;
            capacity?: number;
            traceIndex?: number;
          };
          const dur = 380 / speed;
          await stage.emitPutInsert(
            {
              key: String(p.key ?? ''),
              value: String(p.value ?? ''),
              listOrder: Array.isArray(p.listOrder) ? p.listOrder.map(String) : [],
              hashSlot: typeof p.hashSlot === 'number' ? p.hashSlot : 0,
              size: typeof p.size === 'number' ? p.size : 0,
              capacity: typeof p.capacity === 'number' ? p.capacity : 0,
              traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
            },
            { duration: dur },
          );
          break;
        }

        case 'put-evict': {
          const p = (event.payload ?? {}) as {
            newKey?: string;
            newValue?: string;
            evictedKey?: string;
            evictedValue?: string;
            evictedHashSlot?: number;
            newHashSlot?: number;
            listOrder?: string[];
            size?: number;
            capacity?: number;
            traceIndex?: number;
          };
          await stage.emitPutEvict({
            newKey: String(p.newKey ?? ''),
            newValue: String(p.newValue ?? ''),
            evictedKey: String(p.evictedKey ?? ''),
            evictedValue: String(p.evictedValue ?? ''),
            evictedHashSlot: typeof p.evictedHashSlot === 'number' ? p.evictedHashSlot : 0,
            newHashSlot: typeof p.newHashSlot === 'number' ? p.newHashSlot : 0,
            listOrder: Array.isArray(p.listOrder) ? p.listOrder.map(String) : [],
            size: typeof p.size === 'number' ? p.size : 0,
            capacity: typeof p.capacity === 'number' ? p.capacity : 0,
            traceIndex: typeof p.traceIndex === 'number' ? p.traceIndex : 0,
          });
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        case 'demo-end': {
          stage.signalDemoEnd();
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
