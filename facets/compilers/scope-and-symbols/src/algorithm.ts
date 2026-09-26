/**
 * 스코프와 심볼 테이블 — 이름 해석기가 글을 위에서 아래로 한 번 읽으며 표를 얹고 걷고,
 * 이름이 쓰이는 자리마다 쌓인 표를 맨 위부터 훑어 선언을 찾는다. 손잡이(스코프 규칙)는
 * **선언이 드는 표** 하나를 바꾼다 — 블록마다 · 함수마다 · 하나뿐.
 *
 * 1차 데이터는 원시 프로그램의 줄 구조(`lines`)다. 스코프 · 선언 · 쓰임은 이 구조에서 셈하고
 * (`analyzeProgram`), 화면 글자도 구조에서 찍어 낸다(`formatStmt` — 데이터의 `text` 와 한 글자라도
 * 다르면 던진다). 값을 셈하지 않고, 반복을 되풀이하지 않고, 부르기를 따라 몸으로 뛰지 않는다 —
 * 함수 몸은 글에 있는 자리에서 읽는다.
 *
 * 줄 하나의 차례: ① 몸을 벗어난 표를 걷는다 ② 쓰임을 글자 차례로 찾는다(맨 위 표부터 아래로,
 * 처음 만난 것) ③ 그 줄의 선언을 규칙이 고른 표에 적는다 — 그 표에 같은 이름이 있으면 두 번
 * 선언(걸림, 적지 않고 앞 선언이 남는다) ④ 머리줄이면 규칙에 따라 새 표를 얹고 인자 · `for`
 * 변수가 함께 든다.
 *
 * ── 이벤트 ─────────────────────────────────────────────────────────────
 *   round  (걸음 0, 회차 머리)
 *     payload: { round: number, rule: number, ruleId: string,
 *                lines: { no: number, indent: number, text: string,
 *                         tokens: { start: number, len: number, kind: 'decl' | 'use', ref: number }[] }[],
 *                scopes: { id: number, kind: number, headName: string }[],
 *                names: string[],
 *                decls: { name: string, nameId: number, line: number }[],
 *                uses:  { name: string, nameId: number, line: number }[],
 *                stack: { scope: number, entries: number[] }[],
 *                meters: { made: number, links: number, errors: number } }
 *   line   (걸음 1..줄 수, 줄마다 하나)
 *     payload: { step: number, line: number, last: boolean, phase: string,
 *                ops: ( { k: 'pop', scope: number }
 *                     | { k: 'lookup', use: number, found: boolean, decl: number, scanned: number }
 *                     | { k: 'declare', decl: number, table: number, accepted: boolean, clash: number }
 *                     | { k: 'push', scope: number, height: number } )[],
 *                stack: { scope: number, entries: number[] }[],
 *                meters: { made: number, links: number, errors: number } }
 *       lookup.decl 은 찾지 못하면 -1, scanned 는 훑은 표 수(찾았으면 그 표가 위에서 몇 장째인가)
 *       declare.clash 는 두 번 선언일 때 표에 이미 있던 선언 번호, 아니면 -1
 *   phase  (silent) payload: { phase: string }
 *
 * ── phase 어휘 (irs.ts 와 같다) ──────────────────────────────────────────
 *   place    선언을 표에 적는 줄 (선언이 있고 걸림이 없다)
 *   reject   두 번 선언이 있는 줄 (선언 없는 쓰임은 없다)
 *   found    쓰임만 있고 모두 찾은 줄
 *   missing  선언 없는 쓰임이 있는 줄
 *   걸음마다 phase 하나 — missing > reject > place > found 의 차례로 고른다. 걸음 0 은 phase 가 없다.
 *
 * ── 계기 (누적 채널, 차이만 보낸다) ─────────────────────────────────────────
 *   tables-made   만든 표 (맨 바깥 포함)
 *   links         이은 선 (찾은 쓰임)
 *   scope-errors  걸림 (두 번 선언 + 선언 없음)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ── 1차 데이터 ─────────────────────────────────────────────────────────

export type Expr =
  | { int: number }
  | { float: number }
  | { var: string }
  | { op: string; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'let'; name: string; type?: string; value: Expr }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'for'; var: string; lo: Expr; hi: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'show'; value: Expr };

export type SourceLine = { indent: number; text: string; stmt: Stmt };

export type ScopeAndSymbolsData = {
  type: 'scope-and-symbols';
  stepMs: number;
  lines: SourceLine[];
  scopeRules: { id: string }[];
  scopeRuleLadder: number[];
  defaultScopeRule: number;
};

// ── 글자 찍기 — 구조에서 줄 글자와 이름 자리를 함께 낸다 ─────────────────────

/** 이름이 글자에 나오는 자리. `kind` 는 선언인가 쓰임인가, `order` 는 줄 안의 차례 */
export type NameSpot = { start: number; len: number; name: string; kind: 'decl' | 'use' };

