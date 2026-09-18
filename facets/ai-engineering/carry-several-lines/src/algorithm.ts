/**
 * carry-several-lines — 빔 서치는 탐욕이 놓치는 문장을 어떻게 잡는가.
 *
 * 프롬프트에서 출발해 토큰을 `length` 개 붙인다. 걸음마다 남은 줄 전부가 다음 후보로
 * 가지를 뻗고(펼침), 모든 가지를 누적 점수로 줄 세워 위에서 `beamWidth` 개만 남긴다(솎음).
 * 마지막에 폭 1 로 돈 탐욕의 줄과 견준다.
 *
 * 로짓은 **예로 정한 값**이다. 실제 언어 모형에서 나온 수가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 문맥(앞 토큰 전체)마다 그 문맥의 후보들 안에서 소프트맥스 (자연 지수)
 *   - 토큰 하나의 점수 = 그 확률의 자연로그
 *   - 줄의 점수 = 고른 토큰 점수의 합. 길이 정규화 없음 (모든 줄이 같은 길이)
 *   - 걸음마다 남은 줄 전부를 펼쳐 모은 뒤 점수 큰 차례로 `beamWidth` 개를 남긴다.
 *     동률이면 먼저 펼쳐진 가지(표에 먼저 적힌 후보)가 이긴다 — 안정 정렬
 *   - 탐욕 = 걸음마다 1등 하나만 (폭 1). 동률이면 표에 먼저 적힌 후보
 *   - 데이터에 없는 문맥은 펼치지 않는다 — 만나면 멈추고 던진다 (지어내지 않는다)
 *   - 반올림은 표시할 때만 (stage 몫). 여기서는 반올림하지 않는다
 *
 * 이벤트 (silent 없음 — 전부 걸음):
 *   init    { prompt: string[]; width: number; length: number }
 *   expand  { depth: number; children: Branch[] }
 *             Branch = { id: string; parent: string; token: string; logp: number; score: number }
 *             children 은 펼친 차례 — 앞 걸음의 순위 차례로 줄마다, 줄 안에서는 표의 차례
 *   prune   { depth: number; ranking: string[] }
 *             ranking = 이번 걸음 가지 id 를 점수 큰 차례로. 앞 `width` 개가 남는다
 *   compare { greedy: string[]; greedyScore: number; greedyRank: number | null;
 *             beam: string[]; beamScore: number }
 *             greedy · beam = 프롬프트 다음부터 끝까지의 줄 id 들 (깊이 1 부터).
 *             greedyRank = 탐욕의 끝 줄이 마지막 솎음에서 받은 순위 (1 부터).
 *             마지막 솎음 후보에 없었으면(앞에서 이미 끊겼으면) null
 *
 * id 는 줄의 토큰을 공백으로 이은 것 (`The dog has`). 토큰은 공백을 담지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface CarrySeveralLinesCandidate {
  token: string;
  logit: number;
}

export interface CarrySeveralLinesContext {
  /** 앞 문맥 전체 — 프롬프트부터. */
  context: string[];
  next: CarrySeveralLinesCandidate[];
}

export interface CarrySeveralLinesFacetData {
  type: 'carry-several-lines';
  prompt: string[];
  beamWidth: number;
  length: number;
  model: CarrySeveralLinesContext[];
  stepMs: number;
}

export interface CarrySeveralLinesBranch {
  id: string;
  parent: string;
  token: string;
  logp: number;
  score: number;
}

interface Line {
  tokens: string[];
  score: number;
}

const lineId = (tokens: readonly string[]): string => tokens.join(' ');

/** 문맥의 후보마다 로그확률 — 그 문맥의 후보들 안에서 소프트맥스. */
function logProbs(
  model: readonly CarrySeveralLinesContext[],
  tokens: readonly string[],
): { token: string; logp: number }[] {
  const key = lineId(tokens);
  const entry = model.find((m) => lineId(m.context) === key);
  if (!entry || entry.next.length === 0) {
    throw new Error(`carry-several-lines: 데이터에 없는 문맥 "${key}"`);
  }
  const top = Math.max(...entry.next.map((c) => c.logit));
  const logSum = Math.log(entry.next.reduce((s, c) => s + Math.exp(c.logit - top), 0));
  return entry.next.map((c) => ({ token: c.token, logp: c.logit - top - logSum }));
}

export async function carrySeveralLines(
  base: FacetContext<CarrySeveralLinesFacetData>,
): Promise<void> {
  const ctx = base as ReactiveContext<CarrySeveralLinesFacetData>;
  const { prompt, beamWidth, length, model, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 첫 걸음은 문 밖 — 마운트 직후 빈 화면을 두지 않는다
  await ctx.emit({ type: 'init', payload: { prompt: [...prompt], width: beamWidth, length } });

  let beam: Line[] = [{ tokens: [...prompt], score: 0 }];
  let lastRanking: string[] = [];

  for (let depth = 1; depth <= length; depth += 1) {
    if (!(await pause())) return;

    const branches: (CarrySeveralLinesBranch & { tokens: string[] })[] = beam.flatMap((line) =>
      logProbs(model, line.tokens).map((c) => {
        const tokens = [...line.tokens, c.token];
        return {
          id: lineId(tokens),
          parent: lineId(line.tokens),
          token: c.token,
          logp: c.logp,
          score: line.score + c.logp,
          tokens,
        };
      }),
    );
    await ctx.emit({
      type: 'expand',
      payload: {
        depth,
        children: branches.map(({ id, parent, token, logp, score }) => ({
          id,
          parent,
          token,
          logp,
          score,
        })),
      },
    });

    if (!(await pause())) return;

    // Array.prototype.sort 는 안정 정렬 — 동률이면 먼저 펼쳐진 가지가 앞에 선다
    const ranked = [...branches].sort((a, b) => b.score - a.score);
    lastRanking = ranked.map((b) => b.id);
    beam = ranked.slice(0, beamWidth).map((b) => ({ tokens: b.tokens, score: b.score }));
    await ctx.emit({ type: 'prune', payload: { depth, ranking: lastRanking } });
  }

  // 탐욕 — 폭 1. 같은 모형 · 같은 규약
  let greedy: Line = { tokens: [...prompt], score: 0 };
  const greedyIds: string[] = [];
  for (let depth = 1; depth <= length; depth += 1) {
    if (ctx.cancelled) return;
    const best = logProbs(model, greedy.tokens).reduce((a, c) => (c.logp > a.logp ? c : a));
    greedy = { tokens: [...greedy.tokens, best.token], score: greedy.score + best.logp };
    greedyIds.push(lineId(greedy.tokens));
  }

  const winner = beam[0];
  if (!winner) return;
  const beamIds = winner.tokens.slice(prompt.length).map((_, i) =>
    lineId(winner.tokens.slice(0, prompt.length + i + 1)),
  );
  const at = lastRanking.indexOf(lineId(greedy.tokens));

  if (!(await pause())) return;
  await ctx.emit({
    type: 'compare',
    payload: {
      greedy: greedyIds,
      greedyScore: greedy.score,
      greedyRank: at < 0 ? null : at + 1,
      beam: beamIds,
      beamScore: winner.score,
    },
  });
}
