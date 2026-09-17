/**
 * 되짚어 나오기 — 한 줄기를 끝까지 파고들었다가, 막히면 왔던 길을 거슬러 올라와
 * 다른 갈래로 든다.
 *
 * ── 식별자
 *   node:<정점 이름>   예) `node:A`
 *
 * ── 이벤트 (전부 이 facet 고유 확장)
 *
 * payload 는 **걸음이 내리는 판정**만 싣는다. 구조에서 세지는 것 — 지금 깊이 ·
 * 떠나온 자리 · 밟은 수 · 되짚은 수 · 가장 깊이 내려간 깊이 — 은 장면이 자기
 * 자취에서 센다 (`scene.ts`). 실어 보내면 같은 수가 두 자리에서 나와 언젠가
 * 갈린다.
 *
 *   enter-root  {}
 *               target `node:<출발점>`. 출발점에 선다. silent 아님.
 *   descend     { to: string }
 *               target `node:<to>`. 한 칸 파고든다. **어느 이웃으로 갈지가 이
 *               답사의 판정**이라 그것만 싣는다. 어디서 가는지는 길의 끝이다.
 *   dead-end    {}
 *               target `node:<막힌 자리>`. 더 갈 곳이 없음이 드러난다.
 *   retreat     {}
 *               target `node:<물러난 자리>`. 왔던 길을 거슬러 한 칸 물러난다.
 *               떠나온 자리도 물러난 자리도 길의 끝 둘이라 싣지 않는다.
 *   done        {}
 *               답사가 끝난다. 밟은 수 · 되짚은 수 · 최대 깊이는 장면이 센다.
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
 *
 * 이름은 식별자(`target`)를 짓는 데 쓰고, payload 로 나가는 것은 `descend` 의
 * `to` 하나뿐이다.
 */
type Beat =
  | { kind: 'enter'; node: string }
  | { kind: 'descend'; to: string }
  | { kind: 'dead-end'; node: string }
  | { kind: 'retreat'; to: string }
  | { kind: 'done' };

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
 * 그 사실을 말한 뒤 (`dead-end`) 하나를 덜어 물러난다 (`retreat`).
 *
 * 되짚은 횟수도 깊이도 여기서 세지 않는다. 화면이 같은 것을 자기 자취에서 세므로
 * 여기서 또 세면 한 물음에 두 답이 남는다.
 */
function* walkDepthFirst(data: DiveThenBacktrackData): Generator<Beat, void, undefined> {
  const adj = buildAdjacency(data);
  const start = data.start;
  if (!adj.has(start)) return;

  const visited = new Set<string>([start]);
  const path: string[] = [start];

  yield { kind: 'enter', node: start };

  while (path.length > 0) {
    const cur = path[path.length - 1] ?? start;
    const next = (adj.get(cur) ?? []).find((n) => !visited.has(n));

    if (next !== undefined) {
      visited.add(next);
      path.push(next);
      yield { kind: 'descend', to: next };
      continue;
    }

    yield { kind: 'dead-end', node: cur };

    if (path.length === 1) break;
    path.pop();
    yield { kind: 'retreat', to: path[path.length - 1] ?? start };
  }

  yield { kind: 'done' };
}

/** 걸음 하나를 이벤트로 발신한다. type 은 걸음 종류마다 리터럴이다 (C2). */
async function playBeat(ctx: FacetContext<DiveThenBacktrackData>, beat: Beat): Promise<void> {
  switch (beat.kind) {
    case 'enter':
      await ctx.emit({ type: 'enter-root', target: `node:${beat.node}`, payload: {} });
      return;
    case 'descend':
      await ctx.emit({ type: 'descend', target: `node:${beat.to}`, payload: { to: beat.to } });
      return;
    case 'dead-end':
      await ctx.emit({ type: 'dead-end', target: `node:${beat.node}`, payload: {} });
      return;
    case 'retreat':
      await ctx.emit({ type: 'retreat', target: `node:${beat.to}`, payload: {} });
      return;
    case 'done':
      await ctx.emit({ type: 'done', payload: {} });
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
