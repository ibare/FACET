/**
 * 되짚어 나오기 — 한 줄기를 끝까지 파고들었다가, 막히면 왔던 길을 거슬러 올라와
 * 다른 갈래로 든다.
 *
 * ── 식별자
 *   node:<정점 이름>   예) `node:A`
 *
 * ── 이벤트 (전부 이 facet 고유 확장)
 *   enter-root  { node: string; depth: number }
 *               target `node:<node>`. 출발점에 선다. silent 아님.
 *   descend     { from: string; to: string; depth: number }
 *               target `node:<to>`. 한 칸 파고든다. silent 아님.
 *   dead-end    { node: string; depth: number }
 *               target `node:<node>`. 더 갈 곳이 없음이 드러난다. silent 아님.
 *   retreat     { from: string; to: string; depth: number }
 *               target `node:<to>`. 왔던 길을 거슬러 한 칸 물러난다. silent 아님.
 *   done        { visited: number; backtracks: number; maxDepth: number }
 *               답사가 끝난다. 세 값은 모두 이 답사에서 실제로 센 값이다. silent 아님.
 *   rewind      {}
 *               한 걸음씩 보기로 넘어갈 때 화면을 처음으로 되돌린다. silent 아님
 *               (화면 전체가 바뀐다).
 *
 * ── 메트릭
 *   없다. 조각이므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 *
 * ── 걸음
 *   걸음표를 손으로 적지 않는다. 아래 `walkDepthFirst` 가 간선 목록에서 만든
 *   인접 목록을 실제로 순회하며 걸음을 낳고, 발신부는 걸음 종류마다 리터럴
 *   type 으로 emit 한다 (C2).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DiveThenBacktrackData = {
  type: 'dive-then-backtrack';
  /** 정점 이름. 화면의 글자가 되는 값. */
  vertices: string[];
  /** 무방향 간선. 순서 없는 두 정점의 짝. */
  edges: [string, string][];
  /** 출발 정점. */
  start: string;
  /** 걸음 간격(ms). 읽을 시간을 주는 일이므로 선언에 둔다 (S-piece). */
  stepMs: number;
};

/**
 * 답사가 낳는 걸음. 발신 형태가 아니라 순회의 산물이다 — 각 걸음이 어떤
 * 이벤트가 되는지는 `playBeat` 이 정한다.
 */
type Beat =
  | { kind: 'enter'; node: string; depth: number }
  | { kind: 'descend'; from: string; to: string; depth: number }
  | { kind: 'dead-end'; node: string; depth: number }
  | { kind: 'retreat'; from: string; to: string; depth: number }
  | { kind: 'done'; visited: number; backtracks: number; maxDepth: number };

/** 무방향 간선 목록에서 인접 목록을 만든다. 이웃은 알파벳 오름차순. */
function buildAdjacency(data: DiveThenBacktrackData): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const v of data.vertices) adj.set(v, []);
  for (const [a, b] of data.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return adj;
}

/**
 * 명시적 스택으로 깊이 우선 답사를 돈다.
 *
 * 스택이 곧 "왔던 길" 이다. 갈 곳이 있으면 쌓아 파고들고 (`descend`), 없으면
 * 그 사실을 말한 뒤 (`dead-end`) 하나를 덜어 물러난다 (`retreat`). 되짚는
 * 횟수도 여기서 실제로 세어 `done` 에 싣는다.
 */
