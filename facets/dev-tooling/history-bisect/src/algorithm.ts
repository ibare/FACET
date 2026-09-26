/**
 * history-bisect — 깨진 빌드가 섞인 줄기를 반씩 좁혀 처음 깨진 커밋을 찾는다.
 *
 * 손잡이 둘: 깨진 빌드 수 k(`broken`, 사다리 `brokenLadder`) · 깨진 빌드 자리(`place`, `placements` 의 순번).
 * 한 판을 끝까지 재생하고 입력을 기다렸다가, 받은 값으로 다시 재생한다.
 *
 * 규칙(모형 — 지어낸 결정론 규칙이다. 실제 `git bisect skip` 은 치우친 난수로 고른다):
 *   good g · bad b 사이(g 는 빼고 b 는 넣는다)가 후보. 가운데 m = (g + b) div 2.
 *   m 이 깨진 빌드면 후보 안에서 m 에 가장 가까운 시험 가능한 커밋 — 거리 d = 1, 2, … 마다 아래 m−d 먼저,
 *   다음 위 m+d (거리 동률이면 아래 번호). 시험 가능한 후보가 없으면 멈추고 남은 후보 전부가 답.
 *   good 이면 g ← 고른 것, bad 면 b ← 고른 것. b − g = 1 이면 b 가 답.
 *   판정기: 번호 ≥ firstBad 이면 bad (한 번 깨지면 뒤도 깨져 있다 — 단조).
 *   동률 — 거리 동률만 있고 위 규칙대로 아래를 먼저 본다. 이 데이터에서 실제로 걸린다: 범인 바로 앞 k=1
 *   (가운데 c10 → c9 · c11 둘 다 시험 가능 → c9) · 범인 뒤 k=1 (가운데 c12 → c11 · c13 → c11). 테스트가 센다.
 *
 * 이벤트 (모두 await, type 은 리터럴):
 *   round    { commits: string[], good: number, bad: number, broken: number[], anchor: number,
 *              candidateFrom: number, candidateTo: number }                     — 걸음 0. 판을 새로 연다
 *   test-pick { mid: number, pick: number, skipped: boolean }                 — 꺼냄 걸음
 *   verdict  { commit: number, verdict: 'good' | 'bad', dropFrom: number, dropTo: number,
 *              candidateFrom: number, candidateTo: number }                     — 판정 걸음
 *   stuck    { mid: number, candidateFrom: number, candidateTo: number, untestableFrom: number, untestableTo: number }
 *                                                                            — 멈춤 걸음. untestable = g+1..b−1 (b 는 이미 bad)
 *   answer   { from: number, to: number }                                     — 답 걸음
 *   phase    { phase }  silent: true
 *   커밋은 모두 1 부터의 번호(c1 = 1). anchor 는 깨진 빌드 무리가 자라나는 첫 칸(자리의 from).
 *
 * phase 어휘: midpoint · skip-aside · good · bad · stuck · answer (irs.ts 와 같다)
 *
 * 계기: tests(시험 수) · minutes(쌓인 분 = 시험 × testMinutes) · answer-candidates(b − g).
 *   걸음 0 에 셋 다, 판정 걸음마다 셋 다 — 지금 보이는 값과의 차이만 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Placement = { id: string; from: string; dir: number };

export type HistoryBisectData = {
  type: 'history-bisect';
  stepMs: number;
  commits: string[];
  knownGood: string;
  knownBad: string;
  firstBad: string;
  testMinutes: number;
  placements: Placement[];
  brokenLadder: number[];
  broken: number;
  place: number;
};

export type BisectStep =
  | { kind: 'pick'; mid: number; pick: number; skipped: boolean }
  | {
      kind: 'verdict';
      commit: number;
      verdict: 'good' | 'bad';
      dropFrom: number;
      dropTo: number;
      good: number;
      bad: number;
      tests: number;
    }
  | { kind: 'stuck'; mid: number; good: number; bad: number }
  | { kind: 'answer'; from: number; to: number };

export type BisectPlan = {
  good: number;
  bad: number;
  culprit: number;
  broken: number[];
  anchor: number;
  steps: BisectStep[];
  tests: number;
  skippedAside: number;
  stuck: boolean;
  answerFrom: number;
  answerTo: number;
};

/** 커밋 글자 → 1 부터의 번호. 없는 글자면 던진다. */
export function commitNumber(data: HistoryBisectData, name: string): number {
  const i = data.commits.indexOf(name);
  if (i < 0) throw new Error(`history-bisect: commits 에 '${name}' 이 없다`);
  return i + 1;
}

