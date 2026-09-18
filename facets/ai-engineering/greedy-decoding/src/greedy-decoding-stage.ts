/**
 * greedy-decoding-stage — 낱말 그래프 위를 걷는 글.
 *
 * 다음 낱말 표를 **앞 낱말 → 다음 낱말** 의 갈래로 편다. 출발 낱말(프롬프트의 끝)에서
 * 깊이별로 세로 줄을 세우고, 끝 표식은 오른쪽 벽으로 둔다. 앞으로 가는 갈래는 곧은 선,
 * 뒤로 돌아가는 갈래는 활처럼 휜 선이다.
 *
 * 운동 — 갈래를 옮겨 타고, 고리가 감긴다.
 *  - 한 걸음마다 글의 끝(구슬)이 고른 갈래를 따라 옮겨 가며 자취를 남긴다. 구슬의 넓이가
 *    글 전체의 확률이라 걸음마다 깎여 줄어든다.
 *  - 같은 갈래를 다시 지나면 자취가 바깥으로 한 겹 더 감긴다 — 고리가 몇 번 돌았는지가
 *    겹 수로 남는다.
 *  - 손잡이를 돌려 새 판이 시작되면 앞 판의 자취가 **갈래 자리까지 거꾸로 감겨 들어가고**,
 *    구슬이 다시 부풀어 새 갈래로 뻗는다. 아래 표의 테두리도 그 등수 줄로 옮겨 간다.
 *
 * 문안은 전부 `params.t` 로 — 키와 en 원본은 facet.ts 의 messages 와 같다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 486;

/** 그래프 영역. */
const GRAPH_TOP = 50;
const GRAPH_BOTTOM = 290;
const GRAPH_LEFT = 50;
const GRAPH_RIGHT = 520;
const WALL_X = 588;

/** 낱말 알약. */
const PILL_H = 22;
const PILL_CHAR = 7.4;
const PILL_PAD = 16;

/** 구슬 — 넓이가 글 전체의 확률이다. */
const BEAD_R = 24;

/** 되감긴 자취 사이의 간격. */
const LAP_GAP = 6;

/** 활 모양 갈래가 부푸는 높이. */
const ARC_LIFT = 70;

/** 곡선 한 줄의 표본 수. */
const SAMPLES = 28;

/** 글 띠. */
const TEXT_Y = 322;
const TEXT_LEFT = 20;
const TEXT_CHAR = 8.4;

/** 등수별 표. */
const PANEL_LEGEND_Y = 356;
const PANEL_TOP = 366;
const PANEL_ROW = 36;
const PANEL_LABEL_X = 20;
const BAR_X = 196;
const BAR_MAX = 340;


type Option = { word: string; p: number };
type Row = { word: string; next: Option[] };
type Data = { prompt: string; table: Row[]; endToken: string; firstRanks: number[] };

type Pt = [number, number];
type NodeBox = { x: number; y: number; w: number };

type Segment = { from: string; to: string; lap: number; pts: Pt[] };

type Fan = { from: string; rank: number; options: Option[] };

/** projector 가 부르는 표면. */
export type GreedyDecodingStageApi = {
  beginRun(rank: number, start: string, ms: number): void;
  showFan(step: number, from: string, rank: number, options: Option[], ms: number): void;
  advance(step: number, from: string, word: string, p: number, score: number, permille: number, ms: number): void;
  finish(rank: number, permille: number, closed: boolean, steps: number, ms: number): void;
  tally(repeats: number, repeatSteps: number[]): void;
  reset(): void;
  destroy(): void;
};

