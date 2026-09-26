/**
 * branchCoverage — 커버리지와 변이 점수.
 *
 * 대상 함수 `fee` 를 데이터의 구조(첫 값 · 결정 · 빼기 · 돌려줌)로 실제로 돌리고, 시험 모음의 앞 n 개를
 * 데이터 차례대로 돌려 네 계기(줄 · 갈래 · 조건 가름 · 변이 점수)를 판마다 셈한다. 변이 다섯도 바뀐 자리의
 * 구조(비교 · 묶음 · 빼기 · 조건 뺌)를 대상 구조에 입혀 **실제로 돌려** 판정한다 — 판정 결과는 데이터에 없다.
 *
 * 셈 규약
 *   - 줄: 셀 줄은 첫 값 · 결정 · 빼기 · 돌려줌 네 줄 (`function` 줄은 세지 않는다). 밟힌 셀 줄 / 4.
 *   - 갈래: 결정 하나의 true · false 가운데 탄 것 / 2.
 *   - 조건 가름(MC/DC 짝): 조건 c 에 대해 c 만 다르고 다른 조건은 같고 결정이 뒤집힌 두 시험. 조건값은
 *     **입력이 정한다**(단락 평가와 무관). 여럿이면 돌린 차례로 첫 짝 — 뒤 시험 j 가 이른 것, 같으면 앞 시험 i 가
 *     이른 것. 이 데이터에서 동률은 걸리지 않는다 (A 는 T1-T2 하나, B 는 T1-T3 하나가 먼저 선다).
 *   - 변이 점수: 잡힌 변이 / 5. 시험에 떨어지면 잡힘(기대 = 그 시험의 기대값). 앞 시험에 잡힌 변이는 다시 돌리지 않는다.
 *   - 백분율 `(x * 100 + n // 2) // n` — 정수로만.
 *   - 원본이 시험에 떨어지면 던진다. 모르는 조건 · 바뀜 · 인자 모양도 던진다 (C6).
 *
 * 걸음 (걸음 경계 = `ctx.sleep(stepMs + motionMs)` · 마지막은 입력 대기)
 *   판 머리 걸음 0 → 시험마다 [밟는 줄마다 한 걸음 + 판정 한 걸음]. n=2 → 10 걸음, n=4 → 19 걸음.
 *
 * 이벤트
 *   - `round-start` { testCount: number, motionMs: number, fnName: string, lines: {no, text}[], decisionLine: number,
 *       conditions: {id, text}[], tests: {id, args: (number|boolean)[], expect: number, active: boolean}[],
 *       mutants: {id, line, text}[], meters: Meters }
 *       판 머리. 앞 판의 표지를 걷고 계기 막대를 0 으로.
 *   - `step-line` { test: string, testIndex: number, line: number, f: number,
 *       decision: boolean | null, conditionValues: {id, value}[] | null, meters: Meters }
 *       한 줄을 밟는다. 결정 줄에서만 decision · conditionValues 가 찬다.
 *   - `verdict` { test: string, testIndex: number, result: number, expect: number, passed: true,
 *       killed: string[], pairs: {condition: string, pair: [string, string] | null}[], meters: Meters }
 *       판정 걸음. 이 시험이 잡은 변이들이 함께 뒤집힌다.
 *   - `phase` { phase } — silent. 줄 걸음마다 그 줄의 phase.
 *   Meters = { lines, branches, pairs, mutants: { hit: number, total: number, full: boolean } }
 *
 * phase 어휘 (irs.ts 와 같다): `init-fee` · `decide` · `discount` · `return-fee`
 *
 * 계기 (판마다의 값, 백분율): `line-coverage` · `branch-coverage` · `condition-pairs` · `mutation-score`
 *
 * 입력: `test-count` { value: 사다리 `testCounts` 의 값 }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ArgValue = number | boolean;

export type CodeLine = { no: number; text: string };

export type ConditionSpec =
  | { id: string; text: string; kind: 'compare'; param: string; op: '>=' | '>'; operand: number }
  | { id: string; text: string; kind: 'flag'; param: string };

export type FeeFunction = {
  name: string;
  params: string[];
  lines: CodeLine[];
  init: { line: number; value: number };
  decision: { line: number; combine: 'and' | 'or'; conditions: string[] };
  adjust: { line: number; op: '-' | '+'; amount: number };
  ret: { line: number };
};

export type MutationChange =
  | { kind: 'compare'; condition: string; from: '>=' | '>'; to: '>=' | '>' }
  | { kind: 'combine'; from: 'and' | 'or'; to: 'and' | 'or' }
  | { kind: 'arith'; from: '-' | '+'; to: '-' | '+' }
  | { kind: 'drop-condition'; condition: string };

export type Mutant = { id: string; line: number; text: string; change: MutationChange };

export type CoverageTest = { id: string; args: ArgValue[]; expect: number };

export type BranchCoverageData = {
  type: 'branch-coverage';
  stepMs: number;
  /** 무대 운동 길이(재생 속도 1 에서). 걸음 = stepMs + motionMs */
  motionMs: number;
  fn: FeeFunction;
  conditions: ConditionSpec[];
  tests: CoverageTest[];
  mutants: Mutant[];
  testCounts: number[];
  testCount: number;
};

