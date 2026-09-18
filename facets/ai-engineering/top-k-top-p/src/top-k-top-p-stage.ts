/**
 * top-k / top-p 의 stage — 두 문맥을 나란히, 각자 "순위 사다리" 와 "몫 기둥" 을 띠로 잇는다.
 *
 * 왼쪽 사다리는 순위(개수)의 공간이라 칸 높이가 모두 같고, 오른쪽 기둥은 몫의 공간이라 조각
 * 높이가 확률에 비례한다. 후보 하나가 사다리 칸에서 기둥 조각으로 이어지는 띠 하나다.
 *
 * - k 칼날은 사다리의 **같은 칸 경계**로 내려온다 — 기둥에서는 두 문맥이 전혀 다른 깊이다
 * - p 선은 기둥의 **같은 깊이**에 걸린다 — 사다리에서는 두 문맥이 전혀 다른 칸에서 멈춘다
 * - 칼날 아래로 떨어진 조각이 빠지면 기둥에 빈자리가 남고, 남은 조각이 제 크기에 비례해
 *   부풀어 그 빈자리를 채운다 (다시 나눈 분포)
 *
 * 움직임은 한 시계(rAF)로 흘린다. 길이는 projector 가 재생 속도로 나누어 넘긴다.
 * 색은 design-tokens, 문안은 params.t.
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

const HEIGHT = 480;
const PANEL_W = 290;
const PANEL_X = [10, PIECE_CANVAS_W - 10 - PANEL_W];

// 패널 안쪽 좌표 (패널 왼쪽 끝이 0)
const LADDER_R = 114; // 사다리 오른쪽 끝 — 띠가 시작하는 곳
const COL_X = 196; // 기둥 왼쪽
const COL_W = 42;
const FILL_X = COL_X + COL_W + 3; // 누적 막대
const TAG_X = FILL_X + 8; // p 선 표지

const T = 58; // 사다리 · 기둥 위 끝
const H = 288; // 사다리 · 기둥 높이
const FALL = 30; // 떨어지는 거리

const GAUGE_Y = 376;
const GAUGE_X = 72;
const GAUGE_W = 160;
const VERDICT_Y = 404;
const CAPTION_Y = 432;
const NOTE_Y = 470;

export type StageContext = { id: 'peaked' | 'flat'; prompt: string; tokens: string[]; permille: number[] };
export type RankStatus = 'stay' | 'reach' | 'closed';
export type CutterName = 'none' | 'k' | 'p' | 'renorm-p';

/**
 * 한 문맥의 읽힐 값 — algorithm 이 셈해 싣는다. stage 는 받아 그리기만 한다.
 * share[r] 은 아직 남은 것 안에서의 몫 %(반올림), 떨어진 후보는 -1.
 */
export type ContextFrame = { share: number[]; cutPermille: number; total: number; cutPercent: number };

/** projector 가 부르는 stage 의 구조적 표면. */
export type TopKTopPStage = {
  /** topP 는 p 선의 깊이(백분율 정수), pLabel 은 그 표기 */
  round(topK: number, topP: number, pLabel: string, frames: ContextFrame[], dur: number): void;
  cutK(kept: number[], mass: number[], frames: ContextFrame[], dur: number): void;
  check(rank: number, status: RankStatus[], run: number[], frames: ContextFrame[], dur: number): void;
  settle(keptSum: number[], frames: ContextFrame[], dur: number): void;
  verdict(cutter: CutterName[]): void;
  reset(): void;
  setCaption(text: string): void;
};

