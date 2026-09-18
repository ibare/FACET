/**
 * 프리페치 projector — 원소 하나의 차례에 온 이벤트를 모아 stage 에 옮기고,
 * 미스 · 기다림 · 차례의 끝(`tick`) 마다 그때까지의 가장 중요한 사건 하나를 캡션으로 말한다.
 * (한 차례가 미스 · 기다림 · 쓰기 걸음으로 나뉘므로 걸음마다 말한다.)
 *
 * 캡션의 우선순위: 다시 부름 > 안 쓰고 밀려남 > 미스 > 늦게 도착 > 기다림 > 미리 부름 > 이미 와 있음.
 * 시각은 stage 의 시계가 흐르며 맞춘다 — 멈춘 박자는 `STALL_MS`, 일 박자는 `WORK_MS` 동안.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { PrefetchingStage } from './prefetching-stage.js';

/** 멈춘 박자 하나가 화면에서 흐르는 시간 (algorithm 의 STALL_MS 와 맞춘다). */
const STALL_MS = 70;
/** 일 박자 하나가 흐르는 시간 (algorithm 의 걸음 300ms 안에 끝나게). */
const WORK_MS = 240;

type Fetch = { line: number; slot: number; kind: 'demand' | 'prefetch'; issue: number; arrive: number; stamp: number };
type Evict = { line: number; at: number; wasted: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const numOf = (p: Record<string, unknown>, k: string): number | null =>
  typeof p[k] === 'number' ? (p[k] as number) : null;

function readFetch(p: Record<string, unknown>): Fetch | null {
  const line = numOf(p, 'line');
  const slot = numOf(p, 'slot');
  const issue = numOf(p, 'issue');
  const arrive = numOf(p, 'arrive');
  const stamp = numOf(p, 'stamp');
  const kind = p.kind === 'demand' || p.kind === 'prefetch' ? p.kind : null;
  if (line === null || slot === null || issue === null || arrive === null || stamp === null || kind === null) return null;
  return { line, slot, kind, issue, arrive, stamp };
}

export const prefetchingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PrefetchingStage | undefined;
  const code = views.codePanel as unknown as { highlightPhase?: (phase: string | null) => void } | undefined;
  const tr = runtime?.t ?? makeTranslator();
  const speed = () => Math.max(0.01, runtime?.getSpeed() ?? 1);

  let distance = 0;
  /** 이번 판에서 안 쓰고 밀려난 줄 — 다시 부르면 "다시 부름" 으로 말한다 */
  let wastedLines = new Set<number>();
  /** 지금 차례가 시작된 시각 (앞 차례의 끝) */
  let stepStart = 0;
  let missFetch: Fetch | null = null;
  let prefetchFetch: Fetch | null = null;
  let evictWasted: { victim: number; byPrefetch: boolean } | null = null;
  let waited: { line: number; wait: number; prefetched: boolean } | null = null;
  /** 지금 차례의 원소와 그 줄 — 미스 · 기다림 걸음에서도 캡션을 말하려고 앞서 받는다 */
  let current: { i: number; line: number } | null = null;
  let refetch = false;
  let pendingEvict: Evict | null = null;

  const clearStep = () => {
    missFetch = null;
    prefetchFetch = null;
    evictWasted = null;
    waited = null;
    current = null;
    refetch = false;
    pendingEvict = null;
  };

  const captionFor = (): string | null => {
    if (!current) return null;
    const i = current.i;
    if (missFetch && refetch) {
      return tr('caption.refetch', 'Element {i}: L{line} was called ahead but pushed out before use — fetch it again and wait {wait}.', {
        i,
        line: missFetch.line,
        wait: waited?.wait ?? missFetch.arrive - missFetch.issue,
      });
    }
    if (evictWasted && evictWasted.byPrefetch && prefetchFetch) {
      return tr('caption.wastedByPrefetch', 'Element {i}: calling L{ahead} pushes out L{victim}, called ahead and never used — wasted.', {
        i,
        ahead: prefetchFetch.line,
        victim: evictWasted.victim,
      });
    }
    if (evictWasted && !evictWasted.byPrefetch && missFetch) {
      return tr('caption.wastedByMiss', 'Element {i}: bringing L{line} in pushes out L{victim}, called ahead and never used — wasted.', {
        i,
        line: missFetch.line,
        victim: evictWasted.victim,
      });
    }
    if (missFetch) {
      return tr('caption.miss', 'Element {i}: L{line} is not in the cache — a miss. It arrives at t {arrive}; wait {wait}.', {
        i,
        line: missFetch.line,
        arrive: missFetch.arrive,
        wait: waited?.wait ?? missFetch.arrive - missFetch.issue,
      });
    }
    if (waited && waited.prefetched) {
      return tr('caption.late', 'Element {i}: L{line} was called ahead but is still on its way — not a miss, yet wait {wait}.', {
        i,
        line: waited.line,
        wait: waited.wait,
      });
    }
    if (waited) {
      return tr('caption.wait', 'Element {i}: L{line} is still on its way — wait {wait}.', {
        i,
        line: waited.line,
        wait: waited.wait,
      });
    }
    if (prefetchFetch) {
      return tr('caption.prefetch', 'Element {i} begins L{line}: call L{ahead} now — it arrives at t {arrive}.', {
        i,
        line: current.line,
        ahead: prefetchFetch.line,
        arrive: prefetchFetch.arrive,
      });
    }
    return tr('caption.hit', 'Element {i}: L{line} is already here — no wait.', { i, line: current.line });
  };

  const say = () => {
    const text = captionFor();
    if (text !== null) stage?.setCaption(text);
  };

  return {
    onInit() {
      clearStep();
      stepStart = 0;
      wastedLines = new Set();
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = isObj(event.payload) ? event.payload : {};
      switch (event.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'round': {
          distance = numOf(p, 'distance') ?? 0;
          wastedLines = new Set();
          stepStart = 0;
          clearStep();
          stage?.startRound(distance);
          stage?.setCaption(
            distance === 0
              ? tr('caption.startNone', 'Distance 0: nothing is called ahead — each line is fetched when it is first touched.')
              : tr('caption.start', 'Distance {d}: when a new line begins, call the line {d} ahead of it.', { d: distance }),
          );
          return;
        }
        case 'evict': {
          const line = numOf(p, 'line');
          const at = numOf(p, 'at');
          if (line === null || at === null) return;
          const wasted = p.wasted === true;
          pendingEvict = { line, at, wasted };
          stage?.evict(pendingEvict);
          if (wasted) wastedLines.add(line);
          return;
        }
        case 'fetch': {
          const f = readFetch(p);
          if (!f) return;
          if (pendingEvict?.wasted) evictWasted = { victim: pendingEvict.line, byPrefetch: f.kind === 'prefetch' };
          pendingEvict = null;
          if (f.kind === 'demand') {
            missFetch = f;
            refetch = wastedLines.has(f.line);
            const i = numOf(p, 'i');
            if (i !== null) current = { i, line: f.line };
          } else {
            prefetchFetch = f;
          }
          stage?.fetch(f);
          // 미스 걸음은 따로 멈춘다 — 그 걸음에서 바로 말한다
          if (f.kind === 'demand') say();
          return;
        }
        case 'wait': {
          const line = numOf(p, 'line');
          const from = numOf(p, 'from');
          const to = numOf(p, 'to');
          if (line === null || from === null || to === null) return;
          waited = { line, wait: to - from, prefetched: p.prefetched === true };
          const i = numOf(p, 'i');
          if (i !== null) current = { i, line };
          stage?.wait(from, to);
          stage?.flowTo(to, ((to - from) * STALL_MS) / speed());
          say();
          return;
        }
        case 'touch': {
          const i = numOf(p, 'i');
          const line = numOf(p, 'line');
          const at = numOf(p, 'at');
          const stamp = numOf(p, 'stamp');
          if (i === null || line === null || at === null || stamp === null) return;
          current = { i, line };
          stage?.touch({ i, line, start: stepStart, at, stamp });
          return;
        }
        case 'tick': {
          const t = numOf(p, 't');
          if (t === null) return;
          say();
          stage?.flowTo(t, WORK_MS / speed());
          stepStart = t;
          clearStep();
          return;
        }
        case 'round-end': {
          const cycles = numOf(p, 'cycles');
          const stall = numOf(p, 'stall');
          const wasted = numOf(p, 'wasted');
          const d = numOf(p, 'distance') ?? distance;
          if (cycles === null || stall === null || wasted === null) return;
          stage?.endRound(d, cycles);
          stage?.setCaption(
            tr('caption.done', 'Distance {d}: {cycles} cycles — {stall} of them waiting, {wasted} wasted prefetches.', {
              d,
              cycles,
              stall,
              wasted,
            }),
          );
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      clearStep();
      stepStart = 0;
      wastedLines = new Set();
    },
  };
};
