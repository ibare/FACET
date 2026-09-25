/**
 * 문맥 저장과 복원 — CPU 칸 둘(pc · r)의 수가 기록으로 적히고, 기록의 수가 칸으로 꺼내진다.
 *
 * 모형 (사양의 규약 그대로):
 * - CPU 는 하나, 칸은 둘 — `pc`(다음에 밟을 줄 번호) · `r`(그 프로그램의 변수 하나가 사는 값 칸)
 * - 줄 하나를 밟으면 그 줄의 셈을 r 에 넣고 pc 를 1 올린다.
 *   `let x = k` 는 r ← k. `x = x + k` · `x = x - k` 는 r ← r ± k. `show x` 는 r 을 보이고 r 은 그대로.
 *   이 넷 밖의 줄 모양이 오면 줄 번호를 담아 던진다
 * - 적기 = CPU 의 pc · r 을 그 프로그램의 기록으로 옮겨 적는다. CPU 칸은 꺼내기가 덮을 때까지 그 수를 쥔다.
 *   적은 뒤 CPU 를 쓰는 쪽은 없다
 * - 꺼내기 = 기록의 pc · r 을 CPU 칸에 넣는다. 빈 기록을 꺼내면 던진다. CPU 를 쓰는 쪽이 있는데 꺼내도 던진다
 *   (적지 않은 수를 덮어 잃기 때문이다)
 * - 한 걸음 = 줄 하나 · 적기 하나 · 꺼내기 하나. 걸음 0 = 시작 (initialData 가 그대로 준다)
 * - 차례(무엇을 몇 줄 밟고 언제 적고 꺼내는가)는 데이터 `plan` 이 준다. 전환의 까닭 · 시간 · 비용은 세지 않는다
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 * - `run`     { prog: string; line: number; pc: number; r: number; shown: number | null }
 *             prog 의 줄 line 을 밟은 뒤의 CPU 칸 (pc · r). show 줄이면 shown 에 보인 값, 아니면 null
 * - `save`    { prog: string; pc: number; r: number }  — prog 의 기록에 적힌 수
 * - `restore` { prog: string; pc: number; r: number }  — prog 의 기록에서 CPU 칸으로 꺼낸 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProgramData = { id: string; lines: string[] };
export type Cells = { pc: number; r: number };
export type PlanItem =
  | { do: 'run'; count: number }
  | { do: 'save' }
  | { do: 'restore'; prog: string };

export type SaveAndRestoreFacetData = {
  type: 'save-and-restore';
  stepMs: number;
  programs: ProgramData[];
  /** 시작할 때 CPU 를 쓰는 프로그램과 그 칸 */
  start: { owner: string; pc: number; r: number };
  /** 시작할 때의 기록. null 은 빈 기록 */
  records: Record<string, Cells | null>;
  plan: PlanItem[];
};

type Op =
  | { kind: 'let'; k: number }
  | { kind: 'add'; k: number }
  | { kind: 'show' };

/** 줄 하나를 읽는다. 프로그램의 변수는 첫 `let` 이 정한 이름 하나뿐이다 */
function parseLine(text: string, name: string, where: string): Op {
  const letM = /^let ([a-z]\w*) = (-?\d+)$/.exec(text);
  if (letM) {
    if (letM[1] !== name) throw new Error(`${where}: 이 프로그램의 변수는 ${name} 하나다 — ${text}`);
    return { kind: 'let', k: Number(letM[2]) };
  }
  const addM = /^([a-z]\w*) = ([a-z]\w*) ([+-]) (\d+)$/.exec(text);
  if (addM) {
    if (addM[1] !== name || addM[2] !== name) {
      throw new Error(`${where}: 이 프로그램의 변수는 ${name} 하나다 — ${text}`);
    }
    const k = Number(addM[4]);
    return { kind: 'add', k: addM[3] === '+' ? k : -k };
  }
  const showM = /^show ([a-z]\w*)$/.exec(text);
  if (showM) {
    if (showM[1] !== name) throw new Error(`${where}: 이 프로그램의 변수는 ${name} 하나다 — ${text}`);
    return { kind: 'show' };
  }
  throw new Error(`${where}: 모르는 줄 모양 — ${text}`);
}

