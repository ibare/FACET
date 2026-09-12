/**
 * write-back vs write-through 조각의 projector.
 *
 * 하는 일은 둘뿐이다 — payload 를 좁혀 stage 가 받는 모양으로 조립하고(C9),
 * 지금 화면에서 무슨 일이 일어나는지를 말하는 키를 골라 `tr` 로 해석한다(C10).
 * 문안 자체는 `facet.ts` 의 messages 에 있고 여기에는 키와 en 원본만 있다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/**
 * stage 가 내주는 표면. `views.stage` 는 열린 타입이라 여기서 한 번만 좁힌다 (C9).
 * 메서드는 전부 optional 로 두고 `?.()` 로 부른다 — 다른 view 가 끼어도 깨지지
 * 않게.
 */
type WriteBackStage = {
  step?(view: StepView): void | Promise<void>;
  flush?(view: FlushView): void | Promise<void>;
  finish?(view: DoneView): void | Promise<void>;
  rewind?(): void;
  setCaption?(text: string): void;
};

type StepView = {
  index: number;
  line: number;
  slot: number;
  hit: boolean;
  marks: number;
  evictSlot: number;
  evictLine: number;
  evictMarks: number;
  throughTotal: number;
  backTotal: number;
};

type FlushView = {
  lines: number[];
  slots: number[];
  marks: number[];
  backTotal: number;
};

type DoneView = { writes: number; throughTotal: number; backTotal: number };

/** 가드를 딸린 좁히개 — `as Record` 뒤에 반드시 typeof 검사가 온다 (C9). */
function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function readStep(payload: unknown): StepView | null {
  const p = fields(payload);
  if (p === null) return null;
  return {
    index: num(p.index, 0),
    line: num(p.line, 0),
    slot: num(p.slot, 0),
    hit: p.hit === true,
    marks: num(p.marks, 1),
    evictSlot: num(p.evictSlot, -1),
    evictLine: num(p.evictLine, -1),
    evictMarks: num(p.evictMarks, 0),
    throughTotal: num(p.throughTotal, 0),
    backTotal: num(p.backTotal, 0),
  };
}

function readFlush(payload: unknown): FlushView | null {
  const p = fields(payload);
  if (p === null) return null;
  const lines = numbers(p.lines);
  const slots = numbers(p.slots);
  const marks = numbers(p.marks);
  // 세 배열은 자리끼리 짝을 이룬다. 어긋나면 짧은 쪽까지만 본다.
  const n = Math.min(lines.length, slots.length, marks.length);
  return {
    lines: lines.slice(0, n),
    slots: slots.slice(0, n),
    marks: marks.slice(0, n),
    backTotal: num(p.backTotal, 0),
  };
}

function readDone(payload: unknown): DoneView | null {
  const p = fields(payload);
  if (p === null) return null;
  return {
    writes: num(p.writes, 0),
    throughTotal: num(p.throughTotal, 0),
    backTotal: num(p.backTotal, 0),
  };
}

export const writeBackVsThroughProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as WriteBackStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 걸음의 상태에서 캡션을 고른다. 문제 → 되풀이 → 쫓겨남 → 남은 것 → 셈 으로
   * 이어지는 한 논증의 단계다 (S-piece).
   */
  const captionFor = (view: StepView): string => {
    if (view.index === 0) {
      return tr(
        'caption.start',
        'The same write lands in both. One sends it down now; the other only marks the line.',
      );
    }
    if (view.hit) {
      return tr(
        'caption.again',
        'The same line is written again: another trip down on the left, another mark on the right.',
      );
    }
    if (view.evictLine >= 0) {
      return tr(
        'caption.evict',
        'The line is pushed out, so the marks it gathered go down together — one trip.',
      );
    }
    return tr('caption.load', 'A new line takes an empty slot. The left still sends every write down.');
  };

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'line-write': {
          const view = readStep(event.payload);
          if (!view) return;
          stage?.setCaption?.(captionFor(view));
          await stage?.step?.(view);
          return;
        }
        case 'flush': {
          const view = readFlush(event.payload);
          if (!view) return;
          stage?.setCaption?.(
            tr('caption.flush', 'The marked lines left in the cache still have to go down. Nothing is free.'),
          );
          await stage?.flush?.(view);
          return;
        }
        case 'done': {
          const view = readDone(event.payload);
          if (!view) return;
          stage?.setCaption?.(
            tr('caption.done', 'Same {writes} writes on both sides. Trips to memory: {through} against {back}.', {
              writes: view.writes,
              through: view.throughTotal,
              back: view.backTotal,
            }),
          );
          await stage?.finish?.(view);
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },
    onReset() {
      stage?.rewind?.();
    },
  };
};
