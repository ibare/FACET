/**
 * 쓰기 정책 — 고친 값을 언제 아래층으로 내려보낼 것인가.
 *
 * 같은 열 번의 고침에 아래층으로 내려가는 쓰기가 열과 다섯으로 갈린다.
 * write-through 는 고칠 때마다 하나씩 내려보내 아래층이 늘 참이지만 버스가
 * 바쁘고, write-back 은 줄 위에 모아 두었다가 쫓겨날 때 한 덩어리로 내려보내
 * 트래픽이 줄지만 그동안 아래층은 낡은 값을 들고 있다.
 *
 * **끝에 남은 고쳐진 줄까지 센다.** 재생이 끝난 뒤 캐시에 남은 고쳐진 줄도
 * 언젠가는 내려가야 하므로 그것까지 세야 다섯이 된다. 세지 않으면 하나가 되고
 * 그것은 거짓이다.
 *
 * ── 이벤트
 * 표준은 `done` 뿐이고 메타 `phase` 를 뺀 나머지는 이 facet 의 확장이다 (C2).
 *
 *   phase        { phase }                  silent. 코드 패널 동기화
 *   restart      { policy }                 처음부터 다시 재생. policy 는 식별자
 *                                           ('through' | 'back') 이지 문안이 아니다
 *   write-begin  { step, line }             쓰기 차례 하나를 집는다
 *   fill         { slot, line }             줄이 칸에 들어온다
 *   evict        { slot, line }             줄이 칸에서 쫓겨난다
 *   mark-dirty   { slot, line, pending }    안 내려간 고침이 그 칸에 쌓인다
 *   descend      { slot, line, folded, reason }
 *                                           아래층으로 한 번 내려간다.
 *                                           folded 는 그 한 번에 실려 내려간 고침 수,
 *                                           reason 은 'through' | 'evict' | 'flush'
 *   done         { sent }                   아래층에 닿은 쓰기의 총수
 *
 * `descend` 한 번이 곧 아래층 쓰기 한 번이다. folded 가 둘이어도 내려가는 것은
 * 한 번이며 — 그것이 write-back 이 아끼는 바로 그 지점이다 — 모든 folded 를
 * 더하면 언제나 고친 횟수(10)와 같다.
 *
 * ── phase 어휘 (irs.ts 와 집합이 정확히 같다 — C3)
 *   'lookup' | 'hit' | 'evict' | 'fill' | 'store' | 'flush' | 'done'
 *
 * ── 메트릭 (facet.ts 의 metrics[] 와 이름이 같다 — C5)
 *   write-count         고친 횟수. 정책과 무관하게 열로 같다
 *   memory-write-count  아래층으로 내려간 횟수. 정책이 가르는 것은 이쪽뿐이다
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type WritePolicyData = {
  type: string;
  /** 캐시 칸 수. 완전 연관이라 어느 줄이든 어느 칸에나 들어간다. */
  slots: number;
  /** 한 줄이 담는 바이트. 셈에는 쓰이지 않고 화면이 전제를 밝히는 데 쓴다. */
  lineBytes: number;
  /** 쓰기 차례 — 고칠 줄 번호를 순서대로. */
  writes: number[];
  /** 정책 식별자 목록. 사람이 읽는 이름은 데이터가 아니다. */
  policies: string[];
  /** 시작 정책 식별자. */
  policy: string;
  /** 걸음 사이의 간격(ms). */
  stepMs: number;
};

/** 그 줄을 담고 있는 칸. 없으면 -1. (ctx 를 받지 않는 순수 헬퍼 — C8 예외) */
function findSlot(line: number[], used: number[], target: number): number {
  for (let s = 0; s < line.length; s += 1) {
    if (used[s] === 1 && line[s] === target) return s;
  }
  return -1;
}

/** 버릴 칸. 빈 칸이 먼저, 없으면 가장 오래 안 쓰인 칸 (LRU). */
function pickVictim(used: number[], time: number[]): number {
  for (let s = 0; s < used.length; s += 1) {
    if (used[s] === 0) return s;
  }
  let best = 0;
  let bestTime = time[0];
  for (let s = 1; s < time.length; s += 1) {
    if (time[s] < bestTime) {
      bestTime = time[s];
      best = s;
    }
  }
  return best;
}