/** 프로그램 하나를 줄마다 읽어 둔다. 첫 줄이 `let` 이 아니면 변수 이름을 알 수 없어 던진다 */
function compile(prog: ProgramData): Op[] {
  const first = prog.lines[0];
  if (first === undefined) throw new Error(`프로그램 ${prog.id}: 줄이 없다`);
  const m = /^let ([a-z]\w*) = /.exec(first);
  if (!m || m[1] === undefined) throw new Error(`프로그램 ${prog.id} 줄 1: 첫 줄은 let 이어야 한다 — ${first}`);
  const name = m[1];
  return prog.lines.map((text, i) => parseLine(text, name, `프로그램 ${prog.id} 줄 ${i + 1}`));
}

export async function saveAndRestore(rawCtx: FacetContext<SaveAndRestoreFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<SaveAndRestoreFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  const code = new Map<string, Op[]>();
  for (const p of data.programs) code.set(p.id, compile(p));

  const records = new Map<string, Cells | null>();
  for (const p of data.programs) {
    const rec = data.records[p.id];
    if (rec === undefined) throw new Error(`프로그램 ${p.id}: 시작 기록이 적혀 있지 않다 (빈 기록은 null)`);
    records.set(p.id, rec === null ? null : { pc: rec.pc, r: rec.r });
  }
  if (!code.has(data.start.owner)) throw new Error(`시작 CPU 의 주인 ${data.start.owner} 는 프로그램이 아니다`);

  let owner: string | null = data.start.owner;
  let pc = data.start.pc;
  let r = data.start.r;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 두 프로그램 · CPU 칸 · 기록 둘이 이미 보이는 화면이라 읽을 틈을 둔다
  for (const item of data.plan) {
    if (ctx.cancelled) return;
    if (item.do === 'run') {
      for (let n = 0; n < item.count; n += 1) {
        if (!(await pause())) return;
        if (owner === null) throw new Error('CPU 를 쓰는 프로그램이 없는데 줄을 밟으려 한다');
        const ops = code.get(owner);
        if (ops === undefined) throw new Error(`프로그램 ${owner} 가 없다`);
        const line = pc;
        const op = ops[line - 1];
        if (op === undefined) throw new Error(`프로그램 ${owner}: 밟을 줄 ${line} 이 없다`);
        let shown: number | null = null;
        if (op.kind === 'let') r = op.k;
        else if (op.kind === 'add') r = r + op.k;
        else shown = r;
        pc = line + 1;
        await ctx.emit({ type: 'run', payload: { prog: owner, line, pc, r, shown } });
      }
    } else if (item.do === 'save') {
      if (!(await pause())) return;
      if (owner === null) throw new Error('적을 프로그램이 없다 — CPU 를 쓰는 쪽이 없다');
      records.set(owner, { pc, r });
      const prog = owner;
      owner = null;
      await ctx.emit({ type: 'save', payload: { prog, pc, r } });
    } else if (item.do === 'restore') {
      if (!(await pause())) return;
      if (owner !== null) throw new Error(`${owner} 를 적지 않고 ${item.prog} 를 꺼내려 한다`);
      if (!code.has(item.prog)) throw new Error(`꺼낼 프로그램 ${item.prog} 가 없다`);
      const rec = records.get(item.prog);
      if (rec === undefined || rec === null) throw new Error(`${item.prog} 의 기록이 비어 있어 꺼낼 수 없다`);
      owner = item.prog;
      pc = rec.pc;
      r = rec.r;
      await ctx.emit({ type: 'restore', payload: { prog: item.prog, pc, r } });
    } else {
      throw new Error(`모르는 차례 ${JSON.stringify(item)}`);
    }
  }
}
