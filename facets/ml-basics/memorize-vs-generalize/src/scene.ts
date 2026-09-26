import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowMemorizeData } from './algorithm.js';
import type { Answerer, Example, Label, Phase } from './algorithm.js';

export type Score = { memo: number; rule: number };

/** 이번 걸음 — 문제 하나를 두 쪽에 함께 물었다. */
export type AskStep = {
  kind: 'ask';
  phase: Phase;
  index: number;
  x: number;
  answer: Label;
  memo: { guess: Label; near: number; right: boolean };
  rule: { guess: Label; right: boolean };
  /** 이 걸음에서 앞뒤 자리가 뒤바뀌었는가 (자리 운동의 계기). payload 의 점수로 판정한다 */
  swapped: boolean;
};

export type MemorizeVsGeneralizeScene = {
  // 바탕
  seen: Example[];
  fresh: Example[];
  threshold: number | null;
  axis: { min: number; max: number } | null;
  // 자취
  /** 지금까지 물은 문제 수 (본 것 + 새 것) */
  asked: number;
  hits: { seen: Score; fresh: Score };
  /** 위에서 아래로의 자리. 지금 쪽의 맞힌 수로 가르고 같으면 앞 자리를 지킨다 */
  order: [Answerer, Answerer];
  // 이번 걸음
  step: AskStep | null;
};

function isLabel(v: unknown): v is Label {
  return v === 0 || v === 1;
}

function field(o: unknown, key: string, path: string): unknown {
  if (typeof o !== 'object' || o === null) throw new Error(`${path}: 객체가 아니다`);
  return (o as Record<string, unknown>)[key];
}

function num(o: unknown, key: string, path: string): number {
  const v = field(o, key, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path}.${key}: 수가 아니다`);
  return v;
}

function bool(o: unknown, key: string, path: string): boolean {
  const v = field(o, key, path);
  if (typeof v !== 'boolean') throw new Error(`${path}.${key}: 참거짓이 아니다`);
  return v;
}

function label(o: unknown, key: string, path: string): Label {
  const v = field(o, key, path);
  if (!isLabel(v)) throw new Error(`${path}.${key}: 0 이나 1 이 아니다`);
  return v;
}

function reduceInit(scene: MemorizeVsGeneralizeScene, p: unknown): MemorizeVsGeneralizeScene {
  if (scene.threshold !== null) throw new Error('init: 두 번 왔다');
  const threshold = num(p, 'threshold', 'init.payload');
  const axisRaw = field(p, 'axis', 'init.payload');
  const min = num(axisRaw, 'min', 'init.payload.axis');
  const max = num(axisRaw, 'max', 'init.payload.axis');
  if (!(min < max)) throw new Error('init.payload.axis: min 이 max 보다 작아야 한다');
  return { ...scene, threshold, axis: { min, max }, step: null };
}

function reduceAsk(scene: MemorizeVsGeneralizeScene, p: unknown): MemorizeVsGeneralizeScene {
  if (scene.threshold === null) throw new Error('ask: init 보다 먼저 왔다');
  const phaseRaw = field(p, 'phase', 'ask.payload');
  if (phaseRaw !== 'seen' && phaseRaw !== 'fresh') throw new Error('ask.payload.phase: seen · fresh 가 아니다');
  const phase: Phase = phaseRaw;
  const index = num(p, 'index', 'ask.payload');
  const expectedAsked = phase === 'seen' ? index : scene.seen.length + index;
  if (expectedAsked !== scene.asked) {
    throw new Error(`ask.payload.index: ${phase}[${index}] 는 차례가 아니다 (물은 수 ${scene.asked})`);
  }
  const base = phase === 'seen' ? scene.seen : scene.fresh;
  const q = base[index];
  if (q === undefined) throw new Error(`ask.payload.index: ${phase}[${index}] 가 바탕에 없다`);
  const x = num(p, 'x', 'ask.payload');
  const answer = label(p, 'answer', 'ask.payload');
  if (x !== q.x || answer !== q.y) throw new Error(`ask.payload: ${phase}[${index}] 의 x · 정답이 바탕과 다르다`);

  const memoRaw = field(p, 'memo', 'ask.payload');
  const ruleRaw = field(p, 'rule', 'ask.payload');
  const memo = {
    guess: label(memoRaw, 'guess', 'ask.payload.memo'),
    near: num(memoRaw, 'near', 'ask.payload.memo'),
    right: bool(memoRaw, 'right', 'ask.payload.memo'),
  };
  const rule = {
    guess: label(ruleRaw, 'guess', 'ask.payload.rule'),
    right: bool(ruleRaw, 'right', 'ask.payload.rule'),
  };
  const nearEx = scene.seen.find((e) => e.x === memo.near);
  if (nearEx === undefined) throw new Error(`ask.payload.memo.near: ${memo.near} 는 본 것에 없다`);
  if (nearEx.y !== memo.guess) throw new Error('ask.payload.memo.guess: 가까운 예의 답과 다르다');
  if (memo.right !== (memo.guess === answer)) throw new Error('ask.payload.memo.right: 정답과 맞지 않다');
  if (rule.right !== (rule.guess === answer)) throw new Error('ask.payload.rule.right: 정답과 맞지 않다');

  // 맞힌 수는 알고리즘이 센다 — 장면은 옮겨 담고, 앞 걸음과 이번 맞음 표지에 맞는지만 대조한다
  const scoreRaw = field(p, 'score', 'ask.payload');
  const nextScore: Score = {
    memo: num(scoreRaw, 'memo', 'ask.payload.score'),
    rule: num(scoreRaw, 'rule', 'ask.payload.score'),
  };
  const cur = scene.hits[phase];
  if (nextScore.memo - cur.memo !== (memo.right ? 1 : 0)) {
    throw new Error(`ask.payload.score.memo: 앞 걸음 ${cur.memo} 에서 ${nextScore.memo} 로 갈 수 없다 (right ${memo.right})`);
  }
  if (nextScore.rule - cur.rule !== (rule.right ? 1 : 0)) {
    throw new Error(`ask.payload.score.rule: 앞 걸음 ${cur.rule} 에서 ${nextScore.rule} 로 갈 수 없다 (right ${rule.right})`);
  }
  const hits = { ...scene.hits, [phase]: nextScore };

  const [top, bottom] = scene.order;
  const swapped = nextScore[bottom] > nextScore[top];
  const order: [Answerer, Answerer] = swapped ? [bottom, top] : [top, bottom];

  return {
    ...scene,
    asked: scene.asked + 1,
    hits,
    order,
    step: { kind: 'ask', phase, index, x, answer, memo, rule, swapped },
  };
}

export const memorizeVsGeneralizeScene: ScenePlan<MemorizeVsGeneralizeScene> = {
  initial(initialData: unknown): MemorizeVsGeneralizeScene {
    const d = narrowMemorizeData(initialData);
    return {
      seen: d.seen.map((e) => ({ x: e.x, y: e.y })),
      fresh: d.fresh.map((e) => ({ x: e.x, y: e.y })),
      threshold: null,
      axis: null,
      asked: 0,
      hits: { seen: { memo: 0, rule: 0 }, fresh: { memo: 0, rule: 0 } },
      order: ['memo', 'rule'],
      step: null,
    };
  },
  reduce(scene: MemorizeVsGeneralizeScene, event: FacetRuntimeEvent): MemorizeVsGeneralizeScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'ask':
        return reduceAsk(scene, event.payload);
      default:
        throw new Error(`memorizeVsGeneralizeScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
