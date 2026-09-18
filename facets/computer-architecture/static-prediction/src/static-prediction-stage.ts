/**
 * 정적 예측 stage — 틀림이 옮겨 가는 것을 그린다.
 *
 * 왼쪽에 합산 반복의 프로그램이 있고, 두 분기 줄(`beq` 앞으로 · `blt` 뒤로) 곁에 짐작의
 * 바늘이 선다. 규칙을 바꾸면 바늘이 **다른 쪽으로 돈다.** 오른쪽 띠는 원소 k 마다 그
 * 분기가 맞았는지 틀렸는지를 적고, 틀린 칸에서 버린 박자 덩어리가 **날아가 그 분기의
 * 더미에 쌓인다.** 새 판이 시작되면 앞 판의 더미는 점선 윤곽으로 남아, 덩어리가 어느
 * 분기에서 어느 분기로 자리를 옮겼는지 보인다. 왼쪽 아래 막대는 규칙마다 마지막 판에서
 * 잃은 박자다.
 *
 * 세로는 더미가 가장 높을 때(분기 하나에 틀림 10 × 벌칙 2)를 처음부터 잡아 둔다.
 */

import {
  getColors,
  fonts,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 460;

const CODE_X = 64;
const LINE_Y0 = 64;
const LINE_GAP = 30;

const DIAL_X = 292;
const DIAL_R = 14;
/** 바늘 각 — 탄다면 오른쪽(+), 안 탄다면 왼쪽(−). */
const NEEDLE_DEG = 42;

const STRIP_X0 = 360;
const STRIP_DX = 38;
const CELL_W = 30;
const CELL_H = 22;

const PILE_BASE = 412;
const PILE_W = 44;
const BLOCK_H = 7;
const BLOCK_STEP = 9;
/** 더미 하나가 가질 수 있는 가장 많은 덩어리 — 원소 10 개 × 벌칙 2. 세로를 이것으로 잡는다. */
const PILE_MAX = 20;
const PILE_X = [470, 640] as const;

const HIST_X = 176;
const HIST_Y0 = 318;
const HIST_DY = 30;
const HIST_UNIT = 4.5;

const FLY_MS = 380;
const TURN_MS = 420;
const GROW_MS = 420;

/** projector 가 부르는 표면. */
export type StaticPredictionStage = ViewInstance & {
  setPace(speed: number): void;
  setCaption(text: string): void;
  setPolicy(policy: number, forwardGuess: number, backwardGuess: number): void;
  approach(k: number, backward: number): void;
  showBranch(k: number, backward: number, guess: number, taken: number, miss: boolean): void;
  addLoss(k: number, backward: number, cycles: number): void;
  showTally(policy: number, forwardLost: number, backwardLost: number): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function numArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const staticPredictionStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container, params): StaticPredictionStage {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const data = params.initialData ?? {};

    const program = strArray(data.program);
    const values = numArray(data.values);
    const policies = strArray(data.policies);
    const forwardLine = num(data.forwardLine, 1);
    const forwardTarget = num(data.forwardTarget, 3);
    const backwardLine = num(data.backwardLine, 5);
    const backwardTarget = num(data.backwardTarget, 0);
    const n = values.length;

    const lineY = (i: number) => LINE_Y0 + i * LINE_GAP;
    const rowY = [lineY(forwardLine), lineY(backwardLine)] as const;
    const colX = (k: number) => STRIP_X0 + k * STRIP_DX;

    let destroyed = false;
    let pace = 1;

    // ── 애니메이션: 걸린 것을 모두 적어 두고, 되짚기 · 새 판 · 접기에서 끝 상태로 마감한다
    const frames = new Set<number>();
    const pending = new Set<(t: number) => void>();

    function tween(ms: number, draw: (t: number) => void): void {
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      const dur = ms / Math.max(0.25, pace);
      if (destroyed || !raf || isInstant() || dur <= 0) {
        draw(1);
        return;
      }
      pending.add(draw);
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (now: number) => {
        frames.delete(id);
        if (destroyed || !pending.has(draw)) return;
        const t = Math.min(1, (now - t0) / dur);
        if (t >= 1) {
          pending.delete(draw);
          draw(1);
          return;
        }
        draw(ease(t));
        id = raf(tick);
        frames.add(id);
      };
      let id = raf(tick);
      frames.add(id);
    }

    /** 걸려 있던 움직임을 모두 끝 상태로 마감한다. */
    function flush(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      const list = [...pending];
      pending.clear();
      for (const draw of list) draw(1);
    }

    params.onScrubStart?.(flush);

    // ── 배경과 캡션
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const caption = el('text', {
      x: 16, y: 26, fill: c.text, 'font-family': fonts.body, 'font-size': 14,
    }, svg);
    caption.textContent = tr(
      'caption.start',
      'Each branch is guessed before its result is known. Turn the rule and watch where the misses land.',
    );

    // ── 프로그램 글과 뛰는 화살표
    const codeLayer = el('g', {}, svg);
    const lineHi: SVGRectElement[] = [];
    const lineText: SVGTextElement[] = [];
    program.forEach((src, i) => {
      const hi = el('rect', {
        x: CODE_X - 6, y: lineY(i) - 15, width: 196, height: 22, rx: 3, fill: c.accent, opacity: 0,
      }, codeLayer);
      const t = el('text', {
        x: CODE_X, y: lineY(i), fill: c.text, 'font-family': fonts.mono, 'font-size': 13,
      }, codeLayer);
      t.textContent = src;
      lineHi.push(hi);
      lineText.push(t);
    });

    /** 분기 줄에서 목표 줄로 뛰는 화살표. 바늘이 탄다를 가리키면 실선이 된다. */
    function jumpArrow(from: number, to: number, gutter: number): SVGGElement {
      const g = el('g', {}, codeLayer);
      const y1 = lineY(from) - 4;
      const y2 = lineY(to) - 4;
      el('path', {
        d: `M ${CODE_X - 8} ${y1} H ${gutter} V ${y2} H ${CODE_X - 12}`,
        fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5,
      }, g);
      el('path', {
        d: `M ${CODE_X - 8} ${y2} l -6 -4 v 8 z`,
        fill: c.textMuted,
      }, g);
      return g;
    }
    const arrows = [
      jumpArrow(forwardLine, forwardTarget, 42),
      jumpArrow(backwardLine, backwardTarget, 24),
    ];

    // ── 짐작의 바늘 (분기 줄마다 하나)
    const needles: SVGGElement[] = [];
    const needleDeg = [-NEEDLE_DEG, -NEEDLE_DEG];
    for (const row of [0, 1] as const) {
      const cy = rowY[row] - 2;
      const g = el('g', {}, svg);
      el('path', {
        d: `M ${DIAL_X - DIAL_R} ${cy} A ${DIAL_R} ${DIAL_R} 0 0 1 ${DIAL_X + DIAL_R} ${cy}`,
        fill: 'none', stroke: c.border, 'stroke-width': 1.5,
      }, g);
      const nLabel = el('text', {
        x: DIAL_X - 10, y: cy - DIAL_R - 4, 'text-anchor': 'end', fill: c.textMuted,
        'font-family': fonts.body, 'font-size': 10,
      }, g);
      nLabel.textContent = tr('label.notTaken', 'not taken');
      const tLabel = el('text', {
        x: DIAL_X + 10, y: cy - DIAL_R - 4, 'text-anchor': 'start', fill: c.textMuted,
        'font-family': fonts.body, 'font-size': 10,
      }, g);
      tLabel.textContent = tr('label.taken', 'taken');
      const needle = el('g', { transform: `translate(${DIAL_X} ${cy}) rotate(${needleDeg[row]})` }, g);
      el('line', { x1: 0, y1: 2, x2: 0, y2: -DIAL_R - 2, stroke: c.text, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, needle);
      el('circle', { cx: 0, cy: 0, r: 3, fill: c.text }, needle);
      needles.push(needle);
    }

    function turnNeedle(row: 0 | 1, deg: number): void {
      const from = needleDeg[row]!;
      const cy = rowY[row] - 2;
      needleDeg[row] = deg;
      tween(TURN_MS, (t) => {
        const a = from + (deg - from) * t;
        needles[row]!.setAttribute('transform', `translate(${DIAL_X} ${cy}) rotate(${a})`);
      });
    }

    // ── 값 열 (lw r3) 과 되돌이 셈 (addi r1) — 띠의 맞은 줄에 둔다
    const valueRowY = lineY(0);
    const counterRowY = lineY(backwardLine - 1);
    for (let k = 0; k < n; k += 1) {
      const vt = el('text', {
        x: colX(k), y: valueRowY, 'text-anchor': 'middle', fill: values[k] === 0 ? c.text : c.textMuted,
        'font-family': fonts.mono, 'font-size': 13, 'font-weight': values[k] === 0 ? 700 : 400,
      }, svg);
      vt.textContent = String(values[k]);
      const ct = el('text', {
        x: colX(k), y: counterRowY, 'text-anchor': 'middle', fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': 11,
      }, svg);
      ct.textContent = String(k + 1);
    }

    // ── 결과 띠: 행 둘(앞 · 뒤) × 원소 n
    const cells: SVGRectElement[][] = [[], []];
    const marks: SVGGElement[][] = [[], []];
    for (const row of [0, 1] as const) {
      for (let k = 0; k < n; k += 1) {
        const x = colX(k) - CELL_W / 2;
        const y = rowY[row] - CELL_H / 2 - 4;
        cells[row].push(el('rect', {
          x, y, width: CELL_W, height: CELL_H, rx: 3, fill: 'none', stroke: c.border, 'stroke-width': 1,
        }, svg));
        marks[row].push(el('g', {}, svg));
      }
    }
    let cursor: [number, number] | null = null;

    function paintCursor(next: [number, number] | null): void {
      if (cursor) {
        const [r, k] = cursor;
        const cell = cells[r]![k];
        if (cell && cell.dataset.state === undefined) {
          cell.setAttribute('stroke', c.border);
          cell.setAttribute('stroke-width', '1');
        }
      }
      cursor = next;
      for (const hi of lineHi) hi.setAttribute('opacity', '0');
      for (const t of lineText) t.setAttribute('fill', c.text);
      if (!next) return;
      const line = next[0] === 0 ? forwardLine : backwardLine;
      lineHi[line]?.setAttribute('opacity', '1');
      lineText[line]?.setAttribute('fill', c.stateInk);
    }

    // ── 더미: 분기마다 버린 박자가 쌓이는 곳
    const pileLayer = el('g', {}, svg);
    const ghosts = PILE_X.map((x) => el('rect', {
      x: x - PILE_W / 2 - 3, y: PILE_BASE, width: PILE_W + 6, height: 0,
      fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0,
    }, pileLayer));
    const pileGroups = PILE_X.map(() => el('g', {}, pileLayer));
    const pileCounts = PILE_X.map((x) => el('text', {
      x, y: PILE_BASE - 6, 'text-anchor': 'middle', fill: c.text,
      'font-family': fonts.mono, 'font-size': 13, 'font-weight': 700,
    }, pileLayer));
    PILE_X.forEach((x, row) => {
      el('line', {
        x1: x - PILE_W / 2 - 10, y1: PILE_BASE + 1, x2: x + PILE_W / 2 + 10, y2: PILE_BASE + 1,
        stroke: c.border, 'stroke-width': 1.5,
      }, pileLayer);
      const lab = el('text', {
        x, y: PILE_BASE + 20, 'text-anchor': 'middle', fill: c.textMuted,
        'font-family': fonts.body, 'font-size': 12,
      }, pileLayer);
      lab.textContent = row === 0
        ? tr('label.forward', 'forward branch')
        : tr('label.backward', 'backward branch');
      const src = el('text', {
        x, y: PILE_BASE + 36, 'text-anchor': 'middle', fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': 11,
      }, pileLayer);
      src.textContent = (program[row === 0 ? forwardLine : backwardLine] ?? '').replace(/^\w+:\s*/, '');
    });
    const shown = [0, 0];
    const target = [0, 0];
    const lastRun = [0, 0];
    const flyLayer = el('g', {}, svg);

    const slotY = (i: number) => PILE_BASE - (i + 1) * BLOCK_STEP + (BLOCK_STEP - BLOCK_H);

    function drawPile(row: number): void {
      const g = pileGroups[row]!;
      while (g.firstChild) g.removeChild(g.firstChild);
      const x = PILE_X[row]! - PILE_W / 2;
      const count = Math.min(shown[row]!, PILE_MAX);
      for (let i = 0; i < count; i += 1) {
        el('rect', { x, y: slotY(i), width: PILE_W, height: BLOCK_H, rx: 1.5, fill: c.danger }, g);
      }
      const label = pileCounts[row]!;
      label.textContent = shown[row]! > 0 ? String(shown[row]) : '';
      label.setAttribute('y', String(PILE_BASE - count * BLOCK_STEP - 6));
    }

    // ── 규칙마다 마지막 판에서 잃은 박자
    const histTitle = el('text', {
      x: 16, y: HIST_Y0 - 30, fill: c.textMuted, 'font-family': fonts.body, 'font-size': 12,
    }, svg);
    histTitle.textContent = tr('label.history', 'Cycles lost, last run per rule');
    const policyName = (i: number): string => {
      switch (policies[i]) {
        case 'never': return tr('policy.never', 'never taken');
        case 'always': return tr('policy.always', 'always taken');
        case 'backward': return tr('policy.backward', 'backward taken');
        default: return policies[i] ?? '';
      }
    };
    const histMarker: SVGRectElement[] = [];
    const histFwd: SVGRectElement[] = [];
    const histBack: SVGRectElement[] = [];
    const histNum: SVGTextElement[] = [];
    const histWidth = policies.map(() => [0, 0]);
    policies.forEach((_, i) => {
      const y = HIST_Y0 + i * HIST_DY;
      histMarker.push(el('rect', { x: 10, y: y - 13, width: 4, height: 18, rx: 1, fill: c.accent, opacity: 0 }, svg));
      const name = el('text', {
        x: 20, y, fill: c.text, 'font-family': fonts.body, 'font-size': 12,
      }, svg);
      name.textContent = policyName(i);
      el('line', { x1: HIST_X, y1: y - 12, x2: HIST_X, y2: y + 4, stroke: c.border }, svg);
      histFwd.push(el('rect', { x: HIST_X, y: y - 10, width: 0, height: 12, fill: c.danger, opacity: 0.55 }, svg));
      histBack.push(el('rect', { x: HIST_X, y: y - 10, width: 0, height: 12, fill: c.danger }, svg));
      histNum.push(el('text', {
        x: HIST_X + 6, y, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': 11,
      }, svg));
    });

    function drawHist(i: number, fw: number, bw: number): void {
      histFwd[i]!.setAttribute('width', String(fw));
      histBack[i]!.setAttribute('x', String(HIST_X + fw));
      histBack[i]!.setAttribute('width', String(bw));
    }

    const instance: StaticPredictionStage = {
      setPace(speed: number) {
        pace = Number.isFinite(speed) && speed > 0 ? speed : 1;
      },

      setCaption(text: string) {
        caption.textContent = text;
      },

      setPolicy(policy: number, forwardGuess: number, backwardGuess: number) {
        flush();
        // 바늘이 규칙의 짐작대로 돈다 — 앞 분기 · 뒤 분기
        const guessFwd = forwardGuess === 1;
        const guessBack = backwardGuess === 1;
        turnNeedle(0, guessFwd ? NEEDLE_DEG : -NEEDLE_DEG);
        turnNeedle(1, guessBack ? NEEDLE_DEG : -NEEDLE_DEG);
        arrows[0]!.setAttribute('opacity', guessFwd ? '1' : '0.35');
        arrows[1]!.setAttribute('opacity', guessBack ? '1' : '0.35');
        histMarker.forEach((m, i) => m.setAttribute('opacity', i === policy ? '1' : '0'));

        // 앞 판의 더미는 점선 윤곽으로 남는다 — 덩어리가 어디서 어디로 옮겨 가는지 견줄 자리
        for (const row of [0, 1]) {
          lastRun[row] = shown[row]!;
          const h = Math.min(lastRun[row]!, PILE_MAX) * BLOCK_STEP;
          const ghost = ghosts[row]!;
          ghost.setAttribute('y', String(PILE_BASE - h - 3));
          ghost.setAttribute('height', String(h + 3));
          ghost.setAttribute('opacity', lastRun[row]! > 0 ? '1' : '0');
          shown[row] = 0;
          target[row] = 0;
          drawPile(row);
        }

        // 띠를 비운다
        paintCursor(null);
        for (const row of [0, 1]) {
          for (let k = 0; k < n; k += 1) {
            const cell = cells[row]![k]!;
            delete cell.dataset.state;
            cell.setAttribute('fill', 'none');
            cell.setAttribute('stroke', c.border);
            cell.setAttribute('stroke-width', '1');
            const m = marks[row]![k]!;
            while (m.firstChild) m.removeChild(m.firstChild);
          }
        }
      },

      approach(k: number, backward: number) {
        const row = backward ? 1 : 0;
        const cell = cells[row]?.[k];
        if (!cell) return;
        paintCursor([row, k]);
        cell.setAttribute('stroke', c.accent);
        cell.setAttribute('stroke-width', '3');
      },

      showBranch(k: number, backward: number, _guess: number, _taken: number, miss: boolean) {
        const row = backward ? 1 : 0;
        const cell = cells[row]?.[k];
        const m = marks[row]?.[k];
        if (!cell || !m) return;
        paintCursor([row, k]);
        cell.dataset.state = miss ? 'miss' : 'hit';
        const cx = colX(k);
        const cy = rowY[row] - 4;
        if (miss) {
          cell.setAttribute('fill', 'none');
          cell.setAttribute('stroke', c.danger);
          cell.setAttribute('stroke-width', '2');
          el('path', {
            d: `M ${cx - 5} ${cy - 5} L ${cx + 5} ${cy + 5} M ${cx + 5} ${cy - 5} L ${cx - 5} ${cy + 5}`,
            stroke: c.danger, 'stroke-width': 2.2, 'stroke-linecap': 'round',
          }, m);
        } else {
          cell.setAttribute('fill', c.bgSubtle);
          cell.setAttribute('stroke', c.border);
          cell.setAttribute('stroke-width', '1');
          el('circle', { cx, cy, r: 5, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.6 }, m);
        }
      },

      addLoss(k: number, backward: number, cycles: number) {
        const row = backward ? 1 : 0;
        const fromX = colX(k) - PILE_W / 4;
        const fromY = rowY[row] - 4;
        const toX = PILE_X[row]! - PILE_W / 2;
        for (let j = 0; j < cycles; j += 1) {
          const slot = target[row]!;
          target[row] = slot + 1;
          const toY = slotY(Math.min(slot, PILE_MAX - 1));
          const block = el('rect', {
            x: fromX, y: fromY + j * BLOCK_STEP, width: PILE_W / 2, height: BLOCK_H, rx: 1.5, fill: c.danger,
          }, flyLayer);
          const sx = fromX;
          const sy = fromY + j * BLOCK_STEP;
          tween(FLY_MS + j * 90, (t) => {
            if (t >= 1) {
              block.remove();
              shown[row] = shown[row]! + 1;
              drawPile(row);
              return;
            }
            // 위로 살짝 떴다가 더미로 떨어진다
            const x = sx + (toX - sx) * t;
            const y = sy + (toY - sy) * t - Math.sin(Math.PI * t) * 40;
            const w = PILE_W / 2 + (PILE_W / 2) * t;
            block.setAttribute('x', String(x));
            block.setAttribute('y', String(y));
            block.setAttribute('width', String(w));
          });
        }
      },

      showTally(policy: number, forwardLost: number, backwardLost: number) {
        paintCursor(null);
        const i = policy;
        if (!histFwd[i]) return;
        const [fw0, bw0] = histWidth[i]!;
        const fw1 = forwardLost * HIST_UNIT;
        const bw1 = backwardLost * HIST_UNIT;
        histWidth[i] = [fw1, bw1];
        histNum[i]!.textContent = String(forwardLost + backwardLost);
        tween(GROW_MS, (t) => {
          const fw = fw0! + (fw1 - fw0!) * t;
          const bw = bw0! + (bw1 - bw0!) * t;
          drawHist(i, fw, bw);
          histNum[i]!.setAttribute('x', String(HIST_X + fw + bw + 6));
        });
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        pending.clear();
      },
    };

    return instance;
  },
};