/** 깨진 빌드 무리 — placements[place] 의 from 에서 dir 쪽으로 k 개. 두 끝(판정된 커밋)이나 줄기 밖이면 던진다. */
export function brokenCommits(data: HistoryBisectData, k: number, place: number): number[] {
  if (!data.brokenLadder.includes(k)) throw new Error(`history-bisect: broken ${k} 이 brokenLadder 밖이다`);
  const placement = data.placements[place];
  if (placement === undefined) throw new Error(`history-bisect: placements[${place}] 가 없다`);
  if (placement.dir !== 1 && placement.dir !== -1) throw new Error(`history-bisect: placements[${place}].dir 은 +1 또는 -1 (지금 ${placement.dir})`);
  const good = commitNumber(data, data.knownGood);
  const bad = commitNumber(data, data.knownBad);
  const from = commitNumber(data, placement.from);
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const c = from + i * placement.dir;
    if (c <= good || c >= bad) throw new Error(`history-bisect: 깨진 빌드 c 번호 ${c} 가 두 끝 사이 밖이다`);
    out.push(c);
  }
  return out.sort((a, b) => a - b);
}

/** IR 에 건넬 skip 배열 — 커밋 번호로 색인하는 0/1, 길이 commits + 1 (0 칸은 쓰지 않는다). */
export function skipFlags(data: HistoryBisectData, k: number, place: number): number[] {
  const flags = new Array<number>(data.commits.length + 1).fill(0);
  for (const c of brokenCommits(data, k, place)) flags[c] = 1;
  return flags;
}

/** 한 판의 셈 — 걸음 차례와 끝값. 무대는 이것을 다시 셈하지 않는다. */
export function planBisect(data: HistoryBisectData, k: number, place: number): BisectPlan {
  const culprit = commitNumber(data, data.firstBad);
  const broken = brokenCommits(data, k, place);
  const placement = data.placements[place];
  if (placement === undefined) throw new Error(`history-bisect: placements[${place}] 가 없다`);
  const anchor = commitNumber(data, placement.from);
  const isBroken = (c: number): boolean => broken.includes(c);
  const start = { good: commitNumber(data, data.knownGood), bad: commitNumber(data, data.knownBad) };
  let g = start.good;
  let b = start.bad;
  if (!(g < culprit && culprit <= b)) throw new Error('history-bisect: firstBad 가 knownGood 와 knownBad 사이에 있어야 한다');
  const steps: BisectStep[] = [];
  let tests = 0;
  let skippedAside = 0;
  let stuck = false;
  while (b - g > 1) {
    const mid = Math.floor((g + b) / 2);
    let pick = mid;
    if (isBroken(mid)) {
      pick = -1;
      for (let d = 1; d < b - g && pick === -1; d++) {
        if (mid - d > g && !isBroken(mid - d)) pick = mid - d;
        else if (mid + d < b && !isBroken(mid + d)) pick = mid + d;
      }
    }
    if (pick === -1) {
      steps.push({ kind: 'stuck', mid, good: g, bad: b });
      stuck = true;
      break;
    }
    const skipped = pick !== mid;
    if (skipped) skippedAside += 1;
    steps.push({ kind: 'pick', mid, pick, skipped });
    tests += 1;
    if (pick >= culprit) {
      steps.push({ kind: 'verdict', commit: pick, verdict: 'bad', dropFrom: pick + 1, dropTo: b, good: g, bad: pick, tests });
      b = pick;
    } else {
      steps.push({ kind: 'verdict', commit: pick, verdict: 'good', dropFrom: g + 1, dropTo: pick, good: pick, bad: b, tests });
      g = pick;
    }
  }
  steps.push({ kind: 'answer', from: g + 1, to: b });
  return {
    good: start.good,
    bad: start.bad,
    culprit,
    broken,
    anchor,
    steps,
    tests,
    skippedAside,
    stuck,
    answerFrom: g + 1,
    answerTo: b,
  };
}

