/**
 * split-brain — 네트워크가 갈라져 리더가 둘이 되면 Raft 는 어떻게 하나만 남기는가.
 *
 * 규약 (사양 그대로):
 *   - 과반 = 노드 수 ÷ 2 의 몫 + 1. 노드 수에서 셈한다
 *   - 선출: 선출 타이머가 가장 먼저 바닥난 노드(같은 시각이면 이름 차례)가 term + 1 후보가 되고
 *     표를 청한다. 표 요청은 편도 지연 뒤 닿고, 그때까지 제 타이머가 아직 남은 같은 쪽 노드가 표를 준다.
 *     표 답이 돌아오는 때(타이머 + 지연 × 2)에 표가 과반이면 리더. 이 조각은 선출을 한 걸음으로 줄인다
 *   - 쓰기: 리더가 제 로그 다음 칸에 (제 term, 명령) 을 적고 **닿을 수 있는** 팔로워(같은 쪽 · term ≤ 리더 term)에
 *     옮긴다. 사본 수가 과반 이상이면 그 칸이 확정된다
 *   - 이음이 붙으면 편도 지연 뒤 가장 높은 term 리더의 하트비트가 낮은 term 노드에 닿는다(이름 차례).
 *     더 큰 term 을 들은 노드는 곧바로 팔로워가 되고 term 을 올린다
 *   - 로그 맞추기: 다음 칸 = 리더 끝 + 1 에서 시작해, 앞 칸의 term 이 맞을 때까지 물러난다.
 *     맞은 칸 다음부터 지우고 리더 칸을 적는다. 노드마다 한 걸음으로 줄인다
 *
 * 이벤트 (발신 차례):
 *   partition  { at: number; side: number[]; majority: number }   — side 는 노드 차례로 쪽 번호. 한 걸음
 *   elect      { timeoutAt: number; candidate: string; term: number; voters: string[];
 *                leaderAt: number; majority: number }             — 한 걸음
 *   leaders    { leaders: { node: string; term: number }[] }      — 한 걸음
 *   write      { at: number; leader: string; term: number; cmd: string; index: number;
 *                holders: string[]; majority: number; committed: boolean }   — 쓰기마다 한 걸음
 *   heal       { at: number; leaders: { node: string; term: number }[] }    — 한 걸음
 *   heartbeat  { at: number; from: string; node: string; wasRole: 'leader' | 'follower';
 *                wasTerm: number; term: number; index: number;
 *                dropped: { term: number; cmd: string }[];
 *                written: { term: number; cmd: string }[]; commit: number }  — 낮은 term 노드마다 한 걸음
 *   done       { leaders: string[]; same: number; commit: number;
 *                kept: { term: number; cmd: string }[] }          — 한 걸음. kept = 확정된 칸 가운데 끝까지 한 번도 지워지지 않은 것 전부 (처음부터 확정된 칸 포함)
 * silent 인 이벤트는 없다. 걸음 0 은 장면의 initial() 이 initialData 에서 세운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitBrainEntry = { term: number; cmd: string };

export type SplitBrainFacetData = {
  type: 'split-brain';
  stepMs: number;
  /** 노드 식별자 */
  nodes: string[];
  /** 처음 리더 */
  leader: string;
  /** 처음 모두의 term */
  term: number;
  /** 처음 모두의 로그 (1 번부터) */
  log: SplitBrainEntry[];
  /** 처음 모두가 확정한 마지막 칸 번호 */
  commitIndex: number;
  /** 갈라진 시각과 쪽 */
  splitAt: number;
  sides: string[][];
  /** 선출 타이머 — 갈라진 때부터 바닥나기까지 */
  timers: { node: string; ms: number }[];
  /** 메시지 편도 지연 */
  delayMs: number;
  /** 손님 쓰기 */
  writes: { at: number; cmd: string; to: string }[];
  /** 이음이 붙는 시각 */
  healAt: number;
};

type Role = 'leader' | 'follower';

type Node = {
  id: string;
  role: Role;
  term: number;
  log: SplitBrainEntry[];
  commit: number;
};

function sameEntry(a: SplitBrainEntry, b: SplitBrainEntry): boolean {
  return a.term === b.term && a.cmd === b.cmd;
}

