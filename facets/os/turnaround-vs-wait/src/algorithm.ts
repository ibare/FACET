/**
 * turnaround-vs-wait — 반환 시간이 대기 토막과 실행 토막으로 갈라진다.
 *
 * 프로세스 목록을 FCFS(선점 없음)로 **틱 단위로 실제로 돌려** 시작 · 끝 · 줄에 선 틱 수를 얻는다.
 * 사양의 대조표를 옮겨 적지 않는다.
 *
 * 모형 (공통 안내문):
 * - 시각의 단위는 틱(정수). 틱 t 는 경계이고, 한 틱을 돈다 = t 에서 t+1 까지 CPU 를 쓴다
 * - CPU 하나 · 입출력 없음 · 바꾸는 비용 0 틱
 * - 틱 경계 t 의 차례: ① 돌던 것의 남은 양이 0 이면 t 에 끝난다 ② (몫 없음 — FCFS)
 *   ③ t 에 도착한 것들이 목록 차례로 줄 끝에 선다 ⑥ CPU 가 비었으면 줄 앞을 고른다 ⑦ 한 틱을 돈다.
 *   그래서 t 에 끝난 자리에 t 에 도착한 것이 바로 그 t 에 오를 수 있다
 * - 반환 = 끝 − 도착 · 대기 = 줄에 서 있던 틱 수. 둘이 대기 = 반환 − 길이 로 맞지 않으면 던진다
 *
 * 이벤트 (발신 차례대로):
 * - `init`     silent  { span: number }   — 마지막 끝 틱. 시계 축의 길이 (걸음 0 을 갈아 끼운다)
 * - `schedule`         { runs: { id: string; start: number; end: number }[] }
 *                        — 세 프로세스가 돈 결과를 한꺼번에 (목록 차례)
 * - `split`            { id: string; turnaround: number; wait: number }
 *                        — 그 프로세스의 반환이 대기 · 실행 두 토막으로 갈라진다 (목록 차례로 하나씩)
 * - `compare`          { x: string; y: string }
 *                        — 반환이 같고 대기가 다른 첫 짝 (목록 차례로 찾는다). 없으면 던진다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProcessSpec = { id: string; arrival: number; burst: number };

export type TurnaroundVsWaitFacetData = {
  type: 'turnaround-vs-wait';
  stepMs: number;
  processes: ProcessSpec[];
};

export type RunResult = { id: string; start: number; end: number; wait: number };

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** initialData 의 프로세스 목록을 좁힌다. 모르는 모양이면 던진다 (장면도 이것을 쓴다). */
export function readProcesses(data: unknown): ProcessSpec[] {
  if (typeof data !== 'object' || data === null) {
    throw new Error('turnaround-vs-wait: initialData 가 객체가 아니다');
  }
  const list = (data as { processes?: unknown }).processes;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('turnaround-vs-wait: processes 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return list.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`turnaround-vs-wait: processes[${i}] 가 객체가 아니다`);
    }
    const { id, arrival, burst } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`turnaround-vs-wait: processes[${i}].id 가 없다`);
    }
    if (seen.has(id)) throw new Error(`turnaround-vs-wait: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (!isNonNegInt(arrival)) {
      throw new Error(`turnaround-vs-wait: ${id} 의 도착이 0 이상 정수가 아니다`);
    }
    if (!isNonNegInt(burst) || burst === 0) {
      throw new Error(`turnaround-vs-wait: ${id} 의 길이가 1 이상 정수가 아니다`);
    }
    return { id, arrival, burst };
  });
}

/** FCFS 를 틱 단위로 돌린다. 목록 차례의 결과를 돌려준다. */
export function runFcfs(procs: ProcessSpec[]): RunResult[] {
  const remaining = new Map<string, number>(procs.map((p) => [p.id, p.burst]));
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  const waited = new Map<string, number>(procs.map((p) => [p.id, 0]));
  const queue: string[] = [];
  let running: string | null = null;
  // 지평: 가장 늦은 도착 + 길이의 합이면 FCFS 는 반드시 다 끝난다
  const horizon = Math.max(...procs.map((p) => p.arrival)) + procs.reduce((s, p) => s + p.burst, 0);

  for (let tick = 0; tick <= horizon; tick += 1) {
    // ① 끝
    if (running !== null && remaining.get(running) === 0) {
      end.set(running, tick);
      running = null;
    }
    // ③ 도착 — 목록 차례
    for (const p of procs) {
      if (p.arrival === tick) queue.push(p.id);
    }
    // ⑥ 고름
    if (running === null) {
      const head = queue.shift();
      if (head !== undefined) {
        running = head;
        if (!start.has(head)) start.set(head, tick);
      }
    }
    if (end.size === procs.length) break;
    // ⑦ 한 틱 — 줄에 선 것은 한 틱을 기다린다
    for (const id of queue) waited.set(id, (waited.get(id) as number) + 1);
    if (running !== null) remaining.set(running, (remaining.get(running) as number) - 1);
  }

  return procs.map((p) => {
    const s = start.get(p.id);
    const e = end.get(p.id);
    if (s === undefined || e === undefined) {
      throw new Error(`turnaround-vs-wait: ${p.id} 가 지평 ${horizon} 안에 끝나지 않았다`);
    }
    const wait = waited.get(p.id) as number;
    if (wait !== e - p.arrival - p.burst) {
      throw new Error(`turnaround-vs-wait: ${p.id} 의 대기 ${wait} 가 반환 − 길이와 다르다`);
    }
    return { id: p.id, start: s, end: e, wait };
  });
}

export async function turnaroundVsWait(
  context: FacetContext<TurnaroundVsWaitFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<TurnaroundVsWaitFacetData>;
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('turnaround-vs-wait: stepMs 가 양수가 아니다');
  }
  const procs = readProcesses(ctx.data);
  const runs = runFcfs(procs);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const span = Math.max(...runs.map((r) => r.end));
  await ctx.emit({ type: 'init', payload: { span }, silent: true });

  // 걸음 0 은 도착이 이미 보이는 화면이라 읽을 틈을 둔다
  if (!(await pause())) return;
  await ctx.emit({
    type: 'schedule',
    payload: { runs: runs.map((r) => ({ id: r.id, start: r.start, end: r.end })) },
  });

  for (let i = 0; i < procs.length; i += 1) {
    if (!(await pause())) return;
    const p = procs[i];
    const r = runs[i];
    await ctx.emit({
      type: 'split',
      payload: { id: p.id, turnaround: r.end - p.arrival, wait: r.wait },
    });
  }

  // 반환이 같고 대기가 다른 첫 짝
  let pair: { x: string; y: string } | null = null;
  for (let i = 0; i < procs.length && pair === null; i += 1) {
    if (ctx.cancelled) return;
    for (let j = i + 1; j < procs.length; j += 1) {
      if (ctx.cancelled) return;
      const ti = runs[i].end - procs[i].arrival;
      const tj = runs[j].end - procs[j].arrival;
      if (ti === tj && runs[i].wait !== runs[j].wait) {
        pair = { x: procs[i].id, y: procs[j].id };
        break;
      }
    }
  }
  if (pair === null) {
    throw new Error('turnaround-vs-wait: 반환이 같고 대기가 다른 짝이 데이터에 없다');
  }
  if (!(await pause())) return;
  await ctx.emit({ type: 'compare', payload: pair });
}
