/**
 * wait-and-signal — 조건이 아니면 자물쇠를 내려놓고 잔다.
 *
 * 스레드 프로그램(가상 표기 글자)을 한 틱에 한 줄씩 실제로 돌린다.
 *
 * 규약 (사양 · 공통 안내문 그대로)
 *  - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나 실행하려다 막힌다. 막힌 시도도 한 틱.
 *  - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩. 잠든 · 끝난 스레드는 건너뛴다. 첫 틱은 목록 맨 앞.
 *    한 틱 뒤 다음 차례는 방금 달린 스레드 **다음**부터 찾는다.
 *  - `lock(m)`: 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 *  - `unlock(m)`: 줄이 있으면 맨 앞에게 곧바로 넘긴다 (넘겨받은 쪽은 깨어나 그다음 줄부터). 없으면 비운다.
 *    주인 아닌 스레드의 unlock 은 던진다.
 *  - `while not <이름>`: 판정도 한 줄 = 한 틱. 거짓이면 몸(더 깊게 들여쓴 줄들)으로, 참이면 몸 너머로.
 *    몸의 마지막 줄 다음은 while 줄이다.
 *  - `wait(c, m)`: m 을 놓고(unlock 과 같다 — 줄이 있으면 맨 앞에게 넘긴다) c 의 줄 끝에서 잠든다.
 *    깨어나 m 을 넘겨받으면 wait 다음 줄(곧 while 줄)부터 잇는다.
 *  - `signal(c)`: c 의 줄 맨 앞을 깨워 m 의 줄 끝에 세운다 (아직 잠든 채). 깨운 쪽은 계속 달린다 (메사 방식).
 *    c 의 줄이 비었으면 아무 일도 없다.
 *  - `<이름> = true|false`: 공유 값에 넣는다. `<이름>()`: 자물쇠와 무관한 일 한 줄.
 *  - 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면 멈춘다 (교착).
 *  - 모르는 줄 모양 · 없는 이름 · 셈할 수 없는 상태는 줄 번호를 담아 던진다.
 *
 * 이벤트
 *  - `tick` (silent 아님) — 한 틱을 실행한 뒤 한 번.
 *    payload: {
 *      tick: number;            // 0 부터
 *      thread: string;          // 이 틱을 받은 스레드
 *      line: number;            // 그 스레드 프로그램의 줄 번호 (0 부터)
 *      kind: 'take' | 'block' | 'checkFalse' | 'checkTrue' | 'wait' | 'set' | 'signal'
 *          | 'signalNone' | 'unlockHand' | 'unlockFree' | 'work';
 *      other: string | null;    // 넘겨받은 스레드(wait · unlockHand) · 깨운 스레드(signal) · 막은 주인(block)
 *      owner: string | null;    // 틱 뒤 자물쇠 주인
 *      lockQueue: string[];     // 틱 뒤 자물쇠 줄 (앞부터)
 *      condQueue: string[];     // 틱 뒤 조건 변수 줄 (앞부터)
 *      done: string[];          // 틱 뒤 끝난 스레드 (끝난 차례)
 *      flag: boolean;           // 틱 뒤 공유 값
 *      checks: number;          // 지금까지 조건을 본 횟수
 *    }
 *  - `deadlock` (silent 아님) — 준비된 스레드가 없는데 끝나지 않은 스레드가 있을 때 한 번. payload: { tick: number }
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WaitAndSignalThread = {
  id: string;
  /** 표시 이름 키를 고르는 역할 식별자 */
  role: 'taker' | 'giver';
  /** 가상 표기 프로그램 줄. 몸은 빈칸 넷 들여쓰기 */
  lines: string[];
};

export type WaitAndSignalFacetData = {
  type: 'wait-and-signal';
  stepMs: number;
  lock: string;
  cond: string;
  flag: string;
  flagStart: boolean;
  threads: WaitAndSignalThread[];
};

export type TickKind =
  | 'take'
  | 'block'
  | 'checkFalse'
  | 'checkTrue'
  | 'wait'
  | 'set'
  | 'signal'
  | 'signalNone'
  | 'unlockHand'
  | 'unlockFree'
  | 'work';

type Op =
  | { op: 'lock'; name: string }
  | { op: 'unlock'; name: string }
  | { op: 'whileNot'; name: string; bodyEnd: number }
  | { op: 'wait'; cond: string; lock: string }
  | { op: 'signal'; cond: string }
  | { op: 'set'; name: string; value: boolean }
  | { op: 'work' };

