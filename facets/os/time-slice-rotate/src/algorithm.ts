/**
 * time-slice-rotate — 라운드 로빈에서 몫을 다 쓴 프로세스는 줄 끝으로 돌아간다.
 *
 * 모형: 시각의 단위는 틱(정수). CPU 하나 · 입출력 없음 · 바꾸는 비용 0 틱. 선점 없음 —
 * 몫 끝에서만 내려온다. 틱 경계 tick 에서 일어나는 차례 (같은 틱에 겹치면 이 차례):
 *   1. 돌던 것의 남은 양이 0 이면 tick 에 끝난다 (끝이 먼저)
 *   2. 몫을 다 썼는데 남은 양이 있으면 CPU 에서 내려온다 (아직 줄에 서지 않는다)
 *   3. tick 에 도착한 것들이 줄 끝에 선다 — 같은 틱 도착끼리는 데이터 목록 차례
 *   4. 2 에서 내려온 것이 그 뒤에 선다 (같은 틱이면 도착이 먼저, 몫을 다 쓴 것은 뒤)
 *   5. CPU 가 비었으면 줄 맨 앞을 올린다
 *   6. 한 틱을 돈다
 * 그래서 몫 안에 끝나면 그 자리에서 끝나고, 다음이 같은 틱에 바로 오른다.
 *
 * 이벤트 (걸음 = 사건이 있는 틱 경계 하나. 사건 없는 경계는 내지 않는다):
 *
 *   boundary   (silent 아님)
 *     payload: {
 *       tick: number;                      이 경계의 틱
 *       ran: { id: string; from: number; left: number } | null;
 *                                          앞 경계(from)부터 이 경계까지 CPU 에 있던 것과 그 뒤 남은 양
 *       finished: string | null;           1 에서 끝난 것
 *       arrived: string[];                 3 에서 줄 끝에 선 것 (목록 차례)
 *       back: { id: string; left: number } | null;
 *                                          2·4 에서 몫을 다 써 줄 끝으로 돌아간 것과 남은 양
 *       picked: string | null;             5 에서 CPU 에 오른 것
 *     }
 *
 * 걸음 0 (t0 직전, 첫 발신 앞) 은 장면의 initial 이 initialData 에서 세운다 —
 * t0 에 도착하는 것들이 이미 줄에 서 있는 화면이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RotateProcData = { id: string; arrive: number; len: number };

export type TimeSliceRotateFacetData = {
  type: 'time-slice-rotate';
  stepMs: number;
  quantum: number;
  procs: RotateProcData[];
};

function isInt(v: unknown, min: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min;
}

/** initialData 를 좁힌다. 장면도 같은 함수를 부른다 — 틀린 자료는 던진다. */
export function readRotateData(raw: unknown): { quantum: number; procs: RotateProcData[] } {
  if (typeof raw !== 'object' || raw === null) throw new Error('time-slice-rotate: initialData 가 객체가 아니다');
  const rec = raw as Record<string, unknown>;
  if (!isInt(rec.quantum, 1)) throw new Error('time-slice-rotate: quantum 은 1 이상의 정수여야 한다');
  if (!Array.isArray(rec.procs) || rec.procs.length === 0) {
    throw new Error('time-slice-rotate: procs 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  const procs = rec.procs.map((p, i): RotateProcData => {
    if (typeof p !== 'object' || p === null) throw new Error(`time-slice-rotate: procs[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') throw new Error(`time-slice-rotate: procs[${i}].id 가 없다`);
    if (seen.has(q.id)) throw new Error(`time-slice-rotate: 식별자 ${q.id} 가 겹친다`);
    seen.add(q.id);
    if (!isInt(q.arrive, 0)) throw new Error(`time-slice-rotate: ${q.id} 의 도착이 0 이상의 정수가 아니다`);
    if (!isInt(q.len, 1)) throw new Error(`time-slice-rotate: ${q.id} 의 길이가 1 이상의 정수가 아니다`);
    return { id: q.id, arrive: q.arrive, len: q.len };
  });
  return { quantum: rec.quantum, procs };
}

export async function timeSliceRotate(ctx: FacetContext<TimeSliceRotateFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<TimeSliceRotateFacetData>;
  const stepMs = rctx.data.stepMs;
  const { quantum, procs } = readRotateData(rctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const left = new Map<string, number>(procs.map((p) => [p.id, p.len]));
  const queue: string[] = [];
  let cpu: string | null = null;
  let usedInTurn = 0;
  let lastEmit = 0;
  let doneCount = 0;
  // 빈 CPU 틱을 다 더해도 이 지평 안에 모두 끝난다. 넘으면 모형이 틀린 것이다.
  const horizon = procs.reduce((s, p) => s + p.len, 0) + Math.max(...procs.map((p) => p.arrive)) + 1;

  for (let tick = 0; ; tick += 1) {
    if (rctx.cancelled) return;
    if (tick > horizon) throw new Error(`time-slice-rotate: 틱 ${horizon} 안에 끝나지 않는다`);

    const ranId = cpu;
    let finished: string | null = null;
    let offCpu: string | null = null;
    // 1 · 2
    if (cpu !== null) {
      const l = left.get(cpu);
      if (l === undefined) throw new Error(`time-slice-rotate: 모르는 식별자 ${cpu}`);
      if (l === 0) {
        finished = cpu;
        doneCount += 1;
        cpu = null;
      } else if (usedInTurn === quantum) {
        offCpu = cpu;
        cpu = null;
      }
    }
    // 3
    const arrived = procs.filter((p) => p.arrive === tick).map((p) => p.id);
    queue.push(...arrived);
    // 4
    let back: { id: string; left: number } | null = null;
    if (offCpu !== null) {
      queue.push(offCpu);
      back = { id: offCpu, left: left.get(offCpu) as number };
    }
    // 5
    let picked: string | null = null;
    if (cpu === null && queue.length > 0) {
      picked = queue.shift() as string;
      cpu = picked;
      usedInTurn = 0;
    }

    if (finished !== null || back !== null || arrived.length > 0 || picked !== null) {
      const ran = ranId === null ? null : { id: ranId, from: lastEmit, left: left.get(ranId) as number };
      if (!(await pause())) return;
      await rctx.emit({ type: 'boundary', payload: { tick, ran, finished, arrived, back, picked } });
      lastEmit = tick;
    }

    if (doneCount === procs.length) return;

    // 6
    if (cpu !== null) {
      const l = left.get(cpu) as number;
      left.set(cpu, l - 1);
      usedInTurn += 1;
    }
  }
}
