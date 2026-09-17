/**
 * repeatRelaxAll — 모든 간선을 거듭 펴기 (벨만-포드의 되풀이).
 *
 * 답하는 질문: **왜 간선 전부를 여러 바퀴나 되풀이해야 하는가.**
 * 어느 간선을 먼저 볼지 정할 방법이 없으므로 전부를 한 바퀴씩 돌 수밖에 없고,
 * 순서가 나쁘면 한 바퀴에 정보가 딱 한 칸만 나아간다. 그래서 바퀴 수가 정점
 * 수만큼 필요해진다. 한 바퀴 안에서 대부분의 간선이 헛도는 것 — 양 끝이 아직
 * 모르는 값이라 아무 일도 못 하는 것 — 이 이 조각이 보이려는 장면이다.
 *
 * 걸음표를 손으로 적지 않는다. 바퀴 수는 `nodes.length - 1` 로 셈하고, 한 바퀴는
 * `edges` 배열을 그 순서대로 순회한 결과다. 배열의 순서(거꾸로 놓인 간선 순서)는
 * 저작이 고른 데이터이지 걸음표가 아니다.
 *
 * ── 식별자
 *   `edge:<from>-<to>`   간선. 어느 간선인지는 이것만이 말한다.
 *
 * ── 이벤트 (표준 `done` 외에는 전부 이 facet 고유 어휘)
 *
 * 발신은 **셀 수 있는 수를 싣지 않는다.** 몇 번째 바퀴인가 · 몇 번째 간선인가 ·
 * 몇 번을 살폈나 · 그중 몇 번이 일이 됐나는 전부 장면이 장부에서 센다 —
 * 바퀴는 `round-end` 가 올 때마다 하나씩 쌓이고, 간선 번호는 그 바퀴에 이미 온
 * 살핌 수다 (`scene.ts`). 싣는 것은 **걸음이 내리는 판정**과 **점화식의 값**뿐이다.
 *
 *   relax-skip  { reason: 'unknown' | 'noGain' }
 *               이 간선을 봤지만 아무 일도 없었다. reason 은 헛돈 까닭 —
 *               'unknown' 은 꼬리를 아직 모르는 것, 'noGain' 은 재 보았으나 더
 *               짧아지지 않는 것. 장면이 되짚을 수 없는 판정이라 싣는다.
 *               silent 아님 (걸음 경계).
 *   relax-apply { dist: number }
 *               값이 간선을 타고 건너가 머리의 거리가 정해졌다. `dist` 는
 *               `dist[from] + weight` — **벨만-포드의 점화식 그 자체**라 내주지
 *               않고 싣는다. silent 아님.
 *   round-end   payload 없음. 한 바퀴가 끝났다. silent 아님.
 *   done        payload 없음. 다 굴렸다. 표준 어휘. silent 아님.
 *   rewind      payload 없음. 처음으로 되감는다 — 자동 재생이 끝난 뒤 `advance`
 *               를 처음 눌렀을 때 화면을 초기 상태로 돌린다. silent 아님.
 *
 * ── 메트릭
 *   없다. 조각은 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 방향 간선 하나. */
export type RelaxEdge = { from: string; to: string; weight: number };

export type RepeatRelaxAllData = {
  type: 'repeat-relax-all';
  /** 정점 이름. 왼쪽에서 오른쪽으로 놓인 순서 그대로. */
  nodes: string[];
  /** 간선. **배열 순서가 곧 펴는 순서**다 (저작 결정). */
  edges: RelaxEdge[];
  /** 출발 정점. */
  source: string;
  /** 읽을 것이 있는 걸음의 간격 (ms). */
  stepMs: number;
  /** 헛도는 걸음의 간격 (ms). 아무 일도 없는 장면이라 읽을 시간이 덜 든다. */
  idleStepMs: number;
};

/**
 * 걸음 사이의 문(gate).
 *
 * 'idle' 은 아무 일도 없는 걸음, 'read' 는 읽을 것이 있는 걸음이다. 자동 재생은
 * 둘을 다른 간격으로 쉬고, 한 걸음씩 짚어 볼 때는 구분 없이 누름을 기다린다.
 *
 * @returns 계속 가도 되면 true, 접혔으면 false.
 */
type Gate = (beat: 'idle' | 'read') => Promise<boolean>;