function* walkDepthFirst(data: DiveThenBacktrackData): Generator<Beat, void, undefined> {
  const adj = buildAdjacency(data);
  const start = data.start;
  if (!adj.has(start)) return;

  const visited = new Set<string>([start]);
  const path: string[] = [start];
  let backtracks = 0;
  let maxDepth = 0;

  yield { kind: 'enter', node: start, depth: 0 };

  while (path.length > 0) {
    const cur = path[path.length - 1] ?? start;
    const next = (adj.get(cur) ?? []).find((n) => !visited.has(n));

    if (next !== undefined) {
      visited.add(next);
      path.push(next);
      const depth = path.length - 1;
      if (depth > maxDepth) maxDepth = depth;
      yield { kind: 'descend', from: cur, to: next, depth };
      continue;
    }

    yield { kind: 'dead-end', node: cur, depth: path.length - 1 };

    if (path.length === 1) break;
    path.pop();
    backtracks += 1;
    const parent = path[path.length - 1] ?? start;
    yield { kind: 'retreat', from: cur, to: parent, depth: path.length - 1 };
  }

  yield { kind: 'done', visited: visited.size, backtracks, maxDepth };
}

/** 걸음 하나를 이벤트로 발신한다. type 은 걸음 종류마다 리터럴이다 (C2). */
async function playBeat(ctx: FacetContext<DiveThenBacktrackData>, beat: Beat): Promise<void> {
  switch (beat.kind) {
    case 'enter':
      await ctx.emit({
        type: 'enter-root',
        target: `node:${beat.node}`,
        payload: { node: beat.node, depth: beat.depth },
      });
      return;
    case 'descend':
      await ctx.emit({
        type: 'descend',
        target: `node:${beat.to}`,
        payload: { from: beat.from, to: beat.to, depth: beat.depth },
      });
      return;
    case 'dead-end':
      await ctx.emit({
        type: 'dead-end',
        target: `node:${beat.node}`,
        payload: { node: beat.node, depth: beat.depth },
      });
      return;
    case 'retreat':
      await ctx.emit({
        type: 'retreat',
        target: `node:${beat.to}`,
        payload: { from: beat.from, to: beat.to, depth: beat.depth },
      });
      return;
    case 'done':
      await ctx.emit({
        type: 'done',
        payload: { visited: beat.visited, backtracks: beat.backtracks, maxDepth: beat.maxDepth },
      });
      return;
  }
}

/**
 * 걸음 뒤에 머무는 시간.
 *
 * `dead-end` 는 물러남을 부르는 신호이지 그 자체로 한 걸음이 아니다. 막힘과
 * 되짚기를 한 호흡으로 읽히게 하려고 절반만 머문다 — 선언된 `stepMs` 에서
 * 파생하므로 새 시간 상수를 만들지 않는다.
 */
function holdMs(beat: Beat, stepMs: number): number {
  return beat.kind === 'dead-end' ? Math.round(stepMs / 2) : stepMs;
}

/**
 * 자동 재생이 끝난 뒤 `advance` 로 한 걸음씩 짚어 본다.
 *
 * 처음 누르면 되감고 **첫 걸음까지** 보인다 — 되감기만 하면 눌러도 반응이 없는
 * 것으로 읽힌다 (S-piece). 마지막 걸음 뒤에 다시 누르면 같은 방식으로 처음으로
 * 돌아간다.
 */
async function stepThroughOnInput(ctx: ReactiveContext<DiveThenBacktrackData>): Promise<void> {
  let cursor: Generator<Beat, void, undefined> | null = null;

  while (!ctx.cancelled) {
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;

    let next = cursor?.next();
    if (next === undefined || next.done === true) {
      await ctx.emit({ type: 'rewind', payload: {} });
      cursor = walkDepthFirst(ctx.data);
      next = cursor.next();
    }
    if (next.done !== true) await playBeat(ctx, next.value);
  }
}

export const diveThenBacktrackAlgorithm = async (
  ctx: FacetContext<DiveThenBacktrackData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<DiveThenBacktrackData>;
  const stepMs = rctx.data.stepMs;

  for (const beat of walkDepthFirst(rctx.data)) {
    if (rctx.cancelled) return;
    await playBeat(rctx, beat);
    if (!(await rctx.sleep(holdMs(beat, stepMs)))) return;
  }

  await stepThroughOnInput(rctx);
};
