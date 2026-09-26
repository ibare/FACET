/**
 * 배압 — 받는 쪽이 돌려보내는 크레딧이 보내는 쪽의 속도를 정한다.
 *
 * 크레딧 기반 흐름 제어 모형. 걸음 = 틱 하나. 한 틱 안의 차례:
 *   ① 받는 쪽 처리가 이 틱에 끝나면 그 통이 자리를 비우고 크레딧 1 이 보내는 쪽에 돌아온다
 *   ② 보내는 쪽에 남은 통이 있고 크레딧 > 0 이면 한 통을 보낸다 (크레딧 −1). 0 이면 기다린다
 *   ③ 받는 쪽이 놀고 있고 쥔 통 가운데 처리를 기다리는 것이 있으면 먼저 온 것을 잡는다
 * 불변식: 크레딧 + 받는 쪽이 쥔 통 수 = 자리 수 (틱마다, 어긋나면 던진다).
 *
 * 이벤트
 *   init   (silent) payload { lastTick: number }
 *          — 마지막 틱. 시간 줄의 끝을 그림이 따로 셈하지 않게 싣는다
 *   tick   payload {
 *            tick: number,
 *            returned: string | null,   // ① 처리가 끝나 자리를 비운 통 (크레딧 하나가 돌아간다)
 *            sent: string | null,       // ② 보낸 통
 *            gap: number | null,        // ② 앞서 보낸 틱과의 간격 (첫 통은 null)
 *            waited: boolean,           // ② 남은 통이 있는데 크레딧 0 이라 보내지 못했다
 *            started: string | null,    // ③ 처리를 시작한 통
 *            endsAt: number | null,     // ③ 그 통의 처리가 끝나는 틱
 *            credits: number,           // 틱 끝의 크레딧 (대조용)
 *            held: string[],            // 틱 끝에 받는 쪽이 쥔 통, 들어온 차례 (대조용)
 *          }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TellThemToSlowDownFacetData = {
  type: 'tell-them-to-slow-down';
  /** 보낼 통의 식별자. 틱 0 부터 보내는 쪽에 모두 준비되어 있다 */
  messages: string[];
  /** 받는 쪽 자리 수 (처리 중인 통 포함) = 보내는 쪽이 쥐고 시작하는 크레딧 */
  seats: number;
  /** 받는 쪽이 한 통을 처리하는 틱 수 */
  serviceTicks: number;
  stepMs: number;
};

export type CreditTick = {
  tick: number;
  returned: string | null;
  sent: string | null;
  gap: number | null;
  waited: boolean;
  started: string | null;
  endsAt: number | null;
  credits: number;
  held: string[];
};

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error(`tell-them-to-slow-down: ${path} 는 1 이상의 정수여야 한다 (받음: ${String(v)})`);
  }
  return v;
}

/** `initialData` 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. 알고리즘과 장면이 함께 쓴다. */
export function narrowTellThemToSlowDownData(raw: unknown): TellThemToSlowDownFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('tell-them-to-slow-down: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'tell-them-to-slow-down') {
    throw new Error(`tell-them-to-slow-down: initialData.type 이 어긋난다 (받음: ${String(d.type)})`);
  }
  if (!Array.isArray(d.messages) || d.messages.length === 0) {
    throw new Error('tell-them-to-slow-down: initialData.messages 는 비지 않은 배열이어야 한다');
  }
  const messages: string[] = [];
  d.messages.forEach((m, i) => {
    if (typeof m !== 'string' || m.length === 0) {
      throw new Error(`tell-them-to-slow-down: initialData.messages[${i}] 가 비지 않은 문자열이 아니다`);
    }
    if (messages.includes(m)) {
      throw new Error(`tell-them-to-slow-down: initialData.messages[${i}] 식별자 ${m} 가 겹친다`);
    }
    messages.push(m);
  });
  const seats = positiveInt(d.seats, 'initialData.seats');
  const serviceTicks = positiveInt(d.serviceTicks, 'initialData.serviceTicks');
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) {
    throw new Error('tell-them-to-slow-down: initialData.stepMs 는 양수여야 한다');
  }
  return { type: 'tell-them-to-slow-down', messages, seats, serviceTicks, stepMs: d.stepMs };
}

