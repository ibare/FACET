/**
 * dirty-scan-stage — 지켜보는 값 여섯을 늘 한 줄씩 보여주고, 훑는 자리(막대)가 그
 * 사이를 두 바퀴 오르내리며 지난 값과 지금 값을 견준다. 다르면 지난 값 칸으로
 * 값 하나가 건너가 그 자리를 갈아 끼우고, 다시 그린 자리는 표시가 남는다.
 */
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { DirtyScanScene } from './scene.js';
import type { DirtyScanFacetData } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CANVAS_H = 390;
const PAD_X = 32;
const CAPTION_Y = 26;
const SUBLINE_Y = 48;
const HEADER_Y = 74;
const ROWS_TOP = 92;
const ROW_H = 30;
const ROW_STEP = 38;
const ANIM_MS = 300;

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function textEl(
  x: number,
  y: number,
  s: string,
  opts: { size: string; color: string; family?: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el('text');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('font-size', opts.size);
  node.setAttribute('font-family', opts.family ?? fonts.body);
  node.setAttribute('fill', opts.color);
  node.setAttribute('text-anchor', opts.anchor ?? 'start');
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = s;
  return node;
}

function readViewboxWidth(svg: SVGSVGElement): number {
  const raw = svg.getAttribute('viewBox');
  if (!raw) return PIECE_CANVAS_W;
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length === 4 && Number.isFinite(parts[2]) && parts[2] > 0) return parts[2];
  return PIECE_CANVAS_W;
}

type RowHandles = { lastText: SVGTextElement; nowText: SVGTextElement; markCircle: SVGCircleElement };

type Built = {
  cursorBar: SVGRectElement;
  flashDot: SVGCircleElement;
  copyDot: SVGCircleElement;
  rows: Map<string, RowHandles>;
};

