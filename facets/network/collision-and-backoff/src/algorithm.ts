/**
 * collision-and-backoff — 한 선을 나눠 쓰는 스테이션들이 같은 슬롯에 보내 부딪히고,
 * 각자 다른 기다림을 쥐고 물러났다가 차례로 선을 차지한다 (CSMA/CD).
 *
 * 모형 (사양의 규약):
 * - 시간은 슬롯 정수. 한 걸음 = 한 슬롯.
 * - 슬롯 머리에서 보낼 차례가 된 스테이션은 선을 듣는다. 이어 보내는 스테이션이 있으면 찬 선.
 *   빈 선이면 그 슬롯부터 보낸다. 같은 슬롯에 둘 이상이 보내면 충돌 — 그 슬롯 끝에 모두 멈춘다.
 * - n 번째 충돌 뒤 k ∈ 0 .. 2^min(n,10) − 1 을 데이터에서 꺼내 슬롯 `충돌 + 1 + k` 머리에서 다시 듣는다.
 *   k 가 범위 밖이거나 데이터에 없으면 던진다. k 는 예로 정한 값이다 — 무작위를 쓰지 않는다.
 * - 다시 들었을 때 찬 선이면 빌 때까지 듣다가 빈 슬롯 머리에서 곧바로 보낸다 (1-지속).
 *
 * 줄인 자리 (설명 글이 밝힌다):
 * - 프레임 사이 틈(IFG)은 없다.
 * - 멈춤 신호(jam)는 충돌 슬롯 안에 접어 넣는다. 충돌 슬롯의 신호는 헛것이고, 충돌 뒤 선은 곧바로 빈다.
 * - 전파 지연 · 전송 시간은 셈하지 않는다. 슬롯의 실제 길이는 화면에 없다.
 *
 * 이벤트:
 * - `init` (silent) — payload `{ slots: number; ready: number }`. 재생 전체의 슬롯 수 (미리 셈한 결과)와
 *   슬롯 0 에 보낼 프레임이 준비된 스테이션 수.
 *   걸음 0 을 갈아 끼울 뿐 걸음을 늘리지 않는다.
 * - `slot` — 슬롯 하나. payload
 *   `{ slot: number;
 *      heard: { id: string; busy: boolean }[];   // 이 슬롯 머리에 선을 들은 스테이션 (데이터 차례)
 *      senders: string[];                         // 이 슬롯에 선에 신호를 낸 스테이션 (데이터 차례)
 *      collision: boolean;
 *      picks: { id: string; n: number; k: number; hi: number; relisten: number }[]; // 충돌일 때만
 *      left: number | null;                       // 혼자 보냈을 때 남은 프레임 슬롯
 *      doneBy: string | null;                     // 이 슬롯에서 마지막 슬롯을 보낸 스테이션
 *      waitLeft: { id: string; left: number }[];  // 슬롯 끝에서 남은 기다림 (충돌 뒤 쉬는 중인 것만)
 *      finished: boolean }`                       // 모두 다 보냈는가
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StationSpec = { id: string; readyAt: number; backoffK: number[] };

export type CollisionAndBackoffFacetData = {
  type: 'collision-and-backoff';
  stepMs: number;
  /** 방해받지 않으면 프레임 하나가 선을 차지하는 슬롯 수. */
  frameSlots: number;
  /** 데이터 차례 = 같은 슬롯에서 겪은 일의 차례. */
  stations: StationSpec[];
};

export type HeardRecord = { id: string; busy: boolean };
export type PickRecord = { id: string; n: number; k: number; hi: number; relisten: number };
export type WaitRecord = { id: string; left: number };

export type SlotRecord = {
  slot: number;
  heard: HeardRecord[];
  senders: string[];
  collision: boolean;
  picks: PickRecord[];
  left: number | null;
  doneBy: string | null;
  waitLeft: WaitRecord[];
  finished: boolean;
};

/** 끝나지 않는 데이터를 막는 상한. 넘으면 던진다. */
const MAX_SLOTS = 64;

type StationState = {
  id: string;
  ks: number[];
  n: number;
  mode: 'waiting' | 'deferring' | 'sending' | 'done';
  waitUntil: number;
  sendingLeft: number;
};

