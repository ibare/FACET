/**
 * one-turn-at-a-time 의 stage — 태스크 줄(위) · 도는 것(가운데) · 끝난 차례(아래) 세 레인.
 *
 * 동사 "간다": 줄 맨 앞이 꺼내져 도는 자리(가운데)로 올라가고, 다 돌면 끝난 차례(아래)로
 * 내려간다 — 그사이 다른 것으로 바뀌지 않는다. 새로 온 태스크는 줄 오른쪽 밖에서
 * 미끄러져 들어와 맨 뒤에 선다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { OneTurnAtATimeScene, OneTurnAtATimeStepInfo } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 300;
const MARGIN_X = 40;
const CONTENT_W = 620 - MARGIN_X * 2;
const GAP = 14;
const QUEUE_Y = 78;
const RUNNING_Y = 154;
const FINISHED_Y = 230;
const BOX_H = 46;
const ANIM_MS = 450;

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

type Geo = {
  boxW: number;
  laneX: (index: number) => number;
};

function geometryFor(tasksCount: number): Geo {
  const n = Math.max(1, tasksCount);
  const raw = (CONTENT_W - (n - 1) * GAP) / n;
  const boxW = Math.max(70, Math.min(140, raw));
  return { boxW, laneX: (index: number) => MARGIN_X + index * (boxW + GAP) };
}

function labelFor(id: string, t: Translate): string {
  switch (id) {
    case 'clickA':
      return t('label.clickA', 'Click A');
    case 'timer':
      return t('label.timer', 'Timer');
    case 'clickB':
      return t('label.clickB', 'Click B');
    default:
      throw new Error(`oneTurnAtATimeStage: 알 수 없는 태스크 id: ${id}`);
  }
}

function taskIndex(scene: OneTurnAtATimeScene, id: string): number {
  const i = scene.tasks.findIndex((tk) => tk.id === id);
  if (i < 0) throw new Error(`oneTurnAtATimeStage: 알 수 없는 태스크 id: ${id}`);
  return i;
}

function captionFor(step: OneTurnAtATimeStepInfo, t: Translate): string {
  if (step.kind === 'initial') return t('caption.initial', 'The queue is set. Nothing runs yet.');
  const task = labelFor(step.id, t);
  if (step.done) return t('caption.finish', '{task}: runs to the end.', { task });
  if (step.dequeued) return t('caption.dequeue', '{task}: taken from the queue, starts running.', { task });
  return t('caption.progress', '{task}: keeps running. Unit {u} of {total}.', { task, u: step.u, total: step.total });
}

function arriveNoteFor(step: OneTurnAtATimeStepInfo, t: Translate): string | null {
  if (step.kind !== 'unit' || step.arrived === null) return null;
  return t('caption.arrive', '{task}: lines up at the back of the queue.', { task: labelFor(step.arrived, t) });
}

type Placement = { x: number; y: number };

function placementsOf(scene: OneTurnAtATimeScene, geo: Geo): Map<string, Placement> {
  const out = new Map<string, Placement>();
  scene.queue.forEach((id, i) => out.set(id, { x: geo.laneX(i), y: QUEUE_Y }));
  if (scene.running) out.set(scene.running.id, { x: geo.laneX(0), y: RUNNING_Y });
  scene.finished.forEach((id, i) => out.set(id, { x: geo.laneX(i), y: FINISHED_Y }));
  return out;
}

function drawLaneBg(svg: SVGSVGElement, x: number, y: number, w: number, palette: Palette): void {
  const rect = el('rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(BOX_H));
  rect.setAttribute('rx', String(parseFloat(radii.md)));
  rect.setAttribute('fill', palette.bgSubtle);
  rect.setAttribute('stroke', palette.border);
  svg.appendChild(rect);
}

function drawLabel(svg: SVGSVGElement, x: number, y: number, text: string, palette: Palette): void {
  const t = el('text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-family', fonts.body);
  t.setAttribute('font-size', fontSizes.xs);
  t.setAttribute('fill', palette.textMuted);
  t.textContent = text;
  svg.appendChild(t);
}

function buildToken(
  id: string,
  scene: OneTurnAtATimeScene,
  geo: Geo,
  pos: Placement,
  isRunning: boolean,
  palette: Palette,
  tr: Translate,
): SVGGElement {
  const g = el('g');
  g.setAttribute('data-token', id);
  g.setAttribute('transform', `translate(${round(pos.x)}, ${round(pos.y)})`);

  const rect = el('rect');
  rect.setAttribute('width', String(geo.boxW));
  rect.setAttribute('height', String(BOX_H));
  rect.setAttribute('rx', String(parseFloat(radii.md)));
  const palIdx = taskIndex(scene, id);
  const fill = categorical(Math.max(scene.tasks.length, 1), 'vivid')[palIdx] ?? palette.itemDefault;
  rect.setAttribute('fill', fill);
  if (isRunning) {
    rect.setAttribute('stroke', palette.itemActive);
    rect.setAttribute('stroke-width', '3');
  } else {
    rect.setAttribute('stroke', 'none');
  }
  g.appendChild(rect);

  const half = BOX_H / 2;
  const label = el('text');
  label.setAttribute('x', String(geo.boxW / 2));
  label.setAttribute('y', String(isRunning ? half - 8 : half + 4));
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-family', fonts.body);
  label.setAttribute('font-size', fontSizes.sm);
  label.setAttribute('fill', palette.stateInk);
  label.textContent = labelFor(id, tr);
  g.appendChild(label);

  if (isRunning && scene.running) {
    const { total, done } = scene.running;
    const dotR = 4;
    const dotGap = 12;
    const totalW = (total - 1) * dotGap;
    const startX = geo.boxW / 2 - totalW / 2;
    for (let i = 0; i < total; i += 1) {
      const dot = el('circle');
      dot.setAttribute('data-dot', String(i));
      dot.setAttribute('cx', String(round(startX + i * dotGap)));
      dot.setAttribute('cy', String(half + 14));
      dot.setAttribute('r', String(i < done ? dotR : 0.001));
      dot.setAttribute('fill', i < done ? palette.itemActive : palette.bg);
      dot.setAttribute('stroke', palette.border);
      dot.setAttribute('stroke-width', '1');
      g.appendChild(dot);
    }
  }

  return g;
}

type MountCtx = { svg: SVGSVGElement; t: Translate; palette: Palette };

function drawStatic(scene: OneTurnAtATimeScene, ctx: MountCtx): void {
  const { svg, t, palette } = ctx;
  svg.textContent = '';
  const geo = geometryFor(scene.tasks.length);

  const cap1 = el('text');
  cap1.setAttribute('x', String(MARGIN_X));
  cap1.setAttribute('y', '26');
  cap1.setAttribute('font-family', fonts.body);
  cap1.setAttribute('font-size', fontSizes.md);
  cap1.setAttribute('fill', palette.text);
  cap1.textContent = captionFor(scene.step, t);
  svg.appendChild(cap1);

  const note = arriveNoteFor(scene.step, t);
  if (note !== null) {
    const cap2 = el('text');
    cap2.setAttribute('x', String(MARGIN_X));
    cap2.setAttribute('y', '44');
    cap2.setAttribute('font-family', fonts.body);
    cap2.setAttribute('font-size', fontSizes.sm);
    cap2.setAttribute('fill', palette.textMuted);
    cap2.textContent = note;
    svg.appendChild(cap2);
  }

  drawLaneBg(svg, MARGIN_X, QUEUE_Y, CONTENT_W, palette);
  drawLabel(svg, MARGIN_X, QUEUE_Y - 8, t('label.queueSection', 'Task queue'), palette);

  drawLaneBg(svg, MARGIN_X, RUNNING_Y, geo.boxW, palette);
  drawLabel(svg, MARGIN_X, RUNNING_Y - 8, t('label.runningSection', 'Running'), palette);

  drawLaneBg(svg, MARGIN_X, FINISHED_Y, CONTENT_W, palette);
  drawLabel(svg, MARGIN_X, FINISHED_Y - 8, t('label.finishedSection', 'Finished order'), palette);

  const placements = placementsOf(scene, geo);
  for (const [id, pos] of placements) {
    const isRunning = scene.running?.id === id;
    svg.appendChild(buildToken(id, scene, geo, pos, isRunning, palette, t));
  }
}

function tokenEl(svg: SVGSVGElement, id: string): SVGGElement | null {
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('[data-token]'))) {
    if (g.getAttribute('data-token') === id) return g;
  }
  return null;
}

export const oneTurnAtATimeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const palette = getColors(params.theme);
    const ctx: MountCtx = { svg, t, palette };

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function animate(prev: OneTurnAtATimeScene, next: OneTurnAtATimeScene, mine: number): Promise<void> {
      const geo = geometryFor(next.tasks.length);
      const prevPlacements = placementsOf(prev, geo);
      const nextPlacements = placementsOf(next, geo);

      drawStatic(next, ctx);

      const tracks: Array<{ el: SVGGElement; fromX: number; fromY: number; toX: number; toY: number }> = [];
      for (const [id, to] of nextPlacements) {
        const g = tokenEl(svg, id);
        if (!g) continue;
        const from = prevPlacements.get(id);
        if (from) {
          tracks.push({ el: g, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
        } else {
          tracks.push({ el: g, fromX: MARGIN_X + CONTENT_W + geo.boxW, fromY: to.y, toX: to.x, toY: to.y });
        }
      }
      const dotFill = (() => {
        if (next.step.kind !== 'unit') return null;
        if (!next.running) return null;
        const g = tokenEl(svg, next.running.id);
        if (!g) return null;
        const dot = g.querySelector<SVGCircleElement>(`circle[data-dot="${next.running.done - 1}"]`);
        return dot;
      })();

      return new Promise<void>((resolve) => {
        function finish(): void {
          waiters.delete(finish);
          resolve();
        }
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        waiters.add(finish);
        const dotTargetR = 4;
        const start = performance.now();
        function frame(now: number): void {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (now - start) / ANIM_MS);
          const eased = 1 - (1 - raw) ** 3;
          for (const tr of tracks) {
            const x = tr.fromX + (tr.toX - tr.fromX) * eased;
            const y = tr.fromY + (tr.toY - tr.fromY) * eased;
            tr.el.setAttribute('transform', `translate(${round(x)}, ${round(y)})`);
          }
          if (dotFill) dotFill.setAttribute('r', String(round(dotTargetR * eased)));
          if (raw >= 1) {
            if (mine === gen && !destroyed) drawStatic(next, ctx);
            finish();
            return;
          }
          const id = requestAnimationFrame(frame);
          frames.add(id);
        }
        const id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): void | Promise<void> {
        const mine = (gen += 1);
        const n = next as OneTurnAtATimeScene;
        if (!opts.animate || prev === null) {
          drawStatic(n, ctx);
          return;
        }
        return animate(prev as OneTurnAtATimeScene, n, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
