import type { CanvasView, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, fontSizes, fonts, getColors, makeTranslator, radii, space } from '@ffacet/core/runtime';
import { type FontSwapFacetData, type WrapLayout, toFontSwapData, wrapLayout } from './algorithm.js';
import type { FontSwapScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 기하 — 캡션 한 줄, 원본 코드 네 줄, 자원 상태 한 줄, 문단 상자(최대 세 줄). */
const MARGIN_X = 40;
const CONTENT_W = PIECE_CANVAS_W - 2 * MARGIN_X;
const CAPTION_Y = 28;
const CODE_TOP = 46;
const CODE_LINE_H = 16;
const CODE_LINES = 4;
const STATUS_Y = CODE_TOP + CODE_LINES * CODE_LINE_H + 18;
const BOX_TOP = STATUS_Y + 22;
const BOX_PAD = parseFloat(space.md);
const LINE_H = 26;
const MAX_LINES = 3;
const BOX_INNER_W = CONTENT_W - 2 * BOX_PAD;
/** 세로는 마운트한 뒤 바뀌지 않는다 — 문단이 세 줄로 자랄 흔한 자리를 미리 잡아 둔다. */
const H = Math.round(BOX_TOP + MAX_LINES * LINE_H + 2 * BOX_PAD + 24);

const CAPTION_SIZE = parseFloat(fontSizes.md);
const CODE_SIZE = parseFloat(fontSizes.xs);
const STATUS_SIZE = parseFloat(fontSizes.xs);
const BODY_SIZE = parseFloat(fontSizes.lg);

/** 문단 되놓기 운동의 길이 — 사양이 stepMs 예산에 잡아 둔 짐작(600ms)과 같다. */
const REFLOW_MS = 600;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clean(n: number): number {
  return Math.round(n * 100) / 100 || 0;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function boxHeightFor(lineCount: number): number {
  return lineCount * LINE_H + 2 * BOX_PAD;
}

type Phase = FontSwapScene['phase'];

export const fontSwapStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;

    let data: FontSwapFacetData | null = null;
    try {
      data = toFontSwapData(params.initialData);
    } catch {
      data = null;
    }
    if (!data) {
      // canvas-attach 전수 검사가 `config: {}` 만으로 마운트한다 — 던지지 않고
      // 빈 캔버스를 두는 렌더러를 돌려준다 (S-piece).
      return {
        render(): void {},
        destroy(): void {
          svg.textContent = '';
        },
      };
    }
    const fixedData = data;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    const scale = BOX_INNER_W / fixedData.boxWidthPx;
    const fallbackLayout = wrapLayout(
      fixedData.words,
      fixedData.fallbackCharPx,
      fixedData.fallbackSpacePx,
      fixedData.boxWidthPx,
    );
    const brandLayout = wrapLayout(fixedData.words, fixedData.brandCharPx, fixedData.brandSpacePx, fixedData.boxWidthPx);
    const movedIdx = fixedData.words
      .map((_, i) => i)
      .filter((i) => fallbackLayout.words[i].lineIndex !== brandLayout.words[i].lineIndex);

    function layoutFor(phase: Phase): WrapLayout {
      return phase === 'brand' ? brandLayout : fallbackLayout;
    }

    function wordXY(layout: WrapLayout, i: number): { x: number; y: number; w: number } {
      const wl = layout.words[i];
      return {
        x: MARGIN_X + BOX_PAD + wl.xModelPx * scale,
        y: BOX_TOP + BOX_PAD + wl.lineIndex * LINE_H + BODY_SIZE,
        w: wl.widthModelPx * scale,
      };
    }

    function captionFor(scene: FontSwapScene): string {
      switch (scene.step.kind) {
        case 'blank':
          return t('caption.blank', 'Nothing has rendered yet.');
        case 'firstPaint':
          return t('caption.firstPaint', '{file} arrived. First paint in fallback: {lines} lines.', {
            file: fixedData.cssFile,
            lines: fallbackLayout.lineCount,
          });
        case 'fontRequested':
          return t('caption.fontRequested', 'Font requested: {file}.', { file: fixedData.fontFile });
        case 'fontArrived':
          return t('caption.fontArrived', 'Font arrived: {file}.', { file: fixedData.fontFile });
        case 'repaint':
          return t('caption.repaint', 'Repainted in Brand — {lines} lines now, {moved} words moved down.', {
            lines: brandLayout.lineCount,
            moved: movedIdx.length,
          });
        default: {
          const exhaustive: never = scene.step;
          throw new Error(`font-swap stage: 모르는 걸음 ${JSON.stringify(exhaustive)}`);
        }
      }
    }

    /** 늘 장면 전체를 다시 세운다. 돌려주는 손잡이로 운동이 붙을 요소를 잡는다. */
    function buildStatic(scene: FontSwapScene): { root: SVGGElement; wordEls: SVGTextElement[]; boxRect: SVGRectElement } {
      const root = svgEl('g');
      root.appendChild(svgEl('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }));

      const caption = svgEl('text', {
        x: MARGIN_X,
        y: CAPTION_Y,
        'font-family': fonts.body,
        'font-size': CAPTION_SIZE,
        fill: colors.text,
      });
      caption.textContent = captionFor(scene);
      root.appendChild(caption);

      const arrived = scene.phase !== 'blank';
      const codeLines = [fixedData.linkTag, fixedData.fontFaceRule, fixedData.paragraphRule, fixedData.paragraphTag];
      codeLines.forEach((line, i) => {
        const codeEl = svgEl('text', {
          x: MARGIN_X,
          y: CODE_TOP + i * CODE_LINE_H,
          'font-family': fonts.mono,
          'font-size': CODE_SIZE,
          fill: arrived ? colors.text : colors.textMuted,
        });
        codeEl.textContent = line;
        root.appendChild(codeEl);
      });

      const badges: Array<{ x: number; file: string; state: 'pending' | 'requested' | 'arrived' }> = [
        { x: MARGIN_X, file: fixedData.cssFile, state: arrived ? 'arrived' : 'pending' },
        {
          x: MARGIN_X + 260,
          file: fixedData.fontFile,
          state: scene.fontArrived ? 'arrived' : scene.fontRequested ? 'requested' : 'pending',
        },
      ];
      for (const badge of badges) {
        const dotFill = badge.state === 'pending' ? colors.bg : badge.state === 'requested' ? colors.textMuted : colors.text;
        const dotStroke = badge.state === 'arrived' ? colors.text : colors.textMuted;
        root.appendChild(svgEl('circle', { cx: badge.x + 4, cy: STATUS_Y - 4, r: 4, fill: dotFill, stroke: dotStroke }));
        const label = svgEl('text', {
          x: badge.x + 14,
          y: STATUS_Y,
          'font-family': fonts.mono,
          'font-size': STATUS_SIZE,
          fill: badge.state === 'pending' ? colors.textMuted : colors.text,
        });
        label.textContent = badge.file;
        root.appendChild(label);
      }

      const shownLineCount = scene.phase === 'blank' ? 0 : layoutFor(scene.phase).lineCount;
      const boxRect = svgEl('rect', {
        x: MARGIN_X,
        y: BOX_TOP,
        width: CONTENT_W,
        height: boxHeightFor(shownLineCount),
        fill: colors.bgSubtle,
        stroke: colors.border,
        rx: parseFloat(radii.md),
      });
      root.appendChild(boxRect);

      const wordEls: SVGTextElement[] = [];
      if (scene.phase !== 'blank') {
        const isBrand = scene.phase === 'brand';
        const layout = layoutFor(scene.phase);
        fixedData.words.forEach((word, i) => {
          const { x, y, w } = wordXY(layout, i);
          const moved = isBrand && movedIdx.includes(i);
          if (moved) {
            root.appendChild(
              svgEl('rect', {
                x: clean(x - 4),
                y: clean(y - BODY_SIZE),
                width: clean(w + 8),
                height: LINE_H - 6,
                fill: colors.accent,
                rx: parseFloat(radii.sm),
              }),
            );
          }
          const wordEl = svgEl('text', {
            x: clean(x),
            y: clean(y),
            textLength: clean(w),
            lengthAdjust: 'spacingAndGlyphs',
            'font-family': fonts.body,
            'font-size': BODY_SIZE,
            'font-weight': isBrand ? 700 : 400,
            fill: moved ? colors.stateInk : colors.text,
          });
          wordEl.textContent = word;
          root.appendChild(wordEl);
          wordEls.push(wordEl);
        });
      }

      return { root, wordEls, boxRect };
    }

    function replaceRoot(root: SVGGElement): void {
      svg.textContent = '';
      svg.appendChild(root);
    }

    /** 흘리는 도중 destroy 하면 기다리던 Promise 를 마이크로태스크 안에 푼다 (S-piece). */
    function animate(durationMs: number, draw: (p: number) => void, mine: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        const start = performance.now();
        let frameId: number | undefined;
        const finish = (): void => {
          waiters.delete(finish);
          if (frameId !== undefined) frames.delete(frameId);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now - start) / durationMs);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          frameId = requestAnimationFrame(tick);
          frames.add(frameId);
        };
        frameId = requestAnimationFrame(tick);
        frames.add(frameId);
      });
    }

    /** 대체 글꼴 자리에서 Brand 자리로 — 낱말들이 넓어진 폭으로 다시 놓인다. */
    function animateReflow(next: FontSwapScene, mine: number): Promise<void> {
      const built = buildStatic(next);
      replaceRoot(built.root);

      const fromBoxH = boxHeightFor(fallbackLayout.lineCount);
      const toBoxH = boxHeightFor(brandLayout.lineCount);
      const from = fixedData.words.map((_, i) => wordXY(fallbackLayout, i));
      const to = fixedData.words.map((_, i) => wordXY(brandLayout, i));

      built.wordEls.forEach((el, i) => {
        el.setAttribute('x', String(clean(from[i].x)));
        el.setAttribute('y', String(clean(from[i].y)));
        el.setAttribute('textLength', String(clean(from[i].w)));
      });
      built.boxRect.setAttribute('height', String(clean(fromBoxH)));

      return animate(
        REFLOW_MS,
        (p) => {
          built.wordEls.forEach((el, i) => {
            el.setAttribute('x', String(clean(lerp(from[i].x, to[i].x, p))));
            el.setAttribute('y', String(clean(lerp(from[i].y, to[i].y, p))));
            el.setAttribute('textLength', String(clean(lerp(from[i].w, to[i].w, p))));
          });
          built.boxRect.setAttribute('height', String(clean(lerp(fromBoxH, toBoxH, p))));
        },
        mine,
      ).then(() => {
        // 운동이 끝나면 정본을 한 번 더 세운다 — 보간 끝자리가 노드째 사라진다.
        if (mine === gen && !destroyed) replaceRoot(buildStatic(next).root);
      });
    }

    function render(next: FontSwapScene, prev: FontSwapScene | null, opts: { animate: boolean }): void | Promise<void> {
      const mine = (gen += 1);
      const isReflow = opts.animate && prev !== null && prev.phase === 'fallback' && next.phase === 'brand';
      if (!isReflow) {
        replaceRoot(buildStatic(next).root);
        return;
      }
      return animateReflow(next, mine);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const f of frames) cancelAnimationFrame(f);
      frames.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
