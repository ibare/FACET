/**
 * splitWhenFull — 노드 분할 조각(piece) 알고리즘.
 *
 * "차면 가운데를 위로 올리며 쪼갠다" 는 질문에 답한다. 자식 하나가 이미 꽉 찬
 * 상태에서 키를 하나 더 넣으면 넘치고, 넘친 자리의 가운데 키가 부모로 올라가
 * 좌우 갈림 기준이 되고, 남은 키들이 그 기준으로 두 자리로 갈라진다.
 *
 * `ctx.data` 는 "넣기 전" 트리(부모 + 자식들)와 넣을 키만 담는다. 넘침 판정 /
 * 임시 삽입 / 가운데 뽑기 / 좌우 가르기는 전부 이 파일이 계산한다 — 넣은 뒤
 * 상태를 미리 적어 두고 갈아 끼우지 않는다 (S-piece).
 *
 * ── 확장 이벤트 (C2) ────────────────────────────────────────────────────
 *
 * descend  { childIndex, insertKey, parentKeyIndex, comparedKey }
 *   부모에서 insertKey 를 부모 키와 비교해 자식 childIndex 로 내려간다.
 *   parentKeyIndex/comparedKey 는 비교에 쓰인 부모 키의 위치와 값(하이라이트용).
 *   silent: false — 하강 이동이 있는 step boundary.
 *
 * overflow { childIndex, tempKeys, insertedIndex }
 *   자식 childIndex 가 이미 꽉 차 있어, insertKey 를 끼워 넣은 임시 배열
 *   tempKeys(용량+1개, 정렬됨)가 넘친다. insertedIndex 는 tempKeys 안에서
 *   새로 들어온 키의 자리.
 *   silent: false.
 *
 * promote  { childIndex, middleKey, middleIndex, parentInsertIndex, parentKeysAfter }
 *   tempKeys 의 가운데(middleIndex) 값 middleKey 가 부모로 올라가
 *   parentInsertIndex 자리에 꽂힌다. parentKeysAfter 는 올라간 뒤 부모의
 *   전체 키 배열.
 *   silent: false — 위로 오르는 이동이 있는 핵심 step boundary.
 *
 * divide   { childIndex, leftKeys, rightKeys }
 *   tempKeys 에서 middleKey 를 뺀 나머지가 leftKeys/rightKeys 로 갈라져
 *   각각 childIndex, childIndex+1 자리의 자식이 된다. 나무는 옆으로
 *   넓어지고 층수는 그대로다.
 *   silent: false.
 *
 * rewind   {} (payload 없음)
 *   자동 재생이 끝난 뒤, 처음 누르는 advance 가 화면을 넣기 전 상태로 되돌릴
 *   때 발신한다. control-bar 의 `reset` (mechanism.reset → 전체 재시작) 과
 *   달리, 이 파일이 waitForInput 루프 안에서 스스로 발신하는 시각 초기화
 *   신호다.
 *   silent: false — 트리 전체가 다시 그려지는 시각 변화이므로.
 *
 * `done` 은 쓰지 않는다 — 마지막 시각 변화인 divide 자체가 결말이고, 조각은
 * 표준 완료 신호 대신 곧바로 advance 대기 루프로 들어가 되짚어보기를 준비한다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitWhenFullNode = { keys: number[] };

export type SplitWhenFullData = {
  type: 'split-when-full';
  /** 한 노드가 담는 키의 최대 개수. 넷째가 들어오면 넘친다. */
  capacity: number;
  /** 넣기 전 부모 노드. */
  parent: SplitWhenFullNode;
  /** 넣기 전 자식 노드들 (부모 키 개수 + 1 이어야 하는 온전한 B-트리 형태). */
  children: SplitWhenFullNode[];
  /** 넣을 키. */
  insertKey: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정. */
  stepMs: number;
};

export type DescendPayload = {
  childIndex: number;
  insertKey: number;
  parentKeyIndex: number;
  comparedKey: number;
};

export type OverflowPayload = {
  childIndex: number;
  tempKeys: number[];
  insertedIndex: number;
};

export type PromotePayload = {
  childIndex: number;
  middleKey: number;
  middleIndex: number;
  parentInsertIndex: number;
  parentKeysAfter: number[];
};

export type DividePayload = {
  childIndex: number;
  leftKeys: number[];
  rightKeys: number[];
};

/** 부모 키와 비교해 어느 자식으로 내려갈지 계산. */
function computeDescend(data: SplitWhenFullData): DescendPayload {
  const { parent, insertKey } = data;
  let childIndex = parent.keys.length;
  let parentKeyIndex = Math.max(0, parent.keys.length - 1);
  for (let i = 0; i < parent.keys.length; i += 1) {
    if (insertKey < parent.keys[i]!) {
      childIndex = i;
      parentKeyIndex = i;
      break;
    }
  }
  const comparedKey = parent.keys[Math.min(parentKeyIndex, parent.keys.length - 1)]!;
  return { childIndex, insertKey, parentKeyIndex, comparedKey };
}

