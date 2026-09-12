/**
 * cache-replacement 의 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 한 줄도 여기서 짓지 않는다. 키와 en 원본만 두고 `runtime.t` 로 조회하며,
 * 실제 문장은 `facet.ts` 의 `messages` 에 있다 (C10). 알고리즘은 값만 보내고
 * 무엇이라 말할지는 이 층이 정한다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray, type Translate } from '@ffacet/core/runtime';

/** stage view 의 계약. 오픈 타입(ViewInstance)을 좁히는 자리라 한곳에 모은다 (C9). */
type Stage = {
  setPolicy?(clock: string, rule: string): void;
  setCaption?(value: string): void;
  probe?(step: number): void;
  markResult?(step: number, hit: boolean): void;
  hit?(slot: number, ms: number): Promise<void> | void;
  markVictim?(slot: number): void;
  evict?(slot: number, line: number, ms: number): Promise<void> | void;
  install?(slot: number, line: number, step: number, ms: number): Promise<void> | void;
  setClocks?(used: number[], loaded: number[]): void;
  finish?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** 걸음 하나의 기본 길이. 재생 속도로 나뉜다. */
const EVICT_MS = 320;
const INSTALL_MS = 280;
const HIT_MS = 180;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

/** 사람이 읽는 정책 이름. en 원본이 호출부에 리터럴로 남아야 한다 (C10). */
function policyName(tr: Translate, id: string): string {
  if (id === 'mru') return tr('label.mru', 'MRU · most recently used');
  if (id === 'fifo') return tr('label.fifo', 'FIFO · first in, first out');
  return tr('label.lru', 'LRU · least recently used');
}

/** 그 정책이 무엇을 읽고 어느 끝을 버리는가 — 화면에 계속 걸려 있는 규칙. */
function policyRule(tr: Translate, id: string): string {
  if (id === 'mru') return tr('rule.mru', 'MRU reads "last used" and drops the largest.');
  if (id === 'fifo') return tr('rule.fifo', 'FIFO reads "loaded at" and drops the smallest.');
  return tr('rule.lru', 'LRU reads "last used" and drops the smallest.');
}

/** 그 정책이 읽는 시각의 이름. 칸에 적힌 라벨과 같은 말이어야 한다. */
function clockName(tr: Translate, clock: string): string {
  if (clock === 'loaded') return tr('label.loadedAt', 'loaded at');
  return tr('label.lastUsed', 'last used');
}

export const cacheReplacementProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  const speed = (): number => Math.max(0.25, runtime?.getSpeed() ?? 1);
  const ms = (base: number): number => Math.max(60, Math.round(base / speed()));

  /** 지금 정책 — 축출 캡션이 정책 이름을 불러야 해서 들고 있는다. */
  let policy = 'lru';

  return {
    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'policy-set': {
          const p = event.payload as { policy?: unknown; clock?: unknown } | undefined;
          policy = typeof p?.policy === 'string' ? p.policy : 'lru';
          const clock = typeof p?.clock === 'string' ? p.clock : 'used';
          stage?.setPolicy?.(clock, policyRule(tr, policy));
          stage?.setCaption?.(
            tr('caption.start', '{policy} — watch which slot gets pushed out.', {
              policy: policyName(tr, policy),
            }),
          );
          return;
        }

        case 'probe': {
          const p = event.payload as { step?: unknown; line?: unknown } | undefined;
          const step = num(p?.step);
          const line = num(p?.line);
          if (step === null || line === null) return;
          stage?.probe?.(step);
          stage?.setCaption?.(tr('caption.probe', 'Looking for line {line}.', { line }));
          return;
        }

        case 'hit': {
          const p = event.payload as { step?: unknown; line?: unknown } | undefined;
          const step = num(p?.step);
          const line = num(p?.line);
          const slot = toIndexArray(event.target)[0];
          if (step === null || line === null || slot === undefined) return;
          stage?.markResult?.(step, true);
          stage?.setCaption?.(
            tr('caption.hit', 'Line {line} is already in slot {slot} — hit.', { line, slot }),
          );
          return stage?.hit?.(slot, ms(HIT_MS)) ?? undefined;
        }

        case 'miss': {
          const p = event.payload as { step?: unknown; line?: unknown } | undefined;
          const step = num(p?.step);
          const line = num(p?.line);
          if (step === null || line === null) return;
          stage?.markResult?.(step, false);
          stage?.setCaption?.(tr('caption.miss', 'Line {line} is in no slot — miss.', { line }));
          return;
        }

        case 'choose': {
          const p = event.payload as
            | { clock?: unknown; value?: unknown; pick?: unknown }
            | undefined;
          const value = num(p?.value);
          const slot = toIndexArray(event.target)[0];
          if (value === null || slot === undefined) return;
          const clock = clockName(tr, typeof p?.clock === 'string' ? p.clock : 'used');
          stage?.markVictim?.(slot);
          stage?.setCaption?.(
            p?.pick === 'max'
              ? tr('caption.evictMax', 'Largest {clock} is {value}, so slot {slot} is discarded.', {
                  clock,
                  value,
                  slot,
                })
              : tr('caption.evictMin', 'Smallest {clock} is {value}, so slot {slot} is discarded.', {
                  clock,
                  value,
                  slot,
                }),
          );
          return;
        }

        case 'evict': {
          const p = event.payload as { line?: unknown } | undefined;
          const line = num(p?.line);
          const slot = toIndexArray(event.target)[0];
          if (line === null || slot === undefined) return;
          return stage?.evict?.(slot, line, ms(EVICT_MS)) ?? undefined;
        }

        case 'install': {
          const p = event.payload as
            | { step?: unknown; line?: unknown; cold?: unknown }
            | undefined;
          const step = num(p?.step);
          const line = num(p?.line);
          const slot = toIndexArray(event.target)[0];
          if (step === null || line === null || slot === undefined) return;
          if (p?.cold === true) {
            stage?.setCaption?.(
              tr('caption.cold', 'Slot {slot} is still empty, so line {line} goes there.', {
                slot,
                line,
              }),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.install', 'Line {line} moves into slot {slot}.', { line, slot }),
            );
          }
          return stage?.install?.(slot, line, step, ms(INSTALL_MS)) ?? undefined;
        }

        case 'clocks': {
          const p = event.payload as { used?: unknown; loaded?: unknown } | undefined;
          const used = numArray(p?.used);
          const loaded = numArray(p?.loaded);
          if (used === null || loaded === null) return;
          stage?.setClocks?.(used, loaded);
          return;
        }

        case 'done': {
          const p = event.payload as
            | { misses?: unknown; total?: unknown; policy?: unknown }
            | undefined;
          const misses = num(p?.misses);
          const total = num(p?.total);
          if (misses === null || total === null) return;
          const id = typeof p?.policy === 'string' ? p.policy : policy;
          stage?.finish?.();
          stage?.setCaption?.(
            tr('caption.done', '{policy}: {misses} misses out of {total} accesses.', {
              policy: policyName(tr, id),
              misses,
              total,
            }),
          );
          codePanel?.clearHighlight?.();
          return;
        }

        case 'phase': {
          // silent 는 "걸음의 경계가 아니다" 라는 뜻이지 여기 오지 않는다는 뜻이
          // 아니다. 메커니즘은 projector 를 갱신한 뒤에야 silent 를 본다.
          const p = event.payload as { phase?: unknown } | undefined;
          codePanel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }

        default:
          // 그 밖의 이벤트는 이 화면이 쓰지 않는다 — 의도적으로 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      codePanel?.clearHighlight?.();
    },
  };
};