type Printer = { text: string; spots: NameSpot[] };

function put(p: Printer, s: string): void {
  p.text += s;
}

function putName(p: Printer, name: string, kind: 'decl' | 'use'): void {
  p.spots.push({ start: p.text.length, len: name.length, name, kind });
  p.text += name;
}

function putExpr(p: Printer, e: Expr): void {
  if ('int' in e) return put(p, String(e.int));
  if ('float' in e) return put(p, Number.isInteger(e.float) ? e.float.toFixed(1) : String(e.float));
  if ('var' in e) return putName(p, e.var, 'use');
  if ('op' in e) {
    putExpr(p, e.l);
    put(p, ` ${e.op} `);
    putExpr(p, e.r);
    return;
  }
  if ('call' in e) {
    putName(p, e.call, 'use');
    put(p, '(');
    e.args.forEach((a, i) => {
      if (i > 0) put(p, ', ');
      putExpr(p, a);
    });
    put(p, ')');
    return;
  }
  throw new Error(`모르는 식 모양: ${JSON.stringify(e)}`);
}

/** 문 하나를 원시 표기로 찍는다 — 글자와 이름 자리(왼쪽부터) */
export function formatStmt(s: Stmt): Printer {
  const p: Printer = { text: '', spots: [] };
  switch (s.k) {
    case 'let':
      put(p, 'let ');
      putName(p, s.name, 'decl');
      if (s.type !== undefined) put(p, `: ${s.type}`);
      put(p, ' = ');
      putExpr(p, s.value);
      return p;
    case 'function':
      put(p, 'function ');
      putName(p, s.name, 'decl');
      put(p, '(');
      s.params.forEach((n, i) => {
        if (i > 0) put(p, ', ');
        putName(p, n, 'decl');
      });
      put(p, ')');
      return p;
    case 'for':
      put(p, 'for ');
      putName(p, s.var, 'decl');
      put(p, ' from ');
      putExpr(p, s.lo);
      put(p, ' to ');
      putExpr(p, s.hi);
      return p;
    case 'if':
      put(p, 'if ');
      putExpr(p, s.cond);
      return p;
    case 'return':
      put(p, 'return ');
      putExpr(p, s.value);
      return p;
    case 'show':
      put(p, 'show ');
      putExpr(p, s.value);
      return p;
  }
}

// ── 구조 셈 — 스코프 · 선언 · 쓰임 ─────────────────────────────────────────

/** 스코프 종류 번호 — IR 의 scopeKind 와 같다 */
export const SCOPE_TOP = 0;
export const SCOPE_FN = 1;
export const SCOPE_BLOCK = 2;

export type Scope = {
  id: number;
  kind: number;
  parent: number;
  /** 몸을 여는 머리줄 번호(1 부터), 맨 바깥은 0 */
  headLine: number;
  /** 표 이름에 쓰는 머리 — 함수 이름 · `for` · `if`, 맨 바깥은 '' */
  headName: string;
};

export type Decl = { name: string; nameId: number; line: number; home: number };
export type Use = { name: string; nameId: number; line: number; scope: number };