type Parsed = { op: Op; indent: number; loopHead: number | null };

function indentOf(text: string, where: string): number {
  const m = /^( *)/.exec(text);
  const n = m === null ? 0 : m[1]!.length;
  if (n % 4 !== 0) throw new Error(`${where}: 들여쓰기는 빈칸 넷 단위여야 한다 — "${text}"`);
  return n / 4;
}

/** 프로그램 줄을 해석한다. 모르는 모양은 줄 번호를 담아 던진다. */
function parseProgram(data: WaitAndSignalFacetData, th: WaitAndSignalThread): Parsed[] {
  const out: Parsed[] = [];
  const lines = th.lines;
  for (let i = 0; i < lines.length; i += 1) {
    const where = `스레드 ${th.id} 줄 ${i}`;
    const raw = lines[i];
    if (typeof raw !== 'string') throw new Error(`${where}: 글자가 아니다`);
    const indent = indentOf(raw, where);
    const text = raw.trim();
    let m: RegExpExecArray | null;
    let op: Op;
    if ((m = /^lock\((\w+)\)$/.exec(text)) !== null) {
      if (m[1] !== data.lock) throw new Error(`${where}: 없는 자물쇠 "${m[1]}"`);
      op = { op: 'lock', name: m[1] };
    } else if ((m = /^unlock\((\w+)\)$/.exec(text)) !== null) {
      if (m[1] !== data.lock) throw new Error(`${where}: 없는 자물쇠 "${m[1]}"`);
      op = { op: 'unlock', name: m[1] };
    } else if ((m = /^wait\((\w+), (\w+)\)$/.exec(text)) !== null) {
      if (m[1] !== data.cond) throw new Error(`${where}: 없는 조건 변수 "${m[1]}"`);
      if (m[2] !== data.lock) throw new Error(`${where}: 없는 자물쇠 "${m[2]}"`);
      op = { op: 'wait', cond: m[1], lock: m[2] };
    } else if ((m = /^signal\((\w+)\)$/.exec(text)) !== null) {
      if (m[1] !== data.cond) throw new Error(`${where}: 없는 조건 변수 "${m[1]}"`);
      op = { op: 'signal', cond: m[1] };
    } else if ((m = /^while not (\w+)$/.exec(text)) !== null) {
      if (m[1] !== data.flag) throw new Error(`${where}: 없는 공유 값 "${m[1]}"`);
      let end = i + 1;
      while (end < lines.length && indentOf(lines[end]!, `스레드 ${th.id} 줄 ${end}`) > indent) end += 1;
      if (end === i + 1) throw new Error(`${where}: while 의 몸이 비었다`);
      op = { op: 'whileNot', name: m[1], bodyEnd: end };
    } else if ((m = /^(\w+) = (true|false)$/.exec(text)) !== null) {
      if (m[1] !== data.flag) throw new Error(`${where}: 없는 공유 값 "${m[1]}"`);
      op = { op: 'set', name: m[1], value: m[2] === 'true' };
    } else if (/^\w+\(\)$/.test(text)) {
      op = { op: 'work' };
    } else {
      throw new Error(`${where}: 모르는 줄 모양 "${text}"`);
    }
    out.push({ op, indent, loopHead: null });
  }
  // 몸의 마지막 줄 다음은 while 줄로 돌아간다
  for (let i = 0; i < out.length; i += 1) {
    const p = out[i]!;
    if (p.op.op === 'whileNot') {
      const last = out[p.op.bodyEnd - 1]!;
      if (last.op.op === 'whileNot') throw new Error(`스레드 ${th.id} 줄 ${p.op.bodyEnd - 1}: 겹친 while 은 셈하지 않는다`);
      last.loopHead = i;
    }
  }
  return out;
}