export const dirtyScanStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const initialData = params.initialData as DirtyScanFacetData | undefined;
    const writeCode = initialData?.write.code ?? '';

    const svg = params.canvas;
    const W = readViewboxWidth(svg);
    const contentW = W - PAD_X * 2;
    const NAME_X = PAD_X;
    const LAST_X = PAD_X + contentW * 0.34;
    const LAST_W = contentW * 0.14;
    const ARROW_X = LAST_X + LAST_W + contentW * 0.03;
    const NOW_X = PAD_X + contentW * 0.58;
    const NOW_W = contentW * 0.14;
    const MARK_X = PAD_X + contentW * 0.93;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function rowY(i: number): number {
      return ROWS_TOP + i * ROW_STEP + ROW_H / 2;
    }

    function tween(durationMs: number, onFrame: (progress: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const start = performance.now();
        let id = 0;
        const wake = () => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const step = (now: number) => {
          if (destroyed) {
            frames.delete(id);
            waiters.delete(wake);
            resolve();
            return;
          }
          const progress = Math.min(1, (now - start) / durationMs);
          onFrame(progress);
          if (progress < 1) {
            id = requestAnimationFrame(step);
            frames.add(id);
          } else {
            frames.delete(id);
            waiters.delete(wake);
            resolve();
          }
        };
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    function captionFor(scene: DirtyScanScene): string {
      const step = scene.step;
      if (step.kind === 'init') {
        return t('caption.init', 'Watching {count} values. Each remembers the value it last saw.', {
          count: scene.names.length,
        });
      }
      if (step.kind === 'write') {
        return t('caption.write', 'Write: {name} = {value} — nobody is notified.', {
          name: step.name,
          value: step.to,
        });
      }
      if (step.dirty) {
        return t('caption.lookDiff', 'Pass {pass} · looking at {name} — different from last seen. Redrawing.', {
          pass: step.pass,
          name: step.name,
        });
      }
      return t('caption.lookSame', 'Pass {pass} · looking at {name} — same as last seen.', {
        pass: step.pass,
        name: step.name,
      });
    }

    function drawStatic(scene: DirtyScanScene): Built {
      svg.textContent = '';
      const g = el('g');
      svg.appendChild(g);

      g.appendChild(
        textEl(PAD_X, CAPTION_Y, captionFor(scene), { size: fontSizes.md, color: colors.text, weight: '600' }),
      );
      const sublineStr = scene.step.kind === 'write' ? writeCode : '';
      g.appendChild(
        textEl(PAD_X, SUBLINE_Y, sublineStr, { size: fontSizes.sm, color: colors.textMuted, family: fonts.mono }),
      );

      g.appendChild(textEl(NAME_X, HEADER_Y, t('label.name', 'Value'), { size: fontSizes.xs, color: colors.textMuted }));
      g.appendChild(
        textEl(LAST_X + LAST_W / 2, HEADER_Y, t('label.last', 'Last seen'), {
          size: fontSizes.xs,
          color: colors.textMuted,
          anchor: 'middle',
        }),
      );
      g.appendChild(
        textEl(NOW_X + NOW_W / 2, HEADER_Y, t('label.now', 'Now'), {
          size: fontSizes.xs,
          color: colors.textMuted,
          anchor: 'middle',
        }),
      );
      g.appendChild(
        textEl(MARK_X, HEADER_Y, t('label.redraw', 'Redrawn'), {
          size: fontSizes.xs,
          color: colors.textMuted,
          anchor: 'middle',
        }),
      );

      const rows = new Map<string, RowHandles>();
      scene.names.forEach((name, i) => {
        const y = rowY(i);
        if (i > 0) {
          const line = el('line');
          line.setAttribute('x1', String(PAD_X - 20));
          line.setAttribute('x2', String(W - PAD_X));
          line.setAttribute('y1', String(y - ROW_H / 2));
          line.setAttribute('y2', String(y - ROW_H / 2));
          line.setAttribute('stroke', colors.border);
          line.setAttribute('stroke-width', '1');
          g.appendChild(line);
        }

        g.appendChild(
          textEl(NAME_X, y + 4, name, { size: fontSizes.sm, color: colors.text, family: fonts.mono, weight: '600' }),
        );

        const lastBox = el('rect');
        lastBox.setAttribute('x', String(LAST_X));
        lastBox.setAttribute('y', String(y - ROW_H / 2));
        lastBox.setAttribute('width', String(LAST_W));
        lastBox.setAttribute('height', String(ROW_H));
        lastBox.setAttribute('rx', '4');
        lastBox.setAttribute('fill', colors.bgSubtle);
        lastBox.setAttribute('stroke', colors.border);
        g.appendChild(lastBox);
        const lastText = textEl(LAST_X + LAST_W / 2, y + 4, String(scene.last[name]), {
          size: fontSizes.sm,
          color: colors.text,
          family: fonts.mono,
          anchor: 'middle',
        });
        g.appendChild(lastText);

        g.appendChild(
          textEl(ARROW_X, y + 4, '→', { size: fontSizes.sm, color: colors.textMuted, anchor: 'middle' }),
        );

        const nowBox = el('rect');
        nowBox.setAttribute('x', String(NOW_X));
        nowBox.setAttribute('y', String(y - ROW_H / 2));
        nowBox.setAttribute('width', String(NOW_W));
        nowBox.setAttribute('height', String(ROW_H));
        nowBox.setAttribute('rx', '4');
        nowBox.setAttribute('fill', colors.bg);
        nowBox.setAttribute('stroke', colors.border);
        g.appendChild(nowBox);
        const nowText = textEl(NOW_X + NOW_W / 2, y + 4, String(scene.now[name]), {
          size: fontSizes.sm,
          color: colors.text,
          family: fonts.mono,
          anchor: 'middle',
        });
        g.appendChild(nowText);

        const everDirty = scene.everDirty.includes(name);
        const markCircle = el('circle');
        markCircle.setAttribute('cx', String(MARK_X));
        markCircle.setAttribute('cy', String(y));
        markCircle.setAttribute('r', '5');
        markCircle.setAttribute('fill', everDirty ? colors.success : colors.bg);
        markCircle.setAttribute('stroke', everDirty ? colors.success : colors.border);
        g.appendChild(markCircle);

        rows.set(name, { lastText, nowText, markCircle });
      });

      const activeIndex = scene.step.kind === 'look' ? scene.names.indexOf(scene.step.name) : -1;
      const cursorBar = el('rect');
      cursorBar.setAttribute('x', String(PAD_X - 18));
      cursorBar.setAttribute('width', '6');
      cursorBar.setAttribute('rx', '3');
      cursorBar.setAttribute('height', String(ROW_H));
      if (activeIndex >= 0 && scene.step.kind === 'look') {
        cursorBar.setAttribute('y', String(rowY(activeIndex) - ROW_H / 2));
        cursorBar.setAttribute('fill', scene.step.dirty ? colors.itemSwapping : colors.itemComparing);
        cursorBar.style.opacity = '1';
      } else {
        cursorBar.setAttribute('y', '0');
        cursorBar.setAttribute('fill', colors.itemComparing);
        cursorBar.style.opacity = '0';
      }
      g.appendChild(cursorBar);

      const flashDot = el('circle');
      flashDot.setAttribute('r', '5');
      flashDot.setAttribute('fill', colors.itemActive);
      flashDot.style.opacity = '0';
      if (scene.step.kind === 'write') {
        const idx = scene.names.indexOf(scene.step.name);
        flashDot.setAttribute('cx', String(NOW_X - 14));
        flashDot.setAttribute('cy', String(rowY(idx)));
      }
      g.appendChild(flashDot);

      const copyDot = el('circle');
      copyDot.setAttribute('r', '4');
      copyDot.setAttribute('fill', colors.itemSwapping);
      copyDot.style.opacity = '0';
      g.appendChild(copyDot);

      const statsY = ROWS_TOP + scene.names.length * ROW_STEP + 26;
      const stat = (x: number, label: string, value: number, anchor: string) => {
        g.appendChild(textEl(x, statsY, label, { size: fontSizes.xs, color: colors.textMuted, anchor }));
        g.appendChild(textEl(x, statsY + 20, String(value), { size: fontSizes.lg, color: colors.text, weight: '700', anchor }));
      };
      stat(PAD_X, t('label.pass', 'Pass'), scene.pass, 'start');
      stat(W / 2, t('label.looked', 'Looked at'), scene.looks, 'middle');
      stat(W - PAD_X, t('label.changed', 'Different so far'), scene.dirtyFound, 'end');

      return { cursorBar, flashDot, copyDot, rows };
    }

    async function render(
      next: DirtyScanScene,
      _prev: DirtyScanScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const built = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (step.kind === 'write') {
        built.flashDot.style.opacity = '1';
        await tween(ANIM_MS, (progress) => {
          if (destroyed || mine !== gen) return;
          built.flashDot.style.opacity = String(1 - progress);
        });
      } else if (step.kind === 'look') {
        const idx = next.names.indexOf(step.name);
        if (idx < 0) throw new Error(`dirty-scan stage — 모르는 이름 ${step.name}`);
        if (idx === 0) {
          built.cursorBar.style.opacity = '0';
          await tween(ANIM_MS, (progress) => {
            if (destroyed || mine !== gen) return;
            built.cursorBar.style.opacity = String(progress);
          });
        } else {
          const fromY = rowY(idx - 1) - ROW_H / 2;
          const toY = rowY(idx) - ROW_H / 2;
          built.cursorBar.setAttribute('y', String(fromY));
          await tween(ANIM_MS, (progress) => {
            if (destroyed || mine !== gen) return;
            built.cursorBar.setAttribute('y', String(fromY + (toY - fromY) * progress));
          });
        }
        if (destroyed || mine !== gen) return;
        if (step.dirty) {
          const y = rowY(idx);
          const startX = NOW_X + NOW_W / 2;
          const endX = LAST_X + LAST_W / 2;
          built.copyDot.setAttribute('cy', String(y));
          built.copyDot.setAttribute('cx', String(startX));
          built.copyDot.style.opacity = '1';
          await tween(ANIM_MS, (progress) => {
            if (destroyed || mine !== gen) return;
            built.copyDot.setAttribute('cx', String(startX + (endX - startX) * progress));
          });
          if (destroyed || mine !== gen) return;
          built.copyDot.style.opacity = '0';
        }
      }

      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