export type LineKind = 'init' | 'decide' | 'adjust' | 'return';

export type TraceStep = { kind: LineKind; line: number; f: number };

export type RunResult = {
  result: number;
  trace: TraceStep[];
  decision: boolean;
};

type Variant = {
  fn: FeeFunction;
  conditions: ConditionSpec[];
};

function argOf(fn: FeeFunction, args: ArgValue[], param: string): ArgValue {
  const at = fn.params.indexOf(param);
  if (at < 0) throw new Error(`[branchCoverage] 모르는 매개변수: ${param}`);
  const v = args[at];
  if (v === undefined) throw new Error(`[branchCoverage] 인자 없음: ${param}`);
  return v;
}

/** 조건 하나의 값 — 입력이 정한다. */
export function conditionValue(fn: FeeFunction, cond: ConditionSpec, args: ArgValue[]): boolean {
  const v = argOf(fn, args, cond.param);
  switch (cond.kind) {
    case 'compare': {
      if (typeof v !== 'number') throw new Error(`[branchCoverage] ${cond.id}: 수가 아닌 인자`);
      if (cond.op === '>=') return v >= cond.operand;
      if (cond.op === '>') return v > cond.operand;
      throw new Error(`[branchCoverage] ${cond.id}: 모르는 비교`);
    }
    case 'flag': {
      if (typeof v !== 'boolean') throw new Error(`[branchCoverage] ${cond.id}: 참거짓이 아닌 인자`);
      return v;
    }
    default:
      throw new Error('[branchCoverage] 모르는 조건 모양');
  }
}

function findCondition(conditions: ConditionSpec[], id: string): ConditionSpec {
  const c = conditions.find((x) => x.id === id);
  if (!c) throw new Error(`[branchCoverage] 모르는 조건: ${id}`);
  return c;
}

/** 대상 함수의 구조를 그대로 돌린다 — 밟은 줄과 그때의 f. */
function runVariant(v: Variant, args: ArgValue[]): RunResult {
  const { fn } = v;
  if (args.length !== fn.params.length) throw new Error('[branchCoverage] 인자 수가 매개변수와 다르다');
  const trace: TraceStep[] = [];
  let f = fn.init.value;
  trace.push({ kind: 'init', line: fn.init.line, f });
  const values = fn.decision.conditions.map((id) => conditionValue(fn, findCondition(v.conditions, id), args));
  if (values.length === 0) throw new Error('[branchCoverage] 조건 없는 결정');
  let decision: boolean;
  if (fn.decision.combine === 'and') decision = values.every((x) => x);
  else if (fn.decision.combine === 'or') decision = values.some((x) => x);
  else throw new Error('[branchCoverage] 모르는 묶음');
  trace.push({ kind: 'decide', line: fn.decision.line, f });
  if (decision) {
    if (fn.adjust.op === '-') f = f - fn.adjust.amount;
    else if (fn.adjust.op === '+') f = f + fn.adjust.amount;
    else throw new Error('[branchCoverage] 모르는 셈');
    trace.push({ kind: 'adjust', line: fn.adjust.line, f });
  }
  trace.push({ kind: 'return', line: fn.ret.line, f });
  return { result: f, trace, decision };
}

export function runOriginal(data: BranchCoverageData, args: ArgValue[]): RunResult {
  return runVariant({ fn: data.fn, conditions: data.conditions }, args);
}

