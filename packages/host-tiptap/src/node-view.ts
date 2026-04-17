import type { Editor, NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import type { Catalog, FacetInstance, LensFactory } from '@facet/core';
import { createInstance, getLensRegistry, parseFacetExpr } from '@facet/core';

export type FacetNodeViewOptions = {
  catalog: Catalog;
  lenses: string[];
  lensRegistry?: Map<string, LensFactory>;
};

function renderError(mount: HTMLElement, message: string): void {
  mount.textContent = '';
  const box = document.createElement('span');
  box.className = 'facet-node__error';
  box.style.display = 'inline-block';
  box.style.padding = '2px 8px';
  box.style.borderRadius = '4px';
  box.style.background = '#FAECE7';
  box.style.color = '#A8331C';
  box.style.fontSize = '12px';
  box.textContent = `[facet] ${message}`;
  mount.appendChild(box);
}

export function createFacetNodeView(options: FacetNodeViewOptions): NodeViewRenderer {
  return (props: NodeViewRendererProps) => {
    const { node } = props;

    const dom = document.createElement('span');
    dom.className = 'facet-node';
    dom.setAttribute('data-facet', 'true');
    dom.contentEditable = 'false';
    dom.style.display = 'inline-block';
    dom.style.width = '100%';

    const mount = document.createElement('span');
    mount.className = 'facet-mount';
    mount.style.display = 'block';
    dom.appendChild(mount);

    let instance: FacetInstance | null = null;
    let currentRaw = '';

    const mountInstance = (raw: string) => {
      currentRaw = raw;
      dom.setAttribute('data-raw', raw);
      mount.textContent = '';

      const expr = parseFacetExpr(raw);
      if (!expr) {
        renderError(mount, `Invalid expression: ${raw}`);
        return;
      }

      try {
        instance = createInstance({
          expr,
          catalog: options.catalog,
          lenses: options.lenses,
          lensRegistry: options.lensRegistry ?? getLensRegistry(),
          mountPoint: mount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        renderError(mount, msg);
      }
    };

    const teardownInstance = () => {
      if (instance) {
        instance.destroy();
        instance = null;
      }
    };

    mountInstance(typeof node.attrs.raw === 'string' ? node.attrs.raw : '');

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== node.type.name) return false;
        const nextRaw = typeof updatedNode.attrs.raw === 'string' ? updatedNode.attrs.raw : '';
        if (nextRaw !== currentRaw) {
          teardownInstance();
          mountInstance(nextRaw);
        }
        return true;
      },
      destroy() {
        teardownInstance();
      },
      ignoreMutation() {
        return true;
      },
      stopEvent() {
        return false;
      },
    };
  };
}

export type { Editor };
