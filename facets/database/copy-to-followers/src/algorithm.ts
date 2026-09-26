/**
 * copy-to-followers — 리더가 받은 쓰기를 팔로워에게 똑같이 옮겨 둔다 (동기 복제).
 *
 * 규약 (사양 그대로)
 *   - 동기 복제: 리더는 쓰기를 먼저 자기에게 적고, 팔로워 전부에게 한 걸음에 함께 보낸다.
 *     팔로워가 모두 적은 뒤에야 응답 ok 를 돌려준다.
 *   - 시각은 없다. 걸음마다 시각을 적지 않는다.
 *   - 쓰기는 데이터의 차례대로. 쓰기 표기는 `키=값` (값은 정수).
 *   - 쓰기를 다 마치면 `stop` 노드가 멈추고, 읽기 하나가 `read.at` 노드로 간다.
 *     읽기를 받는 노드가 멈췄거나 그 열쇠가 없으면 던진다.
 *   - 사본 수 = 그 열쇠를 가진 노드 수. 살아 있는 사본 수 = 그중 멈추지 않은 노드 수.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음 = 사건 하나)
 *   write      { node: string; key: string; value: number; copies: number }
 *              리더 node 에 적혔다. copies 는 적은 뒤의 사본 수
 *   replicate  { from: string; to: string[]; key: string; value: number; copies: number }
 *              리더가 팔로워 전부에게 함께 보내 적혔다
 *   ack        { node: string; key: string; value: number; copies: number }
 *              팔로워가 다 적은 뒤 리더 node 가 응답 ok 를 돌려준다
 *   stop       { node: string }
 *              node 가 멈춘다
 *   read       { node: string; key: string; value: number; live: number }
 *              읽기가 node 로 가서 value 가 답으로 나온다. live 는 살아 있는 사본 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CopyToFollowersFacetData = {
  type: 'copy-to-followers';
  stepMs: number;
  /** 노드 식별자. 첫째가 아니라 `leader` 가 리더를 정한다 */
  nodes: string[];
  leader: string;
  /** 쓰기 명령 — `키=값` */
  writes: string[];
  /** 쓰기를 다 마친 뒤 멈추는 노드 */
  stop: string;
  /** 멈춘 뒤의 읽기 */
  read: { key: string; at: string };
};

type Write = { key: string; value: number };

function parseWrite(text: string, index: number): Write {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(-?\d+)$/.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`copy-to-followers: 쓰기 ${index} 번 '${text}' 은 키=정수 꼴이 아니다`);
  }
  return { key: m[1], value: Number(m[2]) };
}

function checkData(data: CopyToFollowersFacetData): void {
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    throw new Error('copy-to-followers: nodes 가 비었다');
  }
  if (new Set(data.nodes).size !== data.nodes.length) {
    throw new Error('copy-to-followers: 같은 노드 식별자가 둘 있다');
  }
  if (!data.nodes.includes(data.leader)) {
    throw new Error(`copy-to-followers: 리더 '${data.leader}' 가 nodes 에 없다`);
  }
  if (!data.nodes.includes(data.stop)) {
    throw new Error(`copy-to-followers: 멈출 노드 '${data.stop}' 가 nodes 에 없다`);
  }
  if (!data.nodes.includes(data.read.at)) {
    throw new Error(`copy-to-followers: 읽기를 받을 노드 '${data.read.at}' 가 nodes 에 없다`);
  }
  if (!Number.isFinite(data.stepMs) || data.stepMs <= 0) {
    throw new Error('copy-to-followers: stepMs 가 양수가 아니다');
  }
}

export async function copyToFollowers(
  context: FacetContext<CopyToFollowersFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<CopyToFollowersFacetData>;
  const data = ctx.data;
  checkData(data);
  const stepMs = data.stepMs;
  const writes = data.writes.map((w, i) => parseWrite(w, i + 1));
  const followers = data.nodes.filter((n) => n !== data.leader);

  // 노드마다 적힌 값. 멈춘 노드의 값도 지우지 않는다 — 꺼졌을 뿐 사라지지 않았다.
  const stores = new Map<string, Map<string, number>>();
  for (const n of data.nodes) stores.set(n, new Map());
  const down = new Set<string>();

  function storeOf(node: string): Map<string, number> {
    const s = stores.get(node);
    if (!s) throw new Error(`copy-to-followers: 모르는 노드 '${node}'`);
    return s;
  }
  function copiesOf(key: string): number {
    let n = 0;
    for (const s of stores.values()) if (s.has(key)) n += 1;
    return n;
  }
  function liveCopiesOf(key: string): number {
    let n = 0;
    for (const [node, s] of stores) if (!down.has(node) && s.has(key)) n += 1;
    return n;
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const w of writes) {
    // 걸음 0 의 빈 노드 셋을 읽을 틈이 첫 문이다.
    if (!(await pause())) return;
    storeOf(data.leader).set(w.key, w.value);
    await ctx.emit({
      type: 'write',
      payload: { node: data.leader, key: w.key, value: w.value, copies: copiesOf(w.key) },
    });

    if (!(await pause())) return;
    for (const f of followers) storeOf(f).set(w.key, w.value);
    await ctx.emit({
      type: 'replicate',
      payload: {
        from: data.leader,
        to: [...followers],
        key: w.key,
        value: w.value,
        copies: copiesOf(w.key),
      },
    });

    if (!(await pause())) return;
    // 동기 복제 — 팔로워 전부에 적혔는지 보고 나서야 응답한다.
    for (const f of followers) {
      if (storeOf(f).get(w.key) !== w.value) {
        throw new Error(`copy-to-followers: ${f} 에 ${w.key} 가 적히지 않았는데 응답하려 한다`);
      }
    }
    await ctx.emit({
      type: 'ack',
      payload: { node: data.leader, key: w.key, value: w.value, copies: copiesOf(w.key) },
    });
  }

  if (!(await pause())) return;
  storeOf(data.stop);
  down.add(data.stop);
  await ctx.emit({ type: 'stop', payload: { node: data.stop } });

  if (!(await pause())) return;
  const at = data.read.at;
  if (down.has(at)) throw new Error(`copy-to-followers: 읽기를 받을 ${at} 가 멈췄다`);
  const value = storeOf(at).get(data.read.key);
  if (value === undefined) {
    throw new Error(`copy-to-followers: ${at} 에 열쇠 '${data.read.key}' 가 없다`);
  }
  await ctx.emit({
    type: 'read',
    payload: { node: at, key: data.read.key, value, live: liveCopiesOf(data.read.key) },
  });
}
