/**
 * encapsulation-boundary — 멤버에 닿는 자리마다 닿는지 막히는지를 실행 전에 판정한다.
 *
 * 프로그램은 돌지 않는다. 줄 구조를 읽어 멤버에 닿는 자리(`x.멤버` 꼴, `this.` 포함)를
 * 글자 차례로 모으고, 자리마다 닿음 · 거부를 가린다.
 *
 * 판정 규약
 *   - 멤버가 `public` 이면 어디서든 닿는다
 *   - `private` 이면 그 멤버를 선언한 클래스의 몸 안에서만 닿는다
 *   - `this` 의 클래스 = 둘러싼 클래스. 밖의 이름의 클래스 = 그 이름을 세운 `let 이름 = new 클래스(…)`
 *   - `new C()` 가 `create` 를 부르는 것은 닿음으로 세지 않는다 (`.` 꼴이 아니다)
 *   - 정의 줄(class · interface · field · function · signature)은 판정 대상이 아니다
 *
 * 걸음 0 은 러너가 세우는 첫 장면(프로그램 전체, 판정 없음)이다. 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (전부 silent 아님)
 *   check    { line: number; inside: boolean; cls: string | null; reaches: Reach[] }
 *            줄 하나의 닿음 자리 전부. line 은 0 부터 센 줄 차례, inside 는 클래스 몸 안인가,
 *            cls 는 둘러싼 클래스 이름(밖이면 null).
 *            Reach = { member: string; mode: 'r' | 'w' | 'call'; vis: 'public' | 'private';
 *                      ok: boolean; col: number; len: number; decl: number }
 *            col · len 은 그 줄 글자에서 `대상.멤버` 가 놓인 자리(글자 단위), decl 은 멤버를 선언한 줄 차례
 *   verdict  { reached: number; refused: number }
 *            판정 걸음. 거부가 하나라도 있으면 프로그램은 한 줄도 돌지 않는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { this: true }
  | { get: Expr; field: string }
  | { mcall: Expr; name: string; args: Expr[] }
  | { call: string; args: Expr[] }
  | { new: string; args: Expr[] }
  | { op: string; l: Expr; r: Expr }
  | { list: Expr[] };

export type Target = string | { obj: Expr; field: string };

export type Stmt =
  | { k: 'class'; name: string; extends?: string; implements?: string }
  | { k: 'interface'; name: string }
  | { k: 'field'; vis: 'public' | 'private'; name: string }
  | { k: 'function'; name: string; params: string[]; vis?: 'public' | 'private' }
  | { k: 'signature'; name: string; params: string[] }
  | { k: 'assign'; to: Target; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'for-each'; var: string; in: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type EncapsulationBoundaryFacetData = {
  type: 'encapsulation-boundary';
  stepMs: number;
  lines: CodeLine[];
};

export type Mode = 'r' | 'w' | 'call';
export type Vis = 'public' | 'private';

export type Reach = {
  member: string;
  mode: Mode;
  vis: Vis;
  ok: boolean;
  col: number;
  len: number;
  decl: number;
};

type Member = { vis: Vis; line: number };
type ClassInfo = { name: string; members: Map<string, Member> };

/** 식을 화면 글자로 찍는다 — 닿는 자리를 줄 글자에서 찾으려고 쓴다. */
function exprText(e: Expr): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) return e.var;
  if ('this' in e) return 'this';
  if ('get' in e) return `${exprText(e.get)}.${e.field}`;
  if ('mcall' in e) return `${exprText(e.mcall)}.${e.name}(${e.args.map(exprText).join(', ')})`;
  if ('call' in e) return `${e.call}(${e.args.map(exprText).join(', ')})`;
  if ('new' in e) return `new ${e.new}(${e.args.map(exprText).join(', ')})`;
  if ('op' in e) return `${exprText(e.l)} ${e.op} ${exprText(e.r)}`;
  return `[${e.list.map(exprText).join(', ')}]`;
}

type Access = { obj: Expr; member: string; mode: Mode };

/** 식 안의 멤버 닿음을 글자 차례로. */
function exprAccesses(e: Expr, mode: Mode): Access[] {
  if ('get' in e) {
    const inner = 'this' in e.get || 'var' in e.get ? [] : exprAccesses(e.get, 'r');
    return [...inner, { obj: e.get, member: e.field, mode }];
  }
  if ('mcall' in e) {
    return [{ obj: e.mcall, member: e.name, mode: 'call' }, ...e.args.flatMap((a) => exprAccesses(a, 'r'))];
  }
  if ('op' in e) return [...exprAccesses(e.l, 'r'), ...exprAccesses(e.r, 'r')];
  if ('call' in e || 'new' in e) return e.args.flatMap((a) => exprAccesses(a, 'r'));
  if ('list' in e) return e.list.flatMap((a) => exprAccesses(a, 'r'));
  return [];
}

