/**
 * demote-on-overuse stage — 줄 셋이 위아래로 쌓여 있고, 오른쪽에 CPU 기둥 하나와 끝난 자리가 있다.
 *
 * 화면이 쥐는 것은 **각 프로세스가 몇 번째 줄에 있는가** 다. 프로세스 칩은 늘 제 줄의 높이에 있다 —
 * 줄에 서 있을 때도, CPU 기둥 안에서 돌 때도(기둥 안 그 줄의 칸), 끝난 뒤에도(끝난 자리의 그 줄 칸).
 *
 * 운동 (한 걸음 = 틱 경계 하나)
 *   가. 방금까지 돌던 것의 몫 칸이 쓴 틱만큼 차오르고 남은 양이 줄어든다
 *   나. 몫을 다 쓴 것은 CPU 기둥에서 한 단 아래 줄로 **내려앉는다**. 끝난 것은 제 줄 높이 그대로 끝난 자리로
 *       옆걸음한다. 도착한 것은 줄 0 왼쪽 밖에서 걸어 들어온다
 *   다. 고른 것이 제 줄 맨 앞에서 CPU 기둥의 같은 높이로 옮겨 가고, 뒤에 선 것이 한 칸 당겨진다
 */
import {
  categorical,
  depthVeil,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { DemoteScene, DemoteStep } from './scene.js';

const H = 344;
const SVG = 'http://www.w3.org/2000/svg';

const TICK_Y = 18;
const HEAD_Y = 44;
const LANES_Y = 52;
const LANES_H = 216;
const CAPTION_Y = 292;
const CAPTION_GAP = 20;
const LABEL_W = 76;
const GUT = 12;
const TOKEN_H = 40;
const TOKEN_W_MAX = 88;
const CELL_H = 10;
const CELL_GAP = 4;

/** 깊이 베일을 옅게 — 줄 글자와 칩이 가장 아래 줄에서도 읽히게 */
const VEIL_SCALE = 0.3;

const FILL_MS = 130;
const DROP_MS = 440;
const PICK_MS = 380;

type Pt = { x: number; y: number };

function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  parent.appendChild(node);
  return node;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 0.6 칸 (굵은 글씨 기준) */
function guessWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? px : px * 0.6;
  return w;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const demoteOnOveruseStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    // 폭에서 역산 — 줄 칸은 칩 둘, 끝난 자리도 칩 둘이 들어갈 만큼
    const tokenW = Math.min(TOKEN_W_MAX, Math.floor((W - LABEL_W - 2 * GUT - 80) / 5));
    const queueX = LABEL_W;
    const queueW = 2 * tokenW + 24;
    const cpuX = queueX + queueW + GUT;
    const cpuW = tokenW + 24;
    const doneX = cpuX + cpuW + GUT;
    const doneW = W - doneX - 4;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 매번 새로 짓는 손잡이
    let tokens = new Map<string, SVGGElement>();
    let leftTexts = new Map<string, SVGTextElement>();
    let cells: SVGRectElement[][] = [];

    function nameOf(id: string): string {
      switch (id) {
        case 'crunch':
          return t('label.crunch', 'Big compute');
        case 'edit':
          return t('label.edit', 'Typing');
        case 'ls':
          return t('label.ls', 'File list');
        default:
          return id.toUpperCase();
      }
    }

    function laneH(s: DemoteScene): number {
      return LANES_H / s.quanta.length;
    }
    function laneTop(s: DemoteScene, level: number): number {
      return LANES_Y + level * laneH(s);
    }
    function tokenY(s: DemoteScene, level: number): number {
      return laneTop(s, level) + Math.max(2, (laneH(s) - 4 - TOKEN_H - CELL_H - 6) / 2);
    }
    function slot(x0: number, w: number, index: number, count: number): number {
      const pitch = count <= 1 ? 0 : Math.min(tokenW + 8, (w - 12 - tokenW) / (count - 1));
      return x0 + 6 + index * pitch;
    }
    function queuePt(s: DemoteScene, level: number, index: number, count: number): Pt {
      return { x: slot(queueX, queueW, index, count), y: tokenY(s, level) };
    }
    function cpuPt(s: DemoteScene, level: number): Pt {
      return { x: cpuX + (cpuW - tokenW) / 2, y: tokenY(s, level) };
    }
    function donePt(s: DemoteScene, id: string, level: number): Pt {
      const same = s.done.filter((d) => s.procs.find((p) => p.id === d)?.level === level);
      return { x: slot(doneX, doneW, same.indexOf(id), same.length), y: tokenY(s, level) };
    }
    function finalPt(s: DemoteScene, id: string): Pt | null {
      const p = s.procs.find((x) => x.id === id);
      if (p === undefined || p.where === 'absent') return null;
      if (p.where === 'running') return cpuPt(s, p.level);
      if (p.where === 'done') return donePt(s, id, p.level);
      const q = s.queues[p.level] ?? [];
      return queuePt(s, p.level, q.indexOf(id), q.length);
    }

    function place(g: SVGGElement, pt: Pt): void {
      g.setAttribute('transform', `translate(${r1(pt.x)},${r1(pt.y)})`);
    }

    function quantumOf(s: DemoteScene, level: number): number {
      const q = s.quanta[level];
      if (q === undefined) throw new Error(`demote-on-overuse stage: 줄 ${level} 이 없다`);
      return q;
    }

    function captions(step: DemoteStep | null, s: DemoteScene): string[] {
      if (step === null) return [];
      const lines: string[] = [];
      if (step.finished !== null) {
        lines.push(
          t('caption.finish', '{name} finishes, still in queue {level}', {
            name: nameOf(step.finished.id),
            level: step.finished.level,
          }),
        );
      }
      if (step.demoted !== null) {
        const d = step.demoted;
        const q = quantumOf(s, d.from);
        lines.push(
          d.from === d.to
            ? t('caption.stay', '{name} used its whole quantum ({q}) · already at the bottom, stays in queue {level}', {
                name: nameOf(d.id),
                q,
                level: d.to,
              })
            : t('caption.demote', '{name} used its whole quantum ({q}) · queue {from} → {to}', {
                name: nameOf(d.id),
                q,
                from: d.from,
                to: d.to,
              }),
        );
      }
      for (const id of step.arrived) {
        lines.push(t('caption.arrive', '{name} arrives · joins queue {level}', { name: nameOf(id), level: 0 }));
      }
      if (step.ran !== null) {
        lines.push(
          t('caption.run', '{name} gets the CPU · queue {level}, quantum {q}', {
            name: nameOf(step.ran.id),
            level: step.ran.level,
            q: quantumOf(s, step.ran.level),
          }),
        );
      }
      return lines;
    }

    function drawStatic(s: DemoteScene): void {
      svg.textContent = '';
      tokens = new Map();
      leftTexts = new Map();
      cells = [];

      const lh = laneH(s);
      const qmax = Math.max(...s.quanta);
      const cellW = Math.min(20, (tokenW - (qmax - 1) * CELL_GAP) / qmax);

      if (s.tick !== null) {
        el('text', { x: 8, y: TICK_Y, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text, 'font-weight': 600 }, svg)
          .textContent = t('label.tick', 'Tick {tick}', { tick: s.tick });
      }

      const head = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted };
      el('text', { ...head, x: queueX + 6, y: HEAD_Y }, svg).textContent = t('label.waiting', 'Waiting');
      el('text', { ...head, x: cpuX + cpuW / 2, y: HEAD_Y, 'text-anchor': 'middle' }, svg).textContent = t('label.cpu', 'CPU');
      el('text', { ...head, x: doneX + 6, y: HEAD_Y }, svg).textContent = t('label.done', 'Done');

      // 줄 — 아래로 갈수록 짙다
      s.quanta.forEach((q, level) => {
        const top = laneTop(s, level);
        const veil = depthVeil(level, params.theme);
        el('rect', { x: 0, y: top, width: W, height: lh - 4, rx: 6, fill: c.bgSubtle }, svg);
        el('rect', { x: 0, y: top, width: W, height: lh - 4, rx: 6, fill: veil.fill, 'fill-opacity': veil.alpha * VEIL_SCALE }, svg);
        el('text', { x: 8, y: top + lh / 2 - 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text }, svg)
          .textContent = t('label.queue', 'Queue {level}', { level });
        el('text', { x: 8, y: top + lh / 2 + 12, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, svg)
          .textContent = t('label.quantum', 'Quantum: {q}', { q });
      });

      // CPU 기둥 하나 — 칸마다 그 줄의 몫이 칸으로 놓인다
      el('rect', { x: cpuX, y: LANES_Y - 2, width: cpuW, height: LANES_H, rx: 8, fill: 'none', stroke: c.primary, 'stroke-width': 1.5 }, svg);
      s.quanta.forEach((q, level) => {
        const row: SVGRectElement[] = [];
        const x0 = cpuPt(s, level).x;
        const y = tokenY(s, level) + TOKEN_H + 6;
        for (let k = 0; k < q; k += 1) {
          row.push(el('rect', { x: x0 + k * (cellW + CELL_GAP), y, width: cellW, height: CELL_H, rx: 2, fill: c.bg, stroke: c.border }, svg));
        }
        cells.push(row);
      });

      // 프로세스 칩
      const hues = categorical(s.procs.length, 'vivid');
      const layer = el('g', {}, svg);
      s.procs.forEach((p, i) => {
        const pt = finalPt(s, p.id);
        if (pt === null) return;
        const g = el('g', {}, layer);
        if (p.where === 'done') g.setAttribute('opacity', '0.5');
        place(g, pt);
        const hue = hues[i] ?? c.text;
        el('rect', { x: 0, y: 0, width: tokenW, height: TOKEN_H, rx: 6, fill: c.bg, stroke: hue, 'stroke-width': p.where === 'running' ? 3 : 2 }, g);
        el('rect', { x: 0, y: 0, width: 5, height: TOKEN_H, rx: 2, fill: hue }, g);
        const name = nameOf(p.id);
        const nameEl = el('text', { x: 11, y: 17, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text }, g);
        nameEl.textContent = name;
        // 칩 폭을 넘을 만한 이름(언어마다 길이가 다르다)은 칩 안으로 눌러 담는다
        const room = tokenW - 16;
        if (guessWidth(name, parseFloat(fontSizes.sm)) > room) {
          nameEl.setAttribute('textLength', String(room));
          nameEl.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
        const left = el('text', { x: 11, y: 32, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, g);
        left.textContent = t('label.left', 'Left: {n}', { n: p.left });
        tokens.set(p.id, g);
        leftTexts.set(p.id, left);
      });

      const lines = captions(s.step, s);
      lines.forEach((line, i) => {
        el('text', { x: 8, y: CAPTION_Y + i * CAPTION_GAP, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, svg)
          .textContent = line;
      });
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, 16);
          timers.add(id);
        };
        frame();
      });
    }

    const alive = (mine: number): boolean => mine === gen && !destroyed;
    const lerp = (a: Pt, b: Pt, p: number): Pt => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
    const same = (a: Pt, b: Pt): boolean => r1(a.x) === r1(b.x) && r1(a.y) === r1(b.y);

    async function animate(s: DemoteScene, step: DemoteStep, mine: number): Promise<void> {
      // 고르기 직전의 줄 — 고른 것을 제 줄 맨 앞에 되돌려 둔 모양
      const inter = s.queues.map((q) => q.slice());
      if (step.ran !== null) inter[step.ran.level]?.unshift(step.ran.id);
      const interPt = (id: string): Pt | null => {
        for (let level = 0; level < inter.length; level += 1) {
          const q = inter[level] ?? [];
          const i = q.indexOf(id);
          if (i >= 0) return queuePt(s, level, i, q.length);
        }
        return null;
      };

      const leaving: { id: string; used: number; from: number } | null =
        step.demoted !== null
          ? { id: step.demoted.id, used: step.demoted.used, from: step.demoted.from }
          : step.finished !== null
            ? { id: step.finished.id, used: step.finished.used, from: step.finished.level }
            : null;

      type Move = { g: SVGGElement; start: Pt; mid: Pt; end: Pt; enter: boolean };
      const moves: Move[] = [];
      for (const p of s.procs) {
        const g = tokens.get(p.id);
        const end = finalPt(s, p.id);
        if (g === undefined || end === null) continue;
        const mid = interPt(p.id) ?? end;
        const enter = step.arrived.includes(p.id);
        let start: Pt;
        if (leaving !== null && leaving.id === p.id) start = cpuPt(s, leaving.from);
        else if (enter) start = { x: -tokenW - 8, y: tokenY(s, 0) };
        else start = mid;
        moves.push({ g, start, mid, end, enter });
      }

      // 아직 못 온 만큼 — 첫 프레임에 끝 자리가 번쩍이지 않게
      for (const m of moves) {
        place(m.g, m.start);
        if (m.enter) m.g.setAttribute('opacity', '0');
      }

      // 가. 몫 칸이 쓴 틱만큼 차오른다
      if (leaving !== null && leaving.used > 0) {
        const leftEl = leftTexts.get(leaving.id);
        const after = step.demoted !== null ? step.demoted.left : 0;
        const before = after + leaving.used;
        if (leftEl !== undefined) leftEl.textContent = t('label.left', 'Left: {n}', { n: before });
        const row = cells[leaving.from] ?? [];
        for (let k = 0; k < leaving.used; k += 1) {
          const cell = row[k];
          await tween(FILL_MS, mine, (p) => {
            if (p >= 1 && cell !== undefined) cell.setAttribute('fill', c.accent);
          });
          if (!alive(mine)) return;
          if (leftEl !== undefined) leftEl.textContent = t('label.left', 'Left: {n}', { n: before - k - 1 });
        }
      }

      // 나. 내려앉고, 끝난 자리로 옮기고, 걸어 들어온다
      const drop = moves.filter((m) => !same(m.start, m.mid) || m.enter);
      if (drop.length > 0) {
        await tween(DROP_MS, mine, (p) => {
          for (const m of drop) {
            place(m.g, lerp(m.start, m.mid, p));
            if (m.enter) m.g.setAttribute('opacity', String(r1(p)));
          }
        });
        if (!alive(mine)) return;
      }

      // 다. 고른 것이 CPU 기둥의 제 줄 높이로, 뒤가 당겨진다
      const pick = moves.filter((m) => !same(m.mid, m.end));
      if (pick.length > 0) {
        await tween(PICK_MS, mine, (p) => {
          for (const m of pick) place(m.g, lerp(m.mid, m.end, p));
        });
      }
    }

    return {
      async render(next: DemoteScene, _prev: DemoteScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animate(next, next.step, mine);
        if (alive(mine)) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
