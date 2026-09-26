/**
 * resolve-to-declaration 의 무대.
 *
 * 왼쪽 여백에 선언마다 줄기 하나가 선다. 쓰임을 선언에 이으면 그 쓰임의 줄에서 줄기로 가지가 뻗고,
 * 줄기를 타고 **위로** 선언 줄까지 거슬러 오른다. 이을 선을 긋기 전에 찾기가 먼저 움직인다 —
 * 쓰인 이름 자리에서 시작한 찾기 영역이 가장 안쪽 몸의 모양으로 부풀고, 거기 선언이 없으면
 * 한 겹 바깥 몸으로 다시 부푼다. 선언 하나는 한 색이라, 같은 `step` 이라도 가리키는 선언에 따라
 * 밑줄 색이 갈린다.
 */

import {
  categorical,
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
import type { ResolveToDeclarationScene, SceneScope } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 찾기가 몸 하나로 부풀어 가는 시간 */
const PROBE_MS = 170;
/** 쓰임에서 선언까지 선이 그어지는 시간 */
const LINK_MS = 250;

const LINE_H_MAX = 32;
const LANE_GAP_MAX = 12;
const TOP_Y = 26;
const CAPTION_H = 70;

type Pt = [number, number];

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r === 0 ? 0 : r);
}

function put(parent: Element, tag: string, attrs: Record<string, string | number>, content?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerpPoly(a: Pt[], b: Pt[], p: number): Pt[] {
  return a.map((pt, i) => [pt[0] + (b[i][0] - pt[0]) * p, pt[1] + (b[i][1] - pt[1]) * p]);
}

function polyAttr(pts: Pt[]): string {
  return pts.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
}

/** 꺾은선을 앞에서부터 p 만큼만 */
function partialPath(pts: Pt[], p: number): Pt[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let left = total * Math.max(0, Math.min(1, p));
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const d = seg[i - 1];
    if (left >= d) {
      out.push(pts[i]);
      left -= d;
      continue;
    }
    const f = d === 0 ? 0 : left / d;
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
    break;
  }
  return out;
}

/** 흘리는 도중의 한 프레임. 없으면 그 장면의 끝 화면이다. */
type Frame = {
  /** 몇 번째 찾아본 스코프로 부푸는 중인가 (looked 의 번호). looked.length 면 찾기가 끝났다 */
  probe: number;
  probeT: number;
  linkT: number;
};

type Layout = {
  fs: number;
  cw: number;
  lh: number;
  laneGap: number;
  laneX0: number;
  codeX: number;
  codeRight: number;
  labelX: number;
};

function layoutOf(scene: ResolveToDeclarationScene): Layout {
  const baseFs = parseFloat(fontSizes.xl);
  const lanes = Math.max(1, scene.decls.length);
  const laneX0 = 50;
  const laneGap = Math.min(LANE_GAP_MAX, 90 / lanes);
  const codeX = laneX0 + (lanes - 1) * laneGap + 30;
  const maxChars = Math.max(1, ...scene.lines.map((l) => l.indent * 4 + l.text.length));
  const labelRoom = 110;
  const cw = Math.min(baseFs * 0.6, (PIECE_CANVAS_W - codeX - labelRoom - 30) / maxChars);
  const fs = cw / 0.6;
  const n = Math.max(1, scene.lines.length);
  const lh = Math.min(LINE_H_MAX, (H - TOP_Y - CAPTION_H - 10) / n);
  const codeRight = codeX + maxChars * cw;
  return { fs, cw, lh, laneGap, laneX0, codeX, codeRight, labelX: codeRight + 32 };
}

/** 몸 i 를 감싼 스코프의 수 — 머리줄이 바깥 몸 안에 있으면 그 몸이 감싼다 */
const scopeDepth = (scopes: SceneScope[], i: number): number => {
  const si = scopes[i];
  return scopes.filter(
    (sj, j) => j !== i && (sj.kind === 'top' || (si.head !== null && sj.first <= si.head && si.last <= sj.last)),
  ).length;
};

