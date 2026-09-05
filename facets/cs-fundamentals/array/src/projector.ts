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

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

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

function indexFromTarget(target: unknown): number | null {
  const t = Array.isArray(target) ? target[0] : target;
  if (typeof t !== 'string') return null;
  const parsed = parseTarget(t);
  if (!parsed || parsed.prefix !== 'index') return null;
  const n = Number(parsed.id);
  return Number.isFinite(n) ? n : null;
}

export const arrayProjector: ProjectorFactory = (views, runtime) => {
  const tr: Translate = runtime?.t ?? makeTranslator();
  /** 상시 캡션. 두 곳에서 쓰이므로 en 원본 리터럴은 여기 한 번만 둔다. */
  const baseCaption = (): string =>
    tr(
      'array.caption.base',
      'An array packs equal-width cells side by side with no gaps and calls each one by a number counted from 0 — know the number and you arrive in one step, but touch the middle and the neighbours shift along.',
    );
  const stage = views.stage as unknown as ArrayStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(baseCaption());
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
            tr('array.caption.read', 'Jumped straight to cell {index} — one "start + {index}" reaches {value}', {
              index: idx,
              value: p.value ?? '',
            }),
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
          stage.setCaption(
            tr('array.caption.write', 'Replaced the value in cell {index} — the neighbours are untouched', { index: idx }),
          );
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
          stage.setCaption(
            tr('array.caption.insert', 'Slid one in at {index} — the {shifted} cells behind it each moved one place along', {
              index: idx,
              shifted: p.shifted ?? 0,
            }),
          );
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
          stage.setCaption(
            tr('array.caption.remove', 'Emptied {index} — the {shifted} cells behind it each pulled one place back', {
              index: idx,
              shifted: p.shifted ?? 0,
            }),
          );
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
          stage.setCaption(
            tr('array.caption.append', 'Laid it on the end — nothing had to shift'),
          );
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
            tr('array.caption.resize', 'The cells are full — moving {copied} of them onto a new strip twice the size', {
              copied: p.copied ?? 0,
            }),
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
          stage.setCaption(
            tr('array.caption.outOfRange', 'That position is out of range ({op} {index}) — nothing happens on the strip', {
              op: p.op ?? '',
              index: p.index ?? '',
            }),
          );
          break;
        }

        case 'limit-reached': {
          const p = (event.payload ?? {}) as { op?: string; maxSize?: number };
          stage.signalOutOfRange();
          stage.setCaption(
            tr('array.caption.limitReached', 'Reached the teaching limit of {maxSize} — no further {op} is possible', {
              maxSize: p.maxSize ?? 0,
              op: p.op ?? 'append',
            }),
            { duration: 1800 },
          );
          break;
        }

        case 'demo-end': {
          stage.setCaption(
            tr(
              'array.caption.handover',
              'Your turn — type an index and a value, then press Read, Write, Insert, Remove, Append or Search.',
            ),
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
      stage.setBaseCaption(baseCaption());
    },
  };
};
