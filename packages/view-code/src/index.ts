/**
 * @facet/view-code — code-view: IR 기반 다중 언어 코드 표시.
 *
 * 사용자가 1~2개 언어를 임의로 추가/제거. phase 동기화 라인 강조 지원.
 * Shiki 로 문법 하이라이팅 (테마: github-light/github-dark).
 *
 * spec (runner 가 주입):
 *   { type: 'code-view', label?: string, _ir?: IR, _transpilers?: Transpiler[] }
 *
 * 메서드:
 *   highlightPhase(phase: string | null)
 *   clearHighlight()
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import {
  registerView,
  getColors,
  fonts,
  fontSizes,
  radii,
  space,
  resolveLocale,
} from '@facet/core/runtime';
import type { IR, Transpiler } from '@facet/core/runtime';
import { ensureLanguage } from './highlighter.js';
import type { ShikiTransformer } from 'shiki';

const MAX_PANELS = 2;

const HL_BG_LIGHT = 'rgba(241, 194, 50, 0.35)';
const HL_BG_DARK = 'rgba(245, 207, 63, 0.22)';

const CODE_VIEW_LABELS_BY_LOCALE: Record<
  string,
  {
    addLanguage: string;
    atMax: string;
    emptyWithIR: string;
    emptyNoIR: string;
    noMoreLanguages: string;
    loading: string;
    errorPrefix: string;
  }
> = {
  en: {
    addLanguage: '+ Add language',
    atMax: 'Max 2',
    emptyWithIR: 'Add a language to view code.',
    emptyNoIR: 'No IR specified.',
    noMoreLanguages: 'No additional languages available.',
    loading: 'Loading…',
    errorPrefix: 'Error',
  },
  ko: {
    addLanguage: '+ 언어 추가',
    atMax: '최대 2개',
    emptyWithIR: '언어를 추가해 코드를 확인하세요.',
    emptyNoIR: 'IR 이 지정되지 않았습니다.',
    noMoreLanguages: '추가 가능한 언어가 없습니다.',
    loading: '로딩…',
    errorPrefix: '오류',
  },
};

type PanelState = {
  transpilerId: string;
  language: string;
  section: HTMLElement;
  codeMount: HTMLElement;
};

export const codeView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const HL_BG = params.theme === 'dark' ? HL_BG_DARK : HL_BG_LIGHT;
    const SHIKI_THEME = params.theme === 'dark' ? 'github-dark' : 'github-light';
    const locale = params.locale;
    const labels = CODE_VIEW_LABELS_BY_LOCALE[locale ?? 'en'] ?? CODE_VIEW_LABELS_BY_LOCALE.en;

    const cfg = params.config as {
      label?: string;
      _ir?: IR;
      _transpilers?: Transpiler[];
    };
    const ir = cfg._ir;
    const transpilers = cfg._transpilers ?? [];

    const root = document.createElement('div');
    root.className = 'facet-code-view';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.sm;
    root.style.minWidth = '0';
    container.appendChild(root);

    // ── 헤더 ───────────────────────────
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = space.sm;
    root.appendChild(header);

    const labelEl = document.createElement('div');
    labelEl.style.fontSize = fontSizes.xs;
    labelEl.style.color = colors.textMuted;
    labelEl.textContent = cfg.label ?? '';
    header.appendChild(labelEl);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'facet-code-view__add';
    addBtn.textContent = labels.addLanguage;
    addBtn.style.fontSize = fontSizes.xs;
    addBtn.style.padding = `${space.xs} ${space.sm}`;
    addBtn.style.borderRadius = radii.sm;
    addBtn.style.border = `1px solid ${colors.border}`;
    addBtn.style.background = colors.bgSubtle;
    addBtn.style.color = colors.text;
    addBtn.style.cursor = 'pointer';
    addBtn.style.fontFamily = fonts.body;
    header.appendChild(addBtn);

    // ── 패널 그리드 ─────────────────────
    const panelsWrap = document.createElement('div');
    panelsWrap.className = 'facet-code-view__panels';
    panelsWrap.style.display = 'grid';
    panelsWrap.style.gap = space.sm;
    panelsWrap.style.minWidth = '0';
    root.appendChild(panelsWrap);

    // ── 빈 상태 ─────────────────────────
    const emptyEl = document.createElement('div');
    emptyEl.className = 'facet-code-view__empty';
    emptyEl.style.padding = `${space.lg} ${space.md}`;
    emptyEl.style.textAlign = 'center';
    emptyEl.style.fontSize = fontSizes.sm;
    emptyEl.style.color = colors.textMuted;
    emptyEl.style.background = colors.bgSubtle;
    emptyEl.style.borderRadius = radii.sm;
    emptyEl.style.border = `1px dashed ${colors.border}`;
    emptyEl.textContent = ir ? labels.emptyWithIR : labels.emptyNoIR;
    root.appendChild(emptyEl);

    // ── 드롭다운 ────────────────────────
    const dropdown = document.createElement('div');
    dropdown.className = 'facet-code-view__dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.background = colors.bg;
    dropdown.style.border = `1px solid ${colors.border}`;
    dropdown.style.borderRadius = radii.sm;
    dropdown.style.padding = space.xs;
    dropdown.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
    dropdown.style.display = 'none';
    dropdown.style.zIndex = '10';
    dropdown.style.minWidth = '140px';
    dropdown.style.flexDirection = 'column';
    document.body.appendChild(dropdown);

    const panels: PanelState[] = [];

    function syncUI(): void {
      const used = new Set(panels.map((p) => p.transpilerId));
      const available = transpilers.filter((t) => !used.has(t.id));
      const atMax = panels.length >= MAX_PANELS;
      const noIR = !ir;
      addBtn.disabled = noIR || atMax || available.length === 0;
      addBtn.style.opacity = addBtn.disabled ? '0.5' : '1';
      addBtn.style.cursor = addBtn.disabled ? 'not-allowed' : 'pointer';
      addBtn.textContent = atMax ? labels.atMax : labels.addLanguage;

      panelsWrap.style.gridTemplateColumns =
        panels.length === 0 ? '1fr' : `repeat(${panels.length}, minmax(0, 1fr))`;
      emptyEl.style.display = panels.length === 0 ? '' : 'none';
      panelsWrap.style.display = panels.length === 0 ? 'none' : 'grid';
    }

    function closeDropdown(): void {
      dropdown.style.display = 'none';
    }

    function openDropdown(): void {
      dropdown.textContent = '';
      const used = new Set(panels.map((p) => p.transpilerId));
      const available = transpilers.filter((t) => !used.has(t.id));
      if (available.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = `${space.xs} ${space.sm}`;
        empty.style.fontSize = fontSizes.xs;
        empty.style.color = colors.textMuted;
        empty.textContent = labels.noMoreLanguages;
        dropdown.appendChild(empty);
      } else {
        for (const t of available) {
          const item = document.createElement('button');
          item.type = 'button';
          item.style.display = 'block';
          item.style.width = '100%';
          item.style.textAlign = 'left';
          item.style.padding = `${space.xs} ${space.sm}`;
          item.style.fontSize = fontSizes.sm;
          item.style.background = 'transparent';
          item.style.border = 'none';
          item.style.color = colors.text;
          item.style.cursor = 'pointer';
          item.style.borderRadius = radii.sm;
          item.style.fontFamily = fonts.body;
          item.textContent = resolveLocale(t.label, locale);
          item.onmouseenter = () => (item.style.background = colors.bgSubtle);
          item.onmouseleave = () => (item.style.background = 'transparent');
          item.onclick = () => {
            closeDropdown();
            void addPanel(t);
          };
          dropdown.appendChild(item);
        }
      }
      const rect = addBtn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
      dropdown.style.left = `${rect.right - 140 + window.scrollX}px`;
      dropdown.style.display = 'flex';
    }

    addBtn.onclick = (e) => {
      e.stopPropagation();
      if (addBtn.disabled) return;
      if (dropdown.style.display === 'flex') closeDropdown();
      else openDropdown();
    };

    const docClickHandler = (e: MouseEvent): void => {
      if (!dropdown.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener('click', docClickHandler);

    function buildPanelSection(t: Transpiler): PanelState {
      const section = document.createElement('section');
      section.className = 'facet-code-view__panel';
      section.dataset.lang = t.language;
      section.style.display = 'flex';
      section.style.flexDirection = 'column';
      section.style.background = colors.bgSubtle;
      section.style.borderRadius = radii.sm;
      section.style.border = `1px solid ${colors.border}`;
      section.style.minWidth = '0';
      section.style.overflow = 'hidden';

      const head = document.createElement('div');
      head.style.display = 'flex';
      head.style.alignItems = 'center';
      head.style.justifyContent = 'space-between';
      head.style.padding = `${space.xs} ${space.sm}`;
      head.style.borderBottom = `1px solid ${colors.border}`;
      head.style.fontSize = fontSizes.xs;
      head.style.color = colors.textMuted;
      head.style.background = colors.bg;

      const langLabel = document.createElement('span');
      langLabel.textContent = resolveLocale(t.label, locale);
      head.appendChild(langLabel);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '✕';
      removeBtn.style.background = 'transparent';
      removeBtn.style.border = 'none';
      removeBtn.style.color = colors.textMuted;
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontSize = fontSizes.sm;
      removeBtn.style.padding = '0 4px';
      removeBtn.onclick = () => removePanel(t.id);
      head.appendChild(removeBtn);

      section.appendChild(head);

      const codeMount = document.createElement('div');
      codeMount.className = 'facet-code-view__code';
      codeMount.style.overflowX = 'auto';
      codeMount.style.fontFamily = fonts.mono;
      codeMount.style.fontSize = fontSizes.sm;
      codeMount.style.lineHeight = '1.55';
      codeMount.style.padding = `${space.sm} ${space.md}`;
      codeMount.textContent = labels.loading;
      section.appendChild(codeMount);

      return { transpilerId: t.id, language: t.language, section, codeMount };
    }

    async function addPanel(t: Transpiler): Promise<void> {
      if (!ir) return;
      if (panels.length >= MAX_PANELS) return;
      if (panels.some((p) => p.transpilerId === t.id)) return;

      const panel = buildPanelSection(t);
      panelsWrap.appendChild(panel.section);
      panels.push(panel);
      syncUI();

      try {
        const { lines } = t.transpile(ir);
        const code = lines.map((l) => l.code).join('\n');
        const phases = lines.map((l) => l.phase);
        const transformer: ShikiTransformer = {
          line(node, lineIdx) {
            const phase = phases[lineIdx - 1];
            if (phase) {
              node.properties = node.properties ?? {};
              (node.properties as Record<string, unknown>)['data-phase'] = phase;
            }
          },
        };
        const hl = await ensureLanguage(t.language);
        const html = hl.codeToHtml(code, {
          lang: t.language,
          theme: SHIKI_THEME,
          transformers: [transformer],
        });
        panel.codeMount.innerHTML = html;
        // shiki 가 감싼 <pre> 의 padding/background 는 우리 컨테이너로 위임
        const pre = panel.codeMount.querySelector('pre');
        if (pre instanceof HTMLElement) {
          pre.style.margin = '0';
          pre.style.background = 'transparent';
          pre.style.padding = '0';
        }
        // 현재 활성 phase 가 있으면 즉시 반영
        if (currentPhase) applyHighlight(panel, currentPhase);
      } catch (err) {
        panel.codeMount.textContent = `${labels.errorPrefix}: ${(err as Error).message}`;
      }
    }

    function removePanel(transpilerId: string): void {
      const idx = panels.findIndex((p) => p.transpilerId === transpilerId);
      if (idx < 0) return;
      const [removed] = panels.splice(idx, 1);
      removed.section.remove();
      syncUI();
    }

    let currentPhase: string | null = null;

    function applyHighlight(panel: PanelState, phase: string | null): void {
      const lines = panel.codeMount.querySelectorAll<HTMLElement>('.line');
      for (const el of lines) {
        if (phase && el.dataset.phase === phase) {
          el.style.backgroundColor = HL_BG;
        } else {
          el.style.backgroundColor = '';
        }
      }
    }

    function highlightPhase(phase: string | null): void {
      currentPhase = phase;
      for (const p of panels) applyHighlight(p, phase);
    }

    function clearHighlight(): void {
      currentPhase = null;
      for (const p of panels) applyHighlight(p, null);
    }

    syncUI();

    return {
      destroy() {
        document.removeEventListener('click', docClickHandler);
        if (dropdown.parentElement) dropdown.remove();
        if (root.parentElement) root.remove();
      },
      highlightPhase,
      clearHighlight,
      // 테스트/디버그용
      _addLanguage(transpilerId: string) {
        const t = transpilers.find((x) => x.id === transpilerId);
        if (t) return addPanel(t);
        return Promise.resolve();
      },
      _removeLanguage(transpilerId: string) {
        removePanel(transpilerId);
      },
      _panelCount() {
        return panels.length;
      },
    };
  },
};

export function registerCodeView(): void {
  registerView('code-view', codeView);
}
