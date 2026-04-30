/**
 * 컨텍스트 스위칭 (context switching) facet 알고리즘 — ReactiveMechanism + 자동 시연 루프.
 *
 * 시그니처 행동: 단 하나의 CPU 무대 위에서 한 흐름의 상태 일습이 자기 보관소로
 * 떠내지고, 다른 흐름의 상태 일습이 그 자리에 되돌려 들어가, 두 흐름이 멈춘
 * 지점에서 정확히 이어 실행된다. 한 사건은 저장 → 빈 무대 → 복원의 세 박자.
 *
 * 진행 모델: 시간 진행형. mount 직후 자동 시연으로 autoSwitches 회의 스위치를
 * 펼치고 idle 로 진입한다. idle 에서 play / step / pause / triggerKind / mode
 * 입력 대기. 자동 진행 중에는 pollInput 으로 입력 인터럽트를 매 사건 사이에 검사.
 *
 * 입력 어휘 (모두 facet 로컬, 'reset' 만 mechanism 표준):
 *   - play           payload?: unknown                             자동 진행 시작
 *   - pause          payload?: unknown                             자동 진행 정지 (상태 보존)
 *   - step           payload?: unknown                             다음 박자 1단계만 진행
 *                                                                  (세 박자 — 트리거+저장 / 빈 / 복원)
 *   - triggerKind    payload: { value, segmentIndex }              다음 트리거 종류 변경
 *   - mode           payload: { value, segmentIndex }              스레드/프로세스 모드 토글
 *
 * 식별자 (C1):
 *   - `stage:cpu`              — CPU 무대 본체.
 *   - `stage:slot:i`           — 무대 레지스터 슬롯 i (i = 0..7).
 *   - `holder:a` / `holder:b`  — 좌·우 보관소 (PCB/TCB 박스).
 *   - `holder:slot:a:i` / `holder:slot:b:i` — 보관소 슬롯.
 *   - `bundle:moving`          — 운동 중 묶음.
 *   - `trigger:mark`           — 천장 트리거 표식.
 *   - `timeline:strip`         — 가로 시간 띠.
 *   - `caption:base` / `caption:event` — 상단 / 사건 캡션.
 *
 * 이벤트 어휘 (모두 facet 로컬):
 *   - init                  { occupant, mode, triggerKind, timings, modeMultipliers,
 *                             strip: { capacity, tickMs }, occupySegmentMs }
 *   - trigger-arrived       { kind, from }
 *   - save-begin            { from, kind, mode }
 *   - save-end              { from, mode }
 *   - restore-begin         { to, mode }
 *   - restore-end           { to, mode }
 *   - mode-changed          { mode, segmentIndex }
 *   - trigger-kind-changed  { kind, segmentIndex }
 *   - reset-state           { occupant, mode, triggerKind }
 *   - mode                  { mode: 'auto' | 'idle' }, silent
 *   - phase                 { phase: 'sequence' | 'idle' }, silent
 *
 * 메트릭: 없음 (시간 띠가 곧 누적 사건 기록).
 *
 * phase 어휘: 'idle' (정지 또는 점유 진행 중) | 'sequence' (한 사건 운동 중).
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type Flow = 'a' | 'b';
export type TriggerKind = 'timer' | 'syscall' | 'io' | 'interrupt';
export type Mode = 'thread' | 'process';

export type TriggerSegment = {
  /** segmented-slider 가 보내는 numeric value — index 와 1:1 매핑 권장. */
  value: number;
  kind: TriggerKind;
};

export type ModeSegment = {
  value: number;
  mode: Mode;
};

export type ContextSwitchingData = {
  type: 'context-switching';
  /** 자동 시연 사건 시퀀스 길이. */
  autoSwitches: number;
  /** 점유 구간 길이 (ms, 1× 기준). 트리거 도착 전 흐름 진행 시간. */
  occupySegmentMs: number;
  /** 사건 박자 길이 (ms, 1× 기준). */
  timings: {
    triggerPulseMs: number;
    saveDurationMs: number;
    emptyDurationMs: number;
    restoreDurationMs: number;
  };
  /** 모드별 회색 구간 배율 (process > thread). */
  modeMultipliers: {
    thread: number;
    process: number;
  };
  /** 트리거 4종 segmented-slider 후보. */
  triggerSegments: TriggerSegment[];
  /** 모드 segmented-slider 후보. */
  modeSegments: ModeSegment[];
  /** 시간 띠 칸 수 (가로 누적). */
  stripCapacity: number;
  /** 시간 띠 한 칸의 시간 가중치 (ms). 1× 기준. */
  stripTickMs: number;
  /** 초기 점유 흐름. */
  initialOccupant: Flow;
  /** 초기 트리거 종류 segmentIndex. */
  initialTriggerIndex: number;
  /** 초기 모드 segmentIndex. */
  initialModeIndex: number;
};

