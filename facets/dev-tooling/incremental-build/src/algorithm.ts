/**
 * incremental-build — 증분 빌드가 얼마나 덜 하는가는 "바뀌었는지를 무엇으로 아느냐" 가 정한다.
 *
 * 규칙(대상 ← 입력들, 적힌 차례)과 지난 빌드의 시각 · 지문이 있다. 소스 하나(`edited`)를 고쳐 저장한 뒤
 * 대상을 하나씩 들여다보며 판정 방식(policy)대로 다시 세울지 가른다.
 *
 * 규약
 * - 규칙이 있는 이름이 대상, 규칙이 없는 입력이 소스. 규칙에도 소스에도 없는 입력 이름은 던진다.
 * - 들여다보는 차례: 대상 입력이 모두 앞에 오는 차례 가운데 규칙의 데이터 차례가 앞선 것.
 *   **동률은 데이터 차례가 깬다** — 이 데이터에서는 lex.o · parse.o · emit.o 셋이 처음에 함께 준비되어
 *   데이터 차례대로 lex.o 가 먼저 뽑힌다. 들여다볼 대상을 못 고르면(고리) 던진다.
 * - 판정 0 시각: 입력 가운데 대상보다 **늦은**(>) 것이 있으면 다시. 같으면 그대로.
 * - 판정 1 입력 지문: 소스 입력은 지금 지문과 지난 지문을 견주고, 대상 입력은 이번에 다시 세워졌으면 바뀜.
 * - 판정 2 출력 지문: 1 과 같되, 다시 세운 대상의 결과 지문이 지난번과 같으면 위로 "바뀜" 을 넘기지 않는다(hold).
 * - 다시 세운 대상은 셋 모두 새 시각(저장 시각에서 시작해 세울 때마다 `buildMinutes` 만큼 간 시계)과
 *   새 결과 지문을 받는다.
 * - 지문 = FNV-1a 32 비트(UTF-8 바이트, 처음 값 0x811c9dc5, 곱 0x01000193) 소문자 16진 여덟 자.
 *   셈 · 견주기는 여덟 자, 화면은 앞 여섯 자. 소스 지문 = FNV(줄들을 `\n` 으로 이은 것).
 *   장난감 번역: 결과 지문 = FNV(대상 이름 + `|` + 주석 줄(앞 빈칸을 떼고 `//` 로 시작)을 뺀 입력 내용을
 *   입력 차례대로 `\n` 으로 이은 것). 대상 입력의 내용은 그 결과 지문 여덟 자 한 줄.
 * - "오른 끝"(reach): 바뀜이 지금 어디까지 올라왔는가. 저장한 소스에서 시작해 다시 세워 바뀜을 넘긴
 *   대상으로 옮겨 가고, 그 위 대상이 그대로 남거나(keep) 결과가 같아 멈추면(hold) 거기서 막힌다.
 *   위에 기대는 대상이 없는 자리까지 오르면 꼭대기다. 이 데이터에서는 고치는 소스가 하나라 한 사슬이다.
 *
 * 이벤트 (걸음 경계는 `ctx.sleep` 과 입력 대기뿐)
 * - `init` — 걸음 0. payload `{ policy: 'time'|'input-hash'|'output-hash', change: 'resave'|'comment'|'code',
 *     edited: string, lines: string[], commentLines: number[],
 *     sources: { name, time, fp }[], targets: { name, inputs: string[], depth: number, time, out }[] }`
 *     (시각은 'HH:MM', 지문은 앞 여섯 자)
 * - `save` — 걸음 1. payload `{ name, timeBefore, timeAfter, fpBefore, fpAfter, same: boolean,
 *     lines: string[], changedLines: number[], commentLines: number[] }`
 * - `verdict` — 걸음 2 부터 대상마다. payload `{ name, verdict: 'keep'|'rebuild'|'hold',
 *     cause: null | { kind: 'time', input, inputTime, targetTime } | { kind: 'hash', input, before, after }
 *            | { kind: 'rebuilt', input } | { kind: 'result', input },
 *     timeBefore, timeAfter, outBefore, outAfter, outSame: boolean | null }`
 *     (keep 이면 cause · outSame 이 null 이고 After 는 Before 와 같다)
 * - `reach` — payload `{ at: string, state: 'rising'|'blocked'|'top' }`
 * - `phase` — silent. payload `{ phase: 'keep'|'rebuild'|'hold' }`
 *
 * phase 어휘: `keep` · `rebuild` · `hold` (irs.ts 와 같은 집합). 걸음 0 · 1 은 IR 밖이라 phase 가 없다.
 *
 * 계기 (회차마다, 판 머리에서 0 으로): `rebuilt` 다시 세운 대상 수(hold 포함) · `kept` 그대로 둔 대상 수.
 *
 * 손잡이: `policy` (0 시각 · 1 입력 지문 · 2 출력 지문) · `change` (0 그대로 저장 · 1 주석만 · 2 코드).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IncrementalBuildRule = { target: string; inputs: string[]; builtAt: string };
export type IncrementalBuildSource = { name: string; lines: string[]; savedAt: string };

export type IncrementalBuildData = {
  type: 'incremental-build';
  stepMs: number;
  rules: IncrementalBuildRule[];
  sources: IncrementalBuildSource[];
  /** 고치는 소스 이름 */
  edited: string;
  /** 저장 시각 'HH:MM' */
  saveAt: string;
  /** 대상 하나를 세우는 데 드는 분 */
  buildMinutes: number;
  /** 판정 방식 식별자 — 손잡이 순번 0.. */
  policies: string[];
  /** 고친 모양 — 손잡이 순번 0.. 마다 `edited` 의 새 내용 */
  changes: { id: string; lines: string[] }[];
  /** 손잡이 사다리 (segments[].value 와 같다) */
  policyLadder: number[];
  changeLadder: number[];
  /** 손잡이 기본값 (segments 의 default 와 같다) */
  policy: number;
  change: number;
};

