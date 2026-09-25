/**
 * 임계 구역 — 공유 값을 건드리는 줄의 첫 줄부터 끝 줄까지를 한 구간으로 셈하고,
 * 두 스레드가 같은 프로그램을 돌 때 그 구간 안에는 한 번에 하나만 서 있는 것을 보인다.
 *
 * 규약 (사양 그대로)
 *   - 구간 셈: 공유 값 이름이 낱말로 들어 있는 줄을 찾고, 그 가운데 첫 줄부터 끝 줄까지를 구간으로 한다.
 *   - CPU 는 하나. 한 틱 = 한 스레드가 한 줄을 실행하거나, 입구에서 막혀 기다림 한 걸음으로 끝난다.
 *   - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩 준다. 첫 틱은 목록 맨 앞.
 *     잠든 스레드 · 끝난 스레드는 건너뛴다.
 *   - 입구 판정은 구간 첫 줄을 실행하려는 틱에 함께 한다. 비었으면 들어가며 그 줄을 실행하고,
 *     남이 안에 있으면 그 틱은 기다림으로 끝나고 잠들어 줄 끝에 선다.
 *   - 구간 끝 줄을 실행하는 틱에 나오며, 기다리던 스레드(줄 맨 앞)를 들인다.
 *     들인 스레드는 다음 제 차례에 구간 첫 줄을 실행한다.
 *   - 자물쇠 줄은 프로그램에 없다 — 구간 경계만 말한다.
 *
 * 줄 모양 (셈할 수 있는 것만. 나머지는 줄 번호를 담아 던진다)
 *   let <이름> = <식>   · <이름> = <식>   · show <식>
 *   <식> = 항 (' + ' 항)*, 항 = 정수 | 이름 (스레드 제 이름 먼저, 없으면 공유 값)
 *
 * 이벤트 (init 만 silent. 걸음 0 은 장면의 initial 이 initialData 에서 세우고 init 이 구간 경계를 얹는다)
 *   init     payload { from: number; to: number }  silent       구간 첫 줄 · 끝 줄 (1 부터) — 자리 잡기용 바탕.
 *            그림은 이것으로 줄 사이 입구 · 출구 자리만 비워 둔다. 표와 울타리는 mark · enclose 걸음에서 선다
 *   mark     payload { lines: number[] }                       공유 값에 닿는 줄 (1 부터)
 *   enclose  payload { from: number; to: number }              구간 첫 줄 · 끝 줄 (1 부터)
 *   run      payload { tick: number; thread: string; line: number;
 *                      enters: boolean; exits: boolean; admitted: string | null;
 *                      inside: string | null; value: number; shown: number | null }
 *            한 줄 실행. inside 는 그 틱 뒤 구간 안의 스레드, value 는 그 틱 뒤 공유 값,
 *            admitted 는 나오며 들인 스레드, shown 은 show 줄이 보인 값
 *   wait     payload { tick: number; thread: string; holder: string }
 *            구간 입구에서 막힘 — 그 틱은 이것으로 끝나고 thread 는 잠든다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CriticalSectionFacetData = {
  type: 'critical-section';
  stepMs: number;
  /** 공유 값 하나 — 이름과 처음 값 */
  shared: { name: string; value: number };
  /** 스레드 식별자. 돌림 차례도 이 차례다 */
  threads: string[];
  /** 모든 스레드가 도는 같은 프로그램 */
  program: string[];
};

const WORD = /[A-Za-z_][A-Za-z0-9_]*/g;

/** 줄 글자에서 공유 값 이름이 낱말로 들어 있는지 본다 */
export function touchesShared(line: string, name: string): boolean {
  const words: string[] = line.match(WORD) ?? [];
  return words.includes(name);
}

type Env = Map<string, number>;

function evalExpr(expr: string, env: Env, shared: { name: string; value: number }, lineNo: number): number {
  const terms = expr.split(' + ');
  let sum = 0;
  for (const raw of terms) {
    const term = raw.trim();
    if (/^-?\d+$/.test(term)) {
      sum += Number(term);
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(term)) {
      throw new Error(`critical-section: line ${lineNo}: cannot read term "${term}"`);
    }
    const own = env.get(term);
    if (own !== undefined) {
      sum += own;
    } else if (term === shared.name) {
      sum += shared.value;
    } else {
      throw new Error(`critical-section: line ${lineNo}: unknown name "${term}"`);
    }
  }
  return sum;
}

