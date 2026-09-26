/**
 * inlining-tradeoff — 컴파일러는 몸 길이의 한계로 붙여 넣을 함수를 고른다.
 *
 * 자료는 세 주소 코드 한 벌(`program`) — 머리줄 `{ k: 'function' }` 뒤에 그 함수의 명령이 온다.
 * 피호출(`main` 이 아닌 함수)을 정의 차례로 보며, 몸 길이(`return` 뺀 명령 수)가 한계 **이하**이면
 * `main` 속 그 함수의 부른 자리를 위 → 아래로 모두 붙인다. 정의는 지우지 않는다.
 *
 * 붙이기 규약 — 매개변수는 인자 이름으로, 몸의 임시는 프로그램에서 가장 큰 임시 번호 다음부터 붙인 차례대로
 * 새로 짓되 `return` 이 돌려주던 임시는 부른 줄의 받는 이름으로. `return` 줄은 옮겨 오지 않는다.
 *
 * 셈 — 크기 = 머리줄 뺀 명령 수 전부(`return` 포함, 정의 넷 모두) · 실행 = `main` 한 번에 밟는 명령 수
 * (`call` 1 + 피호출 몸 전부 · 나머지 줄은 1 씩). 갈래가 없어 구조에서 셈한다.
 * 동률 규칙은 없다 — 한계와 몸 길이가 같으면 "이하" 라 붙인다 (mix 4 ≤ 한계 4, big 8 ≤ 한계 8 에서 걸린다).
 *
 * 판 — 손잡이 값 하나로 원래 프로그램에서 출발해 끝까지: 걸음 0(시작) + 피호출마다 한 걸음 + 셈 한 걸음.
 * 끝나면 `waitForInput` 으로 새 한계를 받아 다시 원래 프로그램에서 선다.
 *
 * 이벤트 (silent 가 아닌 것은 걸음의 내용이고, 걸음 경계는 `ctx.sleep` · `waitForInput` 이다):
 *   - `round-start` { limit, ladder, gaugeMax, scaleMax, defs: DefLine[], mainHeader: string, main: MainLine[], bodies: { name, ops }[],
 *                     size, exec, pasted, mainLen } — 걸음 0, 원래 프로그램
 *   - `judge`       { fn, index, ops, limit, pasted: boolean, sites, siteKeys: string[] (그 함수를 부르던 줄의 key), main: MainLine[],
 *                     size, exec, pastedSites, dSize, dExec, mainLen } — 피호출 하나를 붙이거나 그대로 둔 뒤
 *   - `total`       { size, exec, pasted, mainLen } — 셈 걸음
 *   - `phase`       { phase } — silent: true
 *
 * phase 어휘 (irs.ts 와 같다): `paste` · `call-kept` · `total`
 *
 * 계기 — 걸음마다 그 걸음을 마친 프로그램의 값. 판 머리에서 원래 프로그램의 값으로 되돌린다.
 *   - `code-size`    크기
 *   - `exec-count`   실행
 *   - `pasted-sites` 붙인 자리
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BinOp = '+' | '-' | '*';

export type Instr =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'op'; dst: string; op: BinOp; a: string; b: string }
  | { k: 'call'; dst: string; fn: string; arg: string }
  | { k: 'return'; value: string };

export type InliningTradeoffData = {
  type: 'inlining-tradeoff';
  stepMs: number;
  /** 세 주소 코드 — 머리줄과 명령을 적힌 차례로. `main` 은 부르는 쪽이다 */
  program: Instr[];
  /** 손잡이 사다리 (몸 명령 수) */
  limitLadder: number[];
  /** 첫 판의 한계 — segments 의 default 와 같다 */
  limit: number;
};

type Body = Exclude<Instr, { k: 'function' }>;
type OpInstr = Extract<Instr, { k: 'op' }>;

export type Func = { name: string; param: string; body: Body[] };

/** 정의 칸의 한 줄 — `origin` 은 피호출 번호 */
export type DefLine = { text: string; origin: number; header: boolean };

/**
 * main 칸의 한 줄. `key` 는 판 안에서 줄을 따라가는 이름 — 원래 줄은 `m<j>`, 붙인 줄은 `m<j>.<k>`.
 * `origin` 은 이 줄과 이어진 피호출 번호(부르는 줄 · 붙인 줄, 아니면 −1), `src` 는 붙인 줄이 온 정의 줄 번호(아니면 −1),
 * `site` 는 붙인 줄이 열린 부른 자리의 key (아니면 '').
 */