function readKnob(payload: unknown, action: string, ok: (v: number) => boolean): number {
  if (typeof payload !== 'object' || payload === null) throw new Error(`history-bisect: ${action} 입력에 payload 가 없다`);
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number') throw new Error(`history-bisect: ${action} 입력의 payload.value 가 수가 아니다`);
  if (!ok(value)) throw new Error(`history-bisect: ${action} 입력 ${value} 가 사다리 밖이다`);
  return value;
}

export async function historyBisectAlgorithm(ctx: FacetContext<HistoryBisectData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HistoryBisectData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const shown = { tests: 0, minutes: 0, candidates: 0 };
  const report = (tests: number, candidates: number): void => {
    const minutes = tests * data.testMinutes;
    ctx.metric('tests', tests - shown.tests);
    ctx.metric('minutes', minutes - shown.minutes);
    ctx.metric('answer-candidates', candidates - shown.candidates);
    shown.tests = tests;
    shown.minutes = minutes;
    shown.candidates = candidates;
  };

  const playRound = async (k: number, place: number): Promise<boolean> => {
    const plan = planBisect(data, k, place);
    await ctx.emit({
      type: 'round',
      payload: {
        commits: [...data.commits],
        good: plan.good,
        bad: plan.bad,
        broken: plan.broken,
        anchor: plan.anchor,
        candidateFrom: plan.good + 1,
        candidateTo: plan.bad,
      },
    });
    report(0, plan.bad - plan.good);
    if (!(await rctx.sleep(data.stepMs))) return false;
    for (const step of plan.steps) {
      if (ctx.cancelled) return false;
      switch (step.kind) {
        case 'pick':
          await ctx.emit({ type: 'test-pick', payload: { mid: step.mid, pick: step.pick, skipped: step.skipped } });
          if (step.skipped) await phase('skip-aside');
          else await phase('midpoint');
          if (!(await rctx.sleep(data.stepMs))) return false;
          break;
        case 'verdict':
          await ctx.emit({
            type: 'verdict',
            payload: {
              commit: step.commit,
              verdict: step.verdict,
              dropFrom: step.dropFrom,
              dropTo: step.dropTo,
              candidateFrom: step.good + 1,
              candidateTo: step.bad,
            },
          });
          report(step.tests, step.bad - step.good);
          if (step.verdict === 'bad') await phase('bad');
          else await phase('good');
          if (!(await rctx.sleep(data.stepMs))) return false;
          break;
        case 'stuck':
          await ctx.emit({
            type: 'stuck',
            payload: {
              mid: step.mid,
              candidateFrom: step.good + 1,
              candidateTo: step.bad,
              untestableFrom: step.good + 1,
              untestableTo: step.bad - 1,
            },
          });
          await phase('stuck');
          if (!(await rctx.sleep(data.stepMs))) return false;
          break;
        case 'answer':
          await ctx.emit({ type: 'answer', payload: { from: step.from, to: step.to } });
          await phase('answer');
          break;
      }
    }
    return true;
  };

  let k = data.broken;
  let place = data.place;
  brokenCommits(data, k, place);
  try {
    while (!ctx.cancelled) {
      if (!(await playRound(k, place))) return;
      let changed = false;
      while (!changed) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'broken') {
          k = readKnob(input.payload, 'broken', (v) => data.brokenLadder.includes(v));
          changed = true;
        } else if (input.type === 'place') {
          place = readKnob(input.payload, 'place', (v) => Number.isInteger(v) && v >= 0 && v < data.placements.length);
          changed = true;
        } else {
          continue;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
