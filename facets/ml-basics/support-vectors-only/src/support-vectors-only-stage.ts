/**
 * support-vectors-only-stage — 지워도 안 움직인다 ↔ 건드리면 따라온다.
 *
 * 이 조각의 어려움은 **아무 일도 일어나지 않는 것을 보이는 일**이다. 선이 안
 * 움직였다는 것은 화면에서 정지와 구별되지 않으므로, 손질마다 선을 **다시 푸는
 * 장면**을 실제로 보인다. 탐침이 무리의 무게중심을 축으로 방향을 훑다가 자리를
 * 잡는데, 처음 선이 유령 띠로 그 자리에 남아 있어 탐침이 **그 위로 되돌아오는지
 * 아래로 내려앉는지**가 보인다. 움직임이 있었는데 결과가 같은 것 — 그것이 이
 * 조각이 말하려는 바다.
 *
 * 화면은 둘로 갈린다.
 *   왼쪽   점이 놓인 무대. 산점도는 주인공이 아니라 손질이 벌어지는 자리다.
 *   오른쪽 선의 자리 기록. 풀이가 끝날 때마다 선의 단면(띠 가장자리 둘과 그
 *          한가운데)이 무대에서 떨어져 나와 기둥으로 날아가 쌓인다. 처음 자리에
 *          가로 점선이 그어져 있어, 그대로인 것은 점선에 얹히고 움직인 것은
 *          점선 아래로 어긋난 채 짧아진다. 손질 셋의 결과가 한눈에 나란히 선다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

export type StagePoint = { x: number; y: number; group: 'A' | 'B' };

export type StageSolution = {
  slope: number;
  intercept: number;
  lower: number;
  upper: number;
  margin: number;
  supports: number[];
  verdict: 'first' | 'same' | 'moved';
};

// ── 좁히기. mount 의 initialData 와 projector 의 payload 가 같은 한 벌을 쓴다.

export function readStagePoints(value: unknown): StagePoint[] {
  if (!Array.isArray(value)) return [];
  const out: StagePoint[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.x !== 'number' || typeof rec.y !== 'number') continue;
    out.push({ x: rec.x, y: rec.y, group: rec.group === 'B' ? 'B' : 'A' });
  }
  return out;
}

export function readIndexList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

export function readStageSolution(value: unknown): StageSolution | null {
  if (typeof value !== 'object' || value === null) return null;
  const rec = value as Record<string, unknown>;
  const { slope, intercept, lower, upper, margin } = rec;
  if (
    typeof slope !== 'number' ||
    typeof intercept !== 'number' ||
    typeof lower !== 'number' ||
    typeof upper !== 'number' ||
    typeof margin !== 'number'
  ) {
    return null;
  }
  const verdict = rec.verdict === 'same' ? 'same' : rec.verdict === 'moved' ? 'moved' : 'first';
  return {
    slope,
    intercept,
    lower,
    upper,
    margin,
    supports: readIndexList(rec.supports),
    verdict,
  };
}

/** 손질이 점을 옮겨 가는 자리. 무대의 배율이 그것까지 담아야 한다. */
function readMoveTargets(value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { x: number; y: number }[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec.toX !== 'number' || typeof rec.toY !== 'number') continue;
    out.push({ x: rec.toX, y: rec.toY });
  }
  return out;
}