export type MainLine = {
  key: string;
  text: string;
  kind: 'call' | 'op' | 'return' | 'pasted';
  origin: number;
  src: number;
  site: string;
};

export type JudgeStep = {
  fn: string;
  index: number;
  ops: number;
  pasted: boolean;
  sites: number;
  siteKeys: string[];
  main: MainLine[];
  size: number;
  exec: number;
  pastedSites: number;
  dSize: number;
  dExec: number;
};

export type InlinePlan = {
  callees: Func[];
  mainFunc: Func;
  mainHeader: string;
  defs: DefLine[];
  start: { main: MainLine[]; size: number; exec: number };
  steps: JudgeStep[];
  total: { size: number; exec: number; pasted: number; mainLen: number };
};

// ───────────────────────────────────────────── 찍개 (stage 도 이것을 쓴다)

export function showInstr(ins: Instr): string {
  switch (ins.k) {
    case 'function':
      return `function ${ins.name}(${ins.params.join(', ')})`;
    case 'op':
      return `${ins.dst} = ${ins.a} ${ins.op} ${ins.b}`;
    case 'call':
      return `${ins.dst} = call ${ins.fn}(${ins.arg})`;
    case 'return':
      return `return ${ins.value}`;
    default:
      throw new Error(`inlining-tradeoff: 모르는 명령 ${JSON.stringify(ins)}`);
  }
}

// ───────────────────────────────────────────── 구조 읽기

/** 프로그램을 함수들로 가른다. 머리줄로 시작하지 않거나 몸이 비면 던진다. */
export function splitFunctions(program: readonly Instr[]): { funcs: Func[]; headers: string[] } {
  const funcs: Func[] = [];
  const headers: string[] = [];
  for (const ins of program) {
    if (ins.k === 'function') {
      funcs.push({ name: ins.name, param: ins.params.join(', '), body: [] });
      headers.push(showInstr(ins));
      continue;
    }
    const cur = funcs[funcs.length - 1];
    if (cur === undefined) throw new Error('inlining-tradeoff: 머리줄 앞에 명령이 있다');
    cur.body.push(ins);
  }
  for (const f of funcs) {
    const last = f.body[f.body.length - 1];
    if (last === undefined || last.k !== 'return') throw new Error(`inlining-tradeoff: ${f.name} 이 return 으로 끝나지 않는다`);
    if (f.body.slice(0, -1).some((b) => b.k === 'return')) throw new Error(`inlining-tradeoff: ${f.name} 의 return 이 끝이 아니다`);
  }
  return { funcs, headers };
}

function tempNumber(name: string): number {
  const m = /^t(\d+)$/.exec(name);
  if (m === null) throw new Error(`inlining-tradeoff: 임시 이름이 아니다 ${name}`);
  return Number(m[1]);
}

/** 명령 하나의 실행 값 — 부르기는 1 + 피호출 몸 전부 */
function execOf(ins: Body, bodyLen: ReadonlyMap<string, number>): number {
  if (ins.k !== 'call') return 1;
  const n = bodyLen.get(ins.fn);
  if (n === undefined) throw new Error(`inlining-tradeoff: 모르는 함수를 부른다 ${ins.fn}`);
  return 1 + n;
}

/** 크기 · 실행 — 구조에서 셈한다 */
export function programCostOf(callees: readonly Func[], main: readonly Body[]): { size: number; exec: number } {
  const bodyLen = new Map(callees.map((f) => [f.name, f.body.length] as const));
  let size = main.length;
  for (const f of callees) size += f.body.length;
  let exec = 0;
  for (const ins of main) exec += execOf(ins, bodyLen);
  return { size, exec };
}

/** IR `programCost` 의 입력 — 부르는 쪽이 번호 배열로 바꿔 건넨다 */
export function costInputs(program: readonly Instr[]): { bodyLen: number[]; siteCallee: number[]; mainLen: number } {
  const { funcs } = splitFunctions(program);
  const mainFunc = funcs.find((f) => f.name === 'main');
  if (mainFunc === undefined) throw new Error('inlining-tradeoff: main 이 없다');
  const callees = funcs.filter((f) => f !== mainFunc);
  const siteCallee = mainFunc.body.map((ins) => {
    if (ins.k !== 'call') return -1;
    const i = callees.findIndex((f) => f.name === ins.fn);
    if (i < 0) throw new Error(`inlining-tradeoff: 모르는 함수를 부른다 ${ins.fn}`);
    return i;
  });
  return { bodyLen: callees.map((f) => f.body.length), siteCallee, mainLen: mainFunc.body.length };
}

