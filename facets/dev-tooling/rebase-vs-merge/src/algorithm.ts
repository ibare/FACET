/**
 * 병합과 리베이스 — 두 줄기를 합치는 두 길이 이력을 어떻게 다르게 남기는가.
 *
 * 한 판 = 손잡이 두 값(합치는 길 · main 의 새 커밋 수 m)으로 커밋 그래프를 세우고, 갈라진 자리를 찾은 뒤
 * 길마다 다르게 합친다. 판이 끝나면 입력을 기다렸다가 받은 값으로 다시 돈다.
 *
 * 규약 (공통 안내문):
 *   - 커밋은 부모를 가리킨다. 거슬러 가기는 첫 부모. 병합 커밋의 부모 차례는 main 끝 먼저, feature 끝 다음.
 *   - 장난감 해시 = FNV-1a 32 비트("tree " + 변경 식별자 + "\n" + 부모마다 "parent " + 부모 해시 + "\n")의
 *     소문자 16 진 여덟 자리 가운데 앞 일곱 자리. 부모 해시는 일곱 자리를 그대로 넣는다.
 *   - 다시 만든 커밋 식별자 = 옛 식별자 + `'`.
 *   - 갈라진 자리: main 끝에서 첫 부모로 거슬러 간 집합에, feature 끝에서 첫 부모로 거슬러 가다 처음 닿는 커밋.
 *     거슬러 가는 길에 부모 둘인 커밋이 나오면 던진다 — 병합 커밋은 판의 끝에서만 생긴다.
 *   - 동률 규칙은 없다 — 이 셈에는 견줘 고르는 자리가 없다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음이다. phase 는 보내지 않는다: IR 을 두지 않는다):
 *   board        { way: string, ahead: number,
 *                  commits: { id, change, hash, parents: string[], row: 'main' | 'feature', col: number }[],
 *                  labels: { main: string, feature: string }, names: { main: string, feature: string } }                                  걸음 0
 *   fork         { at: string, mainSide: number, featureSide: number, mainIsAncestor: boolean,
 *                  rebasing: boolean, replay: string[] }                                                           걸음 1
 *   merge-commit { id, change, hash, parents: string[], parentHashes: string[], row, col }         병합 · m≥1
 *   replay       { from, id, change, oldHash, hash, oldParent, parent, oldParentHash, parentHash,
 *                  row, col }                                                                    리베이스 · m≥1
 *   move-label   { name: 'main' | 'feature', from, to, path: string[], kind: 'advance' | 'fast-forward' | 'move',
 *                  unreachable: string[] }
 *                  path = 이름표가 지나는 커밋 차례(끝이 to). advance = 방금 만든 병합 커밋 위로 한 칸,
 *                  fast-forward = 새 커밋 없이 건넘, move = 다시 놓은 끝으로 옮김(옛것이 이름을 잃는다)
 *
 * phase 어휘: 없음 (irs.ts 가 빈 배열이라 집합이 같다).
 *
 * 계기 (판마다 0 에서 다시 센다 — 걸음 0 에 다섯 다 보낸다):
 *   new-commits    이 판에 새로 생긴 커밋 수 — 병합 커밋 · 다시 놓은 커밋마다 +1
 *   merge-commits  부모 둘인 커밋 수 — 병합 커밋 걸음
 *   rehashed       옛 커밋과 짝이 되는 새 커밋 가운데 해시가 다른 것 — 다시 놓기 걸음마다
 *   unnamed        어느 이름에서도 닿지 않게 된 옛 커밋 — feature 옮김 걸음
 *   label-jump     새 커밋 없이 main 이름표가 건넌 칸 — 이름표 건넘 걸음
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RebaseVsMergeCommitSpec = {
  id: string;
  change: string;
  parents: string[];
};

export type RebaseVsMergeData = {
  type: 'rebase-vs-merge';
  stepMs: number;
  /** 합치는 길 — 손잡이 `way` 의 값이 이 목록의 자리다 */
  ways: string[];
  /** main 의 새 커밋 수 사다리 — 손잡이 `ahead` 의 segments 와 같다 */
  aheadLadder: number[];
  way: number;
  ahead: number;
  /** 두 줄기가 함께 가진 뿌리 쪽 커밋 (차례대로, 끝이 갈라지기 전 main 끝) */
  roots: RebaseVsMergeCommitSpec[];
  /** main 쪽 새 커밋 (차례대로 — 손잡이가 앞 m 개를 쓴다) */
  mainNew: RebaseVsMergeCommitSpec[];
  /** feature 쪽 커밋 (차례대로) */
  feature: RebaseVsMergeCommitSpec[];
  /** 병합 커밋의 식별자 · 변경 식별자 */
  mergeCommit: { id: string; change: string };
  /** 브랜치 이름 */
  names: { main: string; feature: string };
};