export type Verdict = 'keep' | 'rebuild' | 'hold';
export type Cause =
  | { kind: 'time'; input: string; inputTime: string; targetTime: string }
  | { kind: 'hash'; input: string; before: string; after: string }
  | { kind: 'rebuilt'; input: string }
  | { kind: 'result'; input: string };

export type PlanStep = {
  name: string;
  verdict: Verdict;
  cause: Cause | null;
  timeBefore: string;
  timeAfter: string;
  outBefore: string;
  outAfter: string;
  outSame: boolean | null;
};

export type IncrementalBuildPlan = {
  policy: string;
  change: string;
  order: string[];
  steps: PlanStep[];
  rebuilt: number;
  kept: number;
  /** 소스 지문 (여덟 자) — 지난 · 지금 */
  srcFpOld: Record<string, string>;
  srcFpNew: Record<string, string>;
  /** 대상 결과 지문 (여덟 자) — 지난번 · 소스 전부를 새로 세운 것 */
  outOld: Record<string, string>;
  outFresh: Record<string, string>;
  /** 대상 시각 (분) — 지난 · 이 판이 끝난 뒤 */
  timeOld: Record<string, number>;
  timeNew: Record<string, number>;
  /** 대상 깊이 — 소스에서 가장 긴 사슬의 길이 */
  depth: Record<string, number>;
};

/** FNV-1a 32 비트 — UTF-8 바이트 위, 소문자 16진 여덟 자. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const six = (fp: string): string => fp.slice(0, 6);

export function toMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`incremental-build: 시각 글자가 HH:MM 이 아니다: '${hhmm}'`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function toClock(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new Error(`incremental-build: 하루 안의 분이 아니다: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const isComment = (line: string): boolean => line.trimStart().startsWith('//');

/** 들여다보는 차례 — 입력이 모두 선 대상 가운데 데이터 차례가 앞선 것. 고리면 던진다. */
export function visitOrder(rules: IncrementalBuildRule[]): string[] {
  const targets = new Set(rules.map((r) => r.target));
  const done = new Set<string>();
  const order: string[] = [];
  while (order.length < rules.length) {
    const pick = rules.find(
      (r) => !done.has(r.target) && r.inputs.every((i) => done.has(i) || !targets.has(i)),
    );
    if (!pick) throw new Error('incremental-build: 들여다볼 대상을 고를 수 없다 — 규칙에 고리가 있다');
    done.add(pick.target);
    order.push(pick.target);
  }
  return order;
}