/** 규약대로 슬롯을 하나씩 셈한다. 모르는 모양 · 셈할 수 없는 상태는 던진다. */
export function simulateSlots(data: CollisionAndBackoffFacetData): SlotRecord[] {
  const frame = data.frameSlots;
  if (!Number.isInteger(frame) || frame < 1) {
    throw new Error(`collision-and-backoff: frameSlots 가 양의 정수가 아니다 (${String(frame)})`);
  }
  if (data.stations.length < 2) {
    throw new Error('collision-and-backoff: 선을 나눠 쓸 스테이션이 둘 이상 있어야 한다');
  }
  const seen = new Set<string>();
  const states: StationState[] = data.stations.map((s) => {
    if (seen.has(s.id)) throw new Error(`collision-and-backoff: 스테이션 ${s.id} 가 두 번 있다`);
    seen.add(s.id);
    if (!Number.isInteger(s.readyAt) || s.readyAt < 0) {
      throw new Error(`collision-and-backoff: ${s.id} 의 readyAt 이 음이 아닌 정수가 아니다`);
    }
    return { id: s.id, ks: [...s.backoffK], n: 0, mode: 'waiting', waitUntil: s.readyAt, sendingLeft: 0 };
  });

  const records: SlotRecord[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
    // 슬롯 머리의 감지 — 이어 보내는 스테이션이 있으면 찬 선이다.
    const busyHead = states.some((s) => s.mode === 'sending');
    const heard: HeardRecord[] = [];
    const senders: StationState[] = [];
    for (const s of states) {
      if (s.mode === 'sending') {
        senders.push(s);
      } else if ((s.mode === 'waiting' || s.mode === 'deferring') && slot >= s.waitUntil) {
        heard.push({ id: s.id, busy: busyHead });
        if (busyHead) {
          s.mode = 'deferring';
        } else {
          s.mode = 'sending';
          s.sendingLeft = frame;
          senders.push(s);
        }
      }
    }

    const picks: PickRecord[] = [];
    let left: number | null = null;
    let doneBy: string | null = null;
    if (senders.length >= 2) {
      for (const s of senders) {
        s.n += 1;
        const k = s.ks.shift();
        if (k === undefined) {
          throw new Error(`collision-and-backoff: ${s.id} 의 ${s.n} 번째 충돌 뒤 k 가 데이터에 없다`);
        }
        const hi = 2 ** Math.min(s.n, 10) - 1;
        if (!Number.isInteger(k) || k < 0 || k > hi) {
          throw new Error(`collision-and-backoff: ${s.id} 의 k=${k} 가 범위 0..${hi} 밖이다`);
        }
        s.mode = 'waiting';
        s.waitUntil = slot + 1 + k;
        s.sendingLeft = 0;
        picks.push({ id: s.id, n: s.n, k, hi, relisten: slot + 1 + k });
      }
    } else if (senders.length === 1) {
      const s = senders[0];
      s.sendingLeft -= 1;
      left = s.sendingLeft;
      if (s.sendingLeft === 0) {
        s.mode = 'done';
        doneBy = s.id;
      }
    }

    const waitLeft: WaitRecord[] = states
      .filter((s) => s.mode === 'waiting' && s.n > 0)
      .map((s) => ({ id: s.id, left: s.waitUntil - (slot + 1) }));
    const finished = states.every((s) => s.mode === 'done');
    records.push({
      slot,
      heard,
      senders: senders.map((s) => s.id),
      collision: senders.length >= 2,
      picks,
      left,
      doneBy,
      waitLeft,
      finished,
    });
    if (finished) return records;
  }
  throw new Error(`collision-and-backoff: ${MAX_SLOTS} 슬롯 안에 끝나지 않았다`);
}

export async function collisionAndBackoff(
  ctx: FacetContext<CollisionAndBackoffFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<CollisionAndBackoffFacetData>;
  const stepMs = ctx.data.stepMs;
  const records = simulateSlots(ctx.data);
  const ready = ctx.data.stations.filter((s) => s.readyAt === 0).length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { slots: records.length, ready }, silent: true });

  // 걸음 0 은 두 스테이션과 빈 선이 이미 서 있는 화면이다 — 읽을 틈을 둔다.
  for (const r of records) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'slot',
      payload: {
        slot: r.slot,
        heard: r.heard.map((h) => ({ ...h })),
        senders: [...r.senders],
        collision: r.collision,
        picks: r.picks.map((p) => ({ ...p })),
        left: r.left,
        doneBy: r.doneBy,
        waitLeft: r.waitLeft.map((w) => ({ ...w })),
        finished: r.finished,
      },
    });
  }
}
