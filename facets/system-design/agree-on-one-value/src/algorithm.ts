/**
 * agree-on-one-value — 한번 정해진 값은 뒤에 온 제안에 밀려 바뀌지 않는다.
 *
 * 받는 쪽(acceptor) 여럿과 제안자 둘. 받는 쪽은 받아들인 (번호, 값) 하나를 든다.
 * 같은 값을 든 받는 쪽이 과반이 되는 순간 그 값이 정해진다. 묻는 제안자(`asks`)는
 * 보내기 전에 제 과반에게 받아들인 것을 묻고, 대답 가운데 번호가 가장 큰 것의 값을
 * 제 값 대신 나른다. 한 번 정하는 합의(Paxos 의 한 칸)를 줄인 모형이다.
 *
 * 이벤트 (걸음 하나 = 메시지 하나가 받는 쪽에 닿음 / 제안자가 나를 값을 정함)
 *
 * - `init` (silent) — 걸음 0 을 갈아 끼운다
 *     payload: { majority: number; totalSteps: number }
 *       majority   : 받는 쪽 수에서 셈한 과반
 *       totalSteps : 걸음 0 을 넣은 걸음 수 (정해진 값 줄의 칸 수)
 * - `ask` — 묻는 제안자의 물음이 받는 쪽에 닿고 대답이 돌아온다
 *     target: `node:<받는 쪽>`
 *     payload: { by: string; at: string; answer: { ballot: number; value: number } | null;
 *                decided: number[] }
 * - `adopt` — 묻는 제안자가 나를 값을 정한다
 *     payload: { by: string; own: number; carries: number;
 *                source: { at: string; ballot: number } | null;
 *                overlap: string[]; decided: number[] }
 *       source  : 값을 가져온 대답(번호가 가장 큰 것). 없으면 null — 제 값을 나른다
 *       overlap : 물은 곳 가운데 이미 받아들인 것이 있던 받는 쪽 (겹친 자리)
 * - `accept` — 제안이 받는 쪽에 닿아 받아들여진다
 *     target: `node:<받는 쪽>`
 *     payload: { by: string; at: string; ballot: number; value: number;
 *                was: { ballot: number; value: number } | null;
 *                holding: number;      // 같은 값을 든 받는 쪽 수
 *                ownHolding: number;   // 제안자 제 값(own)을 든 받는 쪽 수
 *                decided: number[];    // 이 걸음 뒤 과반이 든 값들 (오름차순)
 *                firstDecided: boolean // 이 걸음에서 처음 정해졌는가 }
 *
 * `decided` 는 모든 걸음 이벤트가 싣는다 — 장면이 걸음마다 정해진 값을 줄로 쌓는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Accepted = { ballot: number; value: number };

export type ProposerData = {
  id: string;
  ballot: number;
  value: number;
  /** 보내는(묻는 제안자라면 묻고 나서 보내는) 받는 쪽, 차례대로 */
  to: string[];
  /** 참이면 보내기 전에 `to` 에게 받아들인 것을 묻는다 */
  asks: boolean;
};

export type AgreeOnOneValueFacetData = {
  type: 'agree-on-one-value';
  stepMs: number;
  acceptors: string[];
  proposers: ProposerData[];
};

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === 'string');
}

function narrowProposer(raw: unknown, i: number, acceptors: string[]): ProposerData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`agree-on-one-value: proposers[${i}] 가 객체가 아니다`);
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string') throw new Error(`agree-on-one-value: proposers[${i}].id 가 문자열이 아니다`);
  if (typeof p.ballot !== 'number' || !Number.isInteger(p.ballot)) {
    throw new Error(`agree-on-one-value: proposers[${i}].ballot 이 정수가 아니다`);
  }
  if (typeof p.value !== 'number') throw new Error(`agree-on-one-value: proposers[${i}].value 가 수가 아니다`);
  if (!isStringArray(p.to) || p.to.length === 0) {
    throw new Error(`agree-on-one-value: proposers[${i}].to 가 비었거나 문자열 배열이 아니다`);
  }
  for (const a of p.to) {
    if (!acceptors.includes(a)) throw new Error(`agree-on-one-value: proposers[${i}].to 의 ${a} 가 받는 쪽에 없다`);
  }
  if (typeof p.asks !== 'boolean') throw new Error(`agree-on-one-value: proposers[${i}].asks 가 참거짓이 아니다`);
  return { id: p.id, ballot: p.ballot, value: p.value, to: [...p.to], asks: p.asks };
}

