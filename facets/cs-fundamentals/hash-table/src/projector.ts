/**
 * HashTable Projector — algorithm 이벤트를 hash-table-stage view 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 함수 박스와 결정적 매핑 — view emitInsert / searchJump / rehashStep 이
 *      함수 박스를 통과하는 키 토큰의 단일 동선으로 묶는다.
 *   2. 슬롯 배열과 사슬 — view 가 셀 점유 + 사슬 노드 등장으로 같은 자리의 공존을 표현.
 *   3. 충돌의 사건성 — view emitInsert (isCollision) 이 셀 테두리 깜빡 + 캡션.
 *   4. 검색의 두 단계 — view searchJump (1단계 점프) + searchChainStep (사슬 안 비교).
 *   5. 적재율 게이지 — view emitInsert / removeResult / rehashEnd 가 게이지 폭과 색을 갱신.
 *   6. 리해싱의 일제 이주 — view rehashBegin → rehashStep* → rehashEnd.
 *   7. 사슬 길이의 분포 — view 가 distribution 라벨을 매 갱신마다 다시 쓴다.
 *   8. 체이닝 vs 선형 탐사 — view 가 보조 영역에서 자체 시뮬레이션 (algorithm 무관).
 *
 * 운동 시간 (ms) 은 기획 §9 기준 + runtime.getSpeed() 로 보정.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';

type Distribution = { empty: number; len1: number; len2: number; len3plus: number };
type AlphaLevel = 'safe' | 'caution' | 'warn';

type HashTableStage = {
  reset(): void;
  init(payload: { M: number; hashLabel: string }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  emitInsert(
    payload: {
      index: number;
      key: string;
      slot: number;
      isCollision: boolean;
      chainLength: number;
      size: number;
      M: number;
      alpha: number;
      distribution: Distribution;
    },
    opts?: { duration?: number },
  ): Promise<void>;
  duplicateKey(payload: { index: number; key: string; slot: number }): Promise<void>;
  searchPrepare(key: string): void;
  searchJump(
    payload: { index: number; key: string },
    opts?: { duration?: number },
  ): Promise<void>;
  searchChainStep(
    payload: { index: number; slot: number; key: string; isMatch: boolean; isFinal: boolean },
    opts?: { duration?: number },
  ): Promise<void>;
  searchResult(payload: {
    found: boolean;
    index?: number;
    slot?: number;
    key: string;
    walked: number;
  }): void;
  removePrepare(key: string): void;
  removeJump(
    payload: { index: number; key: string },
    opts?: { duration?: number },
  ): Promise<void>;
  removeChainStep(
    payload: { index: number; slot: number; key: string; isMatch: boolean; isFinal: boolean },
    opts?: { duration?: number },
  ): Promise<void>;
  removeResult(payload: {
    found: boolean;
    index?: number;
    slot?: number;
    key: string;
    size: number;
    M: number;
    alpha: number;
    distribution: Distribution;
  }): Promise<void>;
  updateAlpha(payload: { alpha: number; level: AlphaLevel }): void;
  rehashBegin(
    payload: { oldM: number; newM: number; hashLabel: string },
    opts?: { duration?: number },
  ): Promise<void>;
  rehashStep(
    payload: { key: string; oldIndex: number; newIndex: number; slot: number },
    opts?: { duration?: number },
  ): Promise<void>;
  rehashEnd(payload: {
    M: number;
    alpha: number;
    distribution: Distribution;
    hashLabel: string;
  }): void;
  signalEmpty(op: string, opts?: { duration?: number }): void;
  signalInvalid(op: string, raw: string, opts?: { duration?: number }): void;
};

const BASE_CAPTION =
  '해시 테이블은 같은 모양의 칸을 여러 개 늘어놓고 함수 박스가 키마다 한 자리를 정해 던진다 — 같은 자리에 둘이 떨어지면 그 자리에 사슬을 늘인다.';

function indexFromTarget(target: unknown): number | null {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return null;
  const parsed = parseTarget(t);
  if (!parsed || parsed.prefix !== 'index') return null;
  const n = Number(parsed.id);
  return Number.isFinite(n) ? n : null;
}

export const hashTableProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HashTableStage | undefined;

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
          const p = (event.payload ?? {}) as { M?: number; hashLabel?: string };
          stage.init({
            M: typeof p.M === 'number' ? p.M : 0,
            hashLabel: typeof p.hashLabel === 'string' ? p.hashLabel : '',
          });
          break;
        }

        case 'insert': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as {
            index?: number;
            key?: string;
            slot?: number;
            isCollision?: boolean;
            chainLength?: number;
            size?: number;
            M?: number;
            alpha?: number;
            distribution?: Distribution;
          };
          const dur = 700 / speed;
          await stage.emitInsert(
            {
              index: typeof p.index === 'number' ? p.index : (idx ?? 0),
              key: String(p.key ?? ''),
              slot: typeof p.slot === 'number' ? p.slot : 0,
              isCollision: p.isCollision === true,
              chainLength: typeof p.chainLength === 'number' ? p.chainLength : 1,
              size: typeof p.size === 'number' ? p.size : 0,
              M: typeof p.M === 'number' ? p.M : 0,
              alpha: typeof p.alpha === 'number' ? p.alpha : 0,
              distribution:
                p.distribution ?? { empty: 0, len1: 0, len2: 0, len3plus: 0 },
            },
            { duration: dur },
          );
          break;
        }

        case 'duplicate-key': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as { index?: number; key?: string; slot?: number };
          await stage.duplicateKey({
            index: typeof p.index === 'number' ? p.index : (idx ?? 0),
            key: String(p.key ?? ''),
            slot: typeof p.slot === 'number' ? p.slot : 0,
          });
          break;
        }

        case 'search-prepare': {
          const p = (event.payload ?? {}) as { key?: string };
          stage.searchPrepare(String(p.key ?? ''));
          break;
        }

        case 'search-jump': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as { index?: number; key?: string };
          const dur = 360 / speed;
          await stage.searchJump(
            {
              index: typeof p.index === 'number' ? p.index : (idx ?? 0),
              key: String(p.key ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'search-chain-step': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as {
            index?: number;
            slot?: number;
            key?: string;
            isMatch?: boolean;
            isFinal?: boolean;
          };
          const dur = 280 / speed;
          await stage.searchChainStep(
            {
              index: typeof p.index === 'number' ? p.index : (idx ?? 0),
              slot: typeof p.slot === 'number' ? p.slot : 0,
              key: String(p.key ?? ''),
              isMatch: p.isMatch === true,
              isFinal: p.isFinal === true,
            },
            { duration: dur },
          );
          break;
        }

        case 'search-result': {
          const p = (event.payload ?? {}) as {
            found?: boolean;
            index?: number;
            slot?: number;
            key?: string;
            walked?: number;
          };
          stage.searchResult({
            found: p.found === true,
            index: p.index,
            slot: p.slot,
            key: String(p.key ?? ''),
            walked: typeof p.walked === 'number' ? p.walked : 0,
          });
          break;
        }

        case 'remove-prepare': {
          const p = (event.payload ?? {}) as { key?: string };
          stage.removePrepare(String(p.key ?? ''));
          break;
        }

        case 'remove-jump': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as { index?: number; key?: string };
          const dur = 360 / speed;
          await stage.removeJump(
            {
              index: typeof p.index === 'number' ? p.index : (idx ?? 0),
              key: String(p.key ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'remove-chain-step': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as {
            index?: number;
            slot?: number;
            key?: string;
            isMatch?: boolean;
            isFinal?: boolean;
          };
          const dur = 280 / speed;
          await stage.removeChainStep(
            {
              index: typeof p.index === 'number' ? p.index : (idx ?? 0),
              slot: typeof p.slot === 'number' ? p.slot : 0,
              key: String(p.key ?? ''),
              isMatch: p.isMatch === true,
              isFinal: p.isFinal === true,
            },
            { duration: dur },
          );
          break;
        }

        case 'remove-result': {
          const p = (event.payload ?? {}) as {
            found?: boolean;
            index?: number;
            slot?: number;
            key?: string;
            size?: number;
            M?: number;
            alpha?: number;
            distribution?: Distribution;
          };
          await stage.removeResult({
            found: p.found === true,
            index: p.index,
            slot: p.slot,
            key: String(p.key ?? ''),
            size: typeof p.size === 'number' ? p.size : 0,
            M: typeof p.M === 'number' ? p.M : 0,
            alpha: typeof p.alpha === 'number' ? p.alpha : 0,
            distribution:
              p.distribution ?? { empty: 0, len1: 0, len2: 0, len3plus: 0 },
          });
          break;
        }

        case 'alpha-warn': {
          const p = (event.payload ?? {}) as { alpha?: number; level?: AlphaLevel };
          stage.updateAlpha({
            alpha: typeof p.alpha === 'number' ? p.alpha : 0,
            level: p.level ?? 'safe',
          });
          break;
        }

        case 'rehash-begin': {
          const p = (event.payload ?? {}) as {
            oldM?: number;
            newM?: number;
            hashLabel?: string;
          };
          const dur = 700 / speed;
          await stage.rehashBegin(
            {
              oldM: typeof p.oldM === 'number' ? p.oldM : 0,
              newM: typeof p.newM === 'number' ? p.newM : 0,
              hashLabel: String(p.hashLabel ?? ''),
            },
            { duration: dur },
          );
          break;
        }

        case 'rehash-step': {
          const idx = indexFromTarget(event.target);
          const p = (event.payload ?? {}) as {
            key?: string;
            oldIndex?: number;
            newIndex?: number;
            slot?: number;
          };
          const dur = 360 / speed;
          await stage.rehashStep(
            {
              key: String(p.key ?? ''),
              oldIndex: typeof p.oldIndex === 'number' ? p.oldIndex : 0,
              newIndex:
                typeof p.newIndex === 'number' ? p.newIndex : (idx ?? 0),
              slot: typeof p.slot === 'number' ? p.slot : 0,
            },
            { duration: dur },
          );
          break;
        }

        case 'rehash-end': {
          const p = (event.payload ?? {}) as {
            M?: number;
            alpha?: number;
            distribution?: Distribution;
            hashLabel?: string;
          };
          stage.rehashEnd({
            M: typeof p.M === 'number' ? p.M : 0,
            alpha: typeof p.alpha === 'number' ? p.alpha : 0,
            distribution:
              p.distribution ?? { empty: 0, len1: 0, len2: 0, len3plus: 0 },
            hashLabel: String(p.hashLabel ?? ''),
          });
          break;
        }

        case 'empty-table': {
          const p = (event.payload ?? {}) as { op?: string };
          stage.signalEmpty(String(p.op ?? ''));
          stage.setCaption('표가 비어 있다 — 검색·삭제할 키가 없다.', { duration: 1600 });
          break;
        }

        case 'invalid-key': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        case 'demo-end': {
          stage.setCaption(
            '이제 직접 — 키를 입력하고 삽입·검색·삭제를 눌러보세요.',
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