/**
 * 굴릴 바퀴 수 — 정점 수 빼기 하나.
 *
 * **자르는 잣대가 두 군데면 갈린다.** 옛 화면은 projector 가 `Math.max(1, nodes.length - 1)`
 * 을 따로 셈해 stage 에 넘기고 stage 가 다시 `Math.max(1, model.rounds)` 로 잘랐다.
 * 이제 이 함수 하나를 알고리즘과 장면이 함께 부른다 (`scene.ts` 의 `relaxRoundCount`).
 *
 * 내주어도 조각이 말하려는 바는 남는다 — 이것은 **몇 바퀴를 돌 것인가의 상한**이고,
 * 왜 그만큼이 드는가는 장부에 쌓이는 자취가 말한다.
 */
export function relaxRoundCount(nodeCount: number): number {
  return Math.max(1, nodeCount - 1);
}

/**
 * 바퀴 전체를 한 번 굴린다. 자동 재생과 한 걸음씩 짚기가 같은 코드를 지나며,
 * 다른 것은 문(gate)뿐이다.
 *
 * @returns 끝까지 갔으면 true, 도중에 접혔으면 false.
 */
async function sweep(ctx: ReactiveContext<RepeatRelaxAllData>, gate: Gate): Promise<boolean> {
  const { nodes, edges, source } = ctx.data;
  const rounds = relaxRoundCount(nodes.length);

  // 아직 모르는 정점은 아예 키가 없다 — ∞ 를 수로 흉내 내지 않는다.
  const dist = new Map<string, number>();
  dist.set(source, 0);

  for (let round = 0; round < rounds; round += 1) {
    // 간선을 배열 순서대로 편다. 몇 번째인지는 세지 않는다 — 발신이 오는 차례가
    // 이미 그것을 말한다.
    for (const edge of edges) {
      const tail = dist.get(edge.from);

      if (tail === undefined) {
        if (!(await gate('idle'))) return false;
        await ctx.emit({
          type: 'relax-skip',
          target: `edge:${edge.from}-${edge.to}`,
          payload: { reason: 'unknown' },
        });
        continue;
      }

      const candidate = tail + edge.weight;
      const head = dist.get(edge.to);
      if (head !== undefined && head <= candidate) {
        if (!(await gate('idle'))) return false;
        await ctx.emit({
          type: 'relax-skip',
          target: `edge:${edge.from}-${edge.to}`,
          payload: { reason: 'noGain' },
        });
        continue;
      }

      dist.set(edge.to, candidate);
      if (!(await gate('read'))) return false;
      await ctx.emit({
        type: 'relax-apply',
        target: `edge:${edge.from}-${edge.to}`,
        payload: { dist: candidate },
      });
    }

    if (!(await gate('read'))) return false;
    await ctx.emit({ type: 'round-end' });
  }

  if (!(await gate('read'))) return false;
  await ctx.emit({ type: 'done' });
  return true;
}

export const repeatRelaxAllAlgorithm = async (
  ctx: FacetContext<RepeatRelaxAllData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<RepeatRelaxAllData>;
  const { stepMs, idleStepMs } = rc.data;

  const autoGate: Gate = (beat) => rc.sleep(beat === 'idle' ? idleStepMs : stepMs);
  if (!(await sweep(rc, autoGate))) return;

  // 자동 재생이 끝났다. 이제 곱씹으며 한 걸음씩 짚어 볼 사람을 기다린다.
  for (;;) {
    try {
      const signal = await rc.waitForInput();
      // 지금 이 메커니즘은 advance 만 흘려보내지만, 위젯 입력이 하나라도 붙으면
      // 아무 dispatch 나 걸음으로 세게 된다. 종류를 보고 고른다.
      if (signal.type !== 'advance') continue;
    } catch {
      // 기다리는 중에 러너가 접었다 (reset / destroy). 이 회차는 여기서 끝난다.
      return;
    }

    await rc.emit({ type: 'rewind' });

    // 되감기 직후의 첫 문은 그냥 통과시킨다 — 처음 누르는 advance 는 되감고
    // 첫 걸음까지 보여야 한다 (S-piece). 되감기만 하면 반응이 없는 것으로 읽힌다.
    let firstGateIsFree = true;
    const manualGate: Gate = async () => {
      if (firstGateIsFree) {
        firstGateIsFree = false;
        return true;
      }
      for (;;) {
        try {
          const next = await rc.waitForInput();
          if (next.type === 'advance') return true;
        } catch {
          // 기다리는 중에 러너가 접었다.
          return false;
        }
      }
    };

    if (!(await sweep(rc, manualGate))) return;
  }
};
