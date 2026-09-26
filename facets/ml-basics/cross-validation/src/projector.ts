/**
 * cross-validation projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * 받는 이벤트는 algorithm.ts 머리말의 목록 그대로다. payload 는 typeof 로 읽고, 빠진 값은 던진다.
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 로 잰다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';

export type StageItem = { x: number; cls: number };
export type StageCall = { item: number; fold: number; right: boolean };

export type StageStart = { k: number; used: number; items: StageItem[]; seatFold: number[] };
export type StageDeal = { order: number[] };
export type StageFit = { cuts: number[] };
export type StageJudge = { shuffle: number; calls: StageCall[]; pct: number; stack: number };
export type StageShuffle = StageDeal & StageFit & StageJudge;
export type StageSpread = { lo: number; hi: number; width: number };

/** projector 가 부르는 무대의 표면 — 무대(cross-validation-stage.ts)가 이 모양을 연다 */
export type CrossValidationStage = {
  reset(): void;
  setCaption(text: string): void;
  start(s: StageStart, ms: number): void;
  deal(s: StageDeal, ms: number): void;
  fit(s: StageFit, ms: number): void;
  judge(s: StageJudge, ms: number): void;
  shuffle(s: StageShuffle, ms: number): void;
  spread(s: StageSpread, ms: number): void;
};

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

const MOTION_MS = 500;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function rec(v: unknown, what: string): Rec {
  if (!isRec(v)) throw new Error(`${what}: payload 가 객체가 아니다`);
  return v;
}
function num(r: Rec, key: string): number {
  const v = r[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}
function nums(r: Rec, key: string): number[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`payload.${key} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`payload.${key}[${i}] 가 수가 아니다`);
    return x;
  });
}
function items(r: Rec): StageItem[] {
  const v = r.items;
  if (!Array.isArray(v)) throw new Error('payload.items 가 목록이 아니다');
  return v.map((it, i) => {
    const o = rec(it, `items[${i}]`);
    return { x: num(o, 'x'), cls: num(o, 'cls') };
  });
}
function calls(r: Rec): StageCall[] {
  const v = r.calls;
  if (!Array.isArray(v)) throw new Error('payload.calls 가 목록이 아니다');
  return v.map((it, i) => {
    const o = rec(it, `calls[${i}]`);
    const right = o.right;
    if (typeof right !== 'boolean') throw new Error(`calls[${i}].right 가 참거짓이 아니다`);
    return { item: num(o, 'item'), fold: num(o, 'fold'), right };
  });
}

function splitName(t: Translate, split: number): string {
  switch (split) {
    case 0:
      return t('label.split.0', 'Hold out once');
    case 1:
      return t('label.split.1', '2 folds');
    case 2:
      return t('label.split.2', '5 folds');
    case 3:
      return t('label.split.3', '10 folds');
    case 4:
      return t('label.split.4', '20 folds');
    default:
      throw new Error(`모르는 나누기 ${split}`);
  }
}

export const crossValidationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CrossValidationStage | undefined;
  if (stage === undefined) throw new Error('cross-validation 무대가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? MOTION_MS / speed : MOTION_MS;
  };
  /** 이 판의 배운 횟수 — cv-start 에서 받아 캡션에 쓴다 */
  let used = 0;

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const name = p.phase;
          if (typeof name !== 'string') throw new Error('phase 이름이 없다');
          code?.highlightPhase(name);
          return;
        }
        case 'cv-start': {
          const p = rec(event.payload, 'cv-start');
          const split = num(p, 'split');
          used = num(p, 'used');
          code?.highlightPhase(null);
          const itemList = items(p);
          stage.start({ k: num(p, 'k'), used, items: itemList, seatFold: nums(p, 'seatFold') }, motion());
          stage.setCaption(
            t('caption.start', 'Split: {split} · {n} items wait for their seats', {
              split: splitName(t, split),
              n: itemList.length,
            }),
          );
          return;
        }
        case 'deal': {
          const p = rec(event.payload, 'deal');
          const s = num(p, 'shuffle');
          stage.deal({ order: nums(p, 'order') }, motion());
          stage.setCaption(t('caption.deal', 'Shuffle {s}: items take the seats in shuffled order', { s: s + 1 }));
          return;
        }
        case 'fit': {
          const p = rec(event.payload, 'fit');
          const s = num(p, 'shuffle');
          stage.fit({ cuts: nums(p, 'cuts') }, motion());
          stage.setCaption(
            t('caption.fit', 'Shuffle {s}: each test fold gets a cut from the other items · fits: {used}', {
              s: s + 1,
              used,
            }),
          );
          return;
        }
        case 'judge': {
          const p = rec(event.payload, 'judge');
          const s = num(p, 'shuffle');
          const pct = num(p, 'pct');
          stage.judge({ shuffle: s, calls: calls(p), pct, stack: num(p, 'stack') }, motion());
          stage.setCaption(
            t('caption.judge', 'Shuffle {s}: called right {ok}/{n} · score: {pct} %', {
              s: s + 1,
              ok: num(p, 'ok'),
              n: num(p, 'n'),
              pct,
            }),
          );
          return;
        }
        case 'shuffle': {
          const p = rec(event.payload, 'shuffle');
          const s = num(p, 'shuffle');
          const pct = num(p, 'pct');
          stage.shuffle(
            { shuffle: s, order: nums(p, 'order'), cuts: nums(p, 'cuts'), calls: calls(p), pct, stack: num(p, 'stack') },
            motion(),
          );
          stage.setCaption(
            t('caption.shuffle', 'Shuffle {s}: new seats · fits: {used} · called right {ok}/{n} · score: {pct} %', {
              s: s + 1,
              used,
              ok: num(p, 'ok'),
              n: num(p, 'n'),
              pct,
            }),
          );
          return;
        }
        case 'spread': {
          const p = rec(event.payload, 'spread');
          stage.spread({ lo: num(p, 'lo'), hi: num(p, 'hi'), width: num(p, 'width') }, motion());
          stage.setCaption(t('caption.spread', 'Every shuffle is scored · the bar runs from lowest to highest'));
          return;
        }
        default:
          throw new Error(`cross-validation projector 가 모르는 이벤트: ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      used = 0;
      code?.clearHighlight();
    },
  };
};
