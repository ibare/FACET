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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.base': { en: 'Context switching — on a single CPU stage one flow\'s whole register set is lifted out into its own holder, the other flow\'s set is placed back into those same slots, and each resumes exactly where it stopped.', ko: '컨텍스트 스위칭 — 단 하나의 CPU 무대 위에서 한 흐름의 상태 일습이 자기 보관소로 떠내지고, 다른 흐름의 상태 일습이 그 자리에 되돌려 들어가, 두 흐름이 멈춘 지점에서 정확히 이어 실행된다.' },
    'caption.holderThicker': { en: 'The holders got thicker — there is more to carry across.', ko: '보관소가 두꺼워졌다 — 옮길 묶음이 늘어난다.' },
    'caption.holderThinner': { en: 'The holders got thinner — two threads inside one process.', ko: '보관소가 얇아졌다 — 같은 프로세스 안 두 스레드.' },
    'caption.restore': { en: 'Placing the next flow\'s state back onto the stage.', ko: '다음 흐름의 상태를 무대로 되돌린다.' },
    'caption.resume': { en: 'Carrying on — it resumes exactly where it stopped.', ko: '이어서 시작 — 멈춘 자리에서 정확히 재개된다.' },
    'caption.save': { en: 'Lifting the current state out into the holder.', ko: '현재 상태를 보관소로 떠낸다.' },
    'caption.stageEmpty': { en: 'The stage is empty — nobody is making progress.', ko: '무대가 비어 있다 — 누구도 진전하지 않는다.' },
    'caption.triggerArrived': { en: 'A trigger arrived — the flow stops.', ko: '트리거 도착 — 흐름이 멈춘다.' },
    'caption.triggerChanged': { en: 'The next trigger kind changed.', ko: '다음 트리거 종류가 바뀌었다.' },
    'concept.line1': { en: 'Context switching — on a single CPU stage one flow\'s whole register set is lifted out into its own holder,', ko: '컨텍스트 스위칭 — 단 하나의 CPU 무대 위에서 한 흐름의 상태 일습이 자기 보관소로 떠내지고,' },
    'concept.line2': { en: 'and the other flow\'s set is placed back into those same slots, so each resumes exactly where it stopped.', ko: '다른 흐름의 상태 일습이 그 자리에 되돌려 들어가, 두 흐름이 멈춘 지점에서 정확히 이어 실행된다.' },
    'label.aria': { en: 'Context switching visualization — one CPU stage, holders on each side, triggers from the ceiling, and a time strip', ko: '컨텍스트 스위칭 시각화 — 단일 CPU 무대 + 좌우 보관소 + 천장 트리거 + 시간 띠' },
    'label.ceiling': { en: '— ceiling: where triggers come down from outside —', ko: '— 천장: 트리거가 외부에서 내려오는 자리 —' },
    'label.holderA': { en: 'holder for flow A', ko: '흐름 A 보관소' },
    'label.holderB': { en: 'holder for flow B', ko: '흐름 B 보관소' },
    'label.nextTrigger': { en: 'next trigger: {kind}', ko: '다음 트리거: {kind}' },
    'label.references': { en: 'See also — OSTEP · Silberschatz · Wikipedia · Process Scheduling Visualizer', ko: '참고 — OSTEP · Silberschatz · Wikipedia · Process Scheduling Visualizer' },
    'label.stage': { en: 'CPU stage (single occupancy)', ko: 'CPU 무대 (단일 점유)' },
    'label.timeStrip': { en: 'time strip — flow colour = progress, grey hatching = empty time (overhead)', ko: '시간 띠 — 흐름 색 = 진행, 회색 사선 = 빈 시간 (오버헤드)' },
    'label.title': { en: 'Context switching — stage / holders / time', ko: '컨텍스트 스위칭 — 무대 / 보관소 / 시간' },
    'trigger.interrupt': { en: 'interrupt', ko: '인터럽트' },
    'trigger.io': { en: 'I/O completion', ko: 'I/O 완료' },
    'trigger.syscall': { en: 'system call', ko: '시스템 호출' },
    'trigger.timer': { en: 'timer', ko: '타이머' },
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