function lookupRule(rules: IncrementalBuildRule[], name: string): IncrementalBuildRule {
  const r = rules.find((x) => x.target === name);
  if (!r) throw new Error(`incremental-build: 규칙이 없는 대상 '${name}'`);
  return r;
}

function valueOf<T>(map: Record<string, T>, name: string, what: string): T {
  if (!(name in map)) throw new Error(`incremental-build: ${what} 에 '${name}' 이름이 없다`);
  return map[name] as T;
}

/** 장난감 번역 — 주석 줄을 뺀 입력 내용을 이어 대상 이름과 함께 지문을 셈한다. */
function compile(
  rule: IncrementalBuildRule,
  src: Record<string, string[]>,
  out: Record<string, string>,
): string {
  const body: string[] = [];
  for (const i of rule.inputs) {
    const lines = i in src ? valueOf(src, i, '소스') : [valueOf(out, i, '결과 지문')];
    for (const l of lines) if (!isComment(l)) body.push(l);
  }
  return fnv1a(`${rule.target}|${body.join('\n')}`);
}

function buildAll(rules: IncrementalBuildRule[], order: string[], src: Record<string, string[]>) {
  const out: Record<string, string> = {};
  for (const t of order) out[t] = compile(lookupRule(rules, t), src, out);
  return out;
}

export function validateData(data: IncrementalBuildData): void {
  const srcNames = new Set(data.sources.map((s) => s.name));
  const targets = new Set(data.rules.map((r) => r.target));
  for (const r of data.rules) {
    if (r.inputs.length === 0) throw new Error(`incremental-build: 대상 '${r.target}' 의 입력이 비었다`);
    if (srcNames.has(r.target)) throw new Error(`incremental-build: '${r.target}' 이 소스이자 대상이다`);
    for (const i of r.inputs) {
      if (!srcNames.has(i) && !targets.has(i)) {
        throw new Error(`incremental-build: 모르는 입력 이름 '${i}' (대상 ${r.target})`);
      }
    }
  }
  if (!srcNames.has(data.edited)) throw new Error(`incremental-build: 고치는 파일 '${data.edited}' 이 소스에 없다`);
  if (data.policies.length !== data.policyLadder.length) throw new Error('incremental-build: 판정 방식 목록과 사다리 길이가 다르다');
  if (data.changes.length !== data.changeLadder.length) throw new Error('incremental-build: 고친 모양 목록과 사다리 길이가 다르다');
  if (!Number.isInteger(data.buildMinutes) || data.buildMinutes <= 0) throw new Error('incremental-build: buildMinutes 는 양의 정수');
}