function narrowContexts(data: unknown): StageContext[] {
  if (typeof data !== 'object' || data === null) return [];
  const list = (data as { contexts?: unknown }).contexts;
  if (!Array.isArray(list)) return [];
  const out: StageContext[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (r.id !== 'peaked' && r.id !== 'flat') return [];
    if (typeof r.prompt !== 'string') return [];
    if (!Array.isArray(r.tokens) || !r.tokens.every((s) => typeof s === 'string')) return [];
    if (!Array.isArray(r.permille) || !r.permille.every((x) => typeof x === 'number')) return [];
    if (r.tokens.length !== r.permille.length) return [];
    out.push({ id: r.id, prompt: r.prompt, tokens: r.tokens as string[], permille: r.permille as number[] });
  }
  return out.slice(0, 2);
}

/** 한 문맥의 지금 상태 — 화면의 정본. 기하는 여기서 셈한다. */
type Model = {
  inside: boolean[];
  /** 기둥 전체 높이가 뜻하는 천분율 합 (다시 나눈 분포의 분모) */
  scale: number;
  kN: number;
  /** p 칼날 자리 (남김 수). p 가 k 너머를 자르지 않았으면 -1 */
  pStop: number;
  /** 누적 막대 (천분율). 없으면 -1 */
  run: number;
  /** 지금 견주는 순위. 없으면 -1 */
  focus: number;
  /** 남은 것 안의 몫 % (떨어진 것은 -1) — algorithm 이 셈한 값 */
  share: number[];
  /** 잘린 천분율과 전체 — algorithm 이 셈한 값 */
  cutPermille: number;
  total: number;
  cutPercent: number;
  verdict: string;
};

type Geom = Map<string, number>;

function wrap(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const mid = Math.floor(text.length / 2);
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue;
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  }
  if (best < 0) return [text];
  return [text.slice(0, best), text.slice(best + 1)];
}