export type LinePlan = {
  no: number;
  indent: number;
  text: string;
  scope: number;
  tokens: { start: number; len: number; kind: 'decl' | 'use'; ref: number }[];
  uses: number[];
  /** ③ 줄이 속한 몸에 드는 선언 (let · 함수 이름) */
  lineDecls: number[];
  /** ④ 이 줄이 여는 몸, 없으면 -1 */
  opens: number;
  /** ④ 여는 몸에 함께 드는 선언 (인자 · for 변수) */
  bodyDecls: number[];
};

export type Program = {
  lines: LinePlan[];
  scopes: Scope[];
  decls: Decl[];
  uses: Use[];
  /** 이름 번호 — 첫 선언 차례, 선언 없는 이름은 그 뒤 */
  names: string[];
};

function isHead(s: Stmt): boolean {
  return s.k === 'function' || s.k === 'if' || s.k === 'for';
}

/** 줄 구조에서 스코프(글이 감싼 모양) · 선언 · 쓰임을 셈한다 */
export function analyzeProgram(lines: SourceLine[]): Program {
  if (lines.length === 0) throw new Error('줄이 없다');
  const scopes: Scope[] = [{ id: 0, kind: SCOPE_TOP, parent: -1, headLine: 0, headName: '' }];
  // 열린 몸: [스코프, 머리줄 들여쓰기]
  const open: { scope: number; indent: number }[] = [{ scope: 0, indent: -1 }];
  const plans: LinePlan[] = [];
  const rawDecls: { name: string; line: number; home: number }[] = [];
  const rawUses: { name: string; line: number; scope: number }[] = [];

  lines.forEach((ln, i) => {
    const no = i + 1;
    if (!Number.isInteger(ln.indent) || ln.indent < 0) throw new Error(`L${no} 들여쓰기가 이상하다`);
    const printed = formatStmt(ln.stmt);
    if (printed.text !== ln.text) {
      throw new Error(`L${no} 글자가 구조와 다르다: "${ln.text}" ≠ "${printed.text}"`);
    }
    while (open.length > 1 && open[open.length - 1]!.indent >= ln.indent) open.pop();
    const top = open[open.length - 1];
    if (!top) throw new Error('맨 바깥 스코프를 잃었다');
    if (ln.indent > top.indent + 1) throw new Error(`L${no} 들여쓰기가 몸 하나보다 깊다`);
    const here = top.scope;

    let opens = -1;
    if (isHead(ln.stmt)) {
      const nextLine = lines[i + 1];
      if (!nextLine || nextLine.indent <= ln.indent) throw new Error(`L${no} 머리줄에 몸이 없다`);
      opens = scopes.length;
      const s = ln.stmt;
      scopes.push({
        id: opens,
        kind: s.k === 'function' ? SCOPE_FN : SCOPE_BLOCK,
        parent: here,
        headLine: no,
        headName: s.k === 'function' ? s.name : s.k,
      });
    }

    const plan: LinePlan = {
      no,
      indent: ln.indent,
      text: ln.text,
      scope: here,
      tokens: [],
      uses: [],
      lineDecls: [],
      opens,
      bodyDecls: [],
    };
    // 이름 자리를 왼쪽부터 — 선언이 어느 몸에 드는지는 문 종류가 정한다
    let firstDecl = true;
    for (const spot of printed.spots) {
      if (spot.kind === 'use') {
        plan.tokens.push({ start: spot.start, len: spot.len, kind: 'use', ref: rawUses.length });
        plan.uses.push(rawUses.length);
        rawUses.push({ name: spot.name, line: no, scope: here });
        continue;
      }
      // 선언: let · 함수 이름은 줄이 속한 몸, 인자 · for 변수는 여는 몸
      const s = ln.stmt;
      const intoBody = s.k === 'for' || (s.k === 'function' && !firstDecl);
      firstDecl = false;
      const home = intoBody ? opens : here;
      if (home < 0) throw new Error(`L${no} 선언이 들 몸이 없다`);
      plan.tokens.push({ start: spot.start, len: spot.len, kind: 'decl', ref: rawDecls.length });
      (intoBody ? plan.bodyDecls : plan.lineDecls).push(rawDecls.length);
      rawDecls.push({ name: spot.name, line: no, home });
    }
    plans.push(plan);
    if (opens >= 0) open.push({ scope: opens, indent: ln.indent });
  });

  const names: string[] = [];
  for (const d of rawDecls) if (!names.includes(d.name)) names.push(d.name);
  for (const u of rawUses) if (!names.includes(u.name)) names.push(u.name);
  return {
    lines: plans,
    scopes,
    decls: rawDecls.map((d) => ({ ...d, nameId: names.indexOf(d.name) })),
    uses: rawUses.map((u) => ({ ...u, nameId: names.indexOf(u.name) })),
    names,
  };
}