type Row = 'main' | 'feature';

type Commit = {
  id: string;
  change: string;
  hash: string;
  parents: string[];
  row: Row;
  col: number;
};

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const encoder = new TextEncoder();

/** 장난감 해시 — FNV-1a 32 비트, 앞 일곱 자리 */
export function toyHash(change: string, parentHashes: readonly string[]): string {
  let text = `tree ${change}\n`;
  for (const p of parentHashes) text += `parent ${p}\n`;
  let h = FNV_OFFSET;
  for (const b of encoder.encode(text)) h = Math.imul(h ^ b, FNV_PRIME) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 7);
}

/** 커밋 목록에서 하나를 찾는다 — 없으면 던진다 */
function need(graph: Map<string, Commit>, id: string, where: string): Commit {
  const c = graph.get(id);
  if (!c) throw new Error(`rebaseVsMerge: ${where} — 모르는 커밋 '${id}'`);
  return c;
}

/** 첫 부모로 한 칸 거슬러 간다. 부모 둘인 커밋은 거슬러 가는 길에 나오면 안 된다 */
function firstParent(graph: Map<string, Commit>, id: string): string | null {
  const c = need(graph, id, '거슬러 가기');
  if (c.parents.length > 1) throw new Error(`rebaseVsMerge: 거슬러 가는 길에 부모 둘인 커밋 '${id}' — 병합 커밋은 판의 끝에서만 생긴다`);
  return c.parents[0] ?? null;
}

/** 이름에서 부모를 따라 닿는 커밋 전부 */
function reachable(graph: Map<string, Commit>, heads: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...heads];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of need(graph, id, '닿는 커밋 세기').parents) stack.push(p);
  }
  return seen;
}

/** 한 판의 그림 재료 — 손잡이 값에서 셈한다 */
export function planRebaseVsMerge(data: RebaseVsMergeData, way: number, ahead: number) {
  const wayId = data.ways[way];
  if (wayId === undefined) throw new Error(`rebaseVsMerge: 합치는 길 ${way} 가 ways 에 없다`);
  if (wayId !== 'merge' && wayId !== 'rebase-then-merge') throw new Error(`rebaseVsMerge: 모르는 길 '${wayId}'`);
  if (!data.aheadLadder.includes(ahead) || ahead > data.mainNew.length) {
    throw new Error(`rebaseVsMerge: main 의 새 커밋 수 ${ahead} 가 사다리 밖이다`);
  }
  const graph = new Map<string, Commit>();
  const order: string[] = [];
  const add = (spec: RebaseVsMergeCommitSpec, row: Row): void => {
    if (graph.has(spec.id)) throw new Error(`rebaseVsMerge: 커밋 '${spec.id}' 가 두 번 나온다`);
    const parentHashes = spec.parents.map((p) => need(graph, p, `${spec.id} 의 부모`).hash);
    const col = spec.parents.length === 0 ? 0 : Math.max(...spec.parents.map((p) => need(graph, p, `${spec.id} 의 부모`).col)) + 1;
    graph.set(spec.id, { id: spec.id, change: spec.change, hash: toyHash(spec.change, parentHashes), parents: [...spec.parents], row, col });
    order.push(spec.id);
  };
  for (const s of data.roots) add(s, 'main');
  for (const s of data.mainNew.slice(0, ahead)) add(s, 'main');
  for (const s of data.feature) add(s, 'feature');

  const rootEnd = data.roots[data.roots.length - 1];
  if (!rootEnd) throw new Error('rebaseVsMerge: roots 가 비었다');
  const mainEnd = ahead === 0 ? rootEnd.id : data.mainNew[ahead - 1]!.id;
  const featureEnd = data.feature[data.feature.length - 1]?.id;
  if (featureEnd === undefined) throw new Error('rebaseVsMerge: feature 가 비었다');

  // 갈라진 자리 — main 끝의 첫 부모 줄기에 feature 끝에서 거슬러 가다 처음 닿는 자리
  const mainLine = new Map<string, number>();
  for (let id: string | null = mainEnd, d = 0; id !== null; id = firstParent(graph, id), d += 1) mainLine.set(id, d);
  let at: string | null = featureEnd;
  let featureSide = 0;
  while (at !== null && !mainLine.has(at)) {
    at = firstParent(graph, at);
    featureSide += 1;
  }
  if (at === null) throw new Error('rebaseVsMerge: 두 줄기가 만나는 커밋이 없다');
  const mainSide = mainLine.get(at)!;

  // 다시 놓을 커밋 — 갈라진 자리 뒤 feature 쪽 커밋 (옛것부터)
  const replay: string[] = [];
  for (let id: string | null = featureEnd; id !== null && id !== at; id = firstParent(graph, id)) replay.unshift(id);

  return { wayId, graph, order, mainEnd, featureEnd, at, mainSide, featureSide, mainIsAncestor: mainSide === 0, replay };
}

