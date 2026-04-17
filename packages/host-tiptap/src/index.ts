import { Node, mergeAttributes, InputRule, PasteRule } from '@tiptap/core';
import type { Catalog, LensFactory } from '@facet/core';
import { parseFacetExpr } from '@facet/core';
import { createFacetNodeView } from './node-view.js';

export type FacetExtensionOptions = {
  catalog: Catalog | null;
  lenses: string[];
  lensRegistry?: Map<string, LensFactory>;
};

const FACET_PATTERN_INPUT = /\{facet:[^{}]+\}$/;
const FACET_PATTERN_GLOBAL = /\{facet:[^{}]+\}/g;

export const FacetExtension = Node.create<FacetExtensionOptions>({
  name: 'facet',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      catalog: null,
      lenses: ['circuit', 'code'],
      lensRegistry: undefined,
    };
  },

  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-raw') ?? '',
        renderHTML: (attrs) => {
          const raw = typeof attrs.raw === 'string' ? attrs.raw : '';
          return raw ? { 'data-raw': raw } : {};
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
          const raw = node.getAttribute('data-raw') ?? '';
          if (!parseFacetExpr(raw)) return false;
          return { raw };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-facet': 'true' }), ''];
  },

  addNodeView() {
    return (props) => {
      const opts = this.options;
      if (!opts.catalog) {
        const dom = document.createElement('span');
        dom.setAttribute('data-facet', 'true');
        dom.textContent = '[facet] catalog not configured';
        return { dom };
      }
      const factory = createFacetNodeView({
        catalog: opts.catalog,
        lenses: opts.lenses,
        lensRegistry: opts.lensRegistry,
      });
      return factory(props);
    };
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: FACET_PATTERN_INPUT,
        handler: ({ state, range, match }) => {
          const raw = match[0];
          if (!parseFacetExpr(raw)) return null;
          state.tr.replaceRangeWith(range.from, range.to, type.create({ raw }));
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
          const raw = match[0];
          if (!parseFacetExpr(raw)) return null;
          state.tr.replaceRangeWith(range.from, range.to, type.create({ raw }));
          return;
        },
      }),
    ];
  },
});

export { createFacetNodeView } from './node-view.js';
export type { FacetNodeViewOptions } from './node-view.js';