/** 한 판의 셈 — 판정 방식 · 고친 모양 순번을 받아 대상마다 판정과 새 값을 낸다. */
export function incrementalBuildPlan(
  data: IncrementalBuildData,
  policyIndex: number,
  changeIndex: number,
): IncrementalBuildPlan {
  validateData(data);
  const policy = data.policies[policyIndex];
  const change = data.changes[changeIndex];
  if (policy === undefined) throw new Error(`incremental-build: 판정 방식 순번 ${policyIndex} 이 없다`);
  if (change === undefined) throw new Error(`incremental-build: 고친 모양 순번 ${changeIndex} 이 없다`);
  if (policyIndex > 2) throw new Error(`incremental-build: 판정 방식 ${policy} 을 셈할 줄 모른다`);

  const order = visitOrder(data.rules);
  const oldSrc: Record<string, string[]> = {};
  for (const s of data.sources) oldSrc[s.name] = [...s.lines];
  const newSrc: Record<string, string[]> = { ...oldSrc, [data.edited]: [...change.lines] };

  const outOld = buildAll(data.rules, order, oldSrc);
  const outFresh = buildAll(data.rules, order, newSrc);
  const srcFpOld: Record<string, string> = {};
  const srcFpNew: Record<string, string> = {};
  for (const s of data.sources) {
    srcFpOld[s.name] = fnv1a(valueOf(oldSrc, s.name, '소스').join('\n'));
    srcFpNew[s.name] = fnv1a(valueOf(newSrc, s.name, '소스').join('\n'));
  }

  const time: Record<string, number> = {};
  for (const s of data.sources) time[s.name] = toMinutes(s.savedAt);
  for (const r of data.rules) time[r.target] = toMinutes(r.builtAt);
  const timeOld: Record<string, number> = {};
  for (const r of data.rules) timeOld[r.target] = valueOf(time, r.target, '시각');
  const saveClock = toMinutes(data.saveAt);
  time[data.edited] = saveClock;
  let clock = saveClock;

  const marked: Record<string, boolean> = {};
  for (const s of data.sources) marked[s.name] = srcFpOld[s.name] !== srcFpNew[s.name];

  const depth: Record<string, number> = {};
  for (const t of order) {
    const r = lookupRule(data.rules, t);
    depth[t] = 1 + Math.max(0, ...r.inputs.map((i) => (i in depth ? valueOf(depth, i, '깊이') : 0)));
  }

  const out: Record<string, string> = { ...outOld };
  const steps: PlanStep[] = [];
  let rebuilt = 0;
  let kept = 0;
  for (const t of order) {
    const r = lookupRule(data.rules, t);
    const tTime = valueOf(time, t, '시각');
    let cause: Cause | null = null;
    for (const i of r.inputs) {
      const isSource = i in oldSrc;
      if (policyIndex === 0) {
        const iTime = valueOf(time, i, '시각');
        if (iTime > tTime) {
          cause = { kind: 'time', input: i, inputTime: toClock(iTime), targetTime: toClock(tTime) };
          break;
        }
      } else if (valueOf(marked, i, '바뀜')) {
        cause = isSource
          ? { kind: 'hash', input: i, before: six(valueOf(srcFpOld, i, '지문')), after: six(valueOf(srcFpNew, i, '지문')) }
          : policyIndex === 2
            ? { kind: 'result', input: i }
            : { kind: 'rebuilt', input: i };
        break;
      }
    }
    const outBefore = valueOf(outOld, t, '결과 지문');
    if (cause === null) {
      kept += 1;
      marked[t] = false;
      steps.push({
        name: t, verdict: 'keep', cause: null,
        timeBefore: toClock(tTime), timeAfter: toClock(tTime),
        outBefore: six(outBefore), outAfter: six(outBefore), outSame: null,
      });
      continue;
    }
    rebuilt += 1;
    clock += data.buildMinutes;
    time[t] = clock;
    const fresh = compile(r, newSrc, out);
    if (fresh !== valueOf(outFresh, t, '새 결과 지문')) {
      throw new Error(`incremental-build: 다시 세운 ${t} 가 소스 전부를 새로 세운 결과와 다르다`);
    }
    out[t] = fresh;
    const same = fresh === outBefore;
    const held = policyIndex === 2 && same;
    marked[t] = !held;
    steps.push({
      name: t, verdict: held ? 'hold' : 'rebuild', cause,
      timeBefore: toClock(tTime), timeAfter: toClock(clock),
      outBefore: six(outBefore), outAfter: six(fresh), outSame: same,
    });
  }
  const timeNew: Record<string, number> = {};
  for (const r of data.rules) timeNew[r.target] = valueOf(time, r.target, '시각');
  return {
    policy, change: change.id, order, steps, rebuilt, kept,
    srcFpOld, srcFpNew, outOld, outFresh, timeOld, timeNew, depth,
  };
}

function readKnob(input: { type: string; payload?: unknown }, ladder: number[]): number | null {
  const p = input.payload;
  if (typeof p !== 'object' || p === null || !('value' in p)) return null;
  const v = (p as { value: unknown }).value;
  if (typeof v !== 'number' || !ladder.includes(v)) return null;
  return v;
}

