import type { CanvasView, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { StyleBlocksPaintScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 마운트 뒤 바뀌지 않는다 (canvas-height 테스트). */
const H = 340;

const PAD = 16;
const PANEL_GAP = 16;
const PANEL_Y = 82;
const PANEL_H = 200;
const ROW_H = 28;
const ROW_GAP = 4;
const GROW_MS = 320;
const FLASH_MS = 380;
const FLASH_WIDTH = 4;

const MD_PX = parseFloat(fontSizes.md);
const CAPTION_LINE_H = Math.round(MD_PX * 1.45);
const CAPTION_TOP = Math.round(MD_PX);
const CAPTION_CHAR_PX = MD_PX * 0.55;

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function text(
  x: number,
  y: number,
  s: string,
  opts: { size: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: string; family?: string },
): SVGTextElement {
  const t = el('text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-family', opts.family ?? fonts.body);
  t.setAttribute('font-size', opts.size);
  t.setAttribute('fill', opts.fill);
  t.setAttribute('text-anchor', opts.anchor ?? 'start');
  if (opts.weight) t.setAttribute('font-weight', opts.weight);
  t.textContent = s;
  return t;
}

/** 욕심 줄바꿈 — 정확한 글자 폭 대신 fontSizes 에서 뽑은 평균 폭으로 어림한다. */
function wrapText(s: string, maxWidth: number, charPx: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (cur === '' || trial.length * charPx <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function rowsHeight(count: number): number {
  return count > 0 ? count * (ROW_H + ROW_GAP) - ROW_GAP : 0;
}

function captionOf(t: Translate, scene: StyleBlocksPaintScene): string {
  const step = scene.step;
  if (step === null) return t('caption.start', 'Five lines wait to be read. The screen is blank.');
  if (step.kind === 'arrived') {
    const cssLine = scene.lines.find((l) => l.kind === 'link');
    const resource = cssLine?.src ?? '';
    return t('caption.arrived', '{resource} arrived.', { resource });
  }
  if (step.kind === 'firstPaint') {
    const ms = scene.waitedMs ?? 0;
    return t('caption.firstPaint', 'First paint. The screen was blank for {ms}ms.', { ms });
  }
  const line = scene.lines[step.index];
  const code = line?.code ?? '';
  if (step.domComplete) {
    return t('caption.readLineDomComplete', '{code} read. The DOM is complete, but the screen stays blank.', { code });
  }
  if (line?.kind === 'link') {
    return t('caption.readLineRequestsCss', '{code} read — {resource} requested.', { code, resource: line.src ?? '' });
  }
  return t('caption.readLine', '{code} read.', { code });
}

export const styleBlocksPaintStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const svg = params.canvas;
    const W = svg.viewBox.baseVal.width || PIECE_CANVAS_W;

    const panelW = (W - PAD * 2 - PANEL_GAP) / 2;
    const docX = PAD;
    const screenX = PAD + panelW + PANEL_GAP;
    const docInnerX = docX + 10;
    const docRowW = panelW - 20;
    const contentY0 = PANEL_Y + 34;
    const screenInnerX = screenX + 10;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function animate(mine: number, durationMs: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let frameId = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(frameId);
          resolve();
        };
        const start = performance.now();
        const step = (now: number): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now - start) / durationMs);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          frameId = requestAnimationFrame(step);
          frames.add(frameId);
        };
        waiters.add(finish);
        frameId = requestAnimationFrame(step);
        frames.add(frameId);
      });
    }

    function drawStatic(scene: StyleBlocksPaintScene): { coverRect: SVGRectElement; screenBorder: SVGRectElement } {
      svg.textContent = '';

      // 캡션 (지금 일어나는 일만 말한다).
      const captionLines = wrapText(captionOf(t, scene), W - PAD * 2, CAPTION_CHAR_PX);
      captionLines.forEach((line, i) => {
        svg.appendChild(
          text(PAD, CAPTION_TOP + i * CAPTION_LINE_H, line, { size: fontSizes.md, fill: colors.text }),
        );
      });

      // 시계.
      svg.appendChild(
        text(W - PAD, CAPTION_TOP, t('label.now', 'Now: {ms}ms', { ms: scene.nowMs }), {
          size: fontSizes.sm,
          fill: colors.textMuted,
          anchor: 'end',
        }),
      );

      // 문서 패널.
      const docPanel = el('rect');
      docPanel.setAttribute('x', String(docX));
      docPanel.setAttribute('y', String(PANEL_Y));
      docPanel.setAttribute('width', String(panelW));
      docPanel.setAttribute('height', String(PANEL_H));
      docPanel.setAttribute('fill', colors.bgSubtle);
      docPanel.setAttribute('stroke', colors.border);
      docPanel.setAttribute('stroke-width', '1');
      svg.appendChild(docPanel);
      svg.appendChild(
        text(docX + 10, PANEL_Y + 18, t('label.document', 'Document'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          weight: '600',
        }),
      );

      const rowsG = el('g');
      for (let i = 0; i < scene.lines.length; i += 1) {
        const line = scene.lines[i]!;
        const rowY = contentY0 + i * (ROW_H + ROW_GAP);
        const isLast = i === scene.readCount - 1;
        const marker = el('rect');
        marker.setAttribute('x', String(docInnerX));
        marker.setAttribute('y', String(rowY));
        marker.setAttribute('width', '3');
        marker.setAttribute('height', String(ROW_H));
        marker.setAttribute('fill', isLast ? colors.itemActive : colors.border);
        rowsG.appendChild(marker);
        rowsG.appendChild(
          text(docInnerX + 10, rowY + ROW_H / 2 + 4, line.code, {
            size: fontSizes.xs,
            fill: colors.text,
            family: fonts.mono,
          }),
        );
      }
      svg.appendChild(rowsG);

      // 아직 읽히지 않은 줄을 덮는다 — 패널과 같은 색이라 "아직 없다" 로 읽힌다.
      // clipPath 대신 덮개 사각형을 쓴다 — 같은 조각이 한 쪽에 여럿 있으면 clipPath id 가 부딪힌다.
      const rowsAreaH = rowsHeight(scene.lines.length);
      const readH = rowsHeight(scene.readCount);
      const coverRect = el('rect');
      coverRect.setAttribute('x', String(docInnerX));
      coverRect.setAttribute('y', String(contentY0 + readH));
      coverRect.setAttribute('width', String(docRowW));
      coverRect.setAttribute('height', String(rowsAreaH - readH));
      coverRect.setAttribute('fill', colors.bgSubtle);
      svg.appendChild(coverRect);

      // 화면 패널.
      const screenBorder = el('rect');
      screenBorder.setAttribute('x', String(screenX));
      screenBorder.setAttribute('y', String(PANEL_Y));
      screenBorder.setAttribute('width', String(panelW));
      screenBorder.setAttribute('height', String(PANEL_H));
      screenBorder.setAttribute('fill', colors.bg);
      screenBorder.setAttribute('stroke', colors.border);
      screenBorder.setAttribute('stroke-width', '1');
      svg.appendChild(screenBorder);
      svg.appendChild(
        text(screenX + 10, PANEL_Y + 18, t('label.screen', 'Screen'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          weight: '600',
        }),
      );

      if (scene.paintedAt !== null) {
        let y = contentY0 + 14;
        for (const line of scene.lines) {
          if (line.kind !== 'text' || line.text === undefined) continue;
          svg.appendChild(
            text(screenInnerX, y, line.text, {
              size: line.heading ? fontSizes.lg : fontSizes.sm,
              fill: line.heading ? colors.text : colors.textMuted,
              weight: line.heading ? '700' : undefined,
            }),
          );
          y += line.heading ? 24 : 20;
        }
      }

      // 아래 — 다 된 DOM 이 그려지지 않은 채 기다린 길이.
      if (scene.domCompleteAt !== null) {
        const waitLabel =
          scene.paintedAt === null
            ? t('label.waiting', 'Blocked so far: {ms}ms', { ms: scene.nowMs - scene.domCompleteAt })
            : t('label.waited', 'Blocked for: {ms}ms', { ms: scene.waitedMs ?? 0 });
        svg.appendChild(
          text(PAD, PANEL_Y + PANEL_H + 26, waitLabel, { size: fontSizes.sm, fill: colors.textMuted }),
        );
      }

      return { coverRect, screenBorder };
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): void | Promise<void> {
        const scene = next as StyleBlocksPaintScene;
        const prevScene = prev as StyleBlocksPaintScene | null;
        const mine = (gen += 1);
        const built = drawStatic(scene);
        if (!opts.animate || destroyed || !prevScene) return;

        const tasks: Promise<void>[] = [];

        if (scene.readCount > prevScene.readCount) {
          const rowsAreaH = rowsHeight(scene.lines.length);
          const fromRead = rowsHeight(prevScene.readCount);
          const toRead = rowsHeight(scene.readCount);
          built.coverRect.setAttribute('y', String(contentY0 + fromRead));
          built.coverRect.setAttribute('height', String(rowsAreaH - fromRead));
          tasks.push(
            animate(mine, GROW_MS, (p) => {
              const read = fromRead + (toRead - fromRead) * p;
              built.coverRect.setAttribute('y', String(contentY0 + read));
              built.coverRect.setAttribute('height', String(rowsAreaH - read));
            }),
          );
        }

        if (prevScene.paintedAt === null && scene.paintedAt !== null) {
          built.screenBorder.setAttribute('stroke-width', String(FLASH_WIDTH));
          built.screenBorder.setAttribute('stroke', colors.accent);
          tasks.push(
            animate(mine, FLASH_MS, (p) => {
              built.screenBorder.setAttribute('stroke-width', String(FLASH_WIDTH + (1 - FLASH_WIDTH) * p));
              if (p >= 1) built.screenBorder.setAttribute('stroke', colors.border);
            }),
          );
        }

        if (tasks.length === 0) return;
        return Promise.all(tasks).then(() => {
          if (mine !== gen || destroyed) return;
          drawStatic(scene);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        params.canvas.textContent = '';
      },
    };
  },
};