export async function splitBrain(ctx0: FacetContext<SplitBrainFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<SplitBrainFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ids = data.nodes;
  const total = ids.length;
  const majority = Math.floor(total / 2) + 1;
  const nodes = new Map<string, Node>();
  for (const id of ids) {
    if (nodes.has(id)) throw new Error(`split-brain: 겹치는 노드 ${id}`);
    nodes.set(id, {
      id,
      role: id === data.leader ? 'leader' : 'follower',
      term: data.term,
      log: data.log.map((e) => ({ term: e.term, cmd: e.cmd })),
      commit: data.commitIndex,
    });
  }
  function node(id: string): Node {
    const n = nodes.get(id);
    if (!n) throw new Error(`split-brain: 모르는 노드 ${id}`);
    return n;
  }
  node(data.leader);
  if (data.commitIndex > data.log.length) throw new Error('split-brain: 확정 번호가 로그보다 길다');

  // 확정된 칸 — 지워지는지 지킨다
  const committed: { index: number; entry: SplitBrainEntry; erased: boolean }[] = data.log
    .slice(0, data.commitIndex)
    .map((e, i) => ({ index: i + 1, entry: e, erased: false }));

  // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 첫 발신 앞에 틈을 둔다
  if (!(await pause())) return;

  // ── 갈라짐
  const side = new Map<string, number>();
  for (const [s, group] of data.sides.entries()) {
    if (ctx.cancelled) return;
    for (const id of group) {
      if (ctx.cancelled) return;
      node(id);
      if (side.has(id)) throw new Error(`split-brain: ${id} 가 두 쪽에 있다`);
      side.set(id, s);
    }
  }
  const sideOf = (id: string): number => {
    const s = side.get(id);
    if (s === undefined) throw new Error(`split-brain: ${id} 의 쪽이 없다`);
    return s;
  };
  await ctx.emit({ type: 'partition', payload: { at: data.splitAt, side: ids.map(sideOf), majority } });
  if (!(await pause())) return;

  // ── 선출 (한 걸음으로 줄인다)
  const timers = new Map<string, number>();
  for (const tm of data.timers) {
    if (ctx.cancelled) return;
    node(tm.node);
    const leaderHere = ids.some((o) => sideOf(o) === sideOf(tm.node) && node(o).role === 'leader');
    if (leaderHere) throw new Error(`split-brain: ${tm.node} 는 리더의 하트비트를 듣는 쪽이라 타이머가 바닥나지 않는다`);
    timers.set(tm.node, tm.ms);
  }
  const order = [...data.timers].sort((x, y) => x.ms - y.ms || (x.node < y.node ? -1 : 1));
  const firstTimer = order[0];
  if (firstTimer === undefined) throw new Error('split-brain: 바닥나는 타이머가 없다');
  const first = firstTimer.node;
  const cand = node(first);
  const timeoutAt = data.splitAt + firstTimer.ms;
  cand.term += 1;
  const voters: string[] = [cand.id];
  const askArrives = timeoutAt + data.delayMs;
  for (const id of ids) {
    if (ctx.cancelled) return;
    if (id === cand.id || sideOf(id) !== sideOf(cand.id)) continue;
    const other = node(id);
    const own = timers.get(id);
    if (own === undefined) throw new Error(`split-brain: 리더 없는 쪽의 ${id} 에 선출 타이머가 없다`);
    const stillWaiting = askArrives < data.splitAt + own;
    if (stillWaiting && other.term < cand.term) {
      other.term = cand.term;
      voters.push(id);
    }
  }
  if (voters.length < majority) throw new Error(`split-brain: 표 ${voters.length} 는 과반 ${majority} 에 모자란다`);
  cand.role = 'leader';
  const leaderAt = timeoutAt + 2 * data.delayMs;
  await ctx.emit({
    type: 'elect',
    payload: { timeoutAt, candidate: cand.id, term: cand.term, voters, leaderAt, majority },
  });
  if (!(await pause())) return;

  // ── 리더가 둘
  const leadersNow = (): { node: string; term: number }[] =>
    ids.filter((id) => node(id).role === 'leader').map((id) => ({ node: id, term: node(id).term }));
  await ctx.emit({ type: 'leaders', payload: { leaders: leadersNow() } });
  if (!(await pause())) return;

  // ── 쓰기
  const writes = [...data.writes].sort((a, b) => a.at - b.at);
  for (const w of writes) {
    if (ctx.cancelled) return;
    const ldr = node(w.to);
    if (ldr.role !== 'leader') throw new Error(`split-brain: ${w.to} 는 리더가 아니다`);
    if (w.at >= data.healAt) throw new Error('split-brain: 이음이 붙은 뒤의 쓰기는 이 조각의 모형 밖이다');
    const entry: SplitBrainEntry = { term: ldr.term, cmd: w.cmd };
    ldr.log = [...ldr.log, entry];
    const index = ldr.log.length;
    const holders: string[] = [ldr.id];
    for (const id of ids) {
      if (ctx.cancelled) return;
      if (id === ldr.id || sideOf(id) !== sideOf(ldr.id)) continue;
      const f = node(id);
      if (f.term > ldr.term) continue;
      f.log = [...f.log.slice(0, index - 1), { term: entry.term, cmd: entry.cmd }];
      holders.push(id);
    }
    const ok = holders.length >= majority;
    if (ok) {
      for (const h of holders) node(h).commit = index;
      committed.push({ index, entry, erased: false });
    }
    await ctx.emit({
      type: 'write',
      payload: { at: w.at, leader: ldr.id, term: ldr.term, cmd: w.cmd, index, holders, majority, committed: ok },
    });
    if (!(await pause())) return;
  }

  // ── 이음이 붙는다
  for (const id of ids) side.set(id, 0);
  await ctx.emit({ type: 'heal', payload: { at: data.healAt, leaders: leadersNow() } });
  if (!(await pause())) return;

  // ── 가장 높은 term 리더의 하트비트
  let top: Node | null = null;
  for (const l of leadersNow()) {
    if (ctx.cancelled) return;
    const n = node(l.node);
    if (top === null || n.term > top.term) top = n;
  }
  if (top === null) throw new Error('split-brain: 리더가 없다');
  const leader = top;
  const hbAt = data.healAt + data.delayMs;
  const behind = ids.filter((id) => node(id).term < leader.term);
  for (const id of behind) {
    if (ctx.cancelled) return;
    const n = node(id);
    const wasRole = n.role;
    const wasTerm = n.term;
    n.role = 'follower';
    n.term = leader.term;
    // 다음 칸 = 리더 끝 + 1 에서 시작해 앞 칸이 맞을 때까지 물러난다
    let next = leader.log.length + 1;
    for (;;) {
      if (ctx.cancelled) return;
      const prev = next - 1;
      if (prev === 0) break;
      const mine = n.log[prev - 1];
      const theirs = leader.log[prev - 1];
      if (theirs === undefined) throw new Error(`split-brain: 리더 로그에 ${prev} 번 칸이 없다`);
      if (mine !== undefined && sameEntry(mine, theirs)) break;
      next -= 1;
    }
    const dropped = n.log.slice(next - 1);
    const written = leader.log.slice(next - 1).map((e) => ({ term: e.term, cmd: e.cmd }));
    for (const c of committed) {
      if (ctx.cancelled) return;
      const k = c.index - next;
      const e = dropped[k];
      if (k >= 0 && e !== undefined && sameEntry(c.entry, e)) c.erased = true;
    }
    n.log = [...n.log.slice(0, next - 1), ...written];
    n.commit = leader.commit;
    await ctx.emit({
      type: 'heartbeat',
      payload: {
        at: hbAt,
        from: leader.id,
        node: n.id,
        wasRole,
        wasTerm,
        term: n.term,
        index: next,
        dropped,
        written,
        commit: n.commit,
      },
    });
    if (!(await pause())) return;
  }

  // ── 끝
  const ref = leader.log;
  let same = 0;
  for (const id of ids) {
    if (ctx.cancelled) return;
    const l = node(id).log;
    if (l.length === ref.length && l.every((e, i) => sameEntry(e, ref[i] as SplitBrainEntry))) same += 1;
  }
  const kept = committed
    .filter((c) => !c.erased)
    .map((c) => ({ term: c.entry.term, cmd: c.entry.cmd }));
  await ctx.emit({
    type: 'done',
    payload: { leaders: leadersNow().map((l) => l.node), same, commit: leader.commit, kept },
  });
}