export async function waitAndSignal(context: FacetContext<WaitAndSignalFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<WaitAndSignalFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ids = data.threads.map((th) => th.id);
  if (ids.length === 0) throw new Error('스레드가 없다');
  const programs = new Map<string, Parsed[]>();
  for (const th of data.threads) programs.set(th.id, parseProgram(data, th));

  const pc = new Map<string, number>(ids.map((id) => [id, 0]));
  const asleep = new Set<string>();
  const done: string[] = [];
  let owner: string | null = null;
  const lockQueue: string[] = [];
  const condQueue: string[] = [];
  let flag = data.flagStart;
  let checks = 0;

  function programOf(id: string): Parsed[] {
    const p = programs.get(id);
    if (p === undefined) throw new Error(`없는 스레드 "${id}"`);
    return p;
  }

  function pcOf(id: string): number {
    const n = pc.get(id);
    if (n === undefined) throw new Error(`없는 스레드 "${id}"`);
    return n;
  }

  /** 줄 i 다음에 달릴 줄 — 몸의 마지막 줄이면 while 줄 */
  function nextLine(prog: Parsed[], i: number): number {
    const p = prog[i]!;
    return p.loopHead !== null ? p.loopHead : i + 1;
  }

  /** 자물쇠를 놓는다 — 줄이 있으면 맨 앞에게 곧바로 넘긴다. 넘겨받은 스레드를 돌려준다 */
  function release(by: string, where: string): string | null {
    if (owner !== by) throw new Error(`${where}: 주인이 아닌 스레드 ${by} 가 자물쇠를 놓으려 한다 (주인 ${owner ?? '없음'})`);
    const next = lockQueue.shift();
    if (next === undefined) {
      owner = null;
      return null;
    }
    owner = next;
    asleep.delete(next);
    return next;
  }

  function isReady(id: string): boolean {
    return !asleep.has(id) && !done.includes(id);
  }

  /** 돌림 — after 다음부터 목록 차례로 준비된 스레드를 찾는다 */
  function pickNext(after: number): number | null {
    for (let k = 1; k <= ids.length; k += 1) {
      if (ctx.cancelled) return null;
      const j = (after + k) % ids.length;
      if (isReady(ids[j]!)) return j;
    }
    return null;
  }

  let turn: number | null = isReady(ids[0]!) ? 0 : pickNext(0);
  let tick = 0;

  // 걸음 0 은 두 프로그램이 이미 서 있는 화면이라, 첫 틱 앞에도 읽을 틈을 둔다
  while (done.length < ids.length) {
    if (!(await pause())) return;
    if (turn === null) {
      await ctx.emit({ type: 'deadlock', payload: { tick } });
      return;
    }
    const id = ids[turn]!;
    const prog = programOf(id);
    const line = pcOf(id);
    const cur = prog[line];
    const where = `틱 ${tick} 스레드 ${id} 줄 ${line}`;
    if (cur === undefined) throw new Error(`${where}: 끝난 프로그램에 차례가 왔다`);
    if (asleep.has(id)) throw new Error(`${where}: 잠든 스레드에 차례가 왔다`);

    let kind: TickKind;
    let other: string | null = null;
    const op = cur.op;
    switch (op.op) {
      case 'lock': {
        if (owner === null) {
          owner = id;
          kind = 'take';
        } else if (owner === id) {
          throw new Error(`${where}: 이미 쥔 자물쇠를 다시 잡는다`);
        } else {
          other = owner;
          lockQueue.push(id);
          asleep.add(id);
          kind = 'block';
        }
        // 막혔어도 넘겨받으면 다음 줄부터 잇는다
        pc.set(id, nextLine(prog, line));
        break;
      }
      case 'unlock': {
        other = release(id, where);
        kind = other === null ? 'unlockFree' : 'unlockHand';
        pc.set(id, nextLine(prog, line));
        break;
      }
      case 'whileNot': {
        checks += 1;
        if (flag) {
          kind = 'checkTrue';
          pc.set(id, op.bodyEnd);
        } else {
          kind = 'checkFalse';
          pc.set(id, line + 1);
        }
        break;
      }
      case 'wait': {
        other = release(id, where);
        condQueue.push(id);
        asleep.add(id);
        kind = 'wait';
        pc.set(id, nextLine(prog, line));
        break;
      }
      case 'signal': {
        if (owner !== id) throw new Error(`${where}: 자물쇠를 쥐지 않고 signal 한다`);
        const woke = condQueue.shift();
        if (woke === undefined) {
          kind = 'signalNone';
        } else {
          other = woke;
          lockQueue.push(woke);
          kind = 'signal';
        }
        pc.set(id, nextLine(prog, line));
        break;
      }
      case 'set': {
        flag = op.value;
        kind = 'set';
        pc.set(id, nextLine(prog, line));
        break;
      }
      case 'work': {
        kind = 'work';
        pc.set(id, nextLine(prog, line));
        break;
      }
    }
    if (pcOf(id) >= prog.length) done.push(id);

    await ctx.emit({
      type: 'tick',
      payload: {
        tick,
        thread: id,
        line,
        kind,
        other,
        owner,
        lockQueue: [...lockQueue],
        condQueue: [...condQueue],
        done: [...done],
        flag,
        checks,
      },
    });
    tick += 1;
    turn = pickNext(turn);
  }
}