export async function incrementalBuildAlgorithm(ctx0: FacetContext<IncrementalBuildData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<IncrementalBuildData>;
  const data = ctx.data;
  validateData(data);
  if (!data.policyLadder.includes(data.policy)) throw new Error('incremental-build: 기본 판정 방식이 사다리에 없다');
  if (!data.changeLadder.includes(data.change)) throw new Error('incremental-build: 기본 고친 모양이 사다리에 없다');
  let policyIndex = data.policy;
  let changeIndex = data.change;

  const shown = { rebuilt: 0, kept: 0 };
  const showRebuilt = (v: number) => {
    ctx.metric('rebuilt', v - shown.rebuilt);
    shown.rebuilt = v;
  };
  const showKept = (v: number) => {
    ctx.metric('kept', v - shown.kept);
    shown.kept = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(data.stepMs);

  const playRun = async (): Promise<boolean> => {
    const plan = incrementalBuildPlan(data, policyIndex, changeIndex);
    const editedSrc = data.sources.find((s) => s.name === data.edited);
    if (!editedSrc) throw new Error(`incremental-build: 고치는 파일 '${data.edited}' 이 없다`);
    const newLines = data.changes[changeIndex]?.lines;
    if (!newLines) throw new Error(`incremental-build: 고친 모양 ${changeIndex} 이 없다`);
    const commentOf = (lines: string[]) => lines.flatMap((l, i) => (isComment(l) ? [i] : []));

    // 걸음 0 — 처음
    showRebuilt(0);
    showKept(0);
    await ctx.emit({
      type: 'init',
      payload: {
        policy: plan.policy,
        change: plan.change,
        edited: data.edited,
        lines: [...editedSrc.lines],
        commentLines: commentOf(editedSrc.lines),
        sources: data.sources.map((s) => ({
          name: s.name, time: s.savedAt, fp: six(valueOf(plan.srcFpOld, s.name, '지문')),
        })),
        targets: data.rules.map((r) => ({
          name: r.target,
          inputs: [...r.inputs],
          depth: valueOf(plan.depth, r.target, '깊이'),
          time: r.builtAt,
          out: six(valueOf(plan.outOld, r.target, '결과 지문')),
        })),
      },
    });
    if (!(await pause())) return false;

    // 걸음 1 — 저장
    if (ctx.cancelled) return false;
    const fpBefore = valueOf(plan.srcFpOld, data.edited, '지문');
    const fpAfter = valueOf(plan.srcFpNew, data.edited, '지문');
    await ctx.emit({
      type: 'save',
      payload: {
        name: data.edited,
        timeBefore: editedSrc.savedAt,
        timeAfter: data.saveAt,
        fpBefore: six(fpBefore),
        fpAfter: six(fpAfter),
        same: fpBefore === fpAfter,
        lines: [...newLines],
        changedLines: newLines.flatMap((l, i) => (editedSrc.lines[i] === l ? [] : [i])),
        commentLines: commentOf(newLines),
      },
    });
    await ctx.emit({ type: 'reach', payload: { at: data.edited, state: 'rising' } });
    let reachAt = data.edited;
    let reachBlocked = false;
    if (!(await pause())) return false;

    // 걸음 2.. — 대상 하나씩
    let rebuilt = 0;
    let kept = 0;
    for (const step of plan.steps) {
      if (ctx.cancelled) return false;
      await ctx.emit({ type: 'verdict', payload: { ...step } });
      const rule = lookupRule(data.rules, step.name);
      if (step.verdict === 'keep') {
        kept += 1;
        showKept(kept);
        if (!reachBlocked && rule.inputs.includes(reachAt)) {
          reachBlocked = true;
          await ctx.emit({ type: 'reach', payload: { at: reachAt, state: 'blocked' } });
        }
        await phase('keep');
      } else {
        rebuilt += 1;
        showRebuilt(rebuilt);
        await phase('rebuild');
        reachAt = step.name;
        const hasAbove = data.rules.some((r) => r.inputs.includes(step.name));
        if (step.verdict === 'hold') {
          reachBlocked = true;
          await ctx.emit({ type: 'reach', payload: { at: reachAt, state: 'blocked' } });
          await phase('hold');
        } else {
          await ctx.emit({ type: 'reach', payload: { at: reachAt, state: hasAbove ? 'rising' : 'top' } });
        }
      }
      if (!(await pause())) return false;
    }
    if (rebuilt !== plan.rebuilt || kept !== plan.kept) {
      throw new Error('incremental-build: 걸음에서 센 수가 셈과 다르다');
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'policy') {
          const v = readKnob(input, data.policyLadder);
          if (v === null) continue;
          policyIndex = v;
          break;
        }
        if (input.type === 'change') {
          const v = readKnob(input, data.changeLadder);
          if (v === null) continue;
          changeIndex = v;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
