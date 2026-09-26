/**
 * determinant-must-be-key 무대.
 *
 * 위 — 결정자마다 칸 하나. 표의 열이 둘레에 놓이고, 씨앗(결정자 열)에서 선언된 종속을 따라
 * 물길이 뻗어 정해지는 열을 적신다. 다 적시면 열쇠, 물길이 멈춰 못 닿은 열이 남으면 열쇠가 아니다.
 * 아래 — 표의 줄과 선언된 종속. 열쇠가 아닌 결정자가 정한 짝이 칸에서 내려와 되풀이된 줄에 앉는다.
 *
 * 그리기의 정본은 `drawStatic(scene)` 이다. 운동은 그 위에서 아직 못 온 만큼만 그린다.
 */
import {
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
import type { DeterminantScene, Panel } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const PANEL_GAP = 16;
const PANEL_TOP = 44;
const PANEL_H = 200;
const LOWER_TOP = PANEL_TOP + PANEL_H + 18;
const TOKEN_H = 26;
const STREAM_W = 4;
const HEAD = 7;
const COL_W_MAX = 100;
const ROW_H_MAX = 22;

const SEED_MS = 600;
const SPREAD_MS = 700;
const HALT_MS = 700;
const REPEAT_MS = 700;

const MONO_PX = parseFloat(fontSizes.sm);
const MONO_CHAR = MONO_PX * 0.6;

type Pt = { x: number; y: number };

type TokenHandle = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; at: Pt };
type StreamHandle = { line: SVGLineElement; head: SVGPolygonElement; from: Pt; end: Pt; tip: Pt };
type StubHandle = { line: SVGLineElement; bar: SVGLineElement; from: Pt; end: Pt };
type PanelHandle = {
  tokens: Map<string, TokenHandle>;
  streams: StreamHandle[][];
  stubs: StubHandle[];
  badge: SVGGElement | null;
  top: Pt;
  center: Pt;
};
type Handles = {
  panels: PanelHandle[];
  marks: SVGRectElement[];
  chips: { from: Pt; to: Pt; label: string }[];
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  o: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': o.mono === true ? fonts.mono : fonts.body,
    'font-size': o.size,
    fill: o.fill,
    'text-anchor': o.anchor ?? 'middle',
    'dominant-baseline': 'middle',
  });
  if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
  node.textContent = body;
  return node;
}

function monoWidth(s: string): number {
  return s.length * MONO_CHAR;
}

/** 칸 i 의 가로 범위. */
function panelBox(i: number, n: number): { x: number; w: number } {
  const w = (W - 2 * MARGIN - (n - 1) * PANEL_GAP) / n;
  return { x: MARGIN + i * (w + PANEL_GAP), w };
}

/** 칸 안에서 열 하나가 앉는 자리 — 열 차례로 둘레를 돈다. 첫 열이 왼쪽 아래. */
function tokenAt(i: number, n: number, colIndex: number, colCount: number): Pt {
  const box = panelBox(i, n);
  const cx = box.x + box.w / 2;
  const cy = PANEL_TOP + 112;
  const rad = Math.min(box.w * 0.3, 64);
  const a = -Math.PI / 2 + (colIndex - (colCount - 1) / 2) * ((2 * Math.PI) / colCount);
  return { x: r1(cx + rad * Math.cos(a)), y: r1(cy + rad * Math.sin(a)) };
}

function toward(a: Pt, b: Pt, back: number): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...b };
  return { x: b.x - (dx / len) * back, y: b.y - (dy / len) * back };
}

/** 알맹이(가운데 at, 반폭 hw)의 가장자리까지 — 방향 a→b 로 잰 거리. */
function edgeReach(a: Pt, b: Pt, hw: number): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const hh = TOKEN_H / 2;
  return Math.min(ux === 0 ? Infinity : hw / ux, uy === 0 ? Infinity : hh / uy);
}

function tokenHalf(col: string): number {
  return (monoWidth(col) + 20) / 2;
}