// ───────────────────────────────────────────── 한 판의 계획

/** 한계 하나로 한 판을 끝까지 셈한다 — 걸음마다 main 줄 · 크기 · 실행 */
export function planInlining(program: readonly Instr[], limit: number): InlinePlan {
  const { funcs, headers } = splitFunctions(program);
  const mainIdx = funcs.findIndex((f) => f.name === 'main');
  if (mainIdx < 0) throw new Error('inlining-tradeoff: main 이 없다');
  const mainFunc = funcs[mainIdx]!;
  const mainHeader = headers[mainIdx]!;
  const callees = funcs.filter((_, i) => i !== mainIdx);

  // 정의 칸 — 피호출을 정의 차례로
  const defs: DefLine[] = [];
  const defLineOf: number[][] = [];
  callees.forEach((f, fi) => {
    if (f.body.some((b) => b.k === 'call')) throw new Error(`inlining-tradeoff: 피호출 ${f.name} 이 다른 함수를 부른다`);
    if (f.param.includes(',')) throw new Error(`inlining-tradeoff: 피호출 ${f.name} 의 매개변수가 하나가 아니다`);
    defs.push({ text: headers[funcs.indexOf(f)]!, origin: fi, header: true });
    const rows: number[] = [];
    for (const b of f.body) {
      rows.push(defs.length);
      defs.push({ text: showInstr(b), origin: fi, header: false });
    }
    defLineOf.push(rows);
  });

  // 새 임시는 프로그램 전체에서 가장 큰 번호 다음부터
  let nextTemp = 1;
  for (const f of funcs) for (const b of f.body) if (b.k !== 'return') nextTemp = Math.max(nextTemp, tempNumber(b.dst) + 1);

  type Row = { ins: Body; line: MainLine };
  const calleeIndex = (name: string): number => {
    const i = callees.findIndex((f) => f.name === name);
    if (i < 0) throw new Error(`inlining-tradeoff: 모르는 함수를 부른다 ${name}`);
    return i;
  };
  let rows: Row[] = mainFunc.body.map((ins, j) => ({
    ins,
    line: {
      key: `m${j}`,
      text: showInstr(ins),
      kind: ins.k === 'call' ? 'call' : ins.k,
      origin: ins.k === 'call' ? calleeIndex(ins.fn) : -1,
      src: -1,
      site: '',
    },
  }));
  const costNow = (): { size: number; exec: number } => programCostOf(callees, rows.map((r) => r.ins));
  const start = { main: rows.map((r) => r.line), ...costNow() };

  const steps: JudgeStep[] = [];
  let pastedSites = 0;
  let prev = { size: start.size, exec: start.exec };
  callees.forEach((f, fi) => {
    const ops = f.body.length - 1;
    const pasted = ops <= limit;
    const siteKeys = rows.filter((r) => r.ins.k === 'call' && r.ins.fn === f.name).map((r) => r.line.key);
    const sites = siteKeys.length;
    if (pasted) {
      const retTmp = (f.body[f.body.length - 1] as Extract<Body, { k: 'return' }>).value;
      const next: Row[] = [];
      for (const r of rows) {
        const call = r.ins;
        if (call.k !== 'call' || call.fn !== f.name) {
          next.push(r);
          continue;
        }
        const ren = new Map<string, string>([[f.param, call.arg]]);
        const bodyOps = f.body.slice(0, -1) as OpInstr[];
        for (const b of bodyOps) {
          if (b.k !== 'op') throw new Error(`inlining-tradeoff: ${f.name} 몸에 모르는 명령`);
          ren.set(b.dst, b.dst === retTmp ? call.dst : `t${nextTemp++}`);
        }
        const operand = (x: string): string => {
          if (/^-?\d+$/.test(x)) return x;
          const y = ren.get(x);
          if (y === undefined) throw new Error(`inlining-tradeoff: ${f.name} 몸의 모르는 이름 ${x}`);
          return y;
        };
        bodyOps.forEach((b, k) => {
          const ins: OpInstr = { k: 'op', dst: ren.get(b.dst)!, op: b.op, a: operand(b.a), b: operand(b.b) };
          next.push({
            ins,
            line: {
              key: `${r.line.key}.${k}`,
              text: showInstr(ins),
              kind: 'pasted',
              origin: fi,
              src: defLineOf[fi]![k]!,
              site: r.line.key,
            },
          });
        });
      }
      rows = next;
      pastedSites += sites;
    }
    const cost = costNow();
    steps.push({
      fn: f.name,
      index: fi,
      ops,
      pasted,
      sites,
      siteKeys,
      main: rows.map((r) => r.line),
      size: cost.size,
      exec: cost.exec,
      pastedSites,
      dSize: cost.size - prev.size,
      dExec: cost.exec - prev.exec,
    });
    prev = cost;
  });

  return {
    callees,
    mainFunc,
    mainHeader,
    defs,
    start,
    steps,
    total: { size: prev.size, exec: prev.exec, pasted: pastedSites, mainLen: rows.length },
  };
}