/** 변이의 바뀜을 대상 구조에 입힌다. 바뀌기 전 모양이 맞지 않으면 던진다. */
export function applyMutation(data: BranchCoverageData, m: Mutant): Variant {
  const fn: FeeFunction = {
    ...data.fn,
    decision: { ...data.fn.decision, conditions: [...data.fn.decision.conditions] },
    adjust: { ...data.fn.adjust },
  };
  let conditions = data.conditions.map((c) => ({ ...c }));
  const ch = m.change;
  switch (ch.kind) {
    case 'compare': {
      const c = findCondition(conditions, ch.condition);
      if (c.kind !== 'compare' || c.op !== ch.from) throw new Error(`[branchCoverage] ${m.id}: 비교 모양이 맞지 않다`);
      conditions = conditions.map((x) => (x.id === c.id && x.kind === 'compare' ? { ...x, op: ch.to } : x));
      break;
    }
    case 'combine': {
      if (fn.decision.combine !== ch.from) throw new Error(`[branchCoverage] ${m.id}: 묶음 모양이 맞지 않다`);
      fn.decision.combine = ch.to;
      break;
    }
    case 'arith': {
      if (fn.adjust.op !== ch.from) throw new Error(`[branchCoverage] ${m.id}: 셈 모양이 맞지 않다`);
      fn.adjust.op = ch.to;
      break;
    }
    case 'drop-condition': {
      if (!fn.decision.conditions.includes(ch.condition)) throw new Error(`[branchCoverage] ${m.id}: 뺄 조건이 없다`);
      fn.decision.conditions = fn.decision.conditions.filter((id) => id !== ch.condition);
      break;
    }
    default:
      throw new Error(`[branchCoverage] ${m.id}: 모르는 바뀜`);
  }
  return { fn, conditions };
}

export function runMutant(data: BranchCoverageData, m: Mutant, args: ArgValue[]): number {
  return runVariant(applyMutation(data, m), args).result;
}

