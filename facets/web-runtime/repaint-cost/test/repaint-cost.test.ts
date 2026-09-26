// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  CARD_LAYER_VALUES,
  DRAW_ORDER,
  PROPERTY_VALUES,
  planRound,
  type RepaintCostData,
} from '../src/algorithm.js';
import { repaintCostImperativeIR } from '../src/irs.js';
import { repaintCostFacet } from '../src/facet.js';
import { repaintCostStageView } from '../src/repaint-cost-stage.js';

const data = repaintCostFacet.initialData as unknown as RepaintCostData;

/**
 * 사양의 실측표(spec-repaint-cost.md "실측표") 그대로. 화면에 뜰 정확한 수와 대조한다.
 * 순서: property(0 display·1 height·2 color·3 transform), cardLayer(0 함께·1 떼어 둠).
 */
const SPEC_TABLE: {
  property: number;
  cardLayer: number;
  chain: string;
  renderTreeChange: number;
  boxesRemeasured: number;
  repaintedCount: number;
  repaintedSet: Set<string>;
  layers: number;
}[] = [
  { property: 0, cardLayer: 0, chain: 'style→layout→paint→composite', renderTreeChange: 3, boxesRemeasured: 5, repaintedCount: 4, repaintedSet: new Set(['badge', 'footer', 'list', 'page']), layers: 1 },
  { property: 0, cardLayer: 1, chain: 'style→layout→paint→composite', renderTreeChange: 3, boxesRemeasured: 5, repaintedCount: 4, repaintedSet: new Set(['badge', 'footer', 'list', 'page']), layers: 1 },
  { property: 1, cardLayer: 0, chain: 'style→layout→paint→composite', renderTreeChange: 0, boxesRemeasured: 4, repaintedCount: 7, repaintedSet: new Set(['badge', 'card', 'card-text', 'card-title', 'footer', 'list', 'page']), layers: 1 },
  { property: 1, cardLayer: 1, chain: 'style→layout→paint→composite', renderTreeChange: 0, boxesRemeasured: 4, repaintedCount: 7, repaintedSet: new Set(['badge', 'card', 'card-text', 'card-title', 'footer', 'list', 'page']), layers: 2 },
  { property: 2, cardLayer: 0, chain: 'style→paint→composite', renderTreeChange: 0, boxesRemeasured: 0, repaintedCount: 3, repaintedSet: new Set(['card', 'card-text', 'page']), layers: 1 },
  { property: 2, cardLayer: 1, chain: 'style→paint→composite', renderTreeChange: 0, boxesRemeasured: 0, repaintedCount: 2, repaintedSet: new Set(['card', 'card-text']), layers: 2 },
  { property: 3, cardLayer: 0, chain: 'style→paint→composite', renderTreeChange: 0, boxesRemeasured: 0, repaintedCount: 5, repaintedSet: new Set(['badge', 'card', 'card-text', 'card-title', 'page']), layers: 1 },
  { property: 3, cardLayer: 1, chain: 'style→composite', renderTreeChange: 0, boxesRemeasured: 0, repaintedCount: 0, repaintedSet: new Set(), layers: 2 },
];

describe('repaint-cost — 사양 표 대조', () => {
  it('여덟 조합 모두 도는 단계·렌더 트리 변화·다시 잰 상자·다시 칠한 집합·층 수가 표와 같다', () => {
    for (const row of SPEC_TABLE) {
      const plan = planRound(data, row.property, row.cardLayer);
      const label = `property=${row.property} cardLayer=${row.cardLayer}`;
      expect(plan.stages.join('→'), `${label} chain`).toBe(row.chain);
      expect(plan.renderTreeChange, `${label} renderTreeChange`).toBe(row.renderTreeChange);
      expect(plan.boxesRemeasured, `${label} boxesRemeasured`).toBe(row.boxesRemeasured);
      expect(plan.repainted.length, `${label} repaintedCount`).toBe(row.repaintedCount);
      expect(new Set(plan.repainted), `${label} repaintedSet`).toEqual(row.repaintedSet);
      expect(plan.layers, `${label} layers`).toBe(row.layers);
    }
  });

  it('transform × 떼어 둠은 다시 칠한 것이 정확히 0 이면서도 composite 걸음은 그대로 있다 (card 가 자리를 옮겨야 하므로)', () => {
    const plan = planRound(data, 3, 1);
    expect(plan.repainted).toEqual([]);
    expect(plan.stages).toContain('composite');
    expect(plan.stages).not.toContain('paint');
  });
});

describe('repaint-cost — IR ↔ algorithm', () => {
  it('runIR(computeRepaint) 의 답이 여덟 조합 전부에서 algorithm 이 스스로 겨눈 다시 칠한 집합과 같다', () => {
    for (const property of PROPERTY_VALUES) {
      for (const cardLayer of CARD_LAYER_VALUES) {
        const plan = planRound(data, property, cardLayer);

        if (plan.dirty === null) {
          // transform × 떼어 둠 — 겨눔 자체를 건너뛴다(합성 전용 이동이라 dirty 가 없다).
          expect(plan.repainted).toEqual([]);
          expect(Object.keys(plan.candidates)).toEqual([]);
          continue;
        }

        const ids = DRAW_ORDER.filter((id) => id in plan.candidates);
        const elemX = ids.map((id) => plan.candidates[id]!.x);
        const elemY = ids.map((id) => plan.candidates[id]!.y);
        const elemW = ids.map((id) => plan.candidates[id]!.w);
        const elemH = ids.map((id) => plan.candidates[id]!.h);
        const flags = ids.map(() => 0);
        const dirty = plan.dirty;

        const count = runIR(repaintCostImperativeIR, 'computeRepaint', [
          elemX, elemY, elemW, elemH, ids.length, dirty.x, dirty.y, dirty.w, dirty.h, flags,
        ]);
        expect(count, `property=${property} cardLayer=${cardLayer}`).toBe(plan.repainted.length);
        const gotIds = ids.filter((_, i) => flags[i] === 1);
        expect(new Set(gotIds), `property=${property} cardLayer=${cardLayer}`).toEqual(new Set(plan.repainted));
      }
    }
  });
});

describe('repaint-cost — 손잡이 사다리', () => {
  type Ctl = { action: string; segments: { value: number }[] };
  const controls = (repaintCostFacet.blocks.controls as unknown as { controls: Ctl[] }).controls;

  it('property 사다리는 segments 값과 같다(0..3)', () => {
    const property = controls.find((c) => c.action === 'property')!;
    expect(property.segments.map((s) => s.value)).toEqual([...PROPERTY_VALUES]);
  });

  it('cardLayer 사다리는 segments 값과 같다(0..1)', () => {
    const cardLayer = controls.find((c) => c.action === 'cardLayer')!;
    expect(cardLayer.segments.map((s) => s.value)).toEqual([...CARD_LAYER_VALUES]);
  });

  it('elements 배열 길이(5)와 badge 가 자란 데이터에서도 그대로다', () => {
    expect(data.elements.length).toBe(5);
    expect(data.elements.map((e) => e.id)).toEqual(['header', 'intro', 'card', 'list', 'footer']);
  });
});

describe('repaint-cost — stage 마운트', () => {
  it('mountView 로 던지지 않고 뜬다(전수 검사가 config:{} 만 주는 경우도 흉내)', () => {
    const container = document.createElement('div');
    const instance = mountView(repaintCostStageView, container, { config: {}, initialData: data as unknown as Record<string, unknown> });
    expect(container.querySelector('svg')).not.toBeNull();
    instance.destroy();
  });
});
