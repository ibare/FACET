// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension, parseFacetRaw } from '../src/index.js';
import {
  clearRegistry,
  registerFacets,
  type FacetJson,
} from '@facet/core/runtime';
import { registerBubblesort, bubblesortFacet } from '@facet/algorithm-bubblesort';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

describe('FacetExtension — 기본 설정', () => {
  it('name 이 "facet"', () => {
    expect(FacetExtension.name).toBe('facet');
  });

  it('inline atom 그룹', () => {
    const cfg = (FacetExtension as unknown as { config: Record<string, unknown> }).config;
    expect(cfg.group).toBe('inline');
    expect(cfg.inline).toBe(true);
    expect(cfg.atom).toBe(true);
  });
});

describe('parseFacetRaw — DSL 파서', () => {
  it('유효한 단일 식별자 표현 — 전체 id 반환', () => {
    expect(parseFacetRaw('{facet:bubbleSort}')).toBe('facet:bubbleSort');
    expect(parseFacetRaw('{facet:bubble-sort}')).toBe('facet:bubble-sort');
  });

  it('공백 허용', () => {
    expect(parseFacetRaw('  {facet:foo}  ')).toBe('facet:foo');
  });

  it('잘못된 표현 → null', () => {
    expect(parseFacetRaw('{facet:}')).toBeNull();
    expect(parseFacetRaw('{facet:loop facet:other}')).toBeNull();
    expect(parseFacetRaw('{foo:bar}')).toBeNull();
    expect(parseFacetRaw('')).toBeNull();
  });
});

describe('FacetExtension — Tiptap 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerBubblesort();
  });

  it('등록된 facet id 로 NodeView 가 마운트되어 runFacet 결과가 렌더됨', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const editor = new Editor({
      element: host,
      extensions: [StarterKit, FacetExtension],
      content: `<p><span data-facet="true" data-facet-id="facet:bubbleSort"></span></p>`,
    });

    const mount = host.querySelector('.facet-mount');
    expect(mount).toBeTruthy();
    expect(mount?.querySelector('.facet-bar-chart')).toBeTruthy();
    expect(mount?.querySelector('.facet-control-bar')).toBeTruthy();

    editor.destroy();
    host.remove();
  });

  it('알 수 없는 facet id 는 에러 박스로 표시', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const editor = new Editor({
      element: host,
      extensions: [StarterKit, FacetExtension],
      content: `<p><span data-facet="true" data-facet-id="facet:nope"></span></p>`,
    });

    const err = host.querySelector('.facet-node__error');
    expect(err?.textContent).toContain('unknown facet');

    editor.destroy();
    host.remove();
  });

  it('facet id 변경 시 이전 인스턴스 destroy 후 재마운트', () => {
    // 두 번째 facet 등록
    const altFacet: FacetJson = {
      ...bubblesortFacet,
      id: 'facet:altSort',
      initialData: { type: 'array', values: [1, 2, 3] },
    };
    registerFacets([altFacet]);

    const host = document.createElement('div');
    document.body.appendChild(host);

    const editor = new Editor({
      element: host,
      extensions: [StarterKit, FacetExtension],
      content: `<p><span data-facet="true" data-facet-id="facet:bubbleSort"></span></p>`,
    });

    expect(host.querySelectorAll('.facet-bar-chart rect').length).toBe(8);

    // 노드 attr 갱신
    const { state } = editor;
    editor.commands.command(({ tr }) => {
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'facet') {
          tr.setNodeMarkup(pos, undefined, { id: 'facet:altSort' });
        }
        return true;
      });
      return true;
    });

    const rects = host.querySelectorAll('.facet-bar-chart rect');
    expect(rects.length).toBe(3);

    editor.destroy();
    host.remove();
  });
});