function stmtAccesses(st: Stmt): Access[] {
  const out: Access[] = [];
  if (st.k === 'assign' && typeof st.to !== 'string') {
    out.push({ obj: st.to.obj, member: st.to.field, mode: 'w' });
  }
  if ('value' in st) out.push(...exprAccesses(st.value, 'r'));
  if (st.k === 'for-each') out.push(...exprAccesses(st.in, 'r'));
  return out;
}

const DEFINITION = new Set(['class', 'interface', 'field', 'function', 'signature']);

export type CheckSite = { line: number; inside: boolean; cls: string | null; reaches: Reach[] };

/** 줄 구조에서 닿는 자리를 모아 판정한다. 알고리즘의 셈 전부가 여기 있다. */
export function judgeSites(lines: CodeLine[]): CheckSite[] {
  // 클래스와 멤버 선언 — 클래스 줄 아래 더 깊은 들여쓰기가 그 몸이다
  const classes = new Map<string, ClassInfo>();
  const owner: (string | null)[] = [];
  let open: { name: string; indent: number } | null = null;
  lines.forEach((ln, i) => {
    if (open && ln.indent <= open.indent) open = null;
    const st = ln.stmt;
    if (st.k === 'class') {
      classes.set(st.name, { name: st.name, members: new Map() });
      open = { name: st.name, indent: ln.indent };
      owner.push(null);
      return;
    }
    owner.push(open ? open.name : null);
    const info = open ? classes.get(open.name) : undefined;
    if (info && ln.indent === (open?.indent ?? 0) + 1) {
      if (st.k === 'field') info.members.set(st.name, { vis: st.vis, line: i });
      if (st.k === 'function') info.members.set(st.name, { vis: st.vis ?? 'public', line: i });
    }
  });

  // 밖의 이름 → 클래스: `let 이름 = new 클래스(…)`
  const kinds = new Map<string, string>();
  for (const ln of lines) {
    const st = ln.stmt;
    if (st.k === 'assign' && typeof st.to === 'string' && 'new' in st.value) kinds.set(st.to, st.value.new);
  }

  const sites: CheckSite[] = [];
  lines.forEach((ln, i) => {
    if (DEFINITION.has(ln.stmt.k)) return;
    const acc = stmtAccesses(ln.stmt);
    if (acc.length === 0) return;
    const inside = owner[i] ?? null;
    let cursor = 0;
    const reaches: Reach[] = [];
    for (const a of acc) {
      const cls = 'this' in a.obj ? inside : 'var' in a.obj ? kinds.get(a.obj.var) ?? null : null;
      const token = `${exprText(a.obj)}.${a.member}`;
      if (!cls) {
        throw new Error(`encapsulation-boundary: L${i + 1} '${token}' — 대상의 클래스를 알 수 없다 (멤버 ${a.member})`);
      }
      const m = classes.get(cls)?.members.get(a.member);
      if (!m) {
        throw new Error(`encapsulation-boundary: L${i + 1} '${token}' — 클래스 ${cls} 에 멤버 ${a.member} 가 없다`);
      }
      const col = ln.text.indexOf(token, cursor);
      if (col < 0) {
        throw new Error(`encapsulation-boundary: L${i + 1} 구조에서 찍은 '${token}' 가 줄 글자 '${ln.text}' 에 없다`);
      }
      cursor = col + token.length;
      const ok = m.vis === 'public' || inside === cls;
      reaches.push({ member: a.member, mode: a.mode, vis: m.vis, ok, col, len: token.length, decl: m.line });
    }
    if (reaches.length > 0) sites.push({ line: i, inside: inside !== null, cls: inside, reaches });
  });
  return sites;
}

export async function encapsulationBoundary(
  ctx: FacetContext<EncapsulationBoundaryFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<EncapsulationBoundaryFacetData>;
  const stepMs = ctx.data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sites = judgeSites(ctx.data.lines);
  let reached = 0;
  let refused = 0;

  for (const site of sites) {
    if (!(await pause())) return;
    for (const r of site.reaches) {
      if (r.ok) reached += 1;
      else refused += 1;
    }
    await ctx.emit({
      type: 'check',
      payload: {
        line: site.line,
        inside: site.inside,
        cls: site.cls,
        reaches: site.reaches.map((r) => ({ ...r })),
      },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'verdict', payload: { reached, refused } });
}
