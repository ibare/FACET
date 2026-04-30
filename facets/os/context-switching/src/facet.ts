/**
 * 컨텍스트 스위칭 (context switching) facet JSON 선언.
 *
 * 진행 모델: 시간 진행형 (mount 직후 자동 시연 한 호흡 — autoSwitches 회의 스위치).
 * ReactiveMechanism 위에 자동 시연 + pollInput 인터럽트 패턴.
 *
 * 컨트롤바 어휘 (기획 §6 §8):
 *   [ ▶ play ] [ ⏸ pause ] [ ⏭ step ] [ ↺ reset ]
 *   [ 트리거 segmented-slider: 타이머 / 시스템 호출 / I/O / 인터럽트 ]
 *   [ 모드 segmented-slider: 스레드 / 프로세스 ]
 *
 * 식별자 (C1): `stage:` `holder:` `bundle:` `trigger:` `timeline:` `caption:` 명시 prefix.
 *
 * 파라미터는 기획 §9. 4×2 슬롯, 1× 기준 운동 지속 (저장 700 / 빈 400 / 복원 800ms),
 * 모드 배율 (스레드 1.0× / 프로세스 1.6×), 시간 띠 80 칸.
 */

import type { FacetJson } from '@facet/core/runtime';

export const contextSwitchingFacet: FacetJson = {
  id: 'facet:contextSwitching',
  title: {
    en: 'Context Switching — One Stage, Two Owners',
    ko: '컨텍스트 스위칭 — 한 무대 위 주인의 교대',
  },
  description: {
    en: 'A single CPU stage swaps owners — one flow\'s register bundle is lifted into its holder, the other\'s is replaced into the same slots, and time resumes exactly where each had stopped',
    ko: '단 하나의 CPU 무대 위에서 한 흐름의 레지스터 묶음이 자기 보관소로 떠내지고, 다른 흐름의 묶음이 같은 자리에 되돌려져, 두 흐름이 멈춘 지점부터 정확히 이어 실행되는 사건',
  },
  algorithm: 'module:contextSwitching',
  projector: 'module:contextSwitchingProjector',
  initialData: {
    type: 'context-switching',
    autoSwitches: 4,
    occupySegmentMs: 1500,
    timings: {
      triggerPulseMs: 240,
      saveDurationMs: 700,
      emptyDurationMs: 400,
      restoreDurationMs: 800,
    },
    modeMultipliers: {
      thread: 1.0,
      process: 1.6,
    },
    triggerSegments: [
      { value: 0, kind: 'timer' },
      { value: 1, kind: 'syscall' },
      { value: 2, kind: 'io' },
      { value: 3, kind: 'interrupt' },
    ],
    modeSegments: [
      { value: 0, mode: 'thread' },
      { value: 1, mode: 'process' },
    ],
    stripCapacity: 80,
    stripTickMs: 80,
    initialOccupant: 'a',
    initialTriggerIndex: 0,
    initialModeIndex: 0,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'context-switching-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'play', label: { en: '▶ Play', ko: '▶ 재생' } },
        { widget: 'button', action: 'pause', label: { en: '⏸ Pause', ko: '⏸ 일시정지' } },
        { widget: 'button', action: 'step', label: { en: '⏭ Step', ko: '⏭ 한 박자' } },
        { widget: 'button', action: 'reset', label: { en: '↺ Reset', ko: '↺ 리셋' } },
        {
          widget: 'segmented-slider',
          action: 'triggerKind',
          name: 'triggerKind',
          label: { en: 'Trigger', ko: '트리거' },
          segments: [
            { value: 0, label: { en: 'Timer', ko: '타이머' }, default: true },
            { value: 1, label: { en: 'Syscall', ko: '시스템 호출' } },
            { value: 2, label: { en: 'I/O', ko: 'I/O' } },
            { value: 3, label: { en: 'Interrupt', ko: '인터럽트' } },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'mode',
          name: 'mode',
          label: { en: 'Mode', ko: '모드' },
          segments: [
            { value: 0, label: { en: 'Thread', ko: '스레드' }, default: true },
            { value: 1, label: { en: 'Process', ko: '프로세스' } },
          ],
        },
      ],
    },
  },
};
