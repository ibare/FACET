/**
 * log-replicate-in-order — 리더가 어긋난 팔로워 로그를 거슬러 가서 맞춘다 (Raft 로그 복제).
 *
 * 규약 (사양 그대로):
 *   - 칸 = (term, 명령), 번호는 1 부터
 *   - 리더의 nextIndex 는 처음 제 마지막 번호 + 1
 *   - 보내는 것 = 앞 칸 번호 (nextIndex − 1) 와 그 칸의 term, nextIndex 부터 끝까지의 칸
 *     (앞 칸 번호가 0 이면 term 0 — 누구나 받는다)
 *   - 팔로워는 앞 칸 번호에 같은 term 의 칸이 있을 때만 받는다. 없거나 term 이 다르면 거절
 *   - 거절이면 nextIndex − 1 로 다시 보낸다
 *   - 받으면 앞 칸 뒤의 제 칸을 모두 지우고 받은 칸을 번호 차례로 적는다
 *   - 걸음 묶기: 보냄 한 걸음 · 거절 한 걸음 · 맞음과 지움 한 걸음 · 적는 칸 하나 = 한 걸음
 *
 * 이벤트 (차례대로):
 *   init   { nextIndex: number }                                         silent — 걸음 0 을 갈아 끼운다
 *   send   { prev: number; prevTerm: number; entries: IndexedEntry[] }    보냄
 *   reject { prev: number; have: number | null; want: number; from: number; to: number }
 *                                                                        거절. have 는 팔로워 앞 칸의 term, 칸이 없으면 null
 *   match  { prev: number; term: number; cut: IndexedEntry[] }           맞음 + 앞 칸 뒤 지움
 *   write  { index: number; term: number; cmd: string }                  팔로워가 칸 하나를 적는다
 *   done   { through: number; sent: number; rejected: number; deleted: number; written: number }
 *
 *   IndexedEntry = { index: number; term: number; cmd: string }
 *
 * 두 로그가 끝에 같지 않으면 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LogEntry = { term: number; cmd: string };
export type IndexedEntry = { index: number; term: number; cmd: string };

export type LogReplicateInOrderFacetData = {
  type: 'log-replicate-in-order';
  stepMs: number;
  leaderId: string;
  followerId: string;
  leader: LogEntry[];
  follower: LogEntry[];
};

function narrowEntries(raw: unknown, where: string): LogEntry[] {
  if (!Array.isArray(raw)) throw new Error(`log-replicate-in-order: ${where} 가 배열이 아니다`);
  return raw.map((e: unknown, i) => {
    if (typeof e !== 'object' || e === null) {
      throw new Error(`log-replicate-in-order: ${where} ${i + 1} 번 칸이 객체가 아니다`);
    }
    const term = (e as { term?: unknown }).term;
    const cmd = (e as { cmd?: unknown }).cmd;
    if (typeof term !== 'number' || !Number.isInteger(term) || term < 1) {
      throw new Error(`log-replicate-in-order: ${where} ${i + 1} 번 칸의 term 이 1 이상 정수가 아니다`);
    }
    if (typeof cmd !== 'string' || cmd === '') {
      throw new Error(`log-replicate-in-order: ${where} ${i + 1} 번 칸의 명령이 비었다`);
    }
    return { term, cmd };
  });
}

/** 자료를 좁힌다. 장면 · 알고리즘이 같은 좁히개를 쓴다. */
export function narrowLogData(raw: unknown): LogReplicateInOrderFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('log-replicate-in-order: 자료가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'log-replicate-in-order') {
    throw new Error(`log-replicate-in-order: 자료 종류가 다르다 (${String(d.type)})`);
  }
  if (typeof d.stepMs !== 'number' || d.stepMs < 0) {
    throw new Error('log-replicate-in-order: stepMs 가 없다');
  }
  if (typeof d.leaderId !== 'string' || d.leaderId === '') {
    throw new Error('log-replicate-in-order: leaderId 가 없다');
  }
  if (typeof d.followerId !== 'string' || d.followerId === '') {
    throw new Error('log-replicate-in-order: followerId 가 없다');
  }
  return {
    type: 'log-replicate-in-order',
    stepMs: d.stepMs,
    leaderId: d.leaderId,
    followerId: d.followerId,
    leader: narrowEntries(d.leader, 'leader'),
    follower: narrowEntries(d.follower, 'follower'),
  };
}