// ───────────────────────────────────────────── 알고리즘

type MetricName = 'code-size' | 'exec-count' | 'pasted-sites';

export async function inliningTradeoffAlgorithm(ctx0: FacetContext<InliningTradeoffData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<InliningTradeoffData>;
  const data = ctx.data;
  if (!data.limitLadder.includes(data.limit)) throw new Error('inlining-tradeoff: 첫 한계가 사다리에 없다');

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다
  // 계기의 선언 initial 이 0 이라 처음 보이는 값은 0 이다
  const shown: Record<MetricName, number> = { 'code-size': 0, 'exec-count': 0, 'pasted-sites': 0 };
  const sent = new Set<MetricName>();
  const showMetric = (name: MetricName, val: number): void => {
    if (!sent.has(name) || shown[name] !== val) ctx.metric(name, val - shown[name]);
    sent.add(name);
    shown[name] = val;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 저울눈의 끝 — 사다리 전부에서 가장 큰 값. 판마다 눈금이 바뀌지 않게 한 번 셈한다
  const plans = data.limitLadder.map((l) => planInlining(data.program, l));
  const scaleMax = Math.max(...plans.map((p) => Math.max(p.start.size, p.start.exec, ...p.steps.map((s) => Math.max(s.size, s.exec)))));
  const gaugeMax = Math.max(...data.limitLadder, ...plans[0]!.callees.map((f) => f.body.length - 1));

  const playRound = async (limit: number): Promise<boolean> => {
    const plan = planInlining(data.program, limit);
    // 걸음 0 — 원래 프로그램
    await ctx.emit({
      type: 'round-start',
      payload: {
        limit,
        ladder: data.limitLadder,
        gaugeMax,
        scaleMax,
        defs: plan.defs,
        mainHeader: plan.mainHeader,
        main: plan.start.main,
        bodies: plan.callees.map((f) => ({ name: f.name, ops: f.body.length - 1 })),
        size: plan.start.size,
        exec: plan.start.exec,
        pasted: 0,
        mainLen: plan.start.main.length,
      },
    });
    showMetric('code-size', plan.start.size);
    showMetric('exec-count', plan.start.exec);
    showMetric('pasted-sites', 0);
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 피호출마다 한 걸음
    for (const s of plan.steps) {
      if (ctx.cancelled) return false;
      if (s.pasted) await phase('paste');
      else await phase('call-kept');
      await ctx.emit({
        type: 'judge',
        payload: {
          fn: s.fn,
          index: s.index,
          ops: s.ops,
          limit,
          pasted: s.pasted,
          sites: s.sites,
          siteKeys: s.siteKeys,
          main: s.main,
          size: s.size,
          exec: s.exec,
          pastedSites: s.pastedSites,
          dSize: s.dSize,
          dExec: s.dExec,
          mainLen: s.main.length,
        },
      });
      showMetric('code-size', s.size);
      showMetric('exec-count', s.exec);
      showMetric('pasted-sites', s.pastedSites);
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    // 셈 걸음 — 뒤는 입력 대기가 걸음 경계다
    await phase('total');
    await ctx.emit({ type: 'total', payload: { ...plan.total } });
    showMetric('code-size', plan.total.size);
    showMetric('exec-count', plan.total.exec);
    showMetric('pasted-sites', plan.total.pasted);
    return true;
  };

  let limit = data.limit;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(limit))) return;
      // 새 한계를 기다린다 — 우리 것이 아닌 입력 · 사다리 밖의 값은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'limit') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !data.limitLadder.includes(v)) continue;
        limit = v;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