/** 한 줄을 실행한다. show 줄이면 보인 값을 돌려준다 */
function execLine(
  text: string,
  lineNo: number,
  env: Env,
  shared: { name: string; value: number },
): number | null {
  const decl = /^let ([A-Za-z_][A-Za-z0-9_]*) = (.+)$/.exec(text);
  if (decl) {
    const name = decl[1];
    const expr = decl[2];
    if (name === undefined || expr === undefined) throw new Error(`critical-section: line ${lineNo}: bad let`);
    if (env.has(name)) throw new Error(`critical-section: line ${lineNo}: "${name}" declared twice`);
    if (name === shared.name) throw new Error(`critical-section: line ${lineNo}: let shadows shared "${name}"`);
    env.set(name, evalExpr(expr, env, shared, lineNo));
    return null;
  }
  const show = /^show (.+)$/.exec(text);
  if (show) {
    const expr = show[1];
    if (expr === undefined) throw new Error(`critical-section: line ${lineNo}: bad show`);
    return evalExpr(expr, env, shared, lineNo);
  }
  const assign = /^([A-Za-z_][A-Za-z0-9_]*) = (.+)$/.exec(text);
  if (assign) {
    const name = assign[1];
    const expr = assign[2];
    if (name === undefined || expr === undefined) throw new Error(`critical-section: line ${lineNo}: bad assign`);
    const v = evalExpr(expr, env, shared, lineNo);
    if (env.has(name)) env.set(name, v);
    else if (name === shared.name) shared.value = v;
    else throw new Error(`critical-section: line ${lineNo}: assign to undeclared "${name}"`);
    return null;
  }
  throw new Error(`critical-section: line ${lineNo}: unknown line shape "${text}"`);
}

export async function criticalSection(context: FacetContext<CriticalSectionFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<CriticalSectionFacetData>;
  const { stepMs, program, threads } = ctx.data;
  const shared = { name: ctx.data.shared.name, value: ctx.data.shared.value };

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  if (threads.length === 0) throw new Error('critical-section: no threads');
  if (program.length === 0) throw new Error('critical-section: empty program');

  // 구간 셈 — 공유 값 이름이 낱말로 든 줄 (0 부터)
  const touched: number[] = [];
  program.forEach((text, i) => {
    if (touchesShared(text, shared.name)) touched.push(i);
  });
  const first = touched[0];
  const last = touched[touched.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error(`critical-section: no line touches "${shared.name}"`);
  }

  await ctx.emit({ type: 'init', silent: true, payload: { from: first + 1, to: last + 1 } });

  // 걸음 0 은 프로그램 전체라 읽을 틈을 먼저 준다
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark', payload: { lines: touched.map((i) => i + 1) } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'enclose', payload: { from: first + 1, to: last + 1 } });

  type State = 'ready' | 'blocked' | 'done';
  const pc = new Map<string, number>();
  const state = new Map<string, State>();
  const admittedTo = new Set<string>();
  const envs = new Map<string, Env>();
  for (const th of threads) {
    pc.set(th, 0);
    state.set(th, 'ready');
    envs.set(th, new Map());
  }
  let inside: string | null = null;
  const queue: string[] = [];
  let lastRan: string | null = null;
  let tick = 0;

  const guard = threads.length * program.length * 4 + 8;
  while (threads.some((th) => state.get(th) !== 'done')) {
    if (!(await pause())) return;
    if (tick > guard) throw new Error('critical-section: ran past guard');

    // 돌림 — 방금 달린 스레드 다음부터 목록 차례로 준비된 스레드를 찾는다
    const startAt: number = lastRan === null ? 0 : threads.indexOf(lastRan) + 1;
    let n: string | null = null;
    for (let k = 0; k < threads.length; k += 1) {
      const cand = threads[(startAt + k) % threads.length];
      if (cand !== undefined && state.get(cand) === 'ready') {
        n = cand;
        break;
      }
    }
    if (n === null) throw new Error(`critical-section: tick ${tick}: no ready thread (deadlock)`);
    lastRan = n;

    const i = pc.get(n);
    const env = envs.get(n);
    if (i === undefined || env === undefined) throw new Error(`critical-section: unknown thread ${n}`);
    const text = program[i];
    if (text === undefined) throw new Error(`critical-section: ${n} past program end at ${i + 1}`);

    let enters = false;
    if (i === first && !admittedTo.has(n)) {
      if (inside === null) {
        inside = n;
        admittedTo.add(n);
        enters = true;
      } else {
        state.set(n, 'blocked');
        queue.push(n);
        await ctx.emit({ type: 'wait', payload: { tick, thread: n, holder: inside } });
        tick += 1;
        continue;
      }
    }

    const shown = execLine(text, i + 1, env, shared);
    pc.set(n, i + 1);

    let exits = false;
    let admitted: string | null = null;
    if (i === last) {
      if (inside !== n) throw new Error(`critical-section: line ${i + 1}: ${n} leaves but is not inside`);
      exits = true;
      inside = null;
      const w = queue.shift();
      if (w !== undefined) {
        inside = w;
        admittedTo.add(w);
        state.set(w, 'ready');
        admitted = w;
      }
    }
    if (i + 1 >= program.length) state.set(n, 'done');

    await ctx.emit({
      type: 'run',
      payload: { tick, thread: n, line: i + 1, enters, exits, admitted, inside, value: shared.value, shown },
    });
    tick += 1;
  }
}
