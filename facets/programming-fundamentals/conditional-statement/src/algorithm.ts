/**
 * 조건문 (if / else if / else) facet 알고리즘 — ReactiveMechanism.
 *
 * 시그니처 행동: 입력값이 분기점에 닿는 순간 위에서부터 조건들이 차례로
 * 평가되다가 처음 참이 된 한 가지에서 흐름이 확정되고, 나머지 가지들은
 * 어두워진 채 닫힌다.
 *
 * 진행 모델: 시간 축이 아니라 입력값이 시각의 갱신을 주도. mount 직후
 * 첫 가지(참) 가 켜진 정적 상태로 깔린 뒤 무한 waitForInput 루프로
 * 사용자 입력을 시각 사건으로 매핑한다.
 *
 * 입력:
 *   - input        payload: { name: 'value', value: '0..100' (정수 문자열) }
 *                  view 인-스테이지 슬라이더 드래그 → dispatch 채널.
 *   - mode-toggle  payload?: { mode?: 'two' | 'three' }
 *                  컨트롤바 — 2갈래(if/else) ↔ 3갈래(if/else if/else).
 *   - auto-demo    payload?: unknown
 *                  컨트롤바 — 가지 수만큼 값을 순회해 모든 가지가 한 번씩
 *                  켜졌다가 다시 초기 가지로 돌아오는 짧은 시퀀스.
 *
 * 식별자 (C1):
 *   - `flow:start` `flow:continue`     도식 위·아래 흐름선 끝점.
 *   - `diamond:if` `diamond:elif`       평가 마름모.
 *   - `branch:then` `branch:elif-then` `branch:else` 가지선.
 *   - `block:then` `block:elif-then` `block:else`    실행 블록.
 *   - `merge:end`                       합류 노드.
 *
 * 이벤트 어휘 (모두 facet 로컬, StandardEventType 미포함):
 *   - init                 payload: { mode; value; rules; activeBranchId; sequence }
 *                          mount 즉시 + reset 시 1회.
 *   - evaluate             target: branch:<id>
 *                          payload: { value; sequence; activeBranchId }
 *                          위에서부터 차례로 평가하는 사슬 점등 + 첫 참 응결.
 *   - mode-set             payload: { mode: 'two' | 'three' }
 *                          전체 도식 재배치 신호 (view 가 두/세 갈래 전환).
 *   - demo-start / demo-end  payload?: { value? }
 *                          자동 시연 시퀀스의 시작·종료 표식.
 *   - invalid-input        payload: { op; raw }
 *
 *   메타 (silent):
 *   - phase                payload: { phase: 'idle' | 'auto-demo' }
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type ConditionalMode = 'two' | 'three';

/**
 * 단일 조건 규칙 — `value >= threshold` 형태로 단순화한다. 학습용 도식이라
 * 식 자체는 한국어로 풀어 마름모 안에 그대로 박는다 (예: "값 ≥ 80").
 */
export type ConditionalRule = {
  /** 마름모 식별자 (예: 'if', 'elif'). diamond:<id> 식별자에 사용. */
  diamondId: string;
  /** 마름모 안 식 라벨 (예: '값 ≥ 80'). */
  expr: string;
  /** 평가 임계값. */
  threshold: number;
  /** 이 마름모가 참일 때 점등될 가지선 식별자. */
  trueBranchId: string;
  /** 이 마름모가 참일 때 켜질 블록 식별자. */
  trueBlockId: string;
  /** 블록 라벨 (예: '뜨겁다'). */
  trueBlockLabel: string;
};

export type ConditionalElse = {
  /** else 가지선 식별자. */
  branchId: string;
  /** else 블록 식별자. */
  blockId: string;
  /** else 블록 라벨 (예: '시원하다'). */
  blockLabel: string;
};

export type ConditionalRuleSet = {
  /** if 마름모 → else if 마름모 순서대로. 2갈래 모드에서는 길이 1. */
  rules: ConditionalRule[];
  /** else 가지 (마지막 합류 직전 사슬에 존재). */
  else: ConditionalElse;
};

/** 한 평가 박자의 결과. 위에서부터 한 마름모씩 점등 → 첫 참에서 응결. */
export type EvaluationStep = {
  diamondId: string;
  /** 이 마름모에서 식이 어떻게 평가됐는가. 'true' 면 응결, 'false' 면 다음으로. */
  result: 'true' | 'false';
  /** 점등 박자 (ms). projector 가 그대로 view 에 위임. */
  pulseMs: number;
};

/** 입력값 한 컷에 대한 평가 시퀀스 + 최종 활성 가지. */
export type EvaluationOutcome = {
  value: number;
  /** 마름모 사슬을 위에서 아래로 평가한 순서대로의 박자 (마지막 박자가 응결). */
  sequence: EvaluationStep[];
  /** 응결된 활성 가지 id (참인 마름모의 trueBranchId 또는 else.branchId). */
  activeBranchId: string;
  /** 응결된 활성 블록 id. */
  activeBlockId: string;
};