export const resolveToDeclarationStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const tone = params.theme === 'dark' ? 'vivid' : 'deep';

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const lineTop = (L: Layout, k: number): number => TOP_Y + (k - 1) * L.lh;
    const lineMid = (L: Layout, k: number): number => lineTop(L, k) + L.lh / 2;
    const textX = (L: Layout, scene: ResolveToDeclarationScene, k: number): number =>
      L.codeX + scene.lines[k - 1].indent * 4 * L.cw;
    const laneX = (L: Layout, d: number): number => L.laneX0 + d * L.laneGap;
    const slotY = (L: Layout, line: number, slot: number, slots: number): number => {
      const gap = Math.min(5, (L.lh * 0.5) / Math.max(1, slots - 1));
      return lineMid(L, line) + (slot - (slots - 1) / 2) * gap;
    };

    /** 스코프의 모양 — 여섯 점. 인자 · for 변수가 머리줄에 있으면 그 자리까지 턱이 올라간다. */
    function scopeShape(L: Layout, scene: ResolveToDeclarationScene, i: number): Pt[] {
      const s = scene.scopes[i];
      const depth = scopeDepth(scene.scopes, i);
      const R = L.codeRight + 20 - depth * 8;
      if (s.kind === 'top') {
        const T = lineTop(L, s.first) - 8;
        const B = lineTop(L, s.last) + L.lh + 8;
        const Lx = L.codeX - 12;
        return [[Lx, T], [R, T], [R, B], [Lx, B], [Lx, T], [Lx, T]];
      }
      const bodyL = textX(L, scene, s.first) - 7;
      const T = lineTop(L, s.first) + 1;
      const B = lineTop(L, s.last) + L.lh - 1;
      const onHead = scene.decls.filter((d) => d.scope === i && d.line === s.head);
      if (s.head === null || onHead.length === 0) return [[bodyL, T], [R, T], [R, B], [bodyL, B], [bodyL, T], [bodyL, T]];
      const col = Math.min(...onHead.map((d) => d.col));
      const tabL = textX(L, scene, s.head) + col * L.cw - 4;
      const headT = lineTop(L, s.head) + 3;
      return [[tabL, headT], [R, headT], [R, B], [bodyL, B], [bodyL, T], [tabL, T]];
    }

    function tokenBox(L: Layout, scene: ResolveToDeclarationScene, line: number, col: number, len: number): Pt[] {
      const x = textX(L, scene, line) + col * L.cw - 3;
      const x2 = x + len * L.cw + 6;
      const y = lineMid(L, line) - L.fs * 0.62;
      const y2 = lineMid(L, line) + L.fs * 0.62;
      return [[x, y], [x2, y], [x2, y2], [x, y2], [x, y], [x, y]];
    }

    function scopeLabel(s: SceneScope): string {
      if (s.kind === 'top') return t('label.scope.top', 'Outermost');
      if (s.kind === 'function') {
        if (s.name === null) throw new Error('resolve-to-declaration: 함수 스코프에 이름이 없다');
        return t('label.scope.function', 'Body of {name}', { name: s.name });
      }
      if (s.kind === 'if') return t('label.scope.if', 'Body of if');
      return t('label.scope.for', 'Body of for');
    }

    function draw(scene: ResolveToDeclarationScene, frame: Frame | null): void {
      svg.textContent = '';
      const L = layoutOf(scene);
      const colorsOf = categorical(Math.max(1, scene.decls.length), tone);
      const step = scene.step;
      const probeDone = frame === null || frame.probe >= (step?.looked.length ?? 0);
      const linkT = frame === null ? 1 : frame.linkT;
      const linkDone = probeDone && linkT >= 1;
      const trail = step !== null && !linkDone ? scene.links.slice(0, -1) : scene.links;
      const readLine = step === null ? 0 : scene.uses[step.use].line;

      put(svg, 'rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg });
      const gProbe = put(svg, 'g', {});
      const gScope = put(svg, 'g', {});
      const gLink = put(svg, 'g', {});
      const gMark = put(svg, 'g', {});
      const gText = put(svg, 'g', {});

      // 스코프 테두리와 이름
      scene.scopes.forEach((s, i) => {
        const looked = step !== null && step.looked.slice(0, frame === null ? step.looked.length : frame.probe).includes(i);
        put(gScope, 'polygon', {
          points: polyAttr(scopeShape(L, scene, i)),
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.2,
        });
        const shape = scopeShape(L, scene, i);
        const ly = s.kind === 'top' ? lineMid(L, s.first) : (shape[1][1] + shape[2][1]) / 2;
        put(
          gText,
          'text',
          {
            x: L.labelX,
            y: ly + 4,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: looked ? c.text : c.textMuted,
            'font-weight': looked ? 600 : 400,
          },
          scopeLabel(s),
        );
        put(gScope, 'line', {
          x1: shape[1][0],
          y1: ly,
          x2: L.labelX - 6,
          y2: ly,
          stroke: looked ? c.text : c.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
        });
      });

      // 찾기 — 찾아본 몸과 지금 부푸는 영역
      if (step !== null) {
        const use = scene.uses[step.use];
        const shapes = step.looked.map((s) => scopeShape(L, scene, s));
        const upto = frame === null ? step.looked.length : frame.probe;
        for (let k = 0; k < Math.min(upto, shapes.length); k += 1) {
          const last = k === step.looked.length - 1;
          put(gProbe, 'polygon', {
            points: polyAttr(shapes[k]),
            fill: last ? c.accent : 'none',
            'fill-opacity': last ? 0.2 : 0,
            stroke: last ? c.text : c.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': last ? 'none' : '5 4',
          });
        }
        if (frame !== null && frame.probe < shapes.length) {
          const from = frame.probe === 0 ? tokenBox(L, scene, use.line, use.col, use.name.length) : shapes[frame.probe - 1];
          put(gProbe, 'polygon', {
            points: polyAttr(lerpPoly(from, shapes[frame.probe], ease(frame.probeT))),
            fill: c.accent,
            'fill-opacity': 0.2,
            stroke: c.text,
            'stroke-width': 1.5,
          });
        }
        const tb = tokenBox(L, scene, use.line, use.col, use.name.length);
        put(gMark, 'rect', {
          x: tb[0][0],
          y: tb[0][1],
          width: tb[1][0] - tb[0][0],
          height: tb[2][1] - tb[0][1],
          rx: 3,
          fill: c.accent,
        });
      }

      // 줄기와 가지 — 선언마다 한 색
      const linkPoints = (u: number, d: number): Pt[] => {
        const use = scene.uses[u];
        const decl = scene.decls[d];
        const yu = slotY(L, use.line, use.slot, use.slots);
        const yd = slotY(L, decl.line, decl.slot, decl.slots);
        return [
          [textX(L, scene, use.line) - 5, yu],
          [laneX(L, d), yu],
          [laneX(L, d), yd],
          [textX(L, scene, decl.line) - 5, yd],
        ];
      };
      const arrow = (d: number, color: string): void => {
        const decl = scene.decls[d];
        const x = textX(L, scene, decl.line) - 5;
        const y = slotY(L, decl.line, decl.slot, decl.slots);
        put(gLink, 'polygon', { points: polyAttr([[x, y], [x - 6, y - 3.5], [x - 6, y + 3.5]]), fill: color });
      };
      const linkedDecls = new Set<number>();
      for (const lk of trail) {
        const pts = linkPoints(lk.use, lk.decl);
        put(gLink, 'polyline', {
          points: polyAttr(pts),
          fill: 'none',
          stroke: colorsOf[lk.decl],
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
        });
        linkedDecls.add(lk.decl);
      }
      for (const d of linkedDecls) arrow(d, colorsOf[d]);
      if (step !== null && probeDone) {
        const pts = partialPath(linkPoints(step.use, step.decl), ease(linkT));
        put(gLink, 'polyline', {
          points: polyAttr(pts),
          fill: 'none',
          stroke: colorsOf[step.decl],
          'stroke-width': 3,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        });
        if (linkDone) arrow(step.decl, colorsOf[step.decl]);
      }

      // 선언 표지 — 읽고 지나온 선언만 스코프에 들어 있다
      scene.decls.forEach((d, i) => {
        if (d.line > readLine) return;
        const hit = step !== null && linkDone && step.decl === i;
        const b = tokenBox(L, scene, d.line, d.col, d.name.length);
        put(gMark, 'rect', {
          x: b[0][0],
          y: b[0][1],
          width: b[1][0] - b[0][0],
          height: b[2][1] - b[0][1],
          rx: 3,
          fill: hit ? colorsOf[i] : 'none',
          'fill-opacity': hit ? 0.28 : 0,
          stroke: colorsOf[i],
          'stroke-width': hit ? 2.4 : 1.3,
        });
      });

      // 이은 쓰임의 밑줄
      const underlined = new Set<number>();
      for (const lk of trail) underlined.add(lk.use);
      if (step !== null && linkDone) underlined.add(step.use);
      for (const u of underlined) {
        const use = scene.uses[u];
        const d = scene.links.find((lk) => lk.use === u);
        if (d === undefined) throw new Error(`resolve-to-declaration: L${use.line} 의 ${use.name} 에 이은 선이 없다`);
        const x = textX(L, scene, use.line) + use.col * L.cw;
        const y = lineMid(L, use.line) + L.fs * 0.56;
        put(gMark, 'line', {
          x1: x,
          y1: y,
          x2: x + use.name.length * L.cw,
          y2: y,
          stroke: colorsOf[d.decl],
          'stroke-width': 2.6,
          'stroke-linecap': 'round',
        });
      }

      // 줄 번호와 글자
      scene.lines.forEach((ln, i) => {
        const k = i + 1;
        const y = lineMid(L, k) + L.fs * 0.35;
        const cur = k === readLine;
        put(
          gText,
          'text',
          {
            x: 34,
            y,
            'text-anchor': 'end',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: cur ? c.text : c.textMuted,
            'font-weight': cur ? 700 : 400,
          },
          `L${k}`,
        );
        const line = put(gText, 'text', {
          x: textX(L, scene, k),
          y,
          'font-family': fonts.mono,
          'font-size': num(L.fs) + 'px',
          fill: c.text,
        });
        // 지금 찾는 쓰임은 노란 바탕 위라 글자를 stateInk 로 가른다
        const use = step !== null ? scene.uses[step.use] : null;
        if (use === null || use.line !== k) {
          line.textContent = ln.text;
          return;
        }
        const end = use.col + use.name.length;
        put(line, 'tspan', {}, ln.text.slice(0, use.col));
        put(line, 'tspan', { fill: c.stateInk }, ln.text.slice(use.col, end));
        put(line, 'tspan', {}, ln.text.slice(end));
      });

      // 캡션 — 지금 일어나는 일만
      const cy = H - CAPTION_H + 30;
      const caption =
        step === null
          ? t('caption.start', 'Reading from the top. No use is linked yet.')
          : t('caption.resolve', '{name} on L{use} → declaration on L{decl}', {
              name: scene.uses[step.use].name,
              use: scene.uses[step.use].line,
              decl: scene.decls[step.decl].line,
            });
      put(gText, 'text', { x: 24, y: cy, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text, 'font-weight': 600 }, caption);
      if (step !== null) {
        put(
          gText,
          'text',
          { x: 24, y: cy + 22, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
          t('caption.looked', 'Scopes searched: {n}', { n: step.looked.length }),
        );
      }
      put(
        gText,
        'text',
        { x: PIECE_CANVAS_W - 24, y: cy + 22, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
        t('caption.links', 'Links: {n}', { n: scene.links.length }),
      );
    }

    function tween(ms: number, mine: number, onFrame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - start) / ms);
          onFrame(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: ResolveToDeclarationScene,
      prev: ResolveToDeclarationScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const forward = step !== null && prev !== null && prev.links.length === next.links.length - 1;
      if (!opts.animate || !forward || step === null) {
        draw(next, null);
        return;
      }
      for (let k = 0; k < step.looked.length; k += 1) {
        const ok = await tween(PROBE_MS, mine, (p) => draw(next, { probe: k, probeT: p, linkT: 0 }));
        if (!ok) return;
      }
      const ok = await tween(LINK_MS, mine, (p) => draw(next, { probe: step.looked.length, probeT: 1, linkT: p }));
      if (!ok || mine !== gen || destroyed) return;
      draw(next, null);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