export const topKTopPStageView: CanvasView = {
  canvas: { height: HEIGHT },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const contexts = narrowContexts(params.initialData);

    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;
    let gen = 0;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: HEIGHT, fill: pal.bg }, root);

    const captionLines = [0, 1].map((i) =>
      el(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_Y + i * 17,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: pal.text,
        },
        root,
      ),
    );
    const noteText = t('label.readShare', 'The % beside a word is its share of what is still in.');
    wrap(noteText, 96).forEach((line, i, all) => {
      const node = el(
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: NOTE_Y - (all.length - 1 - i) * 14,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        },
        root,
      );
      node.textContent = line;
    });

    const vivid = categorical(8, 'vivid');
    const pastel = categorical(8, 'pastel');

    const models: Model[] = [];
    let topP = 100;
    let topK = 8;
    let pLabel = '1';

    type Panel = {
      ribbons: SVGPathElement[];
      slabs: SVGRectElement[];
      rows: SVGRectElement[];
      tokens: SVGTextElement[];
      shares: SVGTextElement[];
      kBlade: SVGPathElement;
      kTag: SVGGElement;
      kTagText: SVGTextElement;
      pBlade: SVGPathElement;
      pLine: SVGLineElement;
      pTag: SVGTextElement;
      fill: SVGRectElement;
      gauge: SVGRectElement;
      gaugeText: SVGTextElement;
      verdict: SVGTextElement;
    };
    const panels: Panel[] = [];

    const rowH = (c: number) => H / Math.max(1, contexts[c].permille.length);

    contexts.forEach((ctxData, c) => {
      const count = ctxData.permille.length;
      const g = el('g', { transform: `translate(${PANEL_X[c]},0)` }, root);
      const name = el(
        'text',
        { x: 0, y: 20, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: pal.text },
        g,
      );
      name.textContent = ctxData.id === 'peaked' ? t('label.peaked', 'Peaked context') : t('label.flat', 'Flat context');
      const prompt = el(
        'text',
        { x: 0, y: 40, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.textMuted },
        g,
      );
      prompt.textContent = ctxData.prompt;

      const ribbonLayer = el('g', {}, g);
      const rowLayer = el('g', {}, g);
      const slabLayer = el('g', {}, g);
      const bladeLayer = el('g', {}, g);

      const rh = rowH(c);
      const ribbons: SVGPathElement[] = [];
      const slabs: SVGRectElement[] = [];
      const rows: SVGRectElement[] = [];
      const tokens: SVGTextElement[] = [];
      const shares: SVGTextElement[] = [];
      for (let r = 0; r < count; r++) {
        ribbons.push(el('path', { fill: pastel[r % 8], 'fill-opacity': 0.85 }, ribbonLayer));
        const y = T + r * rh;
        rows.push(
          el(
            'rect',
            { x: 0, y: y + 2, width: LADDER_R, height: rh - 4, rx: 4, fill: pal.bgSubtle, stroke: pal.border },
            rowLayer,
          ),
        );
        const rank = el(
          'text',
          { x: 13, y: y + rh / 2 + 4, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted },
          rowLayer,
        );
        rank.textContent = String(r + 1);
        tokens.push(
          el(
            'text',
            { x: 19, y: y + rh / 2 + 4, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.text },
            rowLayer,
          ),
        );
        tokens[r].textContent = ctxData.tokens[r];
        shares.push(
          el(
            'text',
            {
              x: LADDER_R - 5,
              y: y + rh / 2 + 4,
              'text-anchor': 'end',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: pal.textMuted,
            },
            rowLayer,
          ),
        );
        slabs.push(el('rect', { x: COL_X, width: COL_W, fill: vivid[r % 8], stroke: pal.bg, 'stroke-width': 0.6 }, slabLayer));
      }
      el('rect', { x: COL_X, y: T, width: COL_W, height: H, fill: 'none', stroke: pal.textMuted }, slabLayer);

      const fill = el('rect', { x: FILL_X, width: 4, rx: 2, fill: pal.itemComparing }, bladeLayer);
      const pLine = el(
        'line',
        { x1: COL_X - 6, x2: FILL_X + 6, stroke: pal.itemComparing, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
        bladeLayer,
      );
      const pTag = el(
        'text',
        { x: TAG_X, 'font-family': fonts.body, 'font-size': fontSizes.xs, 'font-weight': 600, fill: pal.itemComparing },
        bladeLayer,
      );
      const pBlade = el(
        'path',
        { fill: 'none', stroke: pal.itemComparing, 'stroke-width': 2.5, 'stroke-linecap': 'round' },
        bladeLayer,
      );
      const kBlade = el(
        'path',
        { fill: 'none', stroke: pal.primary, 'stroke-width': 2.5, 'stroke-linecap': 'round' },
        bladeLayer,
      );
      const kTag = el('g', {}, bladeLayer);
      el('rect', { x: -2, y: -8, width: 24, height: 16, rx: 8, fill: pal.primary }, kTag);
      const kTagText = el(
        'text',
        {
          x: 10,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: pal.textInverse,
        },
        kTag,
      );

      const gaugeLabel = el(
        'text',
        { x: 0, y: GAUGE_Y + 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: pal.textMuted },
        g,
      );
      gaugeLabel.textContent = t('label.cutShare', 'Cut share');
      el('rect', { x: GAUGE_X, y: GAUGE_Y - 4, width: GAUGE_W, height: 8, rx: 4, fill: pal.bgSubtle, stroke: pal.border }, g);
      const gauge = el('rect', { x: GAUGE_X, y: GAUGE_Y - 4, height: 8, rx: 4, fill: pal.textMuted }, g);
      const gaugeText = el(
        'text',
        { x: GAUGE_X + GAUGE_W + 6, y: GAUGE_Y + 4, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.text },
        g,
      );
      const verdict = el(
        'text',
        { x: 0, y: VERDICT_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text },
        g,
      );

      panels.push({ ribbons, slabs, rows, tokens, shares, kBlade, kTag, kTagText, pBlade, pLine, pTag, fill, gauge, gaugeText, verdict });

      models.push(freshModel(c));
    });

    /** 마운트 때와 되감기 때의 모습 — 온전한 분포. 몫 글자는 첫 판의 round 가 채운다. */
    function freshModel(c: number): Model {
      const p = contexts[c].permille;
      let total = 0;
      for (const x of p) total += x;
      return {
        inside: p.map(() => true),
        scale: total,
        kN: p.length,
        pStop: -1,
        run: -1,
        focus: -1,
        share: p.map(() => -1),
        cutPermille: 0,
        total,
        cutPercent: 0,
        verdict: '',
      };
    }

    function applyFrame(c: number, f: ContextFrame | undefined): void {
      if (!f) return;
      const m = models[c];
      m.share = f.share.slice();
      m.inside = contexts[c].permille.map((_, r) => (f.share[r] ?? -1) >= 0);
      m.cutPermille = f.cutPermille;
      m.total = f.total;
      m.cutPercent = f.cutPercent;
    }

    // ── 기하: 모델 → 숫자 묶음. scaleOverride 는 "떨어졌지만 아직 부풀지 않은" 중간 모습
    function cumBefore(c: number, r: number, insideOnly: boolean): number {
      const m = models[c];
      const p = contexts[c].permille;
      let s = 0;
      for (let i = 0; i < r; i++) if (!insideOnly || m.inside[i]) s += p[i];
      return s;
    }

    function geomOf(scaleOverride?: number[]): Geom {
      const out: Geom = new Map();
      contexts.forEach((ctxData, c) => {
        const m = models[c];
        const scale = Math.max(1, scaleOverride?.[c] ?? m.scale);
        const rh = rowH(c);
        for (let r = 0; r < ctxData.permille.length; r++) {
          const y0 = T + (cumBefore(c, r, false) / scale) * H;
          const y1 = T + (cumBefore(c, r + 1, false) / scale) * H;
          out.set(`${c}:y0:${r}`, y0);
          out.set(`${c}:y1:${r}`, y1);
          out.set(`${c}:dy:${r}`, m.inside[r] ? 0 : FALL);
          out.set(`${c}:op:${r}`, m.inside[r] ? 1 : 0);
        }
        // 칼날의 기둥 쪽 끝은 그 순위 경계의 누적 깊이다. 부풀어 넘치면 기둥 바닥에 붙는다
        const bladeRight = (n: number) => Math.min(T + H, T + (cumBefore(c, n, false) / scale) * H);
        out.set(`${c}:kL`, T + m.kN * rh);
        out.set(`${c}:kR`, bladeRight(m.kN));
        out.set(`${c}:pL`, T + Math.max(0, m.pStop) * rh);
        out.set(`${c}:pR`, bladeRight(Math.max(0, m.pStop)));
        out.set(`${c}:pOp`, m.pStop >= 0 ? 1 : 0);
        out.set(`${c}:fill`, m.run >= 0 ? T + (Math.min(m.run, scale) / scale) * H : T);
        out.set(`${c}:fillOp`, m.run >= 0 ? 1 : 0);
        out.set(`${c}:pLine`, T + (topP / 100) * H);
        out.set(`${c}:gauge`, m.total > 0 ? (m.cutPermille / m.total) * GAUGE_W : 0);
      });
      return out;
    }

    let cur: Geom = geomOf();

    const n0 = (x: number) => (Math.abs(x) < 1e-9 ? 0 : Math.round(x * 100) / 100);

    function draw(): void {
      if (destroyed) return;
      contexts.forEach((ctxData, c) => {
        const P = panels[c];
        const m = models[c];
        const rh = rowH(c);
        const get = (k: string) => n0(cur.get(`${c}:${k}`) ?? 0);
        const midX = (LADDER_R + COL_X) / 2;
        for (let r = 0; r < ctxData.permille.length; r++) {
          const y0 = get(`y0:${r}`);
          const y1 = get(`y1:${r}`);
          const dy = get(`dy:${r}`);
          const op = get(`op:${r}`);
          const ly0 = n0(T + r * rh + 5);
          const ly1 = n0(T + (r + 1) * rh - 5);
          const ry0 = n0(y0 + dy);
          const ry1 = n0(Math.max(y0, y1) + dy);
          P.ribbons[r].setAttribute(
            'd',
            `M${LADDER_R},${ly0} C${midX},${ly0} ${midX},${ry0} ${COL_X},${ry0} L${COL_X},${ry1} C${midX},${ry1} ${midX},${ly1} ${LADDER_R},${ly1} Z`,
          );
          P.ribbons[r].setAttribute('opacity', String(op));
          P.slabs[r].setAttribute('y', String(ry0));
          P.slabs[r].setAttribute('height', String(n0(Math.max(0, ry1 - ry0))));
          P.slabs[r].setAttribute('opacity', String(op));
          const focus = m.focus === r;
          const stop = m.pStop >= 0 && m.pStop - 1 === r;
          P.rows[r].setAttribute('stroke', focus || stop ? pal.itemComparing : pal.border);
          P.rows[r].setAttribute('stroke-width', focus ? '2' : '1');
          P.tokens[r].setAttribute('fill', m.inside[r] ? pal.text : pal.textMuted);
          if (m.inside[r]) P.tokens[r].removeAttribute('text-decoration');
          else P.tokens[r].setAttribute('text-decoration', 'line-through');
          P.slabs[r].setAttribute('stroke', focus ? pal.text : pal.bg);
          P.slabs[r].setAttribute('stroke-width', focus ? '2' : '0.6');
        }
        const blade = (yl: number, yr: number) =>
          `M0,${yl} H${LADDER_R} C${midX},${yl} ${midX},${yr} ${COL_X},${yr} H${COL_X + COL_W}`;
        const kL = get('kL');
        P.kBlade.setAttribute('d', blade(kL, get('kR')));
        P.kTag.setAttribute('transform', `translate(0,${kL})`);
        P.pBlade.setAttribute('d', blade(get('pL'), get('pR')));
        P.pBlade.setAttribute('opacity', String(get('pOp')));
        const pl = get('pLine');
        P.pLine.setAttribute('y1', String(pl));
        P.pLine.setAttribute('y2', String(pl));
        P.pTag.setAttribute('y', String(n0(pl + 4)));
        const fy = get('fill');
        P.fill.setAttribute('y', String(T));
        P.fill.setAttribute('height', String(n0(Math.max(0, fy - T))));
        P.fill.setAttribute('opacity', String(get('fillOp')));
        P.gauge.setAttribute('width', String(n0(Math.max(0, get('gauge')))));
      });
    }

    /** 글자 — 모델에서 곧바로. */
    function drawText(): void {
      contexts.forEach((ctxData, c) => {
        const P = panels[c];
        const m = models[c];
        for (let r = 0; r < ctxData.permille.length; r++) {
          const v = m.share[r] ?? -1;
          P.shares[r].textContent = v >= 0 ? t('label.share', '{v}%', { v }) : '';
        }
        P.kTagText.textContent = t('label.kTag', 'k {k}', { k: topK });
        P.pTag.textContent = t('label.pTag', 'p {p}', { p: pLabel });
        P.gaugeText.textContent = t('label.share', '{v}%', { v: m.cutPercent });
        P.verdict.textContent = m.verdict;
      });
    }

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const nextFrame = (fn: () => void) => {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          fn();
        });
        frames.add(id);
      } else {
        const id = setTimeout(() => {
          timers.delete(id);
          fn();
        }, 16);
        timers.add(id);
      }
    };

    /** 지금 모습에서 target 으로 흘린다. 새 흐름이 시작되면 옛 흐름은 물러난다. */
    function tween(target: Geom, dur: number, mine: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) return resolve();
        if (dur <= 0) {
          cur = new Map(target);
          draw();
          return resolve();
        }
        const from = new Map(cur);
        const start = now();
        const frame = () => {
          if (destroyed || mine !== gen) return resolve();
          const k = Math.min(1, (now() - start) / dur);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const next: Geom = new Map();
          for (const [key, to] of target) {
            const f = from.get(key) ?? to;
            next.set(key, f + (to - f) * e);
          }
          cur = next;
          draw();
          if (k < 1) nextFrame(frame);
          else resolve();
        };
        nextFrame(frame);
      });
    }

    /** 두 토막 — 떨어지는 것이 먼저, 부푸는 것이 나중. */
    function fallThenSwell(prevScale: number[], dur: number): void {
      const mine = (gen += 1);
      const mid = geomOf(prevScale);
      const end = geomOf();
      void tween(mid, dur * 0.45, mine).then(() => {
        if (destroyed || mine !== gen) return;
        return tween(end, dur * 0.55, mine);
      });
    }

    drawText();
    draw();

    const stage: TopKTopPStage = {
      round(k, p, label, frames, dur) {
        if (contexts.length === 0) return;
        topK = k;
        topP = p;
        pLabel = label;
        contexts.forEach((ctxData, c) => {
          models[c] = freshModel(c);
          models[c].kN = Math.min(k, ctxData.permille.length);
          applyFrame(c, frames[c]);
        });
        drawText();
        void tween(geomOf(), dur, (gen += 1));
      },
      cutK(kept, mass, frames, dur) {
        if (contexts.length === 0) return;
        const prev = models.map((m) => m.scale);
        contexts.forEach((ctxData, c) => {
          const m = models[c];
          m.kN = kept[c] ?? ctxData.permille.length;
          m.scale = mass[c] ?? m.scale;
          applyFrame(c, frames[c]);
        });
        drawText();
        fallThenSwell(prev, dur);
      },
      check(rank, status, run, frames, dur) {
        if (contexts.length === 0) return;
        contexts.forEach((_, c) => {
          const m = models[c];
          const s = status[c];
          m.run = run[c] ?? m.run;
          m.focus = s === 'stay' || s === 'reach' ? rank : -1;
          if (s === 'reach') {
            const stop = rank + 1;
            m.pStop = stop < m.kN ? stop : -1;
          }
          applyFrame(c, frames[c]);
        });
        drawText();
        void tween(geomOf(), dur, (gen += 1));
      },
      settle(keptSum, frames, dur) {
        if (contexts.length === 0) return;
        const prev = models.map((m) => m.scale);
        contexts.forEach((_, c) => {
          const m = models[c];
          m.scale = keptSum[c] ?? m.scale;
          m.focus = -1;
          m.run = -1;
          applyFrame(c, frames[c]);
        });
        drawText();
        fallThenSwell(prev, dur);
      },
      verdict(cutter) {
        if (contexts.length === 0) return;
        contexts.forEach((_, c) => {
          const who = cutter[c];
          models[c].verdict =
            who === 'k'
              ? t('label.cutBy.k', 'Cut by: k')
              : who === 'p'
                ? t('label.cutBy.p', 'Cut by: p')
                : who === 'renorm-p'
                  ? t('label.cutBy.renormP', 'Cut by: p on the rescaled rest')
                  : t('label.cutBy.none', 'Nothing cut');
        });
        drawText();
      },
      reset() {
        if (destroyed) return;
        gen += 1;
        topK = 8;
        topP = 100;
        pLabel = '1';
        contexts.forEach((_, c) => {
          models[c] = freshModel(c);
        });
        captionLines[0].textContent = '';
        captionLines[1].textContent = '';
        cur = geomOf();
        drawText();
        draw();
      },
      setCaption(text) {
        if (destroyed) return;
        const lines = wrap(text, 92);
        captionLines[0].textContent = lines[0] ?? '';
        captionLines[1].textContent = lines[1] ?? '';
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        }
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    };
  },
};
