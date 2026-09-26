/**
 * critical-path 의 무대 — 문서 줄을 내려가는 파서 커서, 세 자원의 요청→도착 막대,
 * 첫 장/DOM 완성 표식과 그 사이 간격 막대, 화면 미리보기, `.brand` 문단 상자.
 *
 * projector 가 부르는 메서드:
 *   `applyTimeline(kind, payload, speedMul)` — algorithm 의 'timeline' 이벤트를 그대로 옮긴다.
 *   `destroy()`
 */
import { fonts, fontSizes, getColors, makeTranslator, type Palette, type Theme } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { CriticalPathData, DocLine } from './algorithm.js';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const WIDTH = 720;
const LEFT = 46;
const ROW_H = 19;
const DOC_Y0 = 14;
const TRACK_X0 = 160;
const TRACK_W = 500;
const MS_SCALE = TRACK_W / 700;

const timeX = (at: number): number => TRACK_X0 + Math.min(at, 700) * MS_SCALE;

type Row = { id: string; g: SVGGElement; text: SVGTextElement };

type Gap = { ms: number; beforePaint: boolean };

function asGap(v: unknown): Gap | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  return typeof o.ms === 'number' && typeof o.beforePaint === 'boolean' ? { ms: o.ms, beforePaint: o.beforePaint } : undefined;
}

function asLines(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  return v.filter((line): line is number[] => Array.isArray(line));
}

