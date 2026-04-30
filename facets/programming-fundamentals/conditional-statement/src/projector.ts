/**
 * 조건문 facet projector — algorithm 이벤트를 conditional-flowchart view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 평가 마름모 — 식이 닿는 박자에 테두리·글자가 환해지고 결과 칩이 한 컷 뜬다.
 *   2. 활성 vs 비활성 가지 — 굵기·채도 vs 회색 + 빗장 무늬.
 *   3. else if 사슬 — 위 마름모부터 한 박자 간격으로 점등 → 첫 참에서 응결.
 *   4. 합류 노드 — 활성 가지가 닿을 때 짧은 봉합 애니메이션.
 *   5. 입력 반응성 — 슬라이더 흔들면 마름모가 다시 응결되고 활성 가지가 즉시 바뀐다.
 *
 * 슬라이더 입력은 view 가 SVG mousedown/mousemove 로 직접 잡아 dispatch 채널로
 * 보낸다 (`{ type: 'input', payload: { name: 'value', value: '0..100' } }`).
 * projector 는 init / evaluate / mode-set / demo-start / demo-end / invalid-input
 * 만 stage 메서드로 번역한다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type {
  ConditionalMode,
  ConditionalRuleSet,
  EvaluationStep,
} from './algorithm.js';

type FlowchartStage = {
  reset(): void;
  init(payload: {
    mode: ConditionalMode;
    value: number;
    rules: ConditionalRuleSet;
    sequence: EvaluationStep[];
    activeBranchId: string;
    activeBlockId: string;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  applyEvaluation(payload: {
    value: number;
    sequence: EvaluationStep[];
    activeBranchId: string;
    activeBlockId: string;
  }): Promise<void>;
  applyModeSet(payload: {
    mode: ConditionalMode;
    rules: ConditionalRuleSet;
    value: number;
    sequence: EvaluationStep[];
    activeBranchId: string;
    activeBlockId: string;
  }): void;
  signalDemoStart(): void;
  signalDemoEnd(): void;
  signalInvalid(op: string, raw: string): void;
};

const BASE_CAPTION =
  '조건문은 흐르던 코드가 갈림길에 도착했을 때, 지금의 값이 참인지 거짓인지를 보고 단 한 길만 골라 통과한 뒤 다시 한 줄로 모이는 약속이다.';

export const conditionalStatementProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FlowchartStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;
      const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            mode: ConditionalMode;
            value: number;
            rules: ConditionalRuleSet;
            sequence: EvaluationStep[];
            activeBranchId: string;
            activeBlockId: string;
          }>;
          stage.init({
            mode: p.mode === 'three' ? 'three' : 'two',
            value: typeof p.value === 'number' ? p.value : 0,
            rules: (p.rules as ConditionalRuleSet) ?? {
              rules: [],
              else: { branchId: 'else', blockId: 'else', blockLabel: '' },
            },
            sequence: Array.isArray(p.sequence) ? p.sequence : [],
            activeBranchId: String(p.activeBranchId ?? ''),
            activeBlockId: String(p.activeBlockId ?? ''),
          });
          break;
        }

        case 'evaluate': {
          const p = (event.payload ?? {}) as Partial<{
            value: number;
            sequence: EvaluationStep[];
            activeBranchId: string;
            activeBlockId: string;
          }>;
          // 사슬 점등 박자는 speed 로 나눠 빠르기 슬라이더 영향 받게 한다.
          const seq = (Array.isArray(p.sequence) ? p.sequence : []).map((s) => ({
            diamondId: String(s.diamondId),
            result: s.result === 'true' ? ('true' as const) : ('false' as const),
            pulseMs: (typeof s.pulseMs === 'number' ? s.pulseMs : 220) / speed,
          }));
          await stage.applyEvaluation({
            value: typeof p.value === 'number' ? p.value : 0,
            sequence: seq,
            activeBranchId: String(p.activeBranchId ?? ''),
            activeBlockId: String(p.activeBlockId ?? ''),
          });
          break;
        }

        case 'mode-set': {
          const p = (event.payload ?? {}) as Partial<{
            mode: ConditionalMode;
            rules: ConditionalRuleSet;
            value: number;
            sequence: EvaluationStep[];
            activeBranchId: string;
            activeBlockId: string;
          }>;
          stage.applyModeSet({
            mode: p.mode === 'three' ? 'three' : 'two',
            rules: (p.rules as ConditionalRuleSet) ?? {
              rules: [],
              else: { branchId: 'else', blockId: 'else', blockLabel: '' },
            },
            value: typeof p.value === 'number' ? p.value : 0,
            sequence: Array.isArray(p.sequence) ? p.sequence : [],
            activeBranchId: String(p.activeBranchId ?? ''),
            activeBlockId: String(p.activeBlockId ?? ''),
          });
          break;
        }

        case 'demo-start': {
          stage.signalDemoStart();
          break;
        }

        case 'demo-end': {
          stage.signalDemoEnd();
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        default:
          // phase 등 silent 메타 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};