function narrow(raw: unknown): Data | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.prompt !== 'string' || typeof d.endToken !== 'string') return null;
  if (!Array.isArray(d.firstRanks) || !d.firstRanks.every((v) => typeof v === 'number')) return null;
  if (!Array.isArray(d.table)) return null;
  const table: Row[] = [];
  for (const row of d.table) {
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Record<string, unknown>;
    if (typeof r.word !== 'string' || !Array.isArray(r.next)) return null;
    const next: Option[] = [];
    for (const o of r.next) {
      if (typeof o !== 'object' || o === null) return null;
      const opt = o as Record<string, unknown>;
      if (typeof opt.word !== 'string' || typeof opt.p !== 'number') return null;
      next.push({ word: opt.word, p: opt.p });
    }
    table.push({ word: r.word, next });
  }
  return { prompt: d.prompt, table, endToken: d.endToken, firstRanks: d.firstRanks as number[] };
}

/** 좌표를 글자로 — 끝자리와 -0 을 정리한다. */
function f(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r === 0 ? 0 : r);
}

/** 천분율을 소수 한 자리 백분율로 — 14 → "1.4". */
function pctText(permille: number): string {
  return `${Math.floor(permille / 10)}.${permille % 10}`;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export const greedyDecodingStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },
  mount(container, params) {
    void container;
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [barFirst, barWhole] = categorical(2, 'vivid');
    const data = narrow(params.initialData);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement => {
      const node = el('text', attrs, parent);
      node.textContent = s;
      return node;
    };

    const root = el('g', {}, svg);
    const layerStatic = el('g', {}, root);
    const layerTrace = el('g', {}, root);
    const layerFan = el('g', {}, root);
    const layerNodes = el('g', {}, root);
    const layerBead = el('g', {}, root);
    const layerText = el('g', {}, root);
    const layerPanel = el('g', {}, root);
    const layerCaption = el('g', {}, root);

    // ── 배치 — 출발 낱말에서 너비 우선으로 깊이를 매긴다. 출발 낱말은 셈하지 않고
    //    알고리즘이 run-start 에 실어 준 것을 받는다 (원칙 5).
    const nodes = new Map<string, NodeBox>();
    const rows = new Map<string, Option[]>();
    let start = '';
    const endToken = data?.endToken ?? '';
    if (data) for (const r of data.table) rows.set(r.word, r.next);
    const layout = () => {
      nodes.clear();
      if (!data || !rows.has(start)) return;
      const depth = new Map<string, number>([[start, 0]]);
      const parent = new Map<string, string>();
      const order: string[] = [start];
      for (let i = 0; i < order.length; i++) {
        const w = order[i]!;
        for (const o of rows.get(w) ?? []) {
          if (o.word === endToken || depth.has(o.word)) continue;
          depth.set(o.word, (depth.get(w) ?? 0) + 1);
          parent.set(o.word, w);
          order.push(o.word);
        }
      }
      const maxDepth = Math.max(1, ...depth.values());
      const columns: string[][] = [];
      for (const w of order) {
        const d = depth.get(w) ?? 0;
        (columns[d] ??= []).push(w);
      }
      const span = GRAPH_BOTTOM - GRAPH_TOP;
      columns.forEach((col, d) => {
        const x = GRAPH_LEFT + ((GRAPH_RIGHT - GRAPH_LEFT) * d) / maxDepth;
        const prev = columns[d - 1];
        // 앞 줄보다 적게 열린 줄은 부모 곁에 선다 — 부딪히면 고르게 편다.
        let ys = col.map((_, i) => GRAPH_TOP + ((i + 0.5) * span) / col.length);
        if (d > 0 && prev && col.length < prev.length) {
          const byParent = col.map((w) => nodes.get(parent.get(w) ?? '')?.y ?? GRAPH_TOP);
          const sorted = [...byParent].sort((a, b) => a - b);
          const clear = sorted.every((y, i) => i === 0 || y - sorted[i - 1]! >= PILL_H + 8);
          if (clear) ys = byParent;
        }
        col.forEach((w, i) => {
          nodes.set(w, { x, y: ys[i]!, w: w.length * PILL_CHAR + PILL_PAD });
        });
      });
    };
    const midY = (GRAPH_TOP + GRAPH_BOTTOM) / 2;

    /** 갈래 하나의 곡선 — 겹(lap)만큼 바깥으로 비킨다. */
    const edgePts = (from: string, to: string, lap: number): Pt[] => {
      const a = nodes.get(from);
      if (!a) return [];
      let p0: Pt;
      let p2: Pt;
      let ctrl: Pt;
      let nx: number;
      let ny: number;
      if (to === endToken) {
        p0 = [a.x + a.w / 2, a.y];
        p2 = [WALL_X, a.y];
        ctrl = [(p0[0] + p2[0]) / 2, a.y];
        nx = 0;
        ny = 1;
      } else {
        const b = nodes.get(to);
        if (!b) return [];
        if (b.x > a.x) {
          p0 = [a.x + a.w / 2, a.y];
          p2 = [b.x - b.w / 2, b.y];
          ctrl = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
          const dx = p2[0] - p0[0];
          const dy = p2[1] - p0[1];
          const len = Math.hypot(dx, dy) || 1;
          // 앞으로 가는 갈래의 바깥은 아래쪽이다.
          nx = -dy / len;
          ny = dx / len;
          if (ny < 0) {
            nx = -nx;
            ny = -ny;
          }
        } else {
          const above = Math.max(a.y, b.y) <= midY + 1 || a.y < midY;
          const sy = above ? -PILL_H / 2 : PILL_H / 2;
          p0 = [a.x, a.y + sy];
          p2 = [b.x, b.y + sy];
          const cy = above ? Math.min(p0[1], p2[1]) - ARC_LIFT : Math.max(p0[1], p2[1]) + ARC_LIFT;
          ctrl = [(p0[0] + p2[0]) / 2, cy];
          // 활의 바깥은 부푼 쪽이다.
          nx = 0;
          ny = above ? -1 : 1;
        }
      }
      const off = lap * LAP_GAP;
      const q0: Pt = [p0[0] + nx * off, p0[1] + ny * off];
      const q1: Pt = [ctrl[0] + nx * off * 1.6, ctrl[1] + ny * off * 1.6];
      const q2: Pt = [p2[0] + nx * off, p2[1] + ny * off];
      const pts: Pt[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const m = 1 - u;
        pts.push([
          m * m * q0[0] + 2 * m * u * q1[0] + u * u * q2[0],
          m * m * q0[1] + 2 * m * u * q1[1] + u * u * q2[1],
        ]);
      }
      return pts;
    };

    /** 곡선의 앞 frac 만큼. */
    const partial = (pts: Pt[], frac: number): Pt[] => {
      if (pts.length === 0) return pts;
      const k = Math.max(0, Math.min(1, frac)) * (pts.length - 1);
      const whole = Math.floor(k);
      const out = pts.slice(0, whole + 1);
      if (whole < pts.length - 1) {
        const r = k - whole;
        const a = pts[whole]!;
        const b = pts[whole + 1]!;
        out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
      }
      return out;
    };
    const ptsAttr = (pts: Pt[]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    const beadR = (score: number) => BEAD_R * Math.sqrt(Math.max(0, score) / 1_000_000);

    // ── 판의 상태 — 정적 그리기가 정본이다.
    let rank = data?.firstRanks.includes(1) ? 1 : (data?.firstRanks[0] ?? 1);
    let trace: Segment[] = [];
    let words: string[] = [];
    let score = 1_000_000;
    let at = start;
    let fan: Fan | null = null;
    let repeatSteps: number[] = [];
    let caption = '';
    const results = new Map<number, number>();
    const visits = new Map<string, number>();

    // ── 운동의 시계 하나 — 새 운동이 오면 앞 운동은 끝자리로 건너뛴다.
    let destroyed = false;
    let gen = 0;
    let frame: number | null = null;
    const stopClock = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const run = (ms: number, draw: (u: number) => void) => {
      stopClock();
      const mine = (gen += 1);
      if (destroyed || ms <= 0) {
        drawStatic();
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        if (destroyed || mine !== gen) return;
        const u = Math.min(1, (now - t0) / ms);
        draw(ease(u));
        if (u < 1) frame = requestAnimationFrame(tick);
        else {
          frame = null;
          drawStatic();
        }
      };
      draw(0);
      frame = requestAnimationFrame(tick);
    };

    const clear = (g: Element) => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    // ── 바뀌지 않는 것 — 벽 · 출발 갈래 · 주석.
    const drawBackdrop = () => {
      clear(layerStatic);
      if (!data) return;
      el('line', { x1: WALL_X, y1: GRAPH_TOP - 14, x2: WALL_X, y2: GRAPH_BOTTOM + 8, stroke: c.textMuted, 'stroke-width': 2 }, layerStatic);
      text(endToken, {
        x: WALL_X, y: GRAPH_TOP - 20, 'text-anchor': 'middle', fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700,
      }, layerStatic);
      text(t('label.end', 'end'), {
        x: WALL_X - 8, y: GRAPH_BOTTOM + 22, 'text-anchor': 'end', fill: c.textMuted,
        'font-family': fonts.body, 'font-size': fontSizes.xs,
      }, layerStatic);
      // 출발 갈래 — 첫 걸음이 고를 수 있는 셋. 늘 보여서 옮겨 타는 자리가 보인다.
      (rows.get(start) ?? []).forEach((o, i) => {
        const pts = edgePts(start, o.word, 0);
        if (pts.length === 0) return;
        el('polyline', {
          points: ptsAttr(pts), fill: 'none', stroke: c.border, 'stroke-width': 2,
        }, layerStatic);
        const m = pts[Math.floor(pts.length * 0.45)]!;
        text(t('label.forkRank', '#{rank}', { rank: i + 1 }), {
          x: f(m[0]), y: f(m[1] - 6), 'text-anchor': 'middle', fill: c.textMuted,
          'font-family': fonts.body, 'font-size': fontSizes.xs,
        }, layerStatic);
      });
      text(t('label.firstStep', 'first step'), {
        x: BAR_X, y: PANEL_LEGEND_Y, fill: barFirst ?? c.text, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 600,
      }, layerStatic);
      text(t('label.sentence', 'whole sentence'), {
        x: BAR_X + 110, y: PANEL_LEGEND_Y, fill: barWhole ?? c.text, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 600,
      }, layerStatic);
    };

    /** 낱말 알약들. 지금 서 있는 낱말은 테두리가 굵다. */
    const drawNodes = (current: string) => {
      clear(layerNodes);
      for (const [w, b] of nodes) {
        const isHere = w === current;
        el('rect', {
          x: f(b.x - b.w / 2), y: f(b.y - PILL_H / 2), width: f(b.w), height: PILL_H, rx: 11,
          fill: c.bg, stroke: isHere ? c.itemActive : w === start ? c.text : c.border,
          'stroke-width': isHere ? 2.5 : 1.2,
        }, layerNodes);
        text(w, {
          x: f(b.x), y: f(b.y + 4), 'text-anchor': 'middle', fill: c.text,
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, layerNodes);
      }
    };

    /** 후보 갈래 — frac 만큼 뻗는다. */
    const drawFan = (frac: number) => {
      clear(layerFan);
      if (!fan) return;
      fan.options.forEach((o, i) => {
        const pts = edgePts(fan!.from, o.word, 0);
        if (pts.length === 0) return;
        const chosen = i === fan!.rank - 1;
        el('polyline', {
          points: ptsAttr(partial(pts, frac)), fill: 'none',
          stroke: chosen ? c.itemComparing : c.textMuted,
          'stroke-width': chosen ? 2.5 : 1.5, 'stroke-dasharray': '5 4',
        }, layerFan);
        if (frac < 1) return;
        const m = pts[Math.floor(pts.length * 0.6)]!;
        const label = t('label.prob', '{p}%', { p: o.p });
        const bw = label.length * 7 + 10;
        el('rect', {
          x: f(m[0] - bw / 2), y: f(m[1] - 9), width: f(bw), height: 16, rx: 4,
          fill: c.bg, stroke: chosen ? c.itemComparing : c.border,
        }, layerFan);
        text(label, {
          x: f(m[0]), y: f(m[1] + 3), 'text-anchor': 'middle',
          fill: chosen ? c.itemComparing : c.textMuted,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': chosen ? 700 : 400,
        }, layerFan);
      });
    };

    /** 자취 — 마지막 조각만 frac 만큼. 앞 조각들은 다 그어져 있다. */
    const drawTrace = (segs: Segment[], lastFrac: number) => {
      clear(layerTrace);
      segs.forEach((s, i) => {
        const pts = i === segs.length - 1 ? partial(s.pts, lastFrac) : s.pts;
        if (pts.length < 2) return;
        el('polyline', {
          points: ptsAttr(pts), fill: 'none', stroke: c.primary,
          'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }, layerTrace);
      });
    };

    const nodePoint = (w: string): Pt => {
      const b = nodes.get(w);
      return b ? [b.x, b.y] : [WALL_X, midY];
    };

    const drawBead = (p: Pt, r: number) => {
      clear(layerBead);
      if (!data || nodes.size === 0) return;
      el('circle', {
        cx: f(p[0]), cy: f(p[1]), r: f(Math.max(1.5, r)),
        fill: c.accent, 'fill-opacity': 0.85, stroke: c.stateInk, 'stroke-width': 1.2,
      }, layerBead);
    };

    /** 글 띠 — 프롬프트는 옅게, 만든 글은 진하게, 되풀이는 붉게. */
    const drawText = (list: string[], arriving: number, collapse: number) => {
      clear(layerText);
      if (!data) return;
      text(data.prompt, { x: TEXT_LEFT, y: TEXT_Y, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.md }, layerText);
      let x = TEXT_LEFT + (data.prompt.length + 1) * TEXT_CHAR;
      const seam = x;
      el('line', { x1: f(seam - TEXT_CHAR / 2), y1: TEXT_Y - 14, x2: f(seam - TEXT_CHAR / 2), y2: TEXT_Y + 5, stroke: c.border }, layerText);
      list.forEach((w, i) => {
        const isNew = i === list.length - 1 ? arriving : 1;
        const home = x;
        // 새 판이 시작되면 만든 글이 갈래 자리(프롬프트 끝)로 말려 들어간다.
        const gx = seam + (home - seam) * (1 - collapse);
        const shift = (1 - isNew) * -14;
        const node = text(w, {
          x: f(gx + shift), y: TEXT_Y,
          fill: repeatSteps.includes(i) ? c.itemSwapping : c.text,
          'font-family': fonts.mono, 'font-size': fontSizes.md,
          'font-weight': repeatSteps.includes(i) ? 700 : 400,
        }, layerText);
        if (repeatSteps.includes(i)) {
          el('line', {
            x1: f(gx), y1: TEXT_Y + 4, x2: f(gx + w.length * TEXT_CHAR), y2: TEXT_Y + 4,
            stroke: c.itemSwapping, 'stroke-width': 2,
          }, layerText);
        }
        if (collapse > 0) node.setAttribute('opacity', f(1 - collapse));
        x += (w.length + 1) * TEXT_CHAR;
      });
    };

    /** 등수별 표 — 첫 걸음 확률과 글 전체 확률. frameY 는 테두리의 세로 자리. */
    const drawPanel = (frameY: number, growRank: number | null, grow: number) => {
      clear(layerPanel);
      if (!data) return;
      const first = rows.get(start) ?? [];
      data.firstRanks.forEach((r, i) => {
        const y = PANEL_TOP + i * PANEL_ROW;
        const opt = first[r - 1];
        text(t('label.row', 'Rank {rank} · {word}', { rank: r, word: opt?.word ?? '' }), {
          x: PANEL_LABEL_X, y: y + 18, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        }, layerPanel);
        const p = opt?.p ?? 0;
        const w1 = (BAR_MAX * p) / 100;
        el('rect', { x: BAR_X, y: y + 5, width: f(w1), height: 10, rx: 2, fill: barFirst ?? c.text }, layerPanel);
        text(t('label.prob', '{p}%', { p }), {
          x: f(BAR_X + w1 + 6), y: y + 14, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        }, layerPanel);
        const pm = results.get(r);
        if (pm === undefined) {
          el('rect', {
            x: BAR_X, y: y + 19, width: 40, height: 10, rx: 2, fill: 'none',
            stroke: c.border, 'stroke-dasharray': '3 3',
          }, layerPanel);
          text(t('label.unknown', 'not walked yet'), {
            x: BAR_X + 46, y: y + 28, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
          }, layerPanel);
        } else {
          const g = growRank === r ? grow : 1;
          const w2 = ((BAR_MAX * pm) / 1000) * g;
          el('rect', { x: BAR_X, y: y + 19, width: f(Math.max(1, w2)), height: 10, rx: 2, fill: barWhole ?? c.text }, layerPanel);
          text(t('label.pct', '{pct}%', { pct: pctText(pm) }), {
            x: f(BAR_X + w2 + 6), y: y + 28, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'font-weight': 600,
          }, layerPanel);
        }
      });
      el('rect', {
        x: PANEL_LABEL_X - 8, y: f(frameY), width: W - 2 * (PANEL_LABEL_X - 8), height: PANEL_ROW - 2, rx: 6,
        fill: 'none', stroke: c.accent, 'stroke-width': 2.5,
      }, layerPanel);
    };
    const rowY = (r: number) => {
      const i = data ? Math.max(0, data.firstRanks.indexOf(r)) : 0;
      return PANEL_TOP + i * PANEL_ROW - 1;
    };

    const drawCaption = () => {
      clear(layerCaption);
      if (!caption) return;
      text(caption, {
        x: PANEL_LABEL_X, y: 22, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      }, layerCaption);
    };

    /** 정본 — 지금 상태의 화면 전체. */
    const drawStatic = () => {
      if (destroyed) return;
      drawFan(1);
      drawTrace(trace, 1);
      drawNodes(at);
      drawBead(trace.length > 0 ? trace[trace.length - 1]!.pts[trace[trace.length - 1]!.pts.length - 1]! : nodePoint(at), beadR(score));
      drawText(words, 1, 0);
      drawPanel(rowY(rank), null, 1);
      drawCaption();
    };

    drawBackdrop();
    drawStatic();

    const api: GreedyDecodingStageApi = {
      beginRun(nextRank, nextStart, ms) {
        if (!data) return;
        if (nextStart !== start) {
          start = nextStart;
          layout();
          drawBackdrop();
        }
        const oldTrace = trace;
        const oldWords = words;
        const oldScore = score;
        const oldRankY = rowY(rank);
        rank = nextRank;
        trace = [];
        words = [];
        score = 1_000_000;
        at = start;
        fan = null;
        repeatSteps = [];
        visits.clear();
        caption = t('caption.start', 'The prompt ends at “{word}”. Step 1 takes rank {rank}; every later step takes rank 1.', {
          word: start, rank: nextRank,
        });
        if (oldTrace.length === 0) {
          drawStatic();
          return;
        }
        // 앞 판의 자취가 갈래 자리까지 거꾸로 감겨 들어간다.
        const n = oldTrace.length;
        const newY = rowY(nextRank);
        run(ms, (u) => {
          const left = (1 - u) * n;
          clear(layerTrace);
          let tip: Pt = nodePoint(start);
          oldTrace.forEach((s, i) => {
            const frac = Math.max(0, Math.min(1, left - i));
            if (frac <= 0) return;
            const pts = partial(s.pts, frac);
            tip = pts[pts.length - 1] ?? tip;
            if (pts.length < 2) return;
            el('polyline', {
              points: ptsAttr(pts), fill: 'none', stroke: c.primary,
              'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }, layerTrace);
          });
          clear(layerFan);
          drawNodes(start);
          drawBead(tip, beadR(oldScore) + (beadR(1_000_000) - beadR(oldScore)) * u);
          repeatSteps = [];
          drawText(oldWords, 1, u);
          drawPanel(oldRankY + (newY - oldRankY) * u, null, 1);
          drawCaption();
        });
      },

      showFan(_step, from, r, options, ms) {
        if (!data) return;
        fan = { from, rank: r, options: options.map((o) => ({ ...o })) };
        at = from;
        const chosen = options[r - 1];
        caption = t('caption.pick', 'Step {n}: after “{from}”, rank {rank} is “{word}” at {p}%.', {
          n: _step + 1, from, rank: r, word: chosen?.word ?? '', p: chosen?.p ?? 0,
        });
        run(ms, (u) => {
          drawFan(u);
          drawCaption();
        });
      },

      advance(step, from, word, p, nextScore, permille, ms) {
        if (!data) return;
        const key = `${from}>${word}`;
        const lap = visits.get(key) ?? 0;
        visits.set(key, lap + 1);
        const seg: Segment = { from, to: word, lap, pts: edgePts(from, word, lap) };
        const prevScore = score;
        trace = [...trace, seg];
        words = [...words, word];
        score = nextScore;
        at = word === endToken ? from : word;
        fan = null;
        caption = t('caption.advance', 'Step {n}: × {p}% — the whole sentence is now {pct}%.', {
          n: step + 1, p, pct: pctText(permille),
        });
        run(ms, (u) => {
          clear(layerFan);
          drawTrace(trace, u);
          const pts = partial(seg.pts, u);
          const tip = pts[pts.length - 1] ?? nodePoint(from);
          drawNodes(u < 1 ? from : at);
          drawBead(tip, beadR(prevScore) + (beadR(nextScore) - beadR(prevScore)) * u);
          drawText(words, u, 0);
          drawCaption();
        });
      },

      finish(r, permille, closed, steps, ms) {
        if (!data) return;
        results.set(r, permille);
        caption = closed
          ? t('caption.closed', '“{end}” closed the sentence at step {n}. The remaining steps cost nothing — whole sentence {pct}%.', {
            end: endToken, n: steps, pct: pctText(permille),
          })
          : t('caption.ran', 'All {n} steps taken without an end. Whole sentence {pct}%.', {
            n: steps, pct: pctText(permille),
          });
        run(ms, (u) => {
          drawPanel(rowY(rank), r, u);
          drawCaption();
        });
      },

      tally(repeats, steps) {
        if (!data) return;
        repeatSteps = [...steps];
        caption = repeats > 0
          ? t('caption.repeats', 'Words picked again inside the generated text: {n}. The text is going round a loop.', { n: repeats })
          : t('caption.noRepeats', 'No word is picked twice inside the generated text.');
        stopClock();
        gen += 1;
        drawStatic();
      },

      reset() {
        stopClock();
        gen += 1;
        rank = data?.firstRanks.includes(1) ? 1 : (data?.firstRanks[0] ?? 1);
        trace = [];
        words = [];
        score = 1_000_000;
        at = start;
        fan = null;
        repeatSteps = [];
        caption = '';
        results.clear();
        visits.clear();
        drawStatic();
      },

      destroy() {
        destroyed = true;
        gen += 1;
        stopClock();
        clear(root);
        if (root.parentNode === svg) svg.removeChild(root);
      },
    };
    return api as unknown as ReturnType<CanvasView['mount']>;
  },
};
