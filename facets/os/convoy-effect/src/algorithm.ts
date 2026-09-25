/**
 * convoy-effect — FCFS 에서 긴 것 하나가 앞에 서면 뒤의 짧은 것들의 기다림이 함께 불어난다.
 *
 * 틱 모형 (공통 규약)
 * - 시각은 정수 틱. CPU 하나 · 입출력 없음 · 바꾸는 비용 0 틱. FCFS, 선점 없음.
 * - 틱 경계 tick 에서의 차례: ① 돌던 것의 남은 양이 0 이면 tick 에 끝난다 → ② tick 에 도착한 것들이
 *   목록 차례대로 줄 끝에 선다 → ③ CPU 가 비었으면 줄 맨 앞이 오른다 → ④ 한 틱(tick → tick+1)을 돈다.
 *   그래서 tick 에 끝난 자리에 tick 에 도착한 것이 바로 그 tick 에 오를 수 있다.
 * - 기다린 틱 = 그 틱 동안 줄에 서 있었던 틱 수 (= 반환 − 길이).
 * - 앞장선 것(lead) = 맨 처음 CPU 에 오른 것. 나머지를 뒤따른 것으로 센다.
 *
 * 발신 이벤트
 * - `start`  (silent) 틱 0 경계. 걸음 0 을 갈아 끼운다.
 *     payload { tick: number, arrive: string[], run: string }
 *     arrive = 틱 0 에 도착한 식별자 (목록 차례), run = 오른 것 (= lead)
 * - `tick`   한 틱을 돈 걸음. 걸음 하나 = 틱 하나.
 *     payload { from: number, to: number, arrive: string[], run: string | null,
 *               started: boolean, waiting: string[], remaining: number, finished: boolean }
 *     arrive  = 경계 from 에 도착한 것 (틱 0 의 도착은 start 가 이미 보였다 — 여기서는 빈 배열)
 *     run     = 이 틱에 CPU 를 쓴 것 (없으면 null)
 *     started = run 이 경계 from 에 막 오른 것인가 (틱 0 의 오름은 start 가 보였다 — 여기서는 false)
 *     waiting = 이 틱 동안 줄에 서 있던 것 (줄 차례). 저마다 기다린 틱이 1 는다
 *     remaining = 이 틱 뒤 run 의 남은 양, finished = 그 남은 양이 0 이라 to 에 끝났는가
 * - `finish` 다 끝난 뒤의 합산.
 *     payload { ran: number, waited: number, during: number, after: number }
 *     ran = 뒤따른 것들이 쓴 틱 합, waited = 뒤따른 것들이 기다린 틱 합,
 *     during = 그중 lead 가 CPU 를 쥔 동안 쌓인 몫, after = 그 뒤 쌓인 몫
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConvoyJob = { id: string; arrive: number; length: number };

export type ConvoyEffectFacetData = {
  type: 'convoy-effect';
  stepMs: number;
  jobs: ConvoyJob[];
};

/** 자료를 좁힌다. 모르는 모양은 조용히 넘기지 않고 던진다. */
export function readConvoyJobs(raw: unknown): ConvoyJob[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('convoy-effect: jobs 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`convoy-effect: jobs[${i}] 가 객체가 아니다`);
    }
    const rec = item as Record<string, unknown>;
    const id = rec['id'];
    const arrive = rec['arrive'];
    const length = rec['length'];
    if (typeof id !== 'string' || id === '') throw new Error(`convoy-effect: jobs[${i}].id 가 없다`);
    if (seen.has(id)) throw new Error(`convoy-effect: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (typeof arrive !== 'number' || !Number.isInteger(arrive) || arrive < 0) {
      throw new Error(`convoy-effect: ${id} 의 도착이 0 이상의 정수가 아니다`);
    }
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 1) {
      throw new Error(`convoy-effect: ${id} 의 길이가 1 이상의 정수가 아니다`);
    }
    return { id, arrive, length };
  });
}

export async function convoyEffect(ctx: FacetContext<ConvoyEffectFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ConvoyEffectFacetData>;
  const stepMs = ctx.data.stepMs;
  const jobs = readConvoyJobs(ctx.data.jobs);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const remaining = new Map<string, number>(jobs.map((j) => [j.id, j.length]));
  const waited = new Map<string, number>(jobs.map((j) => [j.id, 0]));
  const queue: string[] = [];
  // 지평 — 모두가 도착한 뒤 길이 합만큼 돌면 반드시 끝난다. 넘으면 셈이 틀린 것이다.
  const horizon = Math.max(...jobs.map((j) => j.arrive)) + jobs.reduce((s, j) => s + j.length, 0);

  let running: string | null = null;
  let lead: string | null = null;
  let done = 0;
  let during = 0;
  let after = 0;

  /** 틱 경계의 ②·③ — 도착을 줄 끝에 세우고, CPU 가 비었으면 앞을 올린다. */
  function boundary(tick: number): { arrive: string[]; started: boolean } {
    const arrive = jobs.filter((j) => j.arrive === tick).map((j) => j.id);
    queue.push(...arrive);
    let started = false;
    if (running === null) {
      const next = queue.shift();
      if (next !== undefined) {
        running = next;
        started = true;
        if (lead === null) lead = next;
      }
    }
    return { arrive, started };
  }

  const first = boundary(0);
  if (running === null) throw new Error('convoy-effect: 틱 0 에 도착한 것이 없다');
  await rctx.emit({
    type: 'start',
    silent: true,
    payload: { tick: 0, arrive: first.arrive, run: running },
  });
  // 걸음 0 은 이미 읽을 것이 있는 화면이다 (큰 작업이 막 올랐다) — 첫 틱 앞에 쉰다.

  for (let tick = 0; done < jobs.length; tick += 1) {
    if (!(await pause())) return;
    if (tick >= horizon) throw new Error(`convoy-effect: 지평 ${horizon} 안에 끝나지 않았다`);
    const facts = tick === 0 ? { arrive: [] as string[], started: false } : boundary(tick);

    const run: string | null = running;
    const waiting = [...queue];
    for (const id of waiting) waited.set(id, (waited.get(id) ?? 0) + 1);
    if (run !== null && run === lead) during += waiting.length;
    else after += waiting.length;

    let left = 0;
    let finished = false;
    if (run !== null) {
      const had = remaining.get(run);
      if (had === undefined || had < 1) throw new Error(`convoy-effect: ${run} 의 남은 양을 셀 수 없다`);
      left = had - 1;
      remaining.set(run, left);
      if (left === 0) {
        // ① 다음 경계 tick+1 에 끝난다.
        finished = true;
        done += 1;
        running = null;
      }
    }

    await rctx.emit({
      type: 'tick',
      payload: {
        from: tick,
        to: tick + 1,
        arrive: facts.arrive,
        run,
        started: facts.started,
        waiting,
        remaining: left,
        finished,
      },
    });
  }

  if (!(await pause())) return;
  const followers = jobs.filter((j) => j.id !== lead);
  const ran = followers.reduce((s, j) => s + j.length, 0);
  const waitedSum = followers.reduce((s, j) => s + (waited.get(j.id) ?? 0), 0);
  if (lead !== null && (waited.get(lead) ?? 0) !== 0) {
    throw new Error('convoy-effect: 앞장선 것이 기다렸다 — 모형이 어긋났다');
  }
  if (during + after !== waitedSum) throw new Error('convoy-effect: 기다림의 두 몫이 합과 맞지 않다');
  await rctx.emit({ type: 'finish', payload: { ran, waited: waitedSum, during, after } });
}