function countEdits(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

// ── 판

const W = PIECE_CANVAS_W;
const H = 430;

const EDGE = 14;
const CAPTION_BASELINE = 23;
const PANEL_TOP = 38;
const PANEL_BOTTOM = 416;
/** 무대는 좁고 높다 — 자료가 x 로 여섯 칸, y 로 열한 칸이라 가로를 더 줘도 남는다. */
const PLOT_L = EDGE;
const PLOT_R = 228;
const LEDGER_L = 252;
const LEDGER_R = W - EDGE;

const LEDGER_TITLE_BASELINE = 57;
const LEDGER_LEGEND_Y = 72;
const BADGE_CY = 97;
const BADGE_R = 11;
const GAUGE_TOP = 120;
const GAUGE_BOTTOM = 386;
const COLUMN_LABEL_BASELINE = 403;

const DOT_R = 5.5;
const RING_R = 10;

const PLACE_MS = 460;
const SWEEP_MS = 620;
const BAND_MS = 280;
const FLY_MS = 520;
const RING_MS = 260;
const PULSE_MS = 420;
const DROP_MS = 480;
const RESTORE_MS = 440;
const MOVE_MS = 560;
const CONCLUDE_MS = 420;

/** 탐침이 훑고 오는 각. 이만큼 어긋난 데서 시작해 답으로 좁혀 든다. */
const SWEEP_ARC = 1.25;

const SVG_NS = 'http://www.w3.org/2000/svg';

let mountSeq = 0;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const supportVectorsOnlyStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const classTone = categorical(2, 'vivid');
    const colorOf = (group: 'A' | 'B'): string => (group === 'A' ? classTone[0] : classTone[1]);

    const clipId = `svo-plot-${(mountSeq += 1)}`;

    // ── 걸어 둔 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    function animate(ms: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const t = clamp01((Date.now() - started) / ms);
          draw(t);
          if (t >= 1) {
            finish();
            return;
          }
          const next = requestAnimationFrame(() => {
            frames.delete(next);
            tick();
          });
          frames.add(next);
        };
        const first = requestAnimationFrame(() => {
          frames.delete(first);
          tick();
        });
        frames.add(first);
      });
    }

    // ── 무대의 배율. 선언에는 구조만 있고 자리는 여기서 셈한다 (S-piece).
    const initial = (params.initialData ?? {}) as { points?: unknown; edits?: unknown };
    const seedPoints = readStagePoints(initial.points);
    const moveTargets = readMoveTargets(initial.edits);
    const columnCount = Math.max(1, countEdits(initial.edits) + 1);

    const allX = [...seedPoints.map((p) => p.x), ...moveTargets.map((p) => p.x)];
    const allY = [...seedPoints.map((p) => p.y), ...moveTargets.map((p) => p.y)];
    const PAD = 0.5;
    const dataX0 = allX.length > 0 ? Math.min(...allX) - PAD : 0;
    const dataX1 = allX.length > 0 ? Math.max(...allX) + PAD : 1;
    const dataY0 = allY.length > 0 ? Math.min(...allY) - PAD : 0;
    const dataY1 = allY.length > 0 ? Math.max(...allY) + PAD : 1;
    const spanX = Math.max(1e-6, dataX1 - dataX0);
    const spanY = Math.max(1e-6, dataY1 - dataY0);
    const unit = Math.min((PLOT_R - PLOT_L) / spanX, (PANEL_BOTTOM - PANEL_TOP) / spanY);
    const plotOx = PLOT_L + (PLOT_R - PLOT_L - spanX * unit) / 2;
    const plotOy = PANEL_TOP + (PANEL_BOTTOM - PANEL_TOP - spanY * unit) / 2;
    const px = (x: number): number => plotOx + (x - dataX0) * unit;
    const py = (y: number): number => plotOy + (dataY1 - y) * unit;

    // ── 기록의 눈금. 첫 풀이를 받을 때 범위를 정한다.
    let gaugeLo = 0;
    let gaugeHi = 1;
    const gy = (v: number): number =>
      GAUGE_BOTTOM - ((v - gaugeLo) / (gaugeHi - gaugeLo)) * (GAUGE_BOTTOM - GAUGE_TOP);
    const columnX = (slot: number): number =>
      LEDGER_L + ((LEDGER_R - LEDGER_L) * (slot + 0.5)) / columnCount;

    // ── 켜켜이
    const root = el('g', {});
    svg.appendChild(root);

    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(
      el('rect', {
        x: PLOT_L,
        y: PANEL_TOP,
        width: PLOT_R - PLOT_L,
        height: PANEL_BOTTOM - PANEL_TOP,
      }),
    );
    defs.appendChild(clip);
    root.appendChild(defs);

    const chrome = el('g', {});
    const plotInk = el('g', { 'clip-path': `url(#${clipId})` });
    const pointLayer = el('g', {});
    const ledgerLayer = el('g', {});
    const flyLayer = el('g', {});
    root.appendChild(chrome);
    root.appendChild(plotInk);
    root.appendChild(pointLayer);
    root.appendChild(ledgerLayer);
    root.appendChild(flyLayer);

    // 무대 테두리와 축
    chrome.appendChild(
      el('rect', {
        x: PLOT_L,
        y: PANEL_TOP,
        width: PLOT_R - PLOT_L,
        height: PANEL_BOTTOM - PANEL_TOP,
        rx: 6,
        fill: 'none',
        stroke: palette.border,
        'stroke-width': 1,
      }),
    );
    if (dataY0 < 0 && dataY1 > 0) {
      chrome.appendChild(
        el('line', {
          x1: PLOT_L + 4,
          y1: py(0),
          x2: PLOT_R - 4,
          y2: py(0),
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
    }
    if (dataX0 < 0 && dataX1 > 0) {
      chrome.appendChild(
        el('line', {
          x1: px(0),
          y1: PANEL_TOP + 4,
          x2: px(0),
          y2: PANEL_BOTTOM - 4,
          stroke: palette.border,
          'stroke-width': 1,
        }),
      );
      for (let v = Math.ceil(dataY0); v <= Math.floor(dataY1); v += 1) {
        if (v === 0) continue;
        chrome.appendChild(
          el('line', {
            x1: px(0) - 3,
            y1: py(v),
            x2: px(0) + 3,
            y2: py(v),
            stroke: palette.border,
            'stroke-width': 1,
          }),
        );
      }
    }
    if (dataY0 < 0 && dataY1 > 0) {
      for (let v = Math.ceil(dataX0); v <= Math.floor(dataX1); v += 1) {
        if (v === 0) continue;
        chrome.appendChild(
          el('line', {
            x1: px(v),
            y1: py(0) - 3,
            x2: px(v),
            y2: py(0) + 3,
            stroke: palette.border,
            'stroke-width': 1,
          }),
        );
      }
    }

    // 무리 이름표. 도형에 새긴 글자라 문안이 아니라 표식이다 (C10).
    const legendSpots: Array<{ dx: number; group: 'A' | 'B' }> = [
      { dx: 12, group: 'A' },
      { dx: 52, group: 'B' },
    ];
    for (const spot of legendSpots) {
      chrome.appendChild(
        el('circle', {
          cx: PLOT_L + spot.dx,
          cy: PANEL_TOP + 16,
          r: 4.5,
          fill: colorOf(spot.group),
        }),
      );
      const mark = el('text', {
        x: PLOT_L + spot.dx + 9,
        y: PANEL_TOP + 20,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      mark.textContent = spot.group;
      chrome.appendChild(mark);
    }

    // 기록 칸
    chrome.appendChild(
      el('rect', {
        x: LEDGER_L,
        y: PANEL_TOP,
        width: LEDGER_R - LEDGER_L,
        height: PANEL_BOTTOM - PANEL_TOP,
        rx: 6,
        fill: palette.bgSubtle,
        stroke: palette.border,
        'stroke-width': 1,
      }),
    );
    const ledgerTitle = el('text', {
      x: LEDGER_L + 14,
      y: LEDGER_TITLE_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: palette.text,
    });
    ledgerTitle.textContent = tr('label.record', 'Where the line sits');
    chrome.appendChild(ledgerTitle);

    // 무대의 잉크
    const ghostLine = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: palette.ghostOutline,
      'stroke-width': 9,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    const band = el('polygon', {
      points: '',
      fill: palette.accent,
      'fill-opacity': 0.14,
      opacity: 0,
    });
    const bandLo = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: palette.accent,
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
      opacity: 0,
    });
    const bandHi = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: palette.accent,
      'stroke-width': 1.5,
      'stroke-dasharray': '5 4',
      opacity: 0,
    });
    const boundary = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: palette.text,
      'stroke-width': 2.4,
      opacity: 0,
    });
    const probe = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: palette.text,
      'stroke-width': 1.4,
      'stroke-dasharray': '3 4',
      opacity: 0,
    });
    plotInk.appendChild(ghostLine);
    plotInk.appendChild(band);
    plotInk.appendChild(bandLo);
    plotInk.appendChild(bandHi);
    plotInk.appendChild(boundary);
    plotInk.appendChild(probe);

    const caption = el('text', {
      x: PLOT_L,
      y: CAPTION_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    root.appendChild(caption);

    // ── 상태
    type Node = {
      wrap: SVGGElement;
      ring: SVGCircleElement;
      x: number;
      y: number;
      alive: boolean;
      support: boolean;
    };
    let nodes: Node[] = [];
    let slot = 0;
    let ghostSet = false;
    let baseIntercept: number | null = null;

    function placeNode(node: Node, lift: number, opacity: number): void {
      node.wrap.setAttribute('transform', `translate(${px(node.x)}, ${py(node.y) - lift})`);
      node.wrap.setAttribute('opacity', String(opacity));
    }

    function lineEnds(slope: number, intercept: number): [number, number, number, number] {
      const xa = dataX0 - spanX;
      const xb = dataX1 + spanX;
      return [px(xa), py(slope * xa + intercept), px(xb), py(slope * xb + intercept)];
    }

    function drawStraight(target: SVGLineElement, slope: number, intercept: number): void {
      const [x1, y1, x2, y2] = lineEnds(slope, intercept);
      target.setAttribute('x1', String(x1));
      target.setAttribute('y1', String(y1));
      target.setAttribute('x2', String(x2));
      target.setAttribute('y2', String(y2));
    }

    function drawBand(slope: number, lo: number, hi: number): void {
      const xa = dataX0 - spanX;
      const xb = dataX1 + spanX;
      band.setAttribute(
        'points',
        `${px(xa)},${py(slope * xa + lo)} ${px(xb)},${py(slope * xb + lo)} ` +
          `${px(xb)},${py(slope * xb + hi)} ${px(xa)},${py(slope * xa + hi)}`,
      );
      drawStraight(bandLo, slope, lo);
      drawStraight(bandHi, slope, hi);
    }

    function liveCentroid(): { x: number; y: number } {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const node of nodes) {
        if (!node.alive) continue;
        sx += node.x;
        sy += node.y;
        n += 1;
      }
      return n === 0 ? { x: (dataX0 + dataX1) / 2, y: (dataY0 + dataY1) / 2 } : { x: sx / n, y: sy / n };
    }

    /** 법선각과 원점 거리로 탐침을 놓는다. 세로에 가까운 각도 그려야 해서 일반형을 쓴다. */
    function drawProbe(theta: number, offset: number): void {
      const wx = Math.cos(theta);
      const wy = Math.sin(theta);
      const cx = px(offset * wx);
      const cy = py(offset * wy);
      const dx = -wy;
      const dy = -wx;
      const reach = 900;
      probe.setAttribute('x1', String(cx - reach * dx));
      probe.setAttribute('y1', String(cy - reach * dy));
      probe.setAttribute('x2', String(cx + reach * dx));
      probe.setAttribute('y2', String(cy + reach * dy));
    }

    function setSupportRings(indices: number[]): void {
      const wanted = new Set(indices);
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        node.support = wanted.has(i) && node.alive;
      }
    }

    async function revealRings(): Promise<void> {
      const before = nodes.map((node) => Number(node.ring.getAttribute('opacity') ?? '0'));
      await animate(RING_MS, (t) => {
        const e = smooth(t);
        for (let i = 0; i < nodes.length; i += 1) {
          const node = nodes[i];
          const from = before[i];
          const to = node.support ? 1 : 0;
          node.ring.setAttribute('opacity', String(from + (to - from) * e));
          if (node.support) node.ring.setAttribute('r', String(RING_R + 6 * (1 - e)));
        }
      });
      for (const node of nodes) {
        node.ring.setAttribute('opacity', node.support ? '1' : '0');
        node.ring.setAttribute('r', String(RING_R));
      }
    }

    // ── projector 가 부르는 것

    function setCaption(textContent: string): void {
      caption.textContent = textContent;
    }

    async function setPoints(points: StagePoint[]): Promise<void> {
      pointLayer.textContent = '';
      nodes = points.map((p) => {
        const wrap = el('g', { opacity: 0 });
        const ring = el('circle', {
          cx: 0,
          cy: 0,
          r: RING_R,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 2.5,
          opacity: 0,
        });
        const dot = el('circle', {
          cx: 0,
          cy: 0,
          r: DOT_R,
          fill: colorOf(p.group),
          stroke: palette.bg,
          'stroke-width': 1.5,
        });
        wrap.appendChild(ring);
        wrap.appendChild(dot);
        pointLayer.appendChild(wrap);
        return { wrap, ring, x: p.x, y: p.y, alive: true, support: false };
      });

      const count = Math.max(1, nodes.length - 1);
      await animate(PLACE_MS, (t) => {
        for (let i = 0; i < nodes.length; i += 1) {
          const share = 0.55;
          const from = (i / count) * (1 - share);
          const e = smooth(clamp01((t - from) / share));
          placeNode(nodes[i], 16 * (1 - e), e);
        }
      });
      for (const node of nodes) placeNode(node, 0, 1);
    }

    async function solveBoundary(sol: StageSolution): Promise<void> {
      if (baseIntercept === null) {
        const height = Math.max(1e-6, sol.upper - sol.lower);
        gaugeLo = sol.lower - 0.32 * height;
        gaugeHi = sol.upper + 0.32 * height;
        baseIntercept = sol.intercept;
      }

      // 다시 푸는 동안 남는 것은 처음 자리의 유령뿐이다.
      boundary.setAttribute('opacity', '0');
      band.setAttribute('opacity', '0');
      bandLo.setAttribute('opacity', '0');
      bandHi.setAttribute('opacity', '0');

      const normalX = sol.slope / Math.hypot(sol.slope, 1);
      const normalY = -1 / Math.hypot(sol.slope, 1);
      let endTheta = Math.atan2(normalY, normalX);
      if (endTheta < 0) endTheta += Math.PI;
      const endOffset = Math.sin(endTheta) * sol.intercept;
      const pivot = liveCentroid();

      // 첫 프레임이 오기 전의 묵은 좌표가 한 번 번쩍이지 않게 미리 놓는다.
      const startTheta = endTheta - SWEEP_ARC;
      drawProbe(startTheta, Math.cos(startTheta) * pivot.x + Math.sin(startTheta) * pivot.y);
      probe.setAttribute('opacity', '1');
      await animate(SWEEP_MS, (t) => {
        const e = smooth(t);
        const theta = endTheta - (1 - e) * SWEEP_ARC;
        const through = Math.cos(theta) * pivot.x + Math.sin(theta) * pivot.y;
        drawProbe(theta, through * (1 - e * e) + endOffset * e * e);
      });
      probe.setAttribute('opacity', '0');

      drawStraight(boundary, sol.slope, sol.intercept);
      boundary.setAttribute('opacity', '1');
      band.setAttribute('opacity', '1');
      bandLo.setAttribute('opacity', '1');
      bandHi.setAttribute('opacity', '1');
      await animate(BAND_MS, (t) => {
        const e = smooth(t);
        drawBand(
          sol.slope,
          sol.intercept + (sol.lower - sol.intercept) * e,
          sol.intercept + (sol.upper - sol.intercept) * e,
        );
      });
      drawBand(sol.slope, sol.lower, sol.upper);

      if (!ghostSet) {
        drawStraight(ghostLine, sol.slope, sol.intercept);
        ghostLine.setAttribute('opacity', '0.5');
        ghostSet = true;
        drawBaseline(sol.intercept);
      }

      setSupportRings(sol.supports);
      await revealRings();
      await flyToLedger(sol);
    }

    function drawBaseline(intercept: number): void {
      ledgerLayer.appendChild(
        el('line', {
          x1: LEDGER_L + 10,
          y1: gy(intercept),
          x2: LEDGER_R - 8,
          y2: gy(intercept),
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      ledgerLayer.appendChild(
        el('line', {
          x1: LEDGER_L + 14,
          y1: LEDGER_LEGEND_Y,
          x2: LEDGER_L + 32,
          y2: LEDGER_LEGEND_Y,
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      const legend = el('text', {
        x: LEDGER_L + 38,
        y: LEDGER_LEGEND_Y + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      });
      legend.textContent = tr('label.origin', 'first position');
      ledgerLayer.appendChild(legend);
    }

    async function flyToLedger(sol: StageSolution): Promise<void> {
      const mine = slot;
      slot += 1;

      const fromCenter = py(sol.intercept);
      const fromHalf = Math.abs(py(sol.lower) - py(sol.upper)) / 2;
      const fromX = px(Math.max(dataX0, Math.min(dataX1, 0)));
      const toCenter = gy(sol.intercept);
      const toHalf = Math.abs(gy(sol.lower) - gy(sol.upper)) / 2;
      const toX = columnX(mine);

      const flier = el('line', {
        x1: fromX,
        y1: fromCenter - fromHalf,
        x2: fromX,
        y2: fromCenter + fromHalf,
        stroke: palette.text,
        'stroke-width': 7,
        'stroke-linecap': 'round',
      });
      flyLayer.appendChild(flier);

      await animate(FLY_MS, (t) => {
        const e = smooth(t);
        const cx = fromX + (toX - fromX) * e;
        const cy = fromCenter + (toCenter - fromCenter) * e;
        const half = fromHalf + (toHalf - fromHalf) * e;
        flier.setAttribute('x1', String(cx));
        flier.setAttribute('y1', String(cy - half));
        flier.setAttribute('x2', String(cx));
        flier.setAttribute('y2', String(cy + half));
      });
      flier.remove();

      drawColumn(mine, sol);
    }

    function drawColumn(index: number, sol: StageSolution): void {
      const cx = columnX(index);
      const group = el('g', {});

      group.appendChild(
        el('line', {
          x1: cx,
          y1: gy(sol.upper),
          x2: cx,
          y2: gy(sol.lower),
          stroke: palette.text,
          'stroke-width': 7,
          'stroke-linecap': 'round',
        }),
      );
      group.appendChild(
        el('line', {
          x1: cx - 11,
          y1: gy(sol.intercept),
          x2: cx + 11,
          y2: gy(sol.intercept),
          stroke: palette.accent,
          'stroke-width': 2.5,
        }),
      );

      if (baseIntercept !== null && Math.abs(sol.intercept - baseIntercept) > 1e-6) {
        const barX = cx - 18;
        group.appendChild(
          el('line', {
            x1: barX,
            y1: gy(baseIntercept),
            x2: barX,
            y2: gy(sol.intercept),
            stroke: palette.accent,
            'stroke-width': 2.5,
          }),
        );
        for (const v of [baseIntercept, sol.intercept]) {
          group.appendChild(
            el('line', {
              x1: barX - 4,
              y1: gy(v),
              x2: barX + 4,
              y2: gy(v),
              stroke: palette.accent,
              'stroke-width': 2.5,
            }),
          );
        }
      }

      const width = el('text', {
        x: cx,
        y: gy(sol.lower) + 20,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        'text-anchor': 'middle',
      });
      width.textContent = sol.margin.toFixed(3);
      group.appendChild(width);

      group.appendChild(
        el('circle', {
          cx,
          cy: BADGE_CY,
          r: BADGE_R,
          fill: 'none',
          stroke: palette.accent,
          'stroke-width': 1.5,
        }),
      );
      const badge = el('text', {
        x: cx,
        y: BADGE_CY + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.text,
        'text-anchor': 'middle',
      });
      badge.textContent = String(sol.supports.length);
      group.appendChild(badge);

      const label = el('text', {
        x: cx,
        y: COLUMN_LABEL_BASELINE,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        'text-anchor': 'middle',
      });
      label.textContent =
        index === 0
          ? tr('label.original', 'start')
          : tr('label.trial', 'edit {n}', { n: index });
      group.appendChild(label);

      ledgerLayer.appendChild(group);
    }

    async function pulseSupports(): Promise<void> {
      await animate(PULSE_MS, (t) => {
        const swell = Math.sin(t * Math.PI);
        for (const node of nodes) {
          if (!node.support) continue;
          node.ring.setAttribute('r', String(RING_R + 5 * swell));
          node.ring.setAttribute('stroke-width', String(2.5 + 1.5 * swell));
        }
      });
      for (const node of nodes) {
        node.ring.setAttribute('r', String(RING_R));
        node.ring.setAttribute('stroke-width', '2.5');
      }
    }

    async function dropPoints(indices: number[]): Promise<void> {
      const doomed = indices.filter((i) => i >= 0 && i < nodes.length);
      await animate(DROP_MS, (t) => {
        const e = smooth(t);
        for (const i of doomed) placeNode(nodes[i], -34 * e, 1 - e);
      });
      for (const i of doomed) {
        nodes[i].alive = false;
        nodes[i].wrap.setAttribute('opacity', '0');
      }
    }

    async function restorePoints(points: StagePoint[]): Promise<void> {
      const from = nodes.map((node) => ({ x: node.x, y: node.y, alive: node.alive }));
      await animate(RESTORE_MS, (t) => {
        const e = smooth(t);
        for (let i = 0; i < nodes.length; i += 1) {
          const target = points[i];
          if (target === undefined) continue;
          const start = from[i];
          nodes[i].x = start.x + (target.x - start.x) * e;
          nodes[i].y = start.y + (target.y - start.y) * e;
          placeNode(nodes[i], 0, start.alive ? 1 : e);
        }
      });
      for (let i = 0; i < nodes.length; i += 1) {
        const target = points[i];
        if (target === undefined) continue;
        nodes[i].x = target.x;
        nodes[i].y = target.y;
        nodes[i].alive = true;
        placeNode(nodes[i], 0, 1);
      }
    }

    async function movePoint(index: number, toX: number, toY: number): Promise<void> {
      const node = nodes[index];
      if (node === undefined) return;
      const fromX = node.x;
      const fromY = node.y;
      await animate(MOVE_MS, (t) => {
        const e = smooth(t);
        node.x = fromX + (toX - fromX) * e;
        node.y = fromY + (toY - fromY) * e;
        placeNode(node, 0, 1);
      });
      node.x = toX;
      node.y = toY;
      placeNode(node, 0, 1);
    }

    async function conclude(indices: number[]): Promise<void> {
      setSupportRings(indices);
      await animate(CONCLUDE_MS, (t) => {
        const e = smooth(t);
        for (const node of nodes) {
          if (node.support) continue;
          node.wrap.setAttribute('opacity', String(node.alive ? 1 - 0.72 * e : 0));
        }
      });
      await pulseSupports();
    }

    function rewind(): void {
      caption.textContent = '';
      pointLayer.textContent = '';
      ledgerLayer.textContent = '';
      flyLayer.textContent = '';
      nodes = [];
      slot = 0;
      ghostSet = false;
      baseIntercept = null;
      ghostLine.setAttribute('opacity', '0');
      boundary.setAttribute('opacity', '0');
      band.setAttribute('opacity', '0');
      bandLo.setAttribute('opacity', '0');
      bandHi.setAttribute('opacity', '0');
      probe.setAttribute('opacity', '0');
    }

    return {
      setCaption,
      setPoints,
      solveBoundary,
      pulseSupports,
      dropPoints,
      restorePoints,
      movePoint,
      conclude,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
