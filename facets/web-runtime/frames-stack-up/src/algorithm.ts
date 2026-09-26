/**
 * frames-stack-up — 이벤트 목록.
 *
 * 모두 silent: false (걸음 경계다).
 *
 *   push      { id: string; from: 'queue' | 'call' }
 *     프레임 하나가 스택 위에 올라간다.
 *     from: 'call'  — 지금 스택 꼭대기 프레임이 불러서 (동기 호출).
 *     from: 'queue' — 태스크 줄 맨 앞에 있던 것이 (스택이 빈 뒤) 맨 아래로 옮겨온다.
 *
 *   schedule  { id: string }
 *     지금 스택 꼭대기 프레임이 콜백을 스택이 아니라 태스크 줄로 넘긴다
 *     (`setTimeout(callback, 0)`). 스택 깊이는 그대로다.
 *
 *   pop       { id: string }
 *     스택 꼭대기 프레임이 걷힌다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 호출 사슬의 프레임 하나 — 코드 몇 번째 줄이 이 프레임의 몸인지. */
export type FrameSpec = {
  /** 코드 식별자 (`script` 는 표시 이름을 messages 에서 받고, 나머지는 코드 그대로 보인다). */
  id: string;
  /** 이 프레임의 몸이 있는 코드 줄 번호 (1-based, `code` 배열 인덱스 + 1). */
  line: number;
};

export type FramesStackUpFacetData = {
  type: 'frames-stack-up';
  stepMs: number;
  /** 실제 자바스크립트 코드 다섯 줄, 그대로 (자료 — 번역하지 않는다). */
  code: string[];
  /** 동기 호출 사슬 — 맨 앞이 태스크 줄에서 시작하는 진입 프레임(`script`). */
  chain: FrameSpec[];
  /** 사슬 끝에서 스택 대신 태스크 줄로 넘어가는 콜백 프레임(`done`). */
  callback: FrameSpec;
};

type Action =
  | { kind: 'push'; id: string; from: 'queue' | 'call' }
  | { kind: 'schedule'; id: string }
  | { kind: 'pop'; id: string };

/**
 * 호출 사슬 + 콜백에서 걸음 차례를 만든다 (구조를 도는 것이지, 손으로 적은 걸음표가 아니다).
 *
 * script 가 태스크 줄에서 빈 스택으로 옮겨오고(1), 사슬을 따라 한 겹씩 올라가고(2..n),
 * 사슬 맨 끝에서 콜백을 태스크 줄로 넘기고(schedule), 사슬을 위에서부터 걷어 내리고(n..1),
 * 빈 스택에 콜백이 태스크 줄에서 옮겨와(push) 곧바로 걷힌다(pop).
 */
function buildActions(chain: FrameSpec[], callback: FrameSpec): Action[] {
  if (chain.length === 0) {
    throw new Error('frames-stack-up: chain 이 비어 있다');
  }
  const actions: Action[] = [];
  actions.push({ kind: 'push', id: chain[0].id, from: 'queue' });
  for (let i = 1; i < chain.length; i++) {
    actions.push({ kind: 'push', id: chain[i].id, from: 'call' });
  }
  actions.push({ kind: 'schedule', id: callback.id });
  for (let i = chain.length - 1; i >= 0; i--) {
    actions.push({ kind: 'pop', id: chain[i].id });
  }
  actions.push({ kind: 'push', id: callback.id, from: 'queue' });
  actions.push({ kind: 'pop', id: callback.id });
  return actions;
}

export async function framesStackUp(ctx: FacetContext<FramesStackUpFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<FramesStackUpFacetData>;
  const { chain, callback, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const actions = buildActions(chain, callback);

  for (const action of actions) {
    // 루프 바디 첫 문장에서 취소를 본다 (C8) — 걸음 0(빈 스택 · 태스크 줄에 script)을
    // 읽을 틈을 준 뒤에야 첫 push 를 낸다.
    if (!(await pause())) return;
    if (action.kind === 'push') {
      await rc.emit({ type: 'push', payload: { id: action.id, from: action.from } });
    } else if (action.kind === 'schedule') {
      await rc.emit({ type: 'schedule', payload: { id: action.id } });
    } else if (action.kind === 'pop') {
      await rc.emit({ type: 'pop', payload: { id: action.id } });
    } else {
      const exhaustive: never = action;
      throw new Error(`frames-stack-up: 모르는 동작 ${JSON.stringify(exhaustive)}`);
    }
  }
}