export function percent(x: number, n: number): number {
  if (n <= 0) throw new Error('[branchCoverage] 분모가 0');
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

type Meter = { hit: number; total: number; full: boolean };
export type Meters = { lines: Meter; branches: Meter; pairs: Meter; mutants: Meter };

function meter(hit: number, total: number): Meter {
  return { hit, total, full: hit === total };
}

/** 판 하나의 셈 — 걸음마다의 상태를 차례로 내놓는다. 알고리즘과 검사가 함께 쓴다. */
export type RoundStep =
  | { kind: 'head'; meters: Meters }
  | {
      kind: 'line';
      test: string;
      testIndex: number;
      step: TraceStep;
      decision: boolean | null;
      conditionValues: { id: string; value: boolean }[] | null;
      meters: Meters;
    }
  | {
      kind: 'verdict';
      test: string;
      testIndex: number;
      result: number;
      expect: number;
      killed: string[];
      pairs: { condition: string; pair: [string, string] | null }[];
      meters: Meters;
    };

export function planRound(data: BranchCoverageData, n: number): RoundStep[] {
  if (!Number.isInteger(n) || n < 1 || n > data.tests.length) throw new Error(`[branchCoverage] 시험 수 ${n} 이 범위 밖`);
  const fn = data.fn;
  const counted = new Set([fn.init.line, fn.decision.line, fn.adjust.line, fn.ret.line]);
  const linesTotal = counted.size;
  const pairsTotal = data.conditions.length;
  const mutantsTotal = data.mutants.length;
  const hitLines = new Set<number>();
  const outcomes = new Set<boolean>();
  const pairs = new Map<string, [string, string]>();
  const killed = new Set<string>();
  const ran: { id: string; values: boolean[]; decision: boolean }[] = [];

  const meters = (): Meters => ({
    lines: meter(hitLines.size, linesTotal),
    branches: meter(outcomes.size, 2),
    pairs: meter(pairs.size, pairsTotal),
    mutants: meter(killed.size, mutantsTotal),
  });

  const steps: RoundStep[] = [{ kind: 'head', meters: meters() }];
  for (let ti = 0; ti < n; ti++) {
    const test = data.tests[ti];
    if (!test) throw new Error(`[branchCoverage] 시험 ${ti + 1} 없음`);
    const run = runOriginal(data, test.args);
    const values = data.conditions.map((c) => conditionValue(fn, c, test.args));
    for (const st of run.trace) {
      if (!counted.has(st.line)) throw new Error(`[branchCoverage] 셀 줄이 아닌 ${st.line}`);
      hitLines.add(st.line);
      const isDecide = st.kind === 'decide';
      if (isDecide) outcomes.add(run.decision);
      steps.push({
        kind: 'line',
        test: test.id,
        testIndex: ti,
        step: st,
        decision: isDecide ? run.decision : null,
        conditionValues: isDecide ? data.conditions.map((c, ci) => ({ id: c.id, value: values[ci] === true })) : null,
        meters: meters(),
      });
    }
    if (run.result !== test.expect) {
      throw new Error(`[branchCoverage] 원본이 ${test.id} 에 떨어진다 (${run.result} ≠ ${test.expect})`);
    }
    ran.push({ id: test.id, values, decision: run.decision });
    // 짝 — 이 시험을 뒤 시험으로 하는 짝을 앞 시험 차례로 찾는다
    data.conditions.forEach((c, ci) => {
      if (pairs.has(c.id)) return;
      const cur = ran[ran.length - 1];
      if (!cur) throw new Error('[branchCoverage] 돌린 시험 없음');
      for (let i = 0; i < ran.length - 1; i++) {
        const prev = ran[i];
        if (!prev) throw new Error('[branchCoverage] 돌린 시험 없음');
        const onlyThis = prev.values.every((v, k) => (k === ci ? v !== cur.values[k] : v === cur.values[k]));
        if (onlyThis && prev.decision !== cur.decision) {
          pairs.set(c.id, [prev.id, cur.id]);
          break;
        }
      }
    });
    const nowKilled: string[] = [];
    for (const m of data.mutants) {
      if (killed.has(m.id)) continue; // 앞 시험에 잡힌 변이는 다시 돌리지 않는다
      if (runMutant(data, m, test.args) !== test.expect) nowKilled.push(m.id);
    }
    for (const id of nowKilled) killed.add(id);
    steps.push({
      kind: 'verdict',
      test: test.id,
      testIndex: ti,
      result: run.result,
      expect: test.expect,
      killed: nowKilled,
      pairs: data.conditions.map((c) => ({ condition: c.id, pair: pairs.get(c.id) ?? null })),
      meters: meters(),
    });
  }
  return steps;
}

export async function branchCoverageAlgorithm(ctx: FacetContext<BranchCoverageData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BranchCoverageData>;
  const data = ctx.data;
  if (!data.testCounts.includes(data.testCount)) throw new Error('[branchCoverage] 기본 시험 수가 사다리에 없다');

  // 지금 보이는 계기 값 — 차이만 보낸다 (계기는 누적 채널이다)
  const shown = new Map<string, number>([
    ['line-coverage', 0],
    ['branch-coverage', 0],
    ['condition-pairs', 0],
    ['mutation-score', 0],
  ]);
  const sendMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    if (before === undefined) throw new Error(`[branchCoverage] 선언하지 않은 계기: ${name}`);
    const diff = value - before;
    shown.set(name, value);
    ctx.metric(name, diff);
  };
  const showMeters = (m: Meters): void => {
    sendMetric('line-coverage', percent(m.lines.hit, m.lines.total));
    sendMetric('branch-coverage', percent(m.branches.hit, m.branches.total));
    sendMetric('condition-pairs', percent(m.pairs.hit, m.pairs.total));
    sendMetric('mutation-score', percent(m.mutants.hit, m.mutants.total));
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (n: number): Promise<boolean> => {
    const steps = planRound(data, n);
    let first = true;
    for (const s of steps) {
      if (ctx.cancelled) return false;
      if (!first && !(await rctx.sleep(data.stepMs + data.motionMs))) return false;
      first = false;
      switch (s.kind) {
        case 'head':
          await ctx.emit({
            type: 'round-start',
            payload: {
              testCount: n,
              motionMs: data.motionMs,
              fnName: data.fn.name,
              lines: data.fn.lines.map((l) => ({ no: l.no, text: l.text })),
              decisionLine: data.fn.decision.line,
              conditions: data.conditions.map((c) => ({ id: c.id, text: c.text })),
              tests: data.tests.map((tc, i) => ({ id: tc.id, args: [...tc.args], expect: tc.expect, active: i < n })),
              mutants: data.mutants.map((m) => ({ id: m.id, line: m.line, text: m.text })),
              meters: s.meters,
            },
          });
          break;
        case 'line':
          switch (s.step.kind) {
            case 'init':
              await phase('init-fee');
              break;
            case 'decide':
              await phase('decide');
              break;
            case 'adjust':
              await phase('discount');
              break;
            case 'return':
              await phase('return-fee');
              break;
            default:
              throw new Error('[branchCoverage] 모르는 줄 종류');
          }
          await ctx.emit({
            type: 'step-line',
            payload: {
              test: s.test,
              testIndex: s.testIndex,
              line: s.step.line,
              f: s.step.f,
              decision: s.decision,
              conditionValues: s.conditionValues,
              meters: s.meters,
            },
          });
          break;
        case 'verdict':
          await ctx.emit({
            type: 'verdict',
            payload: {
              test: s.test,
              testIndex: s.testIndex,
              result: s.result,
              expect: s.expect,
              passed: true,
              killed: s.killed,
              pairs: s.pairs,
              meters: s.meters,
            },
          });
          break;
        default:
          throw new Error('[branchCoverage] 모르는 걸음');
      }
      showMeters(s.meters);
    }
    return true;
  };

  try {
    let n = data.testCount;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(n))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'test-count') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.testCounts.includes(value)) continue;
        n = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
