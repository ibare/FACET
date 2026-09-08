// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { mountBlocks } from '../src/runtime/layout-builder.js';
import { registerView, unregisterView } from '../src/runtime/index.js';
import type { View, ViewInstance, ViewMountParams } from '../src/views/types.js';

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