/** 자식이 이미 꽉 찬 상태에서 insertKey 를 끼워 넣어 넘치는 임시 배열을 만든다. */
function computeOverflow(data: SplitWhenFullData, desc: DescendPayload): OverflowPayload {
  const child = data.children[desc.childIndex]!;
  const tempKeys = [...child.keys, data.insertKey].sort((a, b) => a - b);
  const insertedIndex = tempKeys.indexOf(data.insertKey);
  return { childIndex: desc.childIndex, tempKeys, insertedIndex };
}

/** 임시 배열의 가운데를 뽑아 부모의 어느 자리로 올라가는지 계산. */
function computePromote(data: SplitWhenFullData, over: OverflowPayload): PromotePayload {
  const middleIndex = over.tempKeys.length / 2 - 1;
  const middleKey = over.tempKeys[middleIndex]!;
  const { parent } = data;
  let parentInsertIndex = parent.keys.length;
  for (let i = 0; i < parent.keys.length; i += 1) {
    if (middleKey < parent.keys[i]!) {
      parentInsertIndex = i;
      break;
    }
  }
  const parentKeysAfter = [...parent.keys];
  parentKeysAfter.splice(parentInsertIndex, 0, middleKey);
  return { childIndex: over.childIndex, middleKey, middleIndex, parentInsertIndex, parentKeysAfter };
}

/** 가운데를 뺀 나머지를 좌우로 가른다. */
function computeDivide(over: OverflowPayload, prom: PromotePayload): DividePayload {
  const leftKeys = over.tempKeys.slice(0, prom.middleIndex);
  const rightKeys = over.tempKeys.slice(prom.middleIndex + 1);
  return { childIndex: over.childIndex, leftKeys, rightKeys };
}

/**
 * 네 걸음(descend → overflow → promote → divide)을 한 번 재생한다.
 * `gate` 가 각 걸음 사이의 진행 방식을 결정한다 — 자동 재생은 sleep 으로,
 * 수동 되짚기는 다음 advance 입력으로 다음 걸음을 연다.
 */
async function playSequence(
  ctx: ReactiveContext<SplitWhenFullData>,
  data: SplitWhenFullData,
  gate: () => Promise<boolean>,
): Promise<boolean> {
  const desc = computeDescend(data);
  await ctx.emit({ type: 'descend', payload: desc });
  if (ctx.cancelled) return false;
  if (!(await gate())) return false;

  const over = computeOverflow(data, desc);
  await ctx.emit({ type: 'overflow', payload: over });
  if (ctx.cancelled) return false;
  if (!(await gate())) return false;

  const prom = computePromote(data, over);
  await ctx.emit({ type: 'promote', payload: prom });
  if (ctx.cancelled) return false;
  if (!(await gate())) return false;

  const div = computeDivide(over, prom);
  await ctx.emit({ type: 'divide', payload: div });
  return !ctx.cancelled;
}

export async function splitWhenFull(ctxIn: FacetContext<SplitWhenFullData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<SplitWhenFullData>;
  const data = ctx.data;

  async function autoGate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return ctx.sleep(data.stepMs);
  }

  async function manualGate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    try {
      // advance 만 걸음으로 친다. 지금은 그 버튼뿐이지만, View 위젯 입력이
      // 생기면 아무 dispatch 나 한 걸음 나아가게 된다 (S-runtime 의 dispatch 채널).
      for (;;) {
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return false;
        if (input.type === 'advance') break;
      }
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return false;
    }
    return !ctx.cancelled;
  }

  const completedAuto = await playSequence(ctx, data, autoGate);
  if (!completedAuto) return;

  // 자동 재생을 마쳤다 — 이제부터는 advance 로만 나아간다. 처음 누르는
  // advance 는 되감고(rewind) 첫 걸음까지 보인다. 끝까지 짚으면 다음 advance 가
  // 다시 되감아 순환한다.
  while (!ctx.cancelled) {
    try {
      // 되감기를 여는 누름도 advance 만 친다 — manualGate 와 같은 기준이다.
      for (;;) {
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'advance') break;
      }
    } catch {
      // 취소되면 waitForInput 이 reject 한다 — 메커니즘이 조용히 거둔다 (C6).
      return;
    }
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'rewind', payload: {} });
    if (ctx.cancelled) return;

    const completed = await playSequence(ctx, data, manualGate);
    if (!completed) return;
  }
}