export const criticalPathStageView: CanvasView = {
  canvas: { width: WIDTH, height: 470, fit: 'fill' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const theme: Theme | undefined = params.theme;
    const colors: Palette = getColors(theme);
    const t = params.t ?? makeTranslator(params.locale);
    const data = (params.initialData as unknown as CriticalPathData | undefined) ?? undefined;

    const root = el('g');
    svg.appendChild(root);

    // ── 문서 줄 패널 ────────────────────────────────────────────────────────
    const docPanel = el('g');
    root.appendChild(docPanel);

    const preloadLine: DocLine = { id: 'preload', code: data?.preloadLine ?? '' };
    const cssLine: DocLine = { id: 'css', code: data?.cssLine ?? '' };
    const appLine: DocLine = { id: 'app', code: data?.appLineByAttr?.[0] ?? '' };
    const bodyLines: DocLine[] = data?.bodyLines ?? [];
    const allLines: DocLine[] = [preloadLine, cssLine, appLine, ...bodyLines];

    const rows: Row[] = [];
    allLines.forEach((line, i) => {
      const y = DOC_Y0 + i * ROW_H;
      const g = el('g', { transform: `translate(0, ${y})` });
      const text = el('text', { x: LEFT, y: 12, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.text });
      text.textContent = line.code;
      g.appendChild(text);
      docPanel.appendChild(g);
      rows.push({ id: line.id, g, text });
    });
    rows[0]!.g.style.opacity = (data?.preload ?? 0) === 1 ? '1' : '0.25';

    const cursor = el('rect', {
      x: LEFT - 22,
      y: 1,
      width: 12,
      height: ROW_H - 6,
      rx: 2,
      fill: colors.accent,
      stroke: colors.text,
    });
    cursor.style.transition = 'transform 260ms linear, fill 200ms linear';
    docPanel.appendChild(cursor);
    let cursorRowIndex = 0;
    const moveCursorTo = (lineId: string): void => {
      const i = rows.findIndex((r) => r.id === lineId);
      if (i < 0) return;
      cursorRowIndex = i;
      cursor.style.transform = `translateY(${DOC_Y0 + i * ROW_H}px)`;
    };
    moveCursorTo('css');

    // ── 자원 막대 (site.css · app.js · brand.woff2) ─────────────────────────
    const resPanel = el('g', { transform: `translate(0, ${DOC_Y0 + allLines.length * ROW_H + 18})` });
    root.appendChild(resPanel);
    const resLabel = el('text', { x: 0, y: -6, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted });
    resLabel.textContent = t('label.resourcePanel', 'Request → arrive');
    resPanel.appendChild(resLabel);
    const RES_ROW_H = 26;
    const resourceIds = ['site', 'app', 'font'] as const;
    const resourceLabel: Record<(typeof resourceIds)[number], string> = {
      site: 'site.css',
      app: 'app.js',
      font: 'brand.woff2',
    };
    type ResBar = { track: SVGRectElement; fill: SVGRectElement; exec: SVGRectElement };
    const resBars = new Map<string, ResBar>();
    resourceIds.forEach((id, i) => {
      const y = i * RES_ROW_H;
      const label = el('text', { x: 0, y: y + 15, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted });
      label.textContent = resourceLabel[id];
      resPanel.appendChild(label);
      const track = el('rect', { x: TRACK_X0, y: y + 4, width: TRACK_W, height: 12, fill: colors.bgSubtle, stroke: colors.border });
      resPanel.appendChild(track);
      const fill = el('rect', { x: TRACK_X0, y: y + 4, width: 0, height: 12, fill: colors.itemActive });
      fill.style.transition = 'width 500ms linear, x 500ms linear';
      resPanel.appendChild(fill);
      const exec = el('rect', { x: TRACK_X0, y: y + 4, width: 0, height: 12, fill: colors.itemSwapping, opacity: '0.85' });
      exec.style.transition = 'width 400ms linear, x 400ms linear';
      resPanel.appendChild(exec);
      resBars.set(id, { track, fill, exec });
    });

    // ── 첫 장 · DOM 완성 · 간격 ──────────────────────────────────────────────
    const gapY = resourceIds.length * RES_ROW_H + 20;
    const gapPanel = el('g', { transform: `translate(0, ${DOC_Y0 + allLines.length * ROW_H + 18 + gapY})` });
    root.appendChild(gapPanel);
    const gapPanelLabel = el('text', { x: 0, y: -6, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted });
    gapPanelLabel.textContent = t('label.paintDom', 'First paint · DOM complete');
    gapPanel.appendChild(gapPanelLabel);
    const gapLine = el('line', { x1: TRACK_X0, y1: 10, x2: TRACK_X0 + TRACK_W, y2: 10, stroke: colors.border });
    gapPanel.appendChild(gapLine);
    const paintMarker = el('circle', { cx: TRACK_X0, cy: 10, r: 5, fill: colors.itemPivot, stroke: colors.text });
    paintMarker.style.transition = 'transform 400ms linear';
    paintMarker.style.opacity = '0';
    const domMarker = el('circle', { cx: TRACK_X0, cy: 10, r: 5, fill: colors.primary, stroke: colors.text });
    domMarker.style.transition = 'transform 400ms linear';
    domMarker.style.opacity = '0';
    const gapBar = el('rect', { x: TRACK_X0, y: 6, width: 0, height: 8, fill: colors.subtreeShadeRight });
    gapBar.style.transition = 'width 400ms linear, x 400ms linear';
    const gapLabel = el('text', { x: TRACK_X0, y: 26, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted });
    gapPanel.append(gapBar, paintMarker, domMarker, gapLabel);
    let paintAt: number | null = null;
    let domAt: number | null = null;

    const drawGap = (gap: Gap | undefined): void => {
      if (!gap) return;
      const a = gap.beforePaint ? paintAt : domAt;
      const bAt = gap.beforePaint ? domAt : paintAt;
      if (a === null || bAt === null) return;
      const x0 = timeX(Math.min(a, bAt));
      const x1 = timeX(Math.max(a, bAt));
      gapBar.style.transform = `translate(${x0 - TRACK_X0}px,0)`;
      gapBar.setAttribute('width', String(Math.max(1, x1 - x0)));
      gapLabel.textContent = gap.beforePaint
        ? t('caption.gapDomFirst', 'DOM complete first — {ms}ms until first paint', { ms: gap.ms })
        : t('caption.gapPaintFirst', 'First paint first — {ms}ms until DOM complete', { ms: gap.ms });
    };

    // ── 화면 미리보기 ─────────────────────────────────────────────────────
    const screenY = 0;
    const screenPanel = el('g', { transform: `translate(${WIDTH - 150}, ${screenY})` });
    root.appendChild(screenPanel);
    const screenLabel = el('text', { x: 0, y: -6, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted });
    screenLabel.textContent = t('label.screen', 'Screen');
    screenPanel.appendChild(screenLabel);
    const screenFrame = el('rect', { x: 0, y: 0, width: 130, height: 90, fill: colors.bg, stroke: colors.border });
    const blank = el('g');
    const blankRect = el('rect', { x: 8, y: 8, width: 114, height: 74, fill: colors.bgSubtle });
    blank.appendChild(blankRect);
    const filled = el('g');
    filled.style.transformOrigin = '65px 45px';
    filled.style.transform = 'scaleY(0)';
    filled.style.transition = 'transform 500ms ease-out';
    filled.style.opacity = '0';
    for (let i = 0; i < 4; i += 1) {
      filled.appendChild(el('rect', { x: 8, y: 12 + i * 18, width: 114 - (i % 2) * 30, height: 8, fill: colors.itemDefault, stroke: colors.border }));
    }
    screenPanel.append(screenFrame, blank, filled);

    // ── .brand 문단 상자 ──────────────────────────────────────────────────
    const brandY = 190;
    const brandPanel = el('g', { transform: `translate(${WIDTH - 210}, ${brandY})` });
    root.appendChild(brandPanel);
    const brandLabel = el('text', { x: 0, y: -6, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted });
    brandLabel.textContent = t('label.brandBox', '.brand paragraph');
    brandPanel.appendChild(brandLabel);
    const BRAND_W = 220;
    const BRAND_LINE_H = 18;
    const brandFrame = el('rect', { x: 0, y: 0, width: BRAND_W, height: BRAND_LINE_H * 3 + 12, fill: colors.bgSubtle, stroke: colors.border });
    const brandWordsGroup = el('g', { transform: 'translate(6, 14)' });
    brandWordsGroup.style.opacity = '0';
    brandPanel.append(brandFrame, brandWordsGroup);
    const words = data?.words ?? [];
    const wordEls: SVGTextElement[] = words.map((w) => {
      const wordEl = el('text', { x: 0, y: 0, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text });
      wordEl.textContent = w;
      wordEl.style.transition = 'transform 500ms ease-out, fill 300ms linear';
      brandWordsGroup.appendChild(wordEl);
      return wordEl;
    });

    const placeBrandWords = (lines: number[][], charPx: number, spacePx: number, brand: boolean): void => {
      lines.forEach((line, li) => {
        let x = 0;
        for (const wi of line) {
          const t = wordEls[wi];
          if (!t) continue;
          t.style.transform = `translate(${x}px, ${li * BRAND_LINE_H}px)`;
          t.setAttribute('fill', brand ? colors.primary : colors.text);
          const wPx = (words[wi]?.length ?? 0) * charPx;
          x += wPx + spacePx;
        }
      });
    };

    // ── 상태 ────────────────────────────────────────────────────────────
    let sweepTimer: ReturnType<typeof setTimeout> | null = null;

    function resetForNewRound(attrVal: number | undefined): void {
      moveCursorTo('css');
      cursor.setAttribute('fill', colors.accent);
      cursor.style.transitionDuration = '260ms, 200ms';
      for (const id of resourceIds) {
        const bar = resBars.get(id)!;
        bar.fill.setAttribute('width', '0');
        bar.exec.setAttribute('width', '0');
      }
      paintAt = null;
      domAt = null;
      paintMarker.style.opacity = '0';
      domMarker.style.opacity = '0';
      gapBar.setAttribute('width', '0');
      gapLabel.textContent = '';
      blank.style.transition = '';
      blank.style.opacity = '1';
      filled.style.transition = '';
      filled.style.opacity = '0';
      filled.style.transform = 'scaleY(0)';
      brandWordsGroup.style.opacity = '0';
      requestAnimationFrame(() => {
        blank.style.transition = 'opacity 400ms linear';
        filled.style.transition = 'transform 500ms ease-out';
      });
      if (attrVal !== undefined && data?.appLineByAttr) {
        const codeText = data.appLineByAttr[attrVal];
        const row = rows.find((r) => r.id === 'app');
        if (row && typeof codeText === 'string') row.text.textContent = codeText;
      }
    }

    function applyTimeline(kind: string, payload: Record<string, unknown>, speedMul: number): void {
      const speed = Math.max(0.01, speedMul);
      const at = typeof payload.at === 'number' ? payload.at : 0;
      const line = typeof payload.line === 'string' ? payload.line : undefined;
      const resource = typeof payload.resource === 'string' ? payload.resource : undefined;
      const attrVal = typeof payload.attr === 'number' ? payload.attr : undefined;
      const preloadVal = typeof payload.preload === 'number' ? payload.preload : undefined;

      if (preloadVal !== undefined) rows[0]!.g.style.opacity = preloadVal === 1 ? '1' : '0.25';
      if (payload.roundStart === true) resetForNewRound(attrVal);

      switch (kind) {
        case 'request-font-preload':
        case 'request-site':
        case 'request-app': {
          if (line) moveCursorTo(line);
          if (resource) {
            const bar = resBars.get(resource);
            if (bar) {
              bar.fill.setAttribute('x', String(timeX(at)));
              bar.fill.setAttribute('width', '0');
            }
          }
          break;
        }
        case 'parser-stop': {
          if (line) moveCursorTo(line);
          cursor.setAttribute('fill', colors.danger);
          break;
        }
        case 'parser-resume': {
          cursor.setAttribute('fill', colors.accent);
          break;
        }
        case 'body-sweep': {
          const fromLine = typeof payload.fromLine === 'string' ? payload.fromLine : rows[cursorRowIndex]!.id;
          const toLine = typeof payload.toLine === 'string' ? payload.toLine : fromLine;
          const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : 500;
          const toIdx = rows.findIndex((r) => r.id === toLine);
          moveCursorTo(fromLine);
          const dur = durationMs / speed;
          cursor.style.transitionDuration = `${dur}ms, 200ms`;
          if (sweepTimer) clearTimeout(sweepTimer);
          sweepTimer = setTimeout(() => {
            cursor.style.transitionDuration = '260ms, 200ms';
          }, dur);
          if (toIdx >= 0) cursor.style.transform = `translateY(${DOC_Y0 + toIdx * ROW_H}px)`;
          break;
        }
        case 'site-arrive':
        case 'app-arrive':
        case 'font-arrive': {
          if (resource) {
            const bar = resBars.get(resource);
            if (bar) bar.fill.setAttribute('width', String(Math.max(1, timeX(at) - Number(bar.fill.getAttribute('x') ?? 0))));
          }
          break;
        }
        case 'app-exec': {
          const bar = resBars.get('app');
          if (bar) {
            bar.exec.setAttribute('x', String(timeX(at)));
            const execEnd = timeX(at + (data?.resources.app.execMs ?? 60));
            requestAnimationFrame(() => bar.exec.setAttribute('width', String(Math.max(1, execEnd - timeX(at)))));
          }
          break;
        }
        case 'first-paint': {
          paintAt = at;
          paintMarker.style.opacity = '1';
          paintMarker.style.transform = `translate(${timeX(at) - TRACK_X0}px,0)`;
          blank.style.transition = 'opacity 400ms linear';
          blank.style.opacity = '0';
          filled.style.opacity = '1';
          filled.style.transform = 'scaleY(1)';
          const brandInitial = payload.brandInitial === true;
          const lines = asLines(payload.lines);
          const font = brandInitial ? data?.brandFont : data?.fallbackFont;
          if (font) placeBrandWords(lines, font.charPx, font.spacePx, brandInitial);
          brandWordsGroup.style.transition = '';
          brandWordsGroup.style.opacity = '1';
          drawGap(asGap(payload.gap));
          break;
        }
        case 'font-needed':
        case 'font-already-arrived':
          break;
        case 'font-swap': {
          const lines = asLines(payload.lines);
          if (data?.brandFont) placeBrandWords(lines, data.brandFont.charPx, data.brandFont.spacePx, true);
          break;
        }
        case 'parse-end': {
          domAt = at;
          domMarker.style.opacity = '1';
          domMarker.style.transform = `translate(${timeX(at) - TRACK_X0}px,0)`;
          if (line) moveCursorTo(line);
          drawGap(asGap(payload.gap));
          break;
        }
        case 'dcl':
          break;
        default:
          break;
      }
    }

    const instance: ViewInstance & { applyTimeline: typeof applyTimeline } = {
      applyTimeline,
      destroy(): void {
        if (sweepTimer) clearTimeout(sweepTimer);
        root.remove();
      },
    };
    return instance;
  },
};
