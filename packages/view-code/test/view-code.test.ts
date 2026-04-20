// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearRegistry,
  registerIR,
  registerTranspiler,
  type IR,
  type Transpiler,
} from '@facet/core/runtime';
import { codeView } from '../src/index.js';

const dummyIR: IR = {
  id: 'dummy-imperative',
  algorithm: 'dummy',
  paradigm: 'imperative',
  functions: [
    {
      name: 'noop',
      params: [],
      returnType: { kind: 'void' },
      body: [{ kind: 'return' }],
    },
  ],
};

function makeTranspiler(language: string): Transpiler {
  return {
    id: language,
    language: language as Transpiler['language'],
    label: { en: language, ko: language },
    supports: ['imperative'],
    transpile() {
      return {
        lines: [
          { code: `// ${language}`, phase: null },
          { code: 'noop()', phase: 'call' },
        ],
      };
    },
  };
}

function mountWithSpec(transpilers: Transpiler[]): {
  container: HTMLElement;
  instance: ReturnType<typeof codeView.mount>;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const instance = codeView.mount(container, {
    config: {
      type: 'code-view',
      label: 'Code',
      _ir: dummyIR,
      _transpilers: transpilers,
    },
  });
  return { container, instance };
}

describe('code-view', () => {
  beforeEach(() => {
    clearRegistry();
    registerIR('dummy-imperative', dummyIR);
  });

  it('초기 상태: 빈 패널 + 추가 버튼 활성', () => {
    const t = makeTranspiler('python');
    registerTranspiler('python', t);
    const { container, instance } = mountWithSpec([t]);

    expect(container.querySelector('.facet-code-view')).toBeTruthy();
    expect(container.querySelector('.facet-code-view__empty')).toBeTruthy();
    expect(container.querySelectorAll('.facet-code-view__panel').length).toBe(0);

    const btn = container.querySelector('.facet-code-view__add') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    instance.destroy();
  });

  it('IR 미지정: 추가 버튼 비활성', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = codeView.mount(container, {
      config: { type: 'code-view', _transpilers: [] },
    });
    const btn = container.querySelector('.facet-code-view__add') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    instance.destroy();
  });

  it('언어 추가 → 패널 등장, 제거 → 패널 사라짐', async () => {
    const py = makeTranspiler('python');
    registerTranspiler('python', py);
    const { container, instance } = mountWithSpec([py]);

    const addLang = instance._addLanguage as (id: string) => Promise<void>;
    const removeLang = instance._removeLanguage as (id: string) => void;

    await addLang('python');
    expect(container.querySelectorAll('.facet-code-view__panel').length).toBe(1);
    expect(container.querySelector('.facet-code-view__empty')?.getAttribute('style')).toContain(
      'display: none',
    );

    removeLang('python');
    expect(container.querySelectorAll('.facet-code-view__panel').length).toBe(0);

    instance.destroy();
  });

  it('2개 추가 후 추가 버튼 비활성', async () => {
    const py = makeTranspiler('python');
    const java = makeTranspiler('java');
    registerTranspiler('python', py);
    registerTranspiler('java', java);
    const { container, instance } = mountWithSpec([py, java]);

    const addLang = instance._addLanguage as (id: string) => Promise<void>;
    await addLang('python');
    await addLang('java');

    expect(container.querySelectorAll('.facet-code-view__panel').length).toBe(2);
    const btn = container.querySelector('.facet-code-view__add') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Max');

    instance.destroy();
  });

  it('highlightPhase: 패널 내 해당 phase 라인에 배경색', async () => {
    const py = makeTranspiler('python');
    registerTranspiler('python', py);
    const { container, instance } = mountWithSpec([py]);

    const addLang = instance._addLanguage as (id: string) => Promise<void>;
    await addLang('python');

    (instance.highlightPhase as (p: string | null) => void)('call');
    const callLine = container.querySelector(
      '.facet-code-view__panel .line[data-phase="call"]',
    ) as HTMLElement | null;
    expect(callLine).toBeTruthy();
    expect(callLine?.style.backgroundColor).not.toBe('');

    (instance.clearHighlight as () => void)();
    expect(callLine?.style.backgroundColor).toBe('');

    instance.destroy();
  });
});
