import type {
  Catalog,
  IR,
  LensFactory,
  TranspileLine,
  Transpiler,
} from '@facet/core';
import { deriveUIOptions, resolveBody } from '@facet/core';
import { injectStyles } from './styles.js';

const PHASE_LABELS: Record<string, string> = {
  outer_loop: '바깥 패스 시작',
  comparing: '두 원소 비교',
  swapping: '두 원소 교환',
  pass_complete: '한 패스 완료',
};

type ColumnView = {
  paradigm: string;
  head: HTMLElement;
  block: HTMLElement;
  lines: { el: HTMLElement; phase: string | null }[];
};

function findTranspiler(
  catalog: Catalog,
  paradigm: string,
  target: string,
): Transpiler | null {
  for (const t of catalog.transpilers.values()) {
    if (t.paradigm === paradigm && t.target === target) return t;
  }
  return null;
}

function findIR(catalog: Catalog, paradigm: string, availableIRs: string[]): IR | null {
  for (const irId of availableIRs) {
    const ir = catalog.irs.get(irId);
    if (ir && ir.paradigm === paradigm) return ir;
  }
  return null;
}

function paradigmLabel(id: string): string {
  if (id === 'imperative') return '명령형';
  if (id === 'functional') return '함수형';
  return id;
}

function renderLines(block: HTMLElement, lines: TranspileLine[]): ColumnView['lines'] {
  block.textContent = '';
  const result: ColumnView['lines'] = [];
  for (const { code, phase } of lines) {
    const el = document.createElement('div');
    el.className = 'facet-code__line';
    el.textContent = code === '' ? '\u00A0' : code;
    block.appendChild(el);
    result.push({ el, phase });
  }
  return result;
}

function applyPhaseHighlight(columns: ColumnView[], phase: string | null) {
  for (const col of columns) {
    for (const { el, phase: linePhase } of col.lines) {
      el.classList.remove(
        'hl-comparing',
        'hl-swapping',
        'hl-pass_complete',
        'hl-outer_loop',
      );
      if (phase && linePhase === phase) {
        el.classList.add(`hl-${phase}`);
      }
    }
  }
}

export const codeLens: LensFactory = ({ container, eventBus, catalog, expr }) => {
  injectStyles();

  const bodyDef = resolveBody(catalog, expr.bodies[0].name);
  const root = document.createElement('div');
  root.className = 'facet-code';
  container.appendChild(root);

  if (!bodyDef) {
    root.textContent = `Unknown body: facet:${expr.bodies[0].name}`;
    return { destroy: () => root.remove() };
  }

  const options = deriveUIOptions(bodyDef.id, catalog);
  if (!options) {
    root.textContent = `Catalog misconfigured for: ${bodyDef.id}`;
    return { destroy: () => root.remove() };
  }

  // header: meta + language tabs
  const header = document.createElement('div');
  header.className = 'facet-code__header';

  const metaWrap = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'facet-code__meta';
  meta.textContent = '코드 렌즈 · 두 패러다임 동시 비교';
  const phaseInfo = document.createElement('div');
  phaseInfo.className = 'facet-code__phase';
  phaseInfo.textContent = '대기 중 — 본체가 아직 phase를 발생시키지 않음';
  metaWrap.append(meta, phaseInfo);

  const tabsWrap = document.createElement('div');
  tabsWrap.style.display = 'flex';
  tabsWrap.style.alignItems = 'center';
  tabsWrap.style.gap = '6px';
  const tabsLabel = document.createElement('label');
  tabsLabel.style.fontSize = '11px';
  tabsLabel.style.color = '#6b6f80';
  tabsLabel.textContent = '언어';
  const tabs = document.createElement('div');
  tabs.className = 'facet-code__tabs';
  tabsWrap.append(tabsLabel, tabs);

  header.append(metaWrap, tabsWrap);
  root.appendChild(header);

  // columns container
  const columnsEl = document.createElement('div');
  columnsEl.className = 'facet-code__columns';
  root.appendChild(columnsEl);

  const paradigms = options.paradigms.map((p) => p.id);
  const orderedParadigms = ['imperative', 'functional'].filter((p) => paradigms.includes(p));
  const extraParadigms = paradigms.filter((p) => !orderedParadigms.includes(p));
  const columnParadigms = [...orderedParadigms, ...extraParadigms];

  const columns: ColumnView[] = columnParadigms.map((paradigm) => {
    const colWrap = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'facet-code__col-head';
    head.dataset.paradigm = paradigm;
    head.textContent = paradigmLabel(paradigm);
    const block = document.createElement('div');
    block.className = 'facet-code__block';
    colWrap.append(head, block);
    columnsEl.appendChild(colWrap);
    return { paradigm, head, block, lines: [] };
  });

  // language tabs
  let activeTarget = options.languages[0] ?? '';
  const tabButtons = new Map<string, HTMLButtonElement>();

  function refreshTabs() {
    for (const [target, btn] of tabButtons) {
      btn.dataset.active = target === activeTarget ? 'true' : 'false';
    }
  }

  function renderAllColumns() {
    for (const col of columns) {
      const transpiler = findTranspiler(catalog, col.paradigm, activeTarget);
      const ir = findIR(catalog, col.paradigm, bodyDef!.available_irs);
      if (!transpiler || !ir) {
        col.block.textContent = '';
        col.lines = [];
        continue;
      }
      const { lines } = transpiler.transpile(ir);
      col.lines = renderLines(col.block, lines);
    }
    applyPhaseHighlight(columns, currentPhase);
  }

  for (const target of options.languages) {
    const btn = document.createElement('button');
    btn.className = 'facet-code__tab';
    // find a transpiler with this target to get its label
    const probe = [...catalog.transpilers.values()].find((t) => t.target === target);
    btn.textContent = probe?.targetLabel ?? target;
    btn.dataset.active = target === activeTarget ? 'true' : 'false';
    btn.addEventListener('click', () => {
      activeTarget = target;
      refreshTabs();
      renderAllColumns();
    });
    tabButtons.set(target, btn);
    tabs.appendChild(btn);
  }

  let currentPhase: string | null = null;

  function updatePhaseInfo() {
    if (!currentPhase) {
      phaseInfo.textContent = '대기 중 — 본체가 아직 phase를 발생시키지 않음';
      return;
    }
    const label = PHASE_LABELS[currentPhase] ?? '';
    phaseInfo.innerHTML = `현재 phase: <span>${currentPhase}</span>${label ? ` · ${label}` : ''}`;
  }

  renderAllColumns();
  updatePhaseInfo();

  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on('body:phase', (e) => {
      const phase = (e as { phase: string }).phase;
      currentPhase = phase;
      applyPhaseHighlight(columns, phase);
      updatePhaseInfo();
    }),
  );
  unsubs.push(
    eventBus.on('container:complete', () => {
      applyPhaseHighlight(columns, 'pass_complete');
    }),
  );
  unsubs.push(
    eventBus.on('ui:reset', () => {
      currentPhase = null;
      applyPhaseHighlight(columns, null);
      updatePhaseInfo();
    }),
  );

  return {
    destroy() {
      for (const unsub of unsubs) unsub();
      root.remove();
    },
  };
};