export type ConditionalFacetData = {
  type: 'conditional-statement';
  /** 초기 모드. */
  initialMode: ConditionalMode;
  /** 초기 입력값 (0..100 정수). 첫 가지(참) 로 분기되는 값을 권장. */
  initialValue: number;
  /** 모드별 규칙 정의. */
  rulesByMode: { two: ConditionalRuleSet; three: ConditionalRuleSet };
  /** 마름모 한 박자 점등 시간 (ms). 기획 §9 — 약 220ms. */
  pulseMs: number;
  /** auto-demo 시 한 가지 머무름 시간 (ms). */
  autoDemoHoldMs: number;
  /** auto-demo 가 모든 가지를 한 번씩 켜기 위해 사용할 견본 입력값. */
  autoDemoValues: number[];
};

export type ConditionalInputEvent =
  | { type: 'input'; payload?: { name?: string; value?: string } }
  | { type: 'mode-toggle'; payload?: { mode?: ConditionalMode } }
  | { type: 'auto-demo'; payload?: unknown };

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function evaluate(rules: ConditionalRuleSet, value: number, pulseMs: number): EvaluationOutcome {
  const sequence: EvaluationStep[] = [];
  for (const rule of rules.rules) {
    const ok = value >= rule.threshold;
    sequence.push({ diamondId: rule.diamondId, result: ok ? 'true' : 'false', pulseMs });
    if (ok) {
      return {
        value,
        sequence,
        activeBranchId: rule.trueBranchId,
        activeBlockId: rule.trueBlockId,
      };
    }
  }
  return {
    value,
    sequence,
    activeBranchId: rules.else.branchId,
    activeBlockId: rules.else.blockId,
  };
}

export async function conditionalStatement(
  ctxBase: FacetContext<ConditionalFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ConditionalFacetData>;
  const { initialMode, initialValue, rulesByMode, pulseMs, autoDemoHoldMs, autoDemoValues } = ctx.data;

  let mode: ConditionalMode = initialMode;
  let value = clampInt(initialValue, 0, 100, 50);

  const initialOutcome = evaluate(rulesByMode[mode], value, pulseMs);

  // 0. 초기 통보 — 도식 + 첫 평가 결과를 한 번에.
  await ctx.emit({
    type: 'init',
    payload: {
      mode,
      value,
      rules: rulesByMode[mode],
      sequence: initialOutcome.sequence,
      activeBranchId: initialOutcome.activeBranchId,
      activeBlockId: initialOutcome.activeBlockId,
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  async function emitEvaluate(nextValue: number): Promise<void> {
    value = nextValue;
    const outcome = evaluate(rulesByMode[mode], value, pulseMs);
    await ctx.emit({
      type: 'evaluate',
      target: `branch:${outcome.activeBranchId}`,
      payload: {
        value: outcome.value,
        sequence: outcome.sequence,
        activeBranchId: outcome.activeBranchId,
        activeBlockId: outcome.activeBlockId,
      },
    });
  }

  async function emitModeSet(nextMode: ConditionalMode): Promise<void> {
    mode = nextMode;
    const outcome = evaluate(rulesByMode[mode], value, pulseMs);
    await ctx.emit({
      type: 'mode-set',
      payload: {
        mode,
        rules: rulesByMode[mode],
        value,
        sequence: outcome.sequence,
        activeBranchId: outcome.activeBranchId,
        activeBlockId: outcome.activeBlockId,
      },
    });
  }

  async function runAutoDemo(): Promise<void> {
    await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
    await ctx.emit({ type: 'demo-start' });
    for (const v of autoDemoValues) {
      if (ctx.cancelled) return;
      await emitEvaluate(v);
      const ok = await ctx.sleep(autoDemoHoldMs);
      if (!ok || ctx.cancelled) return;
    }
    await ctx.emit({ type: 'demo-end' });
    await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
  }

  // 1. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: ConditionalInputEvent;
    try {
      ev = await ctx.waitForInput<ConditionalInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      const name = ev.payload?.name;
      if (name !== undefined && name !== 'value') {
        await ctx.emit({
          type: 'invalid-input',
          payload: { op: 'input', raw: `unknown name ${String(name)}` },
        });
        continue;
      }
      const raw = ev.payload?.value;
      const next = clampInt(raw, 0, 100, value);
      if (next === value) continue;
      await emitEvaluate(next);
      continue;
    }

    if (ev.type === 'mode-toggle') {
      const requested = ev.payload?.mode;
      const next: ConditionalMode =
        requested === 'two' || requested === 'three'
          ? requested
          : mode === 'two'
            ? 'three'
            : 'two';
      if (next === mode) continue;
      await emitModeSet(next);
      continue;
    }

    if (ev.type === 'auto-demo') {
      await runAutoDemo();
      continue;
    }
  }
}