function commitPayload(c: Commit) {
  return { id: c.id, change: c.change, hash: c.hash, parents: [...c.parents], row: c.row, col: c.col };
}

export async function rebaseVsMergeAlgorithm(context: FacetContext<RebaseVsMergeData>): Promise<void> {
  const ctx = context as ReactiveContext<RebaseVsMergeData>;
  const data = ctx.data;
  let way = data.way;
  let ahead = data.ahead;

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { newCommits: 0, mergeCommits: 0, rehashed: 0, unnamed: 0, labelJump: 0 };
  const setNewCommits = (v: number): void => {
    ctx.metric('new-commits', v - shown.newCommits);
    shown.newCommits = v;
  };
  const setMergeCommits = (v: number): void => {
    ctx.metric('merge-commits', v - shown.mergeCommits);
    shown.mergeCommits = v;
  };
  const setRehashed = (v: number): void => {
    ctx.metric('rehashed', v - shown.rehashed);
    shown.rehashed = v;
  };
  const setUnnamed = (v: number): void => {
    ctx.metric('unnamed', v - shown.unnamed);
    shown.unnamed = v;
  };
  const setLabelJump = (v: number): void => {
    ctx.metric('label-jump', v - shown.labelJump);
    shown.labelJump = v;
  };

  const pause = (): Promise<boolean> => ctx.sleep(data.stepMs);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const plan = planRebaseVsMerge(data, way, ahead);
      const graph = plan.graph;
      const names = { main: plan.mainEnd, feature: plan.featureEnd };
      const oldCommits = [...plan.order];

      // 걸음 0 — 처음
      setNewCommits(0);
      setMergeCommits(0);
      setRehashed(0);
      setUnnamed(0);
      setLabelJump(0);
      await ctx.emit({
        type: 'board',
        payload: {
          way: plan.wayId,
          ahead,
          commits: plan.order.map((id) => commitPayload(need(graph, id, '처음'))),
          labels: { main: names.main, feature: names.feature },
          names: { main: data.names.main, feature: data.names.feature },
        },
      });
      if (!(await pause())) return;

      // 걸음 1 — 갈라진 자리
      const replay = plan.wayId === 'rebase-then-merge' && !plan.mainIsAncestor ? plan.replay : [];
      await ctx.emit({
        type: 'fork',
        payload: {
          at: plan.at,
          mainSide: plan.mainSide,
          featureSide: plan.featureSide,
          mainIsAncestor: plan.mainIsAncestor,
          rebasing: plan.wayId === 'rebase-then-merge',
          replay,
        },
      });
      if (!(await pause())) return;

      /** main 이름표를 새 커밋 없이 feature 끝까지 건너게 한다 */
      const fastForward = async (): Promise<boolean> => {
        if (!reachable(graph, [names.feature]).has(names.main)) throw new Error('rebaseVsMerge: main 끝이 feature 끝의 조상이 아니다 — 건널 수 없다');
        const path: string[] = [];
        for (let id: string | null = names.feature; id !== null && id !== names.main; id = firstParent(graph, id)) path.unshift(id);
        const from = names.main;
        names.main = names.feature;
        setLabelJump(shown.labelJump + path.length);
        await ctx.emit({
          type: 'move-label',
          payload: { name: 'main', from, to: names.main, path, kind: 'fast-forward', unreachable: [] },
        });
        return pause();
      };

      if (plan.mainIsAncestor) {
        // main 이 조상 — 두 길 모두 이름표만 건넌다
        if (!(await fastForward())) return;
      } else if (plan.wayId === 'merge') {
        // 병합 커밋이 부모 둘(main 끝 · feature 끝)을 가지고 선다
        const parents = [names.main, names.feature];
        const parentHashes = parents.map((p) => need(graph, p, '병합 커밋의 부모').hash);
        const m: Commit = {
          id: data.mergeCommit.id,
          change: data.mergeCommit.change,
          hash: toyHash(data.mergeCommit.change, parentHashes),
          parents,
          row: 'main',
          col: Math.max(...parents.map((p) => need(graph, p, '병합 커밋의 부모').col)) + 1,
        };
        graph.set(m.id, m);
        setNewCommits(shown.newCommits + 1);
        setMergeCommits(shown.mergeCommits + 1);
        await ctx.emit({ type: 'merge-commit', payload: { ...commitPayload(m), parentHashes } });
        if (!(await pause())) return;

        const from = names.main;
        names.main = m.id;
        await ctx.emit({
          type: 'move-label',
          payload: { name: 'main', from, to: m.id, path: [m.id], kind: 'advance', unreachable: [] },
        });
        if (!(await pause())) return;
      } else {
        // 다시 놓기 — 옛것부터 하나씩, 새 바닥 위에 새 해시로
        let base = names.main;
        for (const oldId of replay) {
          if (ctx.cancelled) return;
          const old = need(graph, oldId, '다시 놓기');
          const oldParent = old.parents[0];
          if (oldParent === undefined || old.parents.length !== 1) throw new Error(`rebaseVsMerge: 다시 놓을 커밋 '${oldId}' 의 부모가 하나가 아니다`);
          const baseCommit = need(graph, base, '새 바닥');
          const copy: Commit = {
            id: `${oldId}'`,
            change: old.change,
            hash: toyHash(old.change, [baseCommit.hash]),
            parents: [base],
            row: 'main',
            col: baseCommit.col + 1,
          };
          graph.set(copy.id, copy);
          setNewCommits(shown.newCommits + 1);
          if (copy.hash !== old.hash) setRehashed(shown.rehashed + 1);
          await ctx.emit({
            type: 'replay',
            payload: {
              from: oldId,
              id: copy.id,
              change: copy.change,
              oldHash: old.hash,
              hash: copy.hash,
              oldParent,
              parent: base,
              oldParentHash: need(graph, oldParent, '옛 부모').hash,
              parentHash: baseCommit.hash,
              row: copy.row,
              col: copy.col,
            },
          });
          if (!(await pause())) return;
          base = copy.id;
        }

        // feature 이름표가 다시 놓은 끝으로 — 옛것은 이름 없이 남는다
        const from = names.feature;
        names.feature = base;
        const live = reachable(graph, [names.main, names.feature]);
        const unreachable = oldCommits.filter((id) => !live.has(id));
        setUnnamed(unreachable.length);
        await ctx.emit({
          type: 'move-label',
          payload: { name: 'feature', from, to: base, path: [base], kind: 'move', unreachable },
        });
        if (!(await pause())) return;

        // main 이름표가 새 커밋 없이 건넌다
        if (!(await fastForward())) return;
      }

      // 판 끝 — 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'way' && input.type !== 'ahead') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error(`rebaseVsMerge: ${input.type} 입력의 payload 가 객체가 아니다`);
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error(`rebaseVsMerge: ${input.type} 입력의 payload.value 가 수가 아니다`);
        if (input.type === 'way') {
          if (data.ways[value] === undefined) throw new Error(`rebaseVsMerge: 합치는 길 ${value} 가 ways 에 없다`);
          way = value;
        } else {
          if (!data.aheadLadder.includes(value)) throw new Error(`rebaseVsMerge: main 의 새 커밋 수 ${value} 가 사다리 밖이다`);
          ahead = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
