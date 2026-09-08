// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { mountBlocks } from '../src/runtime/layout-builder.js';
import { registerView, unregisterView } from '../src/runtime/index.js';
import { buildLayout, defaultLayout } from '../src/runtime/layout-builder.js';
import type { CanvasView, View, ViewInstance, ViewMountParams } from '../src/views/types.js';

/**
 * mountBlocks 가 조회기(t)를 view 로 넘기는지 본다.
 *
 * 넘기지 않으면 view 가 `params.t ?? makeTranslator(params.locale)` 의 오른쪽으로
 * 떨어져 FacetJson.messages 저작 문안을 보지 못한다 — 화면의 절반은 저작 문안,
 * 절반은 영어 원본이 된다 (C10 조회 1층 유실). 한 줄이 빠져 있던 자리라
 * 회귀를 여기서 막는다.
 */
describe('mountBlocks — 조회기 전달', () => {
  let seen: Partial<ViewMountParams> | null = null;

  const probe: View = {
    mount(_container: HTMLElement, params: ViewMountParams): ViewInstance {
      seen = params;
      return { destroy() {} };
    },
  };

  beforeEach(() => {
    seen = null;
    registerView('probe-view', probe);
  });

  it('mountParams.t 가 view 까지 닿는다', () => {
    const host = document.createElement('div');
    const tr = (_k: string, fallback: string): string => `번역:${fallback}`;

    mountBlocks({
      blocks: { stage: { type: 'probe-view' } },
      blockMounts: { stage: host },
      mountParams: { locale: 'ko', theme: 'dark', t: tr },
    });

    expect(seen).not.toBeNull();
    expect(seen?.t).toBe(tr);
    expect(seen?.t?.('any.key', '원본')).toBe('번역:원본');
    unregisterView('probe-view');
  });

  it('locale·theme·initialData·dispatch 도 함께 닿는다', () => {
    const host = document.createElement('div');
    const dispatch = (): void => {};
    const initialData = { n: 1 };

    mountBlocks({
      blocks: { stage: { type: 'probe-view' } },
      blockMounts: { stage: host },
      mountParams: { locale: 'ko', theme: 'light', initialData, dispatch },
    });

    expect(seen?.locale).toBe('ko');
    expect(seen?.theme).toBe('light');
    expect(seen?.initialData).toBe(initialData);
    expect(seen?.dispatch).toBe(dispatch);
    unregisterView('probe-view');
  });
});

/**
 * 캔버스 껍데기가 한 곳에서만 만들어지는지 본다.
 *
 * 예전에는 view 마다 SVG 를 손수 만들었고 38곳이 서로 갈렸다 — 폭을 속성으로
 * 주는 것, CSS 로 주는 것, 래퍼를 두는 것. 그중 하나가 flex 슬롯 안에서
 * intrinsic 300px 로 떨어져 그림이 절반으로 눌렸다. 갈릴 자리를 없앤 것이
 * 이 구조이므로, 갈리지 않는지를 여기서 잰다.
 */
describe('mountBlocks — 캔버스 껍데기', () => {
  let got: (ViewMountParams & { canvas?: SVGSVGElement }) | null = null;

  const canvasView = (canvas: CanvasView['canvas']): CanvasView => ({
    canvas,
    mount(_c, params): ViewInstance {
      got = params;
      return { destroy() {} };
    },
  });

  beforeEach(() => {
    got = null;
  });

  function mountOne(view: View): HTMLElement {
    const host = document.createElement('div');
    registerView('canvas-probe', view);
    mountBlocks({
      blocks: { stage: { type: 'canvas-probe' } },
      blockMounts: { stage: host },
      mountParams: { theme: 'light' },
    });
    unregisterView('canvas-probe');
    return host;
  }

  it("fit 기본값은 폭을 채우되 width 를 넘지 않는다", () => {
    const host = mountOne(canvasView({ height: 312 }));
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    // 폭은 속성으로 준다 — CSS 로만 주면 flex 슬롯에서 intrinsic 300px 로 떨어진다
    expect(svg?.getAttribute('width')).toBe('100%');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 620 312');
    expect(svg?.style.maxWidth).toBe('620px');
    expect(svg?.style.margin).toBe('0px auto');
    expect(got?.canvas).toBe(svg);
  });

  it("fit: 'intrinsic' 은 픽셀 크기를 지킨다", () => {
    const host = mountOne(canvasView({ width: 480, height: 200, fit: 'intrinsic' }));
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('480');
    expect(svg?.getAttribute('height')).toBe('200');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 480 200');
    expect(svg?.style.maxWidth).toBe('100%');
  });

  it('canvas 를 선언하지 않은 view 는 빈 컨테이너를 받는다', () => {
    const plain: View = {
      mount(_c: HTMLElement, params: ViewMountParams): ViewInstance {
        got = params;
        return { destroy() {} };
      },
    };
    const host = mountOne(plain);
    expect(host.querySelector('svg')).toBeNull();
    expect(got?.canvas).toBeUndefined();
  });
});

describe('defaultLayout — layout 선언이 없을 때', () => {
  it('blocks 키 순서대로 column 을 만든다', () => {
    const layout = defaultLayout({
      stage: { type: 'a' },
      controls: { type: 'b' },
    });
    expect(layout).toEqual({
      type: 'column',
      gap: 8,
      children: [{ ref: 'stage' }, { ref: 'controls' }],
    });
  });

  it('그 배치로 실제 DOM 이 만들어진다', () => {
    const blocks = { stage: { type: 'a' }, controls: { type: 'b' } };
    const built = buildLayout({ layout: defaultLayout(blocks), blocks });
    const slots = built.root.querySelectorAll('.facet-block');
    expect(slots.length).toBe(2);
    expect((slots[0] as HTMLElement).dataset.blockRef).toBe('stage');
    expect((slots[1] as HTMLElement).dataset.blockRef).toBe('controls');
  });
});