// ── 규칙 — 선언이 드는 표 ─────────────────────────────────────────────────

/** 규칙 번호 — 사다리 값. 0 블록마다 · 1 함수마다 · 2 하나뿐 */
export const RULE_BLOCK = 0;
export const RULE_FUNCTION = 1;
export const RULE_SINGLE = 2;

/** 스코프 `home` 의 선언이 드는 표의 스코프 — IR `scopeFor` 와 같은 셈 */
export function tableScopeFor(home: number, rule: number, scopes: Scope[]): number {
  if (rule === RULE_SINGLE) return 0;
  let s = home;
  if (rule === RULE_FUNCTION) {
    for (;;) {
      const sc = scopes[s];
      if (!sc) throw new Error(`스코프 ${s} 가 없다`);
      if (sc.kind !== SCOPE_BLOCK) break;
      s = sc.parent;
    }
  }
  return s;
}

// ── 읽기 — 표 더미를 밟는다 ───────────────────────────────────────────────

export type Table = { scope: number; entries: number[] };

export type Op =
  | { k: 'pop'; scope: number }
  | { k: 'lookup'; use: number; found: boolean; decl: number; scanned: number }
  | { k: 'declare'; decl: number; table: number; accepted: boolean; clash: number }
  | { k: 'push'; scope: number; height: number };

export type Meters = { made: number; links: number; errors: number };

export type LineStep = {
  line: number;
  ops: Op[];
  phase: 'place' | 'reject' | 'found' | 'missing';
  /** 이 걸음이 끝난 표 더미 (아래부터) */
  stack: Table[];
  meters: Meters;
};

export type Reading = {
  steps: LineStep[];
  /** 선언마다 든 표의 스코프 · 받아들여졌나 (1/0) */
  declScope: number[];
  accepted: number[];
  /** 쓰임마다 가리킨 선언, 없으면 -1 · 훑은 표 수 */
  target: number[];
  scanned: number[];
  meters: Meters;
  maxHeight: number;
};

function snapshot(stack: Table[]): Table[] {
  return stack.map((t) => ({ scope: t.scope, entries: [...t.entries] }));
}

