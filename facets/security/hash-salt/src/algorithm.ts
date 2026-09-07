/**
 * 소금 치기 (password salting) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "같은 비밀번호를 쓴 두 사람이 왜 다르게 저장되는가?"
 *
 * 논증 순서가 곧 걸음 순서다. 같은 비밀번호를 그냥 해싱하면 저장된 값도 같아져
 * 한 사람이 뚫리면 다른 사람도 함께 드러난다 (2걸음). 각자 다른 소금을 앞에
 * 붙이면 (3걸음) 저장되는 값이 갈린다 (4걸음).
 *
 * 눈사태 조각과 화면이 비슷해질 위험이 있어 주인공을 달리 두었다. 그쪽은 출력이
 * 얼마나 달라지는지를 보이지만, 여기서는 소금이 붙는 순간과 그 전후의 대비가
 * 주인공이다 — 같은 자리의 값이 눈앞에서 갈라지는 것.
 *
 * 진행 동력은 ReactiveMechanism. 컨트롤바 없이 스스로 시작하고 걸음 간격도
 * 스스로 정한다 (ctx.sleep).
 *
 * 식별자 (C1): 행을 가리키는 곳이 payload 뿐이라 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init              payload: { algorithmLabel, password, users, unsaltedHash }
 *   - rewind payload: {}   손으로 짚기 시작할 때 화면을 되감는다
 *   - reveal-users      payload: {}   두 사람과 그들이 고른 같은 비밀번호
 *   - hash-unsalted     payload: {}   그냥 해싱하면 저장된 값도 같아진다
 *   - add-salt          payload: {}   각자 다른 소금이 앞에 붙는다
 *   - hash-salted       payload: {}   저장되는 값이 갈린다
 *
 * 메트릭 (C5): 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 사람 — 이름, 소금, 소금을 친 해시. */
export type SaltedUser = {
  /** 화면에 인쇄할 사용자 이름. */
  name: string;
  /** 이 사람에게만 주어진 소금. */
  salt: string;
  /** sha256(salt + password) 실측값. */
  hash: string;
};

/** 손으로 짚어 보는 입력. control-bar 의 advance 버튼이 보낸다. */
export type SaltInput = { type: 'advance' } | { type: string };

/** 자동 재생과 손으로 짚기가 공유하는 걸음 수. */
const STEP_COUNT = 4;

export type HashSaltFacetData = {
  type: 'hash-salt';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 두 사람이 공교롭게 똑같이 고른 비밀번호. */
  password: string;
  /** 소금 없이 해싱했을 때의 값. 둘에게 똑같이 나온다. */
  unsaltedHash: string;
  /** 소금을 받은 사람들. 둘이면 대비가 가장 또렷하다. */
  users: SaltedUser[];
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다 (원칙 2).
   */
  stepMs: number;
};

export async function hashSalt(
  ctxBase: FacetContext<HashSaltFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashSaltFacetData>;
  const { algorithmLabel, password, unsaltedHash, users, stepMs } = ctx.data;

  /**
   * 한 걸음을 실제로 발신한다. 자동 재생과 손으로 짚기가 같은 경로를 쓴다.
   *
   * 인덱스로 분기하되 emit 의 type 은 리터럴이다 (C2).
   */
  async function playStep(i: number): Promise<void> {
    switch (i) {
      case 0:
        await ctx.emit({ type: 'reveal-users' });
        break;
      case 1:
        await ctx.emit({ type: 'hash-unsalted' });
        break;
      case 2:
        await ctx.emit({ type: 'add-salt' });
        break;
      default:
        await ctx.emit({ type: 'hash-salted' });
        break;
    }
  }

  /**
   * 걸음 사이 머무름. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8).
   *
   * 걸음을 배열로 순회하지 않고 한 줄씩 펴 쓰는 이유는 `ctx.emit` 의 type 이
   * 리터럴이어야 하기 때문이다 (C2). 덕분에 어휘가 코드에 그대로 드러난다.
   */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    return ok && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { algorithmLabel, password, unsaltedHash, users },
  });

  // 네 걸음. 문제를 먼저 보이지 않으면 소금이 무엇을 푸는지 알 수 없다.
  for (let i = 0; i < STEP_COUNT; i++) {
    if (!(await pause())) return;
    await playStep(i);
  }

  // 손으로 짚어 보는 루프. 끝까지 간 뒤 다시 누르면 처음으로 되감는다.
  let cursor = STEP_COUNT;
  for (;;) {
    if (ctx.cancelled) return;
    let ev: SaltInput;
    try {
      ev = await ctx.waitForInput<SaltInput>();
    } catch {
      return;
    }
    if (ev.type !== 'advance') continue;
    if (cursor >= STEP_COUNT) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await playStep(cursor);
    cursor += 1;
  }
}