export const writePolicyAlgorithm = async (
  ctxIn: FacetContext<WritePolicyData>,
): Promise<void> => {
  const ctx = ctxIn as ReactiveContext<WritePolicyData>;
  const data = ctx.data;
  const writes = data.writes;
  const slotCount = data.slots;
  const policies = data.policies;
  const stepMs = data.stepMs;

  /** phase 는 호출부에 리터럴로 남는다 — 헬퍼는 C3 이 허용하는 형태다. */
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 러너가 되돌리기 때만 비운다. 정책을 바꿔 다시 재생할 때는 알고리즘이
  // 스스로 0 으로 되돌려야 두 번째 재생의 수가 첫 번째에 얹히지 않는다.
  let edits = 0;
  let sent = 0;
  function rewindMetrics(): void {
    if (edits !== 0) ctx.metric('write-count', -edits);
    if (sent !== 0) ctx.metric('memory-write-count', -sent);
    edits = 0;
    sent = 0;
  }

  /** 아래층으로 한 번 내려간다. folded 가 몇이든 내려가는 것은 한 번이다. */
  async function descend(
    slot: number,
    lineNo: number,
    folded: number,
    reason: string,
  ): Promise<void> {
    sent += 1;
    ctx.metric('memory-write-count', 1);
    await ctx.emit({ type: 'descend', payload: { slot, line: lineNo, folded, reason } });
  }

  /** 한 정책으로 쓰기 차례를 끝까지 돌린다. 끝까지 갔으면 true. */
  async function replay(policyIdx: number): Promise<boolean> {
    const name = policies[policyIdx];
    const back = name === 'back';

    rewindMetrics();
    await ctx.emit({ type: 'restart', payload: { policy: name } });

    // 칸마다의 상태. irs.ts 가 이것을 매개변수로 받는 꼴로 같은 셈을 한다.
    const line: number[] = [];
    const used: number[] = [];
    const dirty: number[] = [];
    const time: number[] = [];
    /** 그 칸에 쌓인, 아직 안 내려간 고침의 수. 덩어리의 크기다. */
    const pending: number[] = [];
    for (let s = 0; s < slotCount; s += 1) {
      line.push(-1);
      used.push(0);
      dirty.push(0);
      time.push(0);
      pending.push(0);
    }
    let clock = 0;

    for (let i = 0; i < writes.length; i += 1) {
      if (ctx.cancelled) return false;
      const target = writes[i];
      clock += 1;

      await phase('lookup');
      await ctx.emit({ type: 'write-begin', payload: { step: i, line: target } });

      let s = findSlot(line, used, target);
      if (s >= 0) {
        await phase('hit');
      } else {
        await phase('evict');
        s = pickVictim(used, time);
        if (used[s] === 1) {
          // 쫓겨나는 줄이 고쳐진 줄이면 그때 한 덩어리로 내려간다.
          if (dirty[s] === 1) await descend(s, line[s], pending[s], 'evict');
          await ctx.emit({ type: 'evict', payload: { slot: s, line: line[s] } });
        }
        await phase('fill');
        line[s] = target;
        used[s] = 1;
        dirty[s] = 0;
        pending[s] = 0;
        await ctx.emit({ type: 'fill', payload: { slot: s, line: target } });
      }

      time[s] = clock;
      await phase('store');
      edits += 1;
      ctx.metric('write-count', 1);
      if (back) {
        dirty[s] = 1;
        pending[s] += 1;
        // `line` 을 함께 싣는다 — 캡션이 "줄 N 을 또 고쳤다" 라고 말하므로 칸 번호로는
        // 대신할 수 없다. 지금 데이터는 줄과 칸이 우연히 같은 자리에서만 되풀이 고침이
        // 나서 드러나지 않았는데, `writes` 나 칸 수가 바뀌면 곧바로 거짓이 된다.
        await ctx.emit({
          type: 'mark-dirty',
          payload: { slot: s, line: target, pending: pending[s] },
        });
      } else {
        await descend(s, target, 1, 'through');
      }

      if (!(await ctx.sleep(stepMs))) return false;
    }

    // 재생이 끝났다. 캐시에 남은 고쳐진 줄도 언젠가는 내려가야 한다.
    await phase('flush');
    for (let s = 0; s < slotCount; s += 1) {
      if (ctx.cancelled) return false;
      if (used[s] === 1 && dirty[s] === 1) {
        await descend(s, line[s], pending[s], 'flush');
        if (!(await ctx.sleep(stepMs))) return false;
      }
    }

    await phase('done');
    await ctx.emit({ type: 'done', payload: { sent } });
    return true;
  }

  /** 컨트롤바의 구간 슬라이더가 보낸 정책 번호. 우리 것이 아니면 null. */
  function readPolicy(input: ReactiveInputEvent): number | null {
    if (input.type !== 'policy') return null;
    const p = input.payload as { value?: unknown } | undefined;
    const v = p?.value;
    if (typeof v !== 'number') return null;
    if (v < 0 || v >= policies.length) return null;
    return v;
  }

  /**
   * 다음 정책 선택을 기다린다. 취소됐으면 null.
   *
   * null 은 오직 취소만 뜻한다 — 우리 것이 아닌 입력은 `continue` 로 흘려보내므로
   * 갈림과 취소가 한 값에 겹치지 않는다 (C8).
   */
  async function nextPolicy(): Promise<number | null> {
    for (;;) {
      if (ctx.cancelled) return null;
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return null;
      }
      if (ctx.cancelled) return null;
      const picked = readPolicy(input);
      if (picked === null) continue;
      return picked;
    }
  }

  let policyIdx = policies.indexOf(data.policy);
  if (policyIdx < 0) policyIdx = 0;

  for (;;) {
    if (ctx.cancelled) return;
    if (!(await replay(policyIdx))) return;
    const next = await nextPolicy();
    if (next === null) return;
    policyIdx = next;
  }
};
