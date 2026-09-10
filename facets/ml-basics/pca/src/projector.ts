/**
 * PCA projector — 알고리즘 이벤트를 stage 메서드와 코드 패널 하이라이트로 옮긴다.
 *
 * 이벤트는 `state-changed` 하나이고 `target` 의 prefix 로 갈린다 (C1 —
 * `parseTarget` 경유). 어휘와 payload 스키마는 `algorithm.ts` 머리말에 있다.
 *
 * 문안은 하나도 만들지 않는다 — 화면 문자는 전부 stage 가 `params.t` 로
 * 조회한다 (C10). 색도 만들지 않는다 (S-facet: projector 는 view 메서드만 부른다).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { parseTarget } from '@ffacet/core/runtime';

/** stage 가 노출하는 메서드 표면 (C9 — 구체형은 파일 상단에 모은다). */
type PcaStage = {
  setFrame?(frame: {
    standardized: boolean;
    xs: number[];
    ys: number[];
    cx: number;
    cy: number;
  }): void;
  setCovariance?(cov: {
    sxx: number;
    sxy: number;
    syy: number;
    sdX: number;
    sdY: number;
    sdRatio: number;
  }): void;
  setStretch?(w: { step: number; wx: number; wy: number; wLen: number }): void;
  setVector?(v: { step: number; vx: number; vy: number; angleDeg: number }): void;
  setTurn?(t: { step: number; turn: number; converged: boolean }): void;
  setAxis?(a: {
    axisIndex: number;
    ax: number;
    ay: number;
    angleDeg: number;
    share: number;
    t: number[];
  }): void;
  addLedgerRow?(r: {
    standardized: boolean;
    angleDeg: number;
    share: number;
    steps: number;
  }): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** payload 를 한 번 좁힌 뒤 필드마다 다시 본다 (C9 — 단언 뒤에 검사가 있다). */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function num(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function flag(r: Record<string, unknown>, key: string): boolean | null {
  const v = r[key];
  return typeof v === 'boolean' ? v : null;
}

function numList(r: Record<string, unknown>, key: string): number[] | null {
  const v = r[key];
  if (!Array.isArray(v)) return null;
  for (const item of v) if (typeof item !== 'number') return null;
  return v as number[];
}

export const pcaProjector: ProjectorFactory = (views, _runtime) => {
  const stage = views.stage as unknown as PcaStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const applyFrame = (p: Record<string, unknown>): void => {
    const xs = numList(p, 'xs');
    const ys = numList(p, 'ys');
    const cx = num(p, 'cx');
    const cy = num(p, 'cy');
    const standardized = flag(p, 'standardized');
    if (xs === null || ys === null || cx === null || cy === null || standardized === null) return;
    stage?.setFrame?.({ standardized, xs, ys, cx, cy });
  };

  const applyCov = (p: Record<string, unknown>): void => {
    const sxx = num(p, 'sxx');
    const sxy = num(p, 'sxy');
    const syy = num(p, 'syy');
    const sdX = num(p, 'sdX');
    const sdY = num(p, 'sdY');
    const sdRatio = num(p, 'sdRatio');
    if (sxx === null || sxy === null || syy === null) return;
    if (sdX === null || sdY === null || sdRatio === null) return;
    stage?.setCovariance?.({ sxx, sxy, syy, sdX, sdY, sdRatio });
  };

  const applyVector = (id: string, p: Record<string, unknown>): void => {
    const step = num(p, 'step');
    if (step === null) return;
    if (id === 'w') {
      const wx = num(p, 'wx');
      const wy = num(p, 'wy');
      const wLen = num(p, 'wLen');
      if (wx === null || wy === null || wLen === null) return;
      stage?.setStretch?.({ step, wx, wy, wLen });
      return;
    }
    const vx = num(p, 'vx');
    const vy = num(p, 'vy');
    const angleDeg = num(p, 'angleDeg');
    if (vx === null || vy === null || angleDeg === null) return;
    stage?.setVector?.({ step, vx, vy, angleDeg });
  };

  const applyTurn = (p: Record<string, unknown>): void => {
    const step = num(p, 'step');
    const turn = num(p, 'turn');
    const converged = flag(p, 'converged');
    if (step === null || turn === null || converged === null) return;
    stage?.setTurn?.({ step, turn, converged });
  };

  const applyAxis = (p: Record<string, unknown>): void => {
    const axisIndex = num(p, 'axisIndex');
    const ax = num(p, 'ax');
    const ay = num(p, 'ay');
    const angleDeg = num(p, 'angleDeg');
    const share = num(p, 'share');
    const t = numList(p, 't');
    if (axisIndex === null || ax === null || ay === null) return;
    if (angleDeg === null || share === null || t === null) return;
    stage?.setAxis?.({ axisIndex, ax, ay, angleDeg, share, t });
  };

  const applyLedger = (p: Record<string, unknown>): void => {
    const standardized = flag(p, 'standardized');
    const angleDeg = num(p, 'angleDeg');
    const share = num(p, 'share');
    const steps = num(p, 'steps');
    if (standardized === null || angleDeg === null || share === null || steps === null) return;
    stage?.addLedgerRow?.({ standardized, angleDeg, share, steps });
  };

  return {
    onInit() {
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      if (event.type === 'phase') {
        const p = asRecord(event.payload);
        const phase = p && typeof p.phase === 'string' ? p.phase : null;
        codePanel?.highlightPhase?.(phase);
        return;
      }
      if (event.type !== 'state-changed') {
        // 그 밖의 표준 이벤트는 이 facet 이 발신하지 않는다 — 조용히 흘린다 (C2).
        return;
      }
      const target = typeof event.target === 'string' ? event.target : null;
      const p = asRecord(event.payload);
      if (target === null || p === null) return;
      const parsed = parseTarget(target);
      if (parsed === null) return;
      switch (parsed.prefix) {
        case 'frame':
          applyFrame(p);
          return;
        case 'matrix':
          applyCov(p);
          return;
        case 'vector':
          applyVector(parsed.id, p);
          return;
        case 'turn':
          applyTurn(p);
          return;
        case 'axis':
          applyAxis(p);
          return;
        case 'ledger':
          applyLedger(p);
          return;
        default:
          // 알려지지 않은 prefix 는 흘린다.
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
