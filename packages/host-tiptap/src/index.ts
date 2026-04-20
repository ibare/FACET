/**
 * @facet/host-tiptap — 4-layer 러너용 Tiptap 어댑터.
 *
 * DSL: {facet:<id>} 단일 식별자.
 * id 는 새 러너의 facets 레지스트리(getFacetById) 에서 조회된다.
 */

import { Node, mergeAttributes, InputRule, PasteRule } from '@tiptap/core';
import { createFacetNodeView } from './node-view.js';

const FACET_PATTERN_INPUT = /\{(facet:[a-zA-Z][a-zA-Z0-9-]*)\}$/;
const FACET_PATTERN_GLOBAL = /\{(facet:[a-zA-Z][a-zA-Z0-9-]*)\}/g;

/** `{facet:foo}` 표현에서 전체 id(`facet:foo`) 추출. 형식이 맞지 않으면 null. */
export function parseFacetRaw(raw: string): string | null {
  const m = /^\{(facet:[a-zA-Z][a-zA-Z0-9-]*)\}$/.exec(raw.trim());
  return m ? m[1] : null;
}

export const FacetExtension = Node.create({
  name: 'facet',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-facet-id') ?? '',
        renderHTML: (attrs) => {
          const id = typeof attrs.id === 'string' ? attrs.id : '';
          return id ? { 'data-facet-id': id } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-facet]',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const id = node.getAttribute('data-facet-id') ?? '';
          return id ? { id } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-facet': 'true' }), ''];
  },

  addNodeView() {
    return createFacetNodeView();
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: FACET_PATTERN_INPUT,
        handler: ({ state, range, match }) => {
          const id = match[1];
          if (!id) return null;
          state.tr.replaceRangeWith(range.from, range.to, type.create({ id }));
          return;
        },
      }),
    ];
  },

  addPasteRules() {
    const type = this.type;
    return [
      new PasteRule({
        find: FACET_PATTERN_GLOBAL,
        handler: ({ state, range, match }) => {
          const id = match[1];
          if (!id) return null;
          state.tr.replaceRangeWith(range.from, range.to, type.create({ id }));
          return;
        },
      }),
    ];
  },
});

export { createFacetNodeView } from './node-view.js';