/** 크레딧 흐름 제어를 틱마다 셈한다. 모든 통을 받는 쪽이 처리하면 멈춘다. */
export function simulateCredits(data: TellThemToSlowDownFacetData): CreditTick[] {
  const pending = [...data.messages];
  const held: string[] = [];
  let credits = data.seats;
  let busy: { id: string; endsAt: number } | null = null;
  let lastSent: number | null = null;
  const rows: CreditTick[] = [];
  // 한 통은 늦어도 (자리 수 + 1) × 처리 틱 안에 끝난다 — 넘으면 모형이 멎은 것이다
  const limit = data.messages.length * (data.serviceTicks + 1) * (data.seats + 1);

  for (let tick = 0; pending.length > 0 || held.length > 0; tick += 1) {
    if (tick > limit) {
      throw new Error(`tell-them-to-slow-down: 틱 ${limit} 안에 끝나지 않았다`);
    }
    let returned: string | null = null;
    let sent: string | null = null;
    let gap: number | null = null;
    let waited = false;
    let started: string | null = null;
    let endsAt: number | null = null;

    // ① 끝난 통이 자리를 비우고 크레딧이 돌아온다
    if (busy !== null && busy.endsAt === tick) {
      if (held[0] !== busy.id) {
        throw new Error(`tell-them-to-slow-down: 틱 ${tick} 처리 중인 ${busy.id} 가 맨 앞 자리에 없다`);
      }
      held.shift();
      returned = busy.id;
      credits += 1;
      busy = null;
    }
    // ② 크레딧이 있으면 한 통을 보낸다
    if (pending.length > 0) {
      if (credits > 0) {
        const m = pending.shift();
        if (m === undefined) throw new Error('tell-them-to-slow-down: 보낼 통이 사라졌다');
        credits -= 1;
        held.push(m);
        sent = m;
        gap = lastSent === null ? null : tick - lastSent;
        lastSent = tick;
      } else {
        waited = true;
      }
    }
    // ③ 놀고 있으면 먼저 온 통을 잡는다
    if (busy === null && held.length > 0) {
      const first: string | undefined = held[0];
      if (first === undefined) throw new Error('tell-them-to-slow-down: 쥔 통이 비었다');
      busy = { id: first, endsAt: tick + data.serviceTicks };
      started = first;
      endsAt = busy.endsAt;
    }
    if (held.length > data.seats) {
      throw new Error(`tell-them-to-slow-down: 틱 ${tick} 받는 쪽이 자리 ${data.seats} 보다 많이 쥐었다`);
    }
    if (credits + held.length !== data.seats) {
      throw new Error(`tell-them-to-slow-down: 틱 ${tick} 크레딧 ${credits} + 쥔 통 ${held.length} ≠ ${data.seats}`);
    }
    rows.push({ tick, returned, sent, gap, waited, started, endsAt, credits, held: [...held] });
  }
  return rows;
}

export async function tellThemToSlowDown(
  ctx0: FacetContext<TellThemToSlowDownFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<TellThemToSlowDownFacetData>;
  const data = narrowTellThemToSlowDownData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const rows = simulateCredits(data);
  const last = rows[rows.length - 1];
  if (last === undefined) throw new Error('tell-them-to-slow-down: 셈한 틱이 없다');

  await ctx.emit({ type: 'init', payload: { lastTick: last.tick }, silent: true });

  // 걸음 0 은 보낼 통 · 크레딧 · 빈 받는 쪽이 이미 선 화면이라 읽을 틈을 먼저 둔다
  for (const row of rows) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'tick', payload: { ...row, held: [...row.held] } });
  }
}