/** 한 규칙으로 글을 위에서 아래로 한 번 읽는다 — 줄마다 한 걸음 */
export function readProgram(prog: Program, rule: number): Reading {
  if (rule !== RULE_BLOCK && rule !== RULE_FUNCTION && rule !== RULE_SINGLE) {
    throw new Error(`모르는 스코프 규칙 ${rule}`);
  }
  const stack: Table[] = [{ scope: 0, entries: [] }];
  const declScope = prog.decls.map(() => -1);
  const accepted = prog.decls.map(() => -1);
  const target = prog.uses.map(() => -2);
  const scanned = prog.uses.map(() => 0);
  const meters: Meters = { made: 1, links: 0, errors: 0 };
  let maxHeight = 1;
  const steps: LineStep[] = [];

  const declare = (d: number, ops: Op[]): boolean => {
    const decl = prog.decls[d];
    if (!decl) throw new Error(`선언 ${d} 가 없다`);
    const ts = tableScopeFor(decl.home, rule, prog.scopes);
    const table = stack.find((t) => t.scope === ts);
    if (!table) throw new Error(`L${decl.line} ${decl.name} 이 들 표(스코프 ${ts})가 더미에 없다`);
    declScope[d] = ts;
    const clash = table.entries.find((e) => prog.decls[e]?.name === decl.name);
    if (clash !== undefined) {
      accepted[d] = 0;
      meters.errors += 1;
      ops.push({ k: 'declare', decl: d, table: ts, accepted: false, clash });
      return false;
    }
    accepted[d] = 1;
    table.entries.push(d);
    ops.push({ k: 'declare', decl: d, table: ts, accepted: true, clash: -1 });
    return true;
  };

  for (const ln of prog.lines) {
    const ops: Op[] = [];
    // ① 몸을 벗어난 표를 걷는다 — 줄의 스코프 사슬에 없는 표
    const chain: number[] = [];
    for (let s = ln.scope; s >= 0; ) {
      chain.push(s);
      const sc = prog.scopes[s];
      if (!sc) throw new Error(`스코프 ${s} 가 없다`);
      s = sc.parent;
    }
    for (;;) {
      const top = stack[stack.length - 1];
      if (!top) throw new Error('표 더미가 비었다');
      if (chain.includes(top.scope)) break;
      stack.pop();
      ops.push({ k: 'pop', scope: top.scope });
    }
    // ② 쓰임을 글자 차례로 — 맨 위 표부터
    let missing = false;
    for (const u of ln.uses) {
      const use = prog.uses[u];
      if (!use) throw new Error(`쓰임 ${u} 가 없다`);
      let n = 0;
      let hit = -1;
      for (let k = stack.length - 1; k >= 0 && hit < 0; k -= 1) {
        n += 1;
        const table = stack[k];
        if (!table) throw new Error('표 더미 색인이 어긋났다');
        const e = table.entries.find((d) => prog.decls[d]?.name === use.name);
        if (e !== undefined) hit = e;
      }
      target[u] = hit;
      scanned[u] = n;
      if (hit >= 0) meters.links += 1;
      else {
        meters.errors += 1;
        missing = true;
      }
      ops.push({ k: 'lookup', use: u, found: hit >= 0, decl: hit, scanned: n });
    }
    // ③ 줄의 선언
    let placed = false;
    let rejected = false;
    for (const d of ln.lineDecls) {
      if (declare(d, ops)) placed = true;
      else rejected = true;
    }
    // ④ 머리줄이면 몸을 연다
    if (ln.opens >= 0) {
      if (tableScopeFor(ln.opens, rule, prog.scopes) === ln.opens) {
        stack.push({ scope: ln.opens, entries: [] });
        meters.made += 1;
        maxHeight = Math.max(maxHeight, stack.length);
        ops.push({ k: 'push', scope: ln.opens, height: stack.length });
      }
      for (const d of ln.bodyDecls) {
        if (declare(d, ops)) placed = true;
        else rejected = true;
      }
    }
    const phase = missing ? 'missing' : rejected ? 'reject' : placed ? 'place' : 'found';
    steps.push({ line: ln.no, ops, phase, stack: snapshot(stack), meters: { ...meters } });
  }

  if (target.some((x) => x === -2) || accepted.some((x) => x < 0)) {
    throw new Error('읽지 않은 쓰임 · 선언이 남았다');
  }
  return { steps, declScope, accepted, target, scanned, meters: { ...meters }, maxHeight };
}

// ── IR 인자 — 부르는 쪽이 번호와 버퍼로 바꿔 건넨다 ─────────────────────────