export type ContextSwitchingInputEvent =
  | { type: 'play'; payload?: unknown }
  | { type: 'pause'; payload?: unknown }
  | { type: 'step'; payload?: unknown }
  | { type: 'triggerKind'; payload?: { value?: number; segmentIndex?: number } }
  | { type: 'mode'; payload?: { value?: number; segmentIndex?: number } };

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function flip(o: Flow): Flow {
  return o === 'a' ? 'b' : 'a';
}

// ── 알고리즘 본체 ─────────────────────────────────────────────────────────

export async function contextSwitching(
  ctxBase: FacetContext<ContextSwitchingData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ContextSwitchingData>;
  const data = ctx.data;
  const {
    autoSwitches,
    occupySegmentMs,
    timings,
    modeMultipliers,
    triggerSegments,
    modeSegments,
    stripCapacity,
    stripTickMs,
    initialOccupant,
  } = data;

  let occupant: Flow = initialOccupant;
  let triggerIndex = Math.max(
    0,
    Math.min(triggerSegments.length - 1, data.initialTriggerIndex),
  );
  let modeIndex = Math.max(
    0,
    Math.min(modeSegments.length - 1, data.initialModeIndex),
  );
  let triggerKind: TriggerKind = triggerSegments[triggerIndex]!.kind;
  let mode: Mode = modeSegments[modeIndex]!.mode;

  /** step 박자 진행 상태 — 0 = 사건 미시작 / 1 = 저장 완료 (빈 직전) / 2 = 빈 끝 (복원 직전). */
  let stepBeat = 0;

  function modeFactor(): number {
    return mode === 'process' ? modeMultipliers.process : modeMultipliers.thread;
  }

  // 0. 초기 통보. 점유 흐름의 보관소는 비어 있고, 반대편 보관소는 그 흐름 색으로 잠긴 채.
  await ctx.emit({
    type: 'init',
    payload: {
      occupant,
      mode,
      triggerKind,
      timings,
      modeMultipliers,
      strip: { capacity: stripCapacity, tickMs: stripTickMs },
      occupySegmentMs,
    },
  });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  /** 한 박자 — 트리거 + 저장. occupant 보존, stepBeat → 1. */
  async function beatTriggerSave(): Promise<boolean> {
    if (ctx.cancelled) return false;
    await ctx.emit({
      type: 'trigger-arrived',
      payload: { kind: triggerKind, from: occupant },
    });
    const ok0 = await ctx.sleep(timings.triggerPulseMs);
    if (!ok0 || ctx.cancelled) return false;
    await ctx.emit({
      type: 'save-begin',
      payload: { from: occupant, kind: triggerKind, mode },
    });
    const ok1 = await ctx.sleep(timings.saveDurationMs * modeFactor());
    if (!ok1 || ctx.cancelled) return false;
    await ctx.emit({ type: 'save-end', payload: { from: occupant, mode } });
    stepBeat = 1;
    return true;
  }

  /** 한 박자 — 빈 무대 정지. stepBeat → 2. */
  async function beatEmpty(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(timings.emptyDurationMs * modeFactor());
    if (!ok || ctx.cancelled) return false;
    stepBeat = 2;
    return true;
  }

  /** 한 박자 — 복원. occupant flip, stepBeat → 0. */
  async function beatRestore(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const to = flip(occupant);
    await ctx.emit({ type: 'restore-begin', payload: { to, mode } });
    const ok = await ctx.sleep(timings.restoreDurationMs * modeFactor());
    if (!ok || ctx.cancelled) return false;
    await ctx.emit({ type: 'restore-end', payload: { to, mode } });
    occupant = to;
    stepBeat = 0;
    return true;
  }

  /**
   * 자동 시연 한 호흡 — autoSwitches 회만큼 (occupy → switch) 반복.
   * 매 점유 / 사건 사이에 pollInput 인터럽트 검사.
   */
  async function autoRun(): Promise<ContextSwitchingInputEvent | null> {
    await ctx.emit({ type: 'mode', payload: { mode: 'auto' }, silent: true });

    // step 도중 호출되면 미완료 박자부터 마무리.
    if (stepBeat === 1) {
      await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });
      if (!(await beatEmpty())) return null;
      if (!(await beatRestore())) return null;
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
    } else if (stepBeat === 2) {
      await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });
      if (!(await beatRestore())) return null;
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
    }

    let remaining = autoSwitches;
    while (remaining-- > 0) {
      if (ctx.cancelled) return null;

      // 점유 구간 — 흐름 진행 (실제로 상태 변화 없음, 시간 띠는 stage 가 RAF 로 자란다).
      // 인터럽트를 짧게 쪼개 검사 (250ms 단위).
      const slices = Math.max(1, Math.ceil(occupySegmentMs / 250));
      const sliceMs = occupySegmentMs / slices;
      for (let i = 0; i < slices; i++) {
        const ok = await ctx.sleep(sliceMs);
        if (!ok || ctx.cancelled) return null;
        const pending = ctx.pollInput<ContextSwitchingInputEvent>();
        if (pending) {
          await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
          return pending;
        }
      }

      // 한 사건 — 세 박자 통합 진행.
      await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });
      if (!(await beatTriggerSave())) return null;
      if (!(await beatEmpty())) return null;
      if (!(await beatRestore())) return null;
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

      const pending = ctx.pollInput<ContextSwitchingInputEvent>();
      if (pending) {
        await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
        return pending;
      }
    }

    await ctx.emit({ type: 'mode', payload: { mode: 'idle' }, silent: true });
    return null;
  }

  // mount 직후 한 호흡 자동 시연.
  let interrupted = await autoRun();

  // 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;

    let ev: ContextSwitchingInputEvent;
    if (interrupted) {
      ev = interrupted;
      interrupted = null;
    } else {
      try {
        ev = await ctx.waitForInput<ContextSwitchingInputEvent>();
      } catch {
        return;
      }
    }

    if (ev.type === 'pause') {
      continue;
    }

    if (ev.type === 'triggerKind') {
      const idxRaw = ev.payload?.segmentIndex;
      const valueRaw = ev.payload?.value;
      let nextIdx = triggerIndex;
      if (typeof idxRaw === 'number' && idxRaw >= 0 && idxRaw < triggerSegments.length) {
        nextIdx = Math.floor(idxRaw);
      } else if (typeof valueRaw === 'number') {
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < triggerSegments.length; i++) {
          const d = Math.abs(triggerSegments[i]!.value - valueRaw);
          if (d < bestDiff) {
            bestDiff = d;
            best = i;
          }
        }
        nextIdx = best;
      }
      triggerIndex = nextIdx;
      triggerKind = triggerSegments[triggerIndex]!.kind;
      await ctx.emit({
        type: 'trigger-kind-changed',
        payload: { kind: triggerKind, segmentIndex: triggerIndex },
      });
      continue;
    }

    if (ev.type === 'mode') {
      const idxRaw = ev.payload?.segmentIndex;
      const valueRaw = ev.payload?.value;
      let nextIdx = modeIndex;
      if (typeof idxRaw === 'number' && idxRaw >= 0 && idxRaw < modeSegments.length) {
        nextIdx = Math.floor(idxRaw);
      } else if (typeof valueRaw === 'number') {
        let best = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < modeSegments.length; i++) {
          const d = Math.abs(modeSegments[i]!.value - valueRaw);
          if (d < bestDiff) {
            bestDiff = d;
            best = i;
          }
        }
        nextIdx = best;
      }
      modeIndex = nextIdx;
      mode = modeSegments[modeIndex]!.mode;
      await ctx.emit({
        type: 'mode-changed',
        payload: { mode, segmentIndex: modeIndex },
      });
      continue;
    }

    if (ev.type === 'step') {
      // 일시정지 상태에서 박자 단위 진행. 세 박자 — 트리거+저장 / 빈 / 복원.
      await ctx.emit({ type: 'phase', payload: { phase: 'sequence' }, silent: true });
      if (stepBeat === 0) {
        await beatTriggerSave();
      } else if (stepBeat === 1) {
        await beatEmpty();
      } else {
        await beatRestore();
      }
      // 사건이 마무리됐을 때만 idle 로 복귀 (stepBeat === 0).
      if (stepBeat === 0) {
        await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
      }
      continue;
    }

    if (ev.type === 'play') {
      const next = await autoRun();
      if (next) interrupted = next;
      continue;
    }
  }
}