export async function logReplicateInOrder(
  ctx0: FacetContext<LogReplicateInOrderFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<LogReplicateInOrderFacetData>;
  const data = narrowLogData(ctx.data);
  const stepMs = data.stepMs;
  const leader = data.leader;
  const follower = data.follower.map((e) => ({ term: e.term, cmd: e.cmd }));

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let nextIndex = leader.length + 1;
  await ctx.emit({ type: 'init', payload: { nextIndex }, silent: true });
  // 걸음 0 은 두 로그 전체가 이미 읽을 것이라 첫 보냄 앞에 틈을 둔다
  if (!(await pause())) return;

  let sent = 0;
  let rejected = 0;
  let deleted = 0;
  let written = 0;

  for (;;) {
    if (ctx.cancelled) return;
    if (nextIndex < 1) throw new Error(`log-replicate-in-order: nextIndex ${nextIndex} 가 1 아래다`);
    const prev = nextIndex - 1;
    let prevTerm = 0;
    if (prev >= 1) {
      const at = leader[prev - 1];
      if (at === undefined) throw new Error(`log-replicate-in-order: 리더에 ${prev} 번 칸이 없다`);
      prevTerm = at.term;
    }
    const entries: IndexedEntry[] = leader
      .slice(nextIndex - 1)
      .map((e, k) => ({ index: nextIndex + k, term: e.term, cmd: e.cmd }));
    await ctx.emit({ type: 'send', payload: { prev, prevTerm, entries } });
    sent += 1;
    if (!(await pause())) return;

    const mine = prev >= 1 ? follower[prev - 1] : undefined;
    const have = mine === undefined ? null : mine.term;
    const ok = prev === 0 || have === prevTerm;
    if (!ok) {
      await ctx.emit({
        type: 'reject',
        payload: { prev, have, want: prevTerm, from: nextIndex, to: nextIndex - 1 },
      });
      rejected += 1;
      nextIndex -= 1;
      if (!(await pause())) return;
      continue;
    }

    const cut: IndexedEntry[] = follower
      .slice(prev)
      .map((e, k) => ({ index: prev + 1 + k, term: e.term, cmd: e.cmd }));
    follower.length = prev;
    deleted += cut.length;
    await ctx.emit({ type: 'match', payload: { prev, term: prevTerm, cut } });
    if (!(await pause())) return;

    for (const e of entries) {
      if (ctx.cancelled) return;
      if (e.index !== follower.length + 1) {
        throw new Error(`log-replicate-in-order: ${e.index} 번 칸을 적을 자리가 아니다`);
      }
      follower.push({ term: e.term, cmd: e.cmd });
      written += 1;
      await ctx.emit({ type: 'write', payload: { index: e.index, term: e.term, cmd: e.cmd } });
      if (!(await pause())) return;
    }
    break;
  }

  if (follower.length !== leader.length) {
    throw new Error('log-replicate-in-order: 끝에 두 로그의 길이가 다르다');
  }
  leader.forEach((e, i) => {
    const f = follower[i];
    if (f === undefined || f.term !== e.term || f.cmd !== e.cmd) {
      throw new Error(`log-replicate-in-order: 끝에 ${i + 1} 번 칸이 다르다`);
    }
  });
  await ctx.emit({
    type: 'done',
    payload: { through: leader.length, sent, rejected, deleted, written },
  });
  await pause();
}