/** `resolveAll` 에 넘길 인자 (버퍼는 길이만큼 만든다) */
export function resolveArgs(prog: Program, rule: number): unknown[] {
  return [
    rule,
    prog.decls.map((d) => d.nameId),
    prog.decls.map((d) => d.home),
    prog.decls.map((d) => d.line),
    prog.uses.map((u) => u.nameId),
    prog.uses.map((u) => u.scope),
    prog.uses.map((u) => u.line),
    prog.scopes.map((s) => s.parent),
    prog.scopes.map((s) => s.kind),
    prog.decls.map(() => 0),
    prog.decls.map(() => 0),
    prog.uses.map(() => 0),
  ];
}

// ── 알고리즘 ───────────────────────────────────────────────────────────

function readRule(payload: unknown, ladder: number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number' || !ladder.includes(v)) return null;
  return v;
}

export async function scopeAndSymbolsAlgorithm(ctx: FacetContext<ScopeAndSymbolsData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ScopeAndSymbolsData>;
  const data = ctx.data;
  const ladder = data.scopeRuleLadder;
  if (ladder.length !== data.scopeRules.length) throw new Error('사다리와 규칙 목록의 길이가 다르다');
  if (!ladder.includes(data.defaultScopeRule)) throw new Error('기본 규칙이 사다리에 없다');
  const prog = analyzeProgram(data.lines);

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 첫 회차는 차이 0 이어도 보낸다
  const shown: Meters = { made: 0, links: 0, errors: 0 };
  let firstMeters = true;
  const meters = (m: Meters) => {
    if (firstMeters || m.made !== shown.made) ctx.metric('tables-made', m.made - shown.made);
    if (firstMeters || m.links !== shown.links) ctx.metric('links', m.links - shown.links);
    if (firstMeters || m.errors !== shown.errors) ctx.metric('scope-errors', m.errors - shown.errors);
    firstMeters = false;
    shown.made = m.made;
    shown.links = m.links;
    shown.errors = m.errors;
  };

  const tokensOf = (ln: LinePlan) => ln.tokens.map((tk) => ({ ...tk }));

  let rule = data.defaultScopeRule;
  let round = 0;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const ruleEntry = data.scopeRules[ladder.indexOf(rule)];
      if (!ruleEntry) throw new Error(`규칙 ${rule} 의 항목이 없다`);
      const reading = readProgram(prog, rule);
      round += 1;

      // 걸음 0 — 맨 바깥 표 하나
      const start: Meters = { made: 1, links: 0, errors: 0 };
      await ctx.emit({
        type: 'round',
        payload: {
          round,
          rule,
          ruleId: ruleEntry.id,
          lines: prog.lines.map((ln) => ({ no: ln.no, indent: ln.indent, text: ln.text, tokens: tokensOf(ln) })),
          scopes: prog.scopes.map((s) => ({ id: s.id, kind: s.kind, headName: s.headName })),
          names: [...prog.names],
          decls: prog.decls.map((d) => ({ name: d.name, nameId: d.nameId, line: d.line })),
          uses: prog.uses.map((u) => ({ name: u.name, nameId: u.nameId, line: u.line })),
          stack: [{ scope: 0, entries: [] }],
          meters: { ...start },
        },
      });
      meters(start);
      if (!(await rctx.sleep(data.stepMs))) return;

      for (let i = 0; i < reading.steps.length; i += 1) {
        if (ctx.cancelled) return;
        const st = reading.steps[i];
        if (!st) throw new Error(`걸음 ${i + 1} 이 없다`);
        await ctx.emit({
          type: 'line',
          payload: {
            step: i + 1,
            line: st.line,
            last: i === reading.steps.length - 1,
            phase: st.phase,
            ops: st.ops.map((o) => ({ ...o })),
            stack: snapshot(st.stack),
            meters: { ...st.meters },
          },
        });
        switch (st.phase) {
          case 'place':
            await phase('place');
            break;
          case 'reject':
            await phase('reject');
            break;
          case 'found':
            await phase('found');
            break;
          case 'missing':
            await phase('missing');
            break;
        }
        meters(st.meters);
        if (!(await rctx.sleep(data.stepMs))) return;
      }

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'scopeRule') continue;
        next = readRule(input.payload, ladder);
      }
      rule = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
