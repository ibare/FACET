/**
 * weighted-fair-share projector — algorithm 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 캡션은 값으로 말한다: 셈한 가상 시간 식(`12 + 6 ÷ 2 = 15`), 동률이 걸린 값과 그 규칙,
 * C 의 출발점, 판 끝의 B 몫(%)과 C 가 받은 틱. 결론을 상수 글자로 박지 않는다.
 * 운동 길이는 걸음마다 runtime.getSpeed() 를 읽어 정한다 (사양 상한 300ms).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import { ceilingOf, type WeightedFairShareData } from './algorithm.js';
import type { WeightedFairShareStage } from './weighted-fair-share-stage.js';

const MOTION_MS = 300;

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

type Rec = Record<string, unknown>;

function rec(payload: unknown, what: string): Rec {
  if (typeof payload !== 'object' || payload === null) throw new Error(`weightedFairShareProjector: ${what} 의 payload 가 없다`);
  return payload as Record<string, unknown>;
}

function num(p: Rec, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`weightedFairShareProjector: ${key} 가 수가 아니다`);
  return v;
}

function nums(p: Rec, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`weightedFairShareProjector: ${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`weightedFairShareProjector: ${key} 에 수가 아닌 것이 있다`);
    return x;
  });
}

function strs(p: Rec, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`weightedFairShareProjector: ${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`weightedFairShareProjector: ${key} 에 글자가 아닌 것이 있다`);
    return x;
  });
}

function str(p: Rec, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`weightedFairShareProjector: ${key} 가 글자가 아니다`);
  return v;
}

export const weightedFairShareProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as WeightedFairShareStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  let procs: string[] = [];
  const nameOf = (i: number) => {
    const id = procs[i];
    if (id === undefined) throw new Error(`weightedFairShareProjector: 모르는 프로세스 색인 ${i}`);
    return id.toUpperCase();
  };
  /** "A 24 · C 30" — 색인과 값의 목록. */
  const listOf = (pairs: [number, number][]) => pairs.map(([i, v]) => `${nameOf(i)} ${v}`).join(' · ');

  /** 판의 머리 — 캡션과 빈 그래프 (A · B 가 0 에 선 모습). */
  const beginRound = (p: Rec, ms: number): Promise<void> | undefined => {
    procs = strs(p, 'procs');
    const weights = nums(p, 'weights');
    const late = num(p, 'late');
    const cStart = num(p, 'cStart');
    if (cStart !== 0 && cStart !== 1) throw new Error(`weightedFairShareProjector: 모르는 출발 ${cStart}`);
    const mode = cStart === 1 ? t('label.startLowest', 'at the lowest') : t('label.startZero', 'at zero');
    stage?.setCaption(
      t('caption.round', 'Weights {names} = {weights}', {
        names: procs.map((_, i) => nameOf(i)).join(':'),
        weights: weights.join(':'),
      }),
      t('caption.start', '{name} starts {mode}', { name: nameOf(late), mode }),
    );
    return stage?.startRound(
      { procs, weights, ticks: num(p, 'ticks'), arriveAt: num(p, 'arriveAt'), late, unit: num(p, 'unit'), vTop: num(p, 'vTop') },
      ms,
    );
  };

  return {
    /**
     * 걸음 0 — 마운트 때 initialData 에서 빈 그래프를 그린다. 첫 판의 `round` 는 같은 모습을 다시 그릴 뿐이라
     * 걸음 0 이 따로 생기지 않는다 (판마다 26 걸음).
     */
    onInit(raw) {
      // initialData 가 없으면(전수 검사의 빈 마운트) 걸음 0 을 건너뛴다 — 첫 `round` 가 그린다. 있는데 틀리면 던진다.
      if (raw === undefined || raw === null) return;
      if (typeof raw === 'object' && Object.keys(raw).length === 0) return;
      const d = rec(raw, 'initialData');
      const data: WeightedFairShareData = {
        type: 'weighted-fair-share',
        stepMs: num(d, 'stepMs'),
        procs: strs(d, 'procs'),
        weightLadder: nums(d, 'weightLadder'),
        startLadder: nums(d, 'startLadder'),
        unit: num(d, 'unit'),
        ticks: num(d, 'ticks'),
        arriveAt: num(d, 'arriveAt'),
        weight: num(d, 'weight'),
        cStart: num(d, 'cStart'),
      };
      void beginRound(
        {
          procs: data.procs,
          weights: data.procs.map((_, i) => (i === 1 ? data.weight : 1)),
          cStart: data.cStart,
          ticks: data.ticks,
          arriveAt: data.arriveAt,
          late: data.procs.length - 1,
          unit: data.unit,
          vTop: ceilingOf(data),
        },
        0,
      );
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = rec(e.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round': {
          await beginRound(rec(e.payload, 'round'), motion());
          return;
        }
        case 'arrive': {
          const p = rec(e.payload, 'arrive');
          const tick = num(p, 'tick');
          const proc = num(p, 'proc');
          const start = num(p, 'start');
          const from = str(p, 'from');
          const others = nums(p, 'others');
          const pairs: [number, number][] = [];
          for (let k = 0; k + 1 < others.length; k += 2) pairs.push([others[k], others[k + 1]]);
          const main =
            from === 'lowest'
              ? t('caption.arriveLowest', 'Tick {tick}: {name} arrives, virtual time starts at the lowest present: {v}', { tick, name: nameOf(proc), v: start })
              : from === 'zero'
                ? t('caption.arriveZero', 'Tick {tick}: {name} arrives, virtual time starts at 0', { tick, name: nameOf(proc) })
                : null;
          if (main === null) throw new Error(`weightedFairShareProjector: 모르는 출발 ${from}`);
          stage?.setCaption(main, t('caption.present', 'Present: {list}', { list: listOf(pairs) }));
          await stage?.arrive({ tick, proc, start }, motion());
          return;
        }
        case 'tick': {
          const p = rec(e.payload, 'tick');
          const tick = num(p, 'tick');
          const proc = num(p, 'proc');
          const vrs = nums(p, 'vrs');
          const present = nums(p, 'present');
          const tied = nums(p, 'tied');
          const tie = str(p, 'tie');
          const main = t('caption.pick', 'Tick {tick}: {name} runs · {before} + {unit} ÷ {w} = {after}', {
            tick,
            name: nameOf(proc),
            before: num(p, 'before'),
            unit: num(p, 'unit'),
            w: num(p, 'weight'),
            after: num(p, 'after'),
          });
          let sub: string;
          if (tie === 'recent' || tie === 'order') {
            const vars = { v: num(p, 'before'), names: tied.map((i) => nameOf(i)).join(' · ') };
            sub =
              tie === 'recent'
                ? t('caption.tieRecent', 'Tie at {v} ({names}): the one that ran longest ago goes first', vars)
                : t('caption.tieOrder', 'Tie at {v} ({names}): none has run yet, list order decides', vars);
          } else if (tie === 'none') {
            const pairs: [number, number][] = [];
            present.forEach((on, i) => {
              if (on === 1 && i !== proc) pairs.push([i, vrs[i]]);
            });
            sub = t('caption.others', 'Others: {list}', { list: listOf(pairs) });
          } else {
            throw new Error(`weightedFairShareProjector: 모르는 동률 ${tie}`);
          }
          stage?.setCaption(main, sub);
          await stage?.runTick({ tick, proc, vrs, present, ran: nums(p, 'ran') }, motion());
          return;
        }
        case 'share': {
          const p = rec(e.payload, 'share');
          const first = num(p, 'first');
          const firstB = num(p, 'firstB');
          const pct = num(p, 'pct');
          stage?.setCaption(
            t('caption.share', '{name} share of the first {n} ticks: {got}/{n} = {pct}%', { name: nameOf(1), n: first, got: firstB, pct }),
            t('caption.late', 'Last {m} ticks · {name}: {c}', { m: num(p, 'lateTicks'), name: nameOf(procs.length - 1), c: num(p, 'lateRun') }),
          );
          await stage?.showShare({ first, firstB, pct }, motion());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