/** 글자 폭 짐작 — 넓은 글자(한글 · 한자 · 가나)는 한 칸, 나머지는 0.6 칸. */
function bodyWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? px : px * 0.6;
  return w;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function headPoints(from: Pt, tip: Pt): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tip.x - ux * HEAD * 1.6;
  const by = tip.y - uy * HEAD * 1.6;
  const pts = [
    [tip.x, tip.y],
    [bx - uy * HEAD, by + ux * HEAD],
    [bx + uy * HEAD, by - ux * HEAD],
  ];
  return pts.map(([x, y]) => `${r1(x!)},${r1(y!)}`).join(' ');
}

type TokenLook = { fill: string; stroke: string; ink: string; dashed: boolean };

function lookOf(panel: Panel, seed: string[], col: string, c: Palette): TokenLook {
  if (panel.planted && seed.includes(col)) {
    return { fill: c.accent, stroke: c.accent, ink: c.stateInk, dashed: false };
  }
  if (panel.reached.includes(col)) {
    return { fill: c.itemActive, stroke: c.itemActive, ink: c.stateInk, dashed: false };
  }
  if (panel.missing.includes(col)) {
    return { fill: c.bg, stroke: c.danger, ink: c.danger, dashed: true };
  }
  return { fill: c.bgSubtle, stroke: c.border, ink: c.text, dashed: false };
}

function paintToken(h: TokenHandle, look: TokenLook): void {
  h.rect.setAttribute('fill', look.fill);
  h.rect.setAttribute('stroke', look.stroke);
  if (look.dashed) h.rect.setAttribute('stroke-dasharray', '4 3');
  else h.rect.removeAttribute('stroke-dasharray');
  h.text.setAttribute('fill', look.ink);
}

function scaleAbout(g: SVGGElement, at: Pt, s: number): void {
  if (s === 1) {
    g.removeAttribute('transform');
    return;
  }
  const k = r1(s * 100) / 100;
  g.setAttribute(
    'transform',
    `translate(${r1(at.x)} ${r1(at.y)}) scale(${k}) translate(${r1(-at.x)} ${r1(-at.y)})`,
  );
}

