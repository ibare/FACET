/**
 * Facet NodeView — 새 4-layer 러너(runFacet)에 위임.
 *
 * node.attrs.id 로 등록된 facet JSON 을 조회하여 mount 영역에 인스턴스화.
 * 노드 update/destroy 시 runFacet 핸들의 destroy 를 호출해 라이프사이클 일치.
 */

import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core';
import { getFacetById, runFacet, type FacetRunHandle } from '@facet/core/runtime';

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

export function createFacetNodeView(): NodeViewRenderer {
  return (props: NodeViewRendererProps) => {
    const { node } = props;

    const dom = document.createElement('span');
    dom.className = 'facet-node';
    dom.setAttribute('data-facet', 'true');
    dom.contentEditable = 'false';
    dom.style.display = 'inline-block';
    dom.style.width = '100%';

    const mount = document.createElement('div');
    mount.className = 'facet-mount';
    mount.style.display = 'block';
    dom.appendChild(mount);

    let handle: FacetRunHandle | null = null;
    let currentId = '';

    const mountInstance = (id: string) => {
      currentId = id;
      dom.setAttribute('data-facet-id', id);
      mount.textContent = '';

      if (!id) {
        renderError(mount, 'missing id');
        return;
      }

      const facetJson = getFacetById(id);
      if (!facetJson) {
        renderError(mount, `unknown facet: ${id}`);
        return;
      }

      try {
        handle = runFacet(facetJson, mount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        renderError(mount, msg);
      }
    };

    const teardownInstance = () => {
      if (handle) {
        try {
          handle.destroy();
        } catch {
          // ignore
        }
        handle = null;
      }
    };

    mountInstance(typeof node.attrs.id === 'string' ? node.attrs.id : '');

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== node.type.name) return false;
        const nextId = typeof updatedNode.attrs.id === 'string' ? updatedNode.attrs.id : '';
        if (nextId !== currentId) {
          teardownInstance();
          mountInstance(nextId);
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