/** `ctx.data` · 장면 `initial` 이 함께 쓰는 좁히개. 어긋나면 던진다. 값을 베껴 돌려준다. */
export function narrowAgreeOnOneValueData(raw: unknown): AgreeOnOneValueFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('agree-on-one-value: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'agree-on-one-value') throw new Error('agree-on-one-value: type 이 다르다');
  if (typeof d.stepMs !== 'number' || d.stepMs <= 0) throw new Error('agree-on-one-value: stepMs 가 양수가 아니다');
  if (!isStringArray(d.acceptors) || d.acceptors.length === 0) {
    throw new Error('agree-on-one-value: acceptors 가 비었거나 문자열 배열이 아니다');
  }
  if (new Set(d.acceptors).size !== d.acceptors.length) throw new Error('agree-on-one-value: acceptors 에 겹친 식별자가 있다');
  const acceptors = [...d.acceptors];
  if (!Array.isArray(d.proposers) || d.proposers.length === 0) {
    throw new Error('agree-on-one-value: proposers 가 비었거나 배열이 아니다');
  }
  const proposers = d.proposers.map((p, i) => narrowProposer(p, i, acceptors));
  if (new Set(proposers.map((p) => p.id)).size !== proposers.length) {
    throw new Error('agree-on-one-value: proposers 에 겹친 식별자가 있다');
  }
  if (new Set(proposers.map((p) => p.ballot)).size !== proposers.length) {
    throw new Error('agree-on-one-value: 제안자 번호가 겹친다');
  }
  return { type: 'agree-on-one-value', stepMs: d.stepMs, acceptors, proposers };
}

/** 다섯이면 셋 — 받는 쪽 수의 과반 */
export function majorityOf(count: number): number {
  return Math.floor(count / 2) + 1;
}

/** 과반이 든 값들 (오름차순) */
function decidedValues(accepted: Map<string, Accepted | null>, majority: number): number[] {
  const count = new Map<number, number>();
  for (const a of accepted.values()) {
    if (a === null) continue;
    const before = count.get(a.value);
    count.set(a.value, before === undefined ? 1 : before + 1);
  }
  return [...count.entries()].filter(([, n]) => n >= majority).map(([v]) => v).sort((x, y) => x - y);
}

function holdingOf(accepted: Map<string, Accepted | null>, value: number): number {
  let n = 0;
  for (const a of accepted.values()) if (a !== null && a.value === value) n += 1;
  return n;
}

/** 걸음 0 을 넣은 걸음 수 — 묻는 제안자는 물음 · 값 정하기 · 보냄, 아니면 보냄만 */
function countSteps(proposers: ProposerData[]): number {
  return proposers.reduce((n, p) => n + (p.asks ? p.to.length * 2 + 1 : p.to.length), 1);
}

/** 대답 가운데 번호가 가장 큰 것. 없으면 null */
function highestAnswer(
  answers: { at: string; accepted: Accepted }[],
): { at: string; accepted: Accepted } | null {
  return answers.reduce<{ at: string; accepted: Accepted } | null>(
    (best, r) => (best === null || r.accepted.ballot > best.accepted.ballot ? r : best),
    null,
  );
}

export async function agreeOnOneValue(
  context: FacetContext<AgreeOnOneValueFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<AgreeOnOneValueFacetData>;
  const data = narrowAgreeOnOneValueData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const majority = majorityOf(data.acceptors.length);
  const totalSteps = countSteps(data.proposers);

  const accepted = new Map<string, Accepted | null>();
  for (const a of data.acceptors) accepted.set(a, null);
  let everDecided = false;

  await ctx.emit({ type: 'init', payload: { majority, totalSteps }, silent: true });

  for (const p of data.proposers) {
    if (ctx.cancelled) return;
    let carries = p.value;

    if (p.asks) {
      const answers: { at: string; accepted: Accepted }[] = [];
      for (const at of p.to) {
        if (!(await pause())) return;
        const got = accepted.get(at);
        if (got === undefined) throw new Error(`agree-on-one-value: 받는 쪽 ${at} 가 없다`);
        if (got !== null) answers.push({ at, accepted: { ...got } });
        await ctx.emit({
          type: 'ask',
          target: `node:${at}`,
          payload: {
            by: p.id,
            at,
            answer: got === null ? null : { ballot: got.ballot, value: got.value },
            decided: decidedValues(accepted, majority),
          },
        });
      }
      if (!(await pause())) return;
      const best = highestAnswer(answers);
      if (best !== null) carries = best.accepted.value;
      await ctx.emit({
        type: 'adopt',
        payload: {
          by: p.id,
          own: p.value,
          carries,
          source: best === null ? null : { at: best.at, ballot: best.accepted.ballot },
          overlap: answers.map((r) => r.at),
          decided: decidedValues(accepted, majority),
        },
      });
    }

    for (const at of p.to) {
      if (!(await pause())) return;
      const was = accepted.get(at);
      if (was === undefined) throw new Error(`agree-on-one-value: 받는 쪽 ${at} 가 없다`);
      if (was !== null && was.ballot >= p.ballot) {
        throw new Error(`agree-on-one-value: ${at} 가 이미 번호 ${was.ballot} 을 들었는데 번호 ${p.ballot} 가 닿았다`);
      }
      accepted.set(at, { ballot: p.ballot, value: carries });
      const decided = decidedValues(accepted, majority);
      const firstDecided = !everDecided && decided.length > 0;
      if (decided.length > 0) everDecided = true;
      await ctx.emit({
        type: 'accept',
        target: `node:${at}`,
        payload: {
          by: p.id,
          at,
          ballot: p.ballot,
          value: carries,
          was: was === null ? null : { ballot: was.ballot, value: was.value },
          holding: holdingOf(accepted, carries),
          ownHolding: holdingOf(accepted, p.value),
          decided,
          firstDecided,
        },
      });
    }
  }
}