export const determinantMustBeKeyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function caption(scene: DeterminantScene): string {
      const step = scene.step;
      const base = scene.base;
      if (step === null) {
        return t('caption.start', 'Each determinant becomes a seed. Declared dependencies: {n}.', {
          n: base.dependencies.length,
        });
      }
      const panel = scene.panels[step.panel]!;
      if (step.kind === 'seed') {
        return t('caption.seed', 'Seed: {cols}.', {
          cols: base.determinants[step.panel]!.join(', '),
        });
      }
      if (step.kind === 'spread') {
        const stream = panel.streams[step.stream]!;
        const vars = {
          fd: t('label.fd', 'FD{n}', { n: stream.fd + 1 }),
          added: stream.to.join(', '),
          n: panel.reached.length,
          total: base.columns.length,
        };
        return t('caption.spread', '{fd} applies. Added: {added}. Reached: {n} / {total}.', vars);
      }
      if (step.kind === 'halt') {
        return t('caption.halt', 'No dependency adds more. Not reached: {missing}.', {
          missing: panel.missing.join(', '),
        });
      }
      const rep = scene.repeat;
      if (rep === null) throw new Error('determinant-must-be-key-stage: repeat 걸음에 되풀이가 없다');
      // 칠하는 것과 같은 것을 센다 — 모든 무리의 짝과 그 줄 전부
      return t('caption.repeat', 'Repeated pairs: {pairs}. Rows: {n}.', {
        pairs: rep.groups.map((g) => g.values.join(' · ')).join('; '),
        n: rep.groups.reduce((sum, g) => sum + g.rows.length, 0),
      });
    }

    function drawStatic(scene: DeterminantScene): Handles {
      svg.textContent = '';
      const base = scene.base;
      const nPanels = base.determinants.length;
      const handles: Handles = { panels: [], marks: [], chips: [] };

      label(svg, W / 2, 24, caption(scene), { size: fontSizes.md, fill: c.text });

      // ── 결정자 칸 ──
      base.determinants.forEach((seed, pi) => {
        const panel = scene.panels[pi]!;
        const box = panelBox(pi, nPanels);
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: box.x,
          y: PANEL_TOP,
          width: box.w,
          height: PANEL_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        });
        const top = { x: r1(box.x + box.w / 2), y: PANEL_TOP + 20 };
        label(g, top.x, top.y, t('label.determinant', 'Determinant: {cols}', { cols: seed.join(', ') }), {
          size: fontSizes.sm,
          fill: c.textMuted,
        });
        const at = new Map<string, Pt>();
        base.columns.forEach((col, ci) => at.set(col, tokenAt(pi, nPanels, ci, base.columns.length)));

        // 물길 — 종속의 왼쪽 열마다 더해진 열로
        const streamLayer = el(g, 'g', {});
        const streams: StreamHandle[][] = panel.streams.map((s) => {
          const dep = base.dependencies[s.fd]!;
          const out: StreamHandle[] = [];
          for (const src of dep.lhs) {
            for (const dst of s.to) {
              const from = at.get(src)!;
              const to = at.get(dst)!;
              const tip = toward(from, to, edgeReach(to, from, tokenHalf(dst)) + 3);
              const end = toward(from, tip, HEAD * 1.4);
              const line = el(streamLayer, 'line', {
                x1: from.x,
                y1: from.y,
                x2: end.x,
                y2: end.y,
                stroke: c.itemActive,
                'stroke-width': STREAM_W,
                'stroke-linecap': 'round',
              });
              const head = el(streamLayer, 'polygon', {
                points: headPoints(from, tip),
                fill: c.itemActive,
              });
              out.push({ line, head, from, end, tip });
            }
          }
          return out;
        });

        // 멈춘 물머리 — 닿은 열 가운데 가장 가까운 데서 못 닿은 열 쪽으로 반쯤 가다 막힌다
        const stubs: StubHandle[] = panel.missing.map((m) => {
          const target = at.get(m)!;
          let near = at.get(panel.reached[0]!)!;
          for (const rc of panel.reached) {
            const p = at.get(rc)!;
            if (Math.hypot(p.x - target.x, p.y - target.y) < Math.hypot(near.x - target.x, near.y - target.y)) {
              near = p;
            }
          }
          const nearCol = panel.reached.find((rc) => at.get(rc) === near)!;
          const start = toward(target, near, edgeReach(near, target, tokenHalf(nearCol)) + 2);
          const stop = toward(near, target, edgeReach(target, near, tokenHalf(m)) + 2);
          const end = lerp(start, stop, 0.55);
          const line = el(streamLayer, 'line', {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            stroke: c.danger,
            'stroke-width': STREAM_W - 1,
            'stroke-dasharray': '5 4',
          });
          const dx = target.x - near.x;
          const dy = target.y - near.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * 9;
          const ny = (dx / len) * 9;
          const bar = el(streamLayer, 'line', {
            x1: end.x + nx,
            y1: end.y + ny,
            x2: end.x - nx,
            y2: end.y - ny,
            stroke: c.danger,
            'stroke-width': STREAM_W - 1,
            'stroke-linecap': 'round',
          });
          return { line, bar, from: start, end };
        });

        // 열 알맹이
        const tokens = new Map<string, TokenHandle>();
        for (const col of base.columns) {
          const p = at.get(col)!;
          const tg = el(g, 'g', {});
          const w = monoWidth(col) + 20;
          const rect = el(tg, 'rect', {
            x: p.x - w / 2,
            y: p.y - TOKEN_H / 2,
            width: w,
            height: TOKEN_H,
            rx: TOKEN_H / 2,
            'stroke-width': 1.5,
          });
          const text = label(tg, p.x, p.y, col, { size: fontSizes.sm, fill: c.text, mono: true });
          const h = { g: tg, rect, text, at: p };
          paintToken(h, lookOf(panel, seed, col, c));
          tokens.set(col, h);
          if (panel.missing.includes(col)) {
            label(tg, p.x, p.y + TOKEN_H / 2 + 11, t('label.notReached', 'not reached'), {
              size: fontSizes.xs,
              fill: c.danger,
            });
          }
        }

        // 닿은 수와 판정
        const footY = PANEL_TOP + PANEL_H - 18;
        if (panel.planted) {
          label(
            g,
            box.x + 14,
            footY,
            t('label.reached', 'Reached: {n} / {total}', {
              n: panel.reached.length,
              total: base.columns.length,
            }),
            { size: fontSizes.sm, fill: c.textMuted, anchor: 'start' },
          );
        }
        let badge: SVGGElement | null = null;
        const whole = panel.reached.length === base.columns.length;
        if (whole || panel.halted) {
          badge = el(g, 'g', {});
          const word = whole ? t('label.key', 'Key') : t('label.notKey', 'Not a key');
          const bw = bodyWidth(word, parseFloat(fontSizes.sm)) + 18;
          el(badge, 'rect', {
            x: box.x + box.w - 12 - bw,
            y: footY - 11,
            width: bw,
            height: 22,
            rx: 11,
            fill: whole ? c.primary : c.danger,
          });
          label(badge, box.x + box.w - 12 - bw / 2, footY, word, {
            size: fontSizes.sm,
            fill: whole ? c.textInverse : c.stateInk,
            weight: '600',
          });
        }
        handles.panels.push({
          tokens,
          streams,
          stubs,
          badge,
          top,
          center: { x: top.x, y: PANEL_TOP + 112 },
        });
      });

      // ── 표 ──
      const tableW = W / 2 - MARGIN;
      const colW = Math.min(COL_W_MAX, tableW / base.columns.length);
      const headY = LOWER_TOP + 32;
      const rowTop = headY + 12;
      const rowH = Math.min(ROW_H_MAX, (H - 8 - rowTop) / Math.max(1, base.rows.length));
      label(svg, MARGIN, LOWER_TOP + 10, base.table, {
        size: fontSizes.sm,
        fill: c.textMuted,
        mono: true,
        anchor: 'start',
        weight: '600',
      });
      const tg = el(svg, 'g', {});
      const markLayer = el(tg, 'g', {});
      base.columns.forEach((col, ci) => {
        label(tg, MARGIN + ci * colW + 8, headY, col, {
          size: fontSizes.sm,
          fill: c.text,
          mono: true,
          anchor: 'start',
          weight: '600',
        });
      });
      el(tg, 'line', {
        x1: MARGIN,
        y1: rowTop,
        x2: MARGIN + colW * base.columns.length,
        y2: rowTop,
        stroke: c.border,
      });
      base.rows.forEach((row, ri) => {
        const y = rowTop + ri * rowH + rowH / 2;
        row.forEach((v, ci) => {
          label(tg, MARGIN + ci * colW + 8, y, v, {
            size: fontSizes.sm,
            fill: c.text,
            mono: true,
            anchor: 'start',
          });
        });
      });

      // 되풀이된 짝이 앉은 칸
      const rep = scene.repeat;
      if (rep !== null) {
        const src = handles.panels[rep.determinant]!.center;
        for (const group of rep.groups) {
          const chip = group.values.join(' · ');
          for (const ri of group.rows) {
            const y = rowTop + ri * rowH;
            const xs: number[] = [];
            for (const col of rep.columns) {
              const ci = base.columns.indexOf(col);
              xs.push(MARGIN + ci * colW);
              handles.marks.push(
                el(markLayer, 'rect', {
                  x: MARGIN + ci * colW + 2,
                  y: y + 1.5,
                  width: colW - 4,
                  height: rowH - 3,
                  rx: 4,
                  fill: c.accent,
                  'fill-opacity': 0.55,
                }),
              );
            }
            const left = Math.min(...xs);
            const right = Math.max(...xs) + colW;
            handles.chips.push({ from: src, to: { x: r1((left + right) / 2), y: r1(y + rowH / 2) }, label: chip });
          }
        }
      }

      // ── 선언된 종속 ──
      const fx = W / 2 + 18;
      label(svg, fx, LOWER_TOP + 10, t('label.dependencies', 'Declared dependencies'), {
        size: fontSizes.sm,
        fill: c.textMuted,
        anchor: 'start',
      });
      const current =
        scene.step !== null && scene.step.kind === 'spread'
          ? scene.panels[scene.step.panel]!.streams[scene.step.stream]!.fd
          : -1;
      base.dependencies.forEach((dep, n) => {
        const y = LOWER_TOP + 40 + n * 30;
        if (n === current) {
          el(svg, 'rect', {
            x: fx - 6,
            y: y - 12,
            width: W - MARGIN - fx + 6,
            height: 24,
            rx: 5,
            fill: c.accent,
            'fill-opacity': 0.45,
          });
        }
        label(svg, fx, y, t('label.fd', 'FD{n}', { n: n + 1 }), {
          size: fontSizes.sm,
          fill: c.textMuted,
          anchor: 'start',
        });
        label(svg, fx + 40, y, `${dep.lhs.join(', ')} → ${dep.rhs.join(', ')}`, {
          size: fontSizes.sm,
          fill: c.text,
          mono: true,
          anchor: 'start',
        });
      });
      return handles;
    }

    // ── 걸음마다의 운동 — 정적 그림 위에서 아직 못 온 만큼 ──

    async function moveSeed(mine: number, scene: DeterminantScene, h: Handles, pi: number): Promise<void> {
      const ph = h.panels[pi]!;
      const seed = scene.base.determinants[pi]!;
      const idle: TokenLook = { fill: c.bgSubtle, stroke: c.border, ink: c.text, dashed: false };
      const drops = seed.map((col) => {
        const tok = ph.tokens.get(col)!;
        paintToken(tok, idle);
        return {
          tok,
          dot: el(svg, 'circle', { cx: ph.top.x, cy: ph.top.y + 10, r: 7, fill: c.accent, stroke: c.stateInk }),
        };
      });
      if (ph.badge !== null) ph.badge.setAttribute('opacity', '0');
      await tween(mine, SEED_MS, (p) => {
        const e = ease(p);
        for (const d of drops) {
          const at = lerp({ x: ph.top.x, y: ph.top.y + 10 }, d.tok.at, e);
          d.dot.setAttribute('cx', String(r1(at.x)));
          d.dot.setAttribute('cy', String(r1(at.y)));
          if (p >= 1) {
            d.dot.remove();
            paintToken(d.tok, { fill: c.accent, stroke: c.accent, ink: c.stateInk, dashed: false });
          }
        }
      });
    }

    async function moveSpread(
      mine: number,
      scene: DeterminantScene,
      h: Handles,
      pi: number,
      si: number,
    ): Promise<void> {
      const ph = h.panels[pi]!;
      const lines = ph.streams[si]!;
      const targets = scene.panels[pi]!.streams[si]!.to.map((col) => ph.tokens.get(col)!);
      const idle: TokenLook = { fill: c.bgSubtle, stroke: c.border, ink: c.text, dashed: false };
      const wet: TokenLook = { fill: c.itemActive, stroke: c.itemActive, ink: c.stateInk, dashed: false };
      for (const tok of targets) paintToken(tok, idle);
      for (const s of lines) s.head.setAttribute('opacity', '0');
      if (ph.badge !== null) ph.badge.setAttribute('opacity', '0');
      const FLOW = 0.72;
      await tween(mine, SPREAD_MS, (p) => {
        const q = ease(Math.min(1, p / FLOW));
        for (const s of lines) {
          const at = lerp(s.from, s.end, q);
          s.line.setAttribute('x2', String(r1(at.x)));
          s.line.setAttribute('y2', String(r1(at.y)));
          if (p >= FLOW) s.head.removeAttribute('opacity');
        }
        if (p >= FLOW) {
          const k = (p - FLOW) / (1 - FLOW);
          for (const tok of targets) {
            paintToken(tok, wet);
            scaleAbout(tok.g, tok.at, 1 + 0.18 * Math.sin(Math.PI * k));
          }
        }
        if (p >= 1) {
          for (const tok of targets) scaleAbout(tok.g, tok.at, 1);
          if (ph.badge !== null) ph.badge.removeAttribute('opacity');
        }
      });
    }

    async function moveHalt(mine: number, scene: DeterminantScene, h: Handles, pi: number): Promise<void> {
      const ph = h.panels[pi]!;
      const panel = scene.panels[pi]!;
      const idle: TokenLook = { fill: c.bgSubtle, stroke: c.border, ink: c.text, dashed: false };
      const missing = panel.missing.map((col) => ph.tokens.get(col)!);
      const reached = panel.reached.map((col) => ph.tokens.get(col)!);
      for (const tok of missing) {
        paintToken(tok, idle);
        tok.g.setAttribute('opacity', '0.55');
      }
      for (const s of ph.stubs) s.bar.setAttribute('opacity', '0');
      if (ph.badge !== null) ph.badge.setAttribute('opacity', '0');
      const RUN = 0.6;
      await tween(mine, HALT_MS, (p) => {
        const q = ease(Math.min(1, p / RUN));
        for (const s of ph.stubs) {
          const at = lerp(s.from, s.end, q);
          s.line.setAttribute('x2', String(r1(at.x)));
          s.line.setAttribute('y2', String(r1(at.y)));
          if (p >= RUN) s.bar.removeAttribute('opacity');
        }
        if (p >= RUN) {
          const k = (p - RUN) / (1 - RUN);
          // 번짐이 막혀 되밀린다 — 닿은 알맹이가 한 번 부풀었다 가라앉는다
          for (const tok of reached) scaleAbout(tok.g, tok.at, 1 + 0.1 * Math.sin(Math.PI * k));
        }
        if (p >= 1) {
          for (const tok of reached) scaleAbout(tok.g, tok.at, 1);
          for (const tok of missing) tok.g.removeAttribute('opacity');
          if (ph.badge !== null) ph.badge.removeAttribute('opacity');
        }
      });
    }

    async function moveRepeat(mine: number, h: Handles): Promise<void> {
      for (const m of h.marks) m.setAttribute('opacity', '0');
      const chips = h.chips.map((cp) => {
        const w = monoWidth(cp.label) + 16;
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: -w / 2,
          y: -11,
          width: w,
          height: 22,
          rx: 11,
          fill: c.accent,
          stroke: c.stateInk,
          'stroke-width': 1,
        });
        label(g, 0, 0, cp.label, { size: fontSizes.sm, fill: c.stateInk, mono: true });
        g.setAttribute('transform', `translate(${r1(cp.from.x)} ${r1(cp.from.y)})`);
        return { g, cp };
      });
      const n = Math.max(1, chips.length);
      const LAG = 0.12;
      await tween(mine, REPEAT_MS, (p) => {
        chips.forEach((ch, i) => {
          const start = (LAG * i) / n;
          const q = ease(Math.max(0, Math.min(1, (p - start) / (1 - LAG))));
          const at = lerp(ch.cp.from, ch.cp.to, q);
          ch.g.setAttribute('transform', `translate(${r1(at.x)} ${r1(at.y)})`);
        });
        if (p >= 1) {
          for (const ch of chips) ch.g.remove();
          for (const m of h.marks) m.removeAttribute('opacity');
        }
      });
    }

    const inst = {
      async render(
        next: DeterminantScene,
        _prev: DeterminantScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null) return;
        if (step.kind === 'seed') await moveSeed(mine, next, handles, step.panel);
        else if (step.kind === 'spread') await moveSpread(mine, next, handles, step.panel, step.stream);
        else if (step.kind === 'halt') await moveHalt(mine, next, handles, step.panel);
        else await moveRepeat(mine, handles);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
    return inst;
  },
};
