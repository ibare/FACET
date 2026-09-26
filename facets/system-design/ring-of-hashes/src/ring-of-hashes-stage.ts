/**
 * ring-of-hashes 무대 — 고리와 대기열.
 *
 * 동사: 자리를 **잡고**, 시계 방향으로 **걸어** 처음 만난 서버에 **멈춘다**.
 *  - 서버 걸음: 대기열의 칩이 고리 위 제 자리로 날아가 앉는다.
 *  - 키 걸음: 키가 제 자리로 날아가 앉은 뒤, 걷는 점이 수가 커지는 쪽으로 고리를 따라
 *    가며 발자국(호)을 남기고 처음 만난 서버에서 멈춘다. 멈춘 뒤 키와 발자국이 주인 색을 입는다.
 *
 * 자리 0 은 꼭대기, 수가 커지면 시계 방향이다. 좌표는 캔버스 크기에서 셈한다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RingScene } from './scene.js';

const H = 430;
/** 아래 캡션 띠 (세 줄까지) */
const CAPTION_BAND = 62;
/** 고리 바깥 서버 이름이 들어갈 가로 여유 */
const LABEL_ROOM = 84;
/** 고리 위아래 여유 */
const V_PAD = 34;
const TRAY_W = 112;
const R_MAX = 160;
/** 대기열 한 줄의 상한 */
const ROW_MAX = 28;

const SERVER_FLY_MS = 520;
const KEY_FLY_MS = 240;
const WALK_BASE_MS = 100;
const WALK_PER_POS_MS = 7;
const WALK_MAX_MS = 360;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 본문 글꼴의 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)와 나머지를 가른다 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x2e80 ? px * 0.88 : px * 0.46;
  }
  return w;
}

function wrapLines(s: string, px: number, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  const tokens = s.split(/(\s+)/).filter((x) => x.length > 0);
  for (const tok of tokens) {
    const cand = line + tok;
    if (textWidth(cand, px) <= maxW || line.trim().length === 0) {
      if (textWidth(cand, px) <= maxW) {
        line = cand;
        continue;
      }
      // 한 토막이 한 줄보다 길다 — 글자 단위로 나눈다 (띄어쓰기 없는 언어)
      for (const ch of tok) {
        if (textWidth(line + ch, px) > maxW && line.length > 0) {
          lines.push(line.trimEnd());
          line = '';
        }
        line += ch;
      }
      continue;
    }
    lines.push(line.trimEnd());
    line = tok.trim().length === 0 ? '' : tok;
  }
  if (line.trim().length > 0) lines.push(line.trimEnd());
  return lines;
}

type Geometry = {
  size: number;
  cx: number;
  cy: number;
  r: number;
  trayX: number;
  rowH: number;
  serverHeadY: number;
  keyHeadY: number;
  serverRowY: number[];
  keyRowY: number[];
};

function geometry(scene: RingScene): Geometry {
  const ringAreaH = H - CAPTION_BAND;
  const r = Math.min((ringAreaH - 2 * V_PAD) / 2, (PIECE_CANVAS_W - TRAY_W - 2 * LABEL_ROOM - 16) / 2, R_MAX);
  const cx = LABEL_ROOM + r + 8;
  const cy = V_PAD + r;
  const trayX = PIECE_CANVAS_W - TRAY_W - 8;
  const headH = parseFloat(fontSizes.sm) + 12;
  const rows = scene.servers.length + scene.keys.length;
  const rowH = Math.min(ROW_MAX, (ringAreaH - 16 - 2 * headH - 8) / rows);
  const serverHeadY = 16;
  const serverRowY = scene.servers.map((_, i) => serverHeadY + headH + i * rowH);
  const keyHeadY = serverHeadY + headH + scene.servers.length * rowH + 8;
  const keyRowY = scene.keys.map((_, i) => keyHeadY + headH + i * rowH);
  return { size: scene.size, cx, cy, r, trayX, rowH, serverHeadY, keyHeadY, serverRowY, keyRowY };
}

/** 자리(소수도 된다)를 고리 위 점으로 — 0 은 꼭대기, 수가 커지면 시계 방향 */
function at(g: Geometry, pos: number, rad: number): Pt {
  const th = (2 * Math.PI * pos) / g.size;
  return { x: r2(g.cx + rad * Math.sin(th)), y: r2(g.cy - rad * Math.cos(th)) };
}

/** 자리 a 에서 시계 방향으로 len 칸 가는 호 */
function arcPath(g: Geometry, a: number, len: number, rad: number): string {
  if (len <= 0) return '';
  const p0 = at(g, a, rad);
  const p1 = at(g, a + len, rad);
  const large = len > g.size / 2 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r2(rad)} ${r2(rad)} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

/** 고리 둘레의 어느 쪽인지로 글자 붙임을 고른다 — 바깥으로 뻗을지(outward) 안으로 뻗을지 */
function anchorFor(g: Geometry, pos: number, outward: boolean): 'start' | 'middle' | 'end' {
  const s = Math.sin((2 * Math.PI * pos) / g.size);
  if (Math.abs(s) < 0.2) return 'middle';
  if (s > 0) return outward ? 'start' : 'end';
  return outward ? 'end' : 'start';
}

type Box = { x0: number; x1: number; y0: number; y1: number };

function boxOf(p: Pt, w: number, h: number, anchor: 'start' | 'middle' | 'end'): Box {
  const x0 = anchor === 'start' ? p.x : anchor === 'end' ? p.x - w : p.x - w / 2;
  return { x0, x1: x0 + w, y0: p.y - h / 2, y1: p.y + h / 2 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 이번 걸음에 움직일 손잡이 */
type Handles = {
  mover: SVGGElement;
  /** 움직이는 것이 대기열에서 출발하는 점 − 고리 위 끝점 */
  fromOffset: Pt;
  /** 키 걸음일 때만 */
  walk: { trail: SVGPathElement; dot: SVGCircleElement; pos: number; dist: number } | null;
};

export const ringOfHashesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** ms 동안 16ms 마다 frame(u) 를 부른다. 세대가 바뀌면 false */
    async function tween(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let f = 1; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(ms / frames);
        if (mine !== gen || destroyed) return false;
        frame(f / frames);
      }
      return true;
    }

    function serverColor(scene: RingScene, server: string): string {
      const i = scene.servers.indexOf(server);
      const palette = categorical(scene.servers.length, 'vivid');
      const c = palette[i];
      if (c === undefined) throw new Error(`ring-of-hashes-stage: 서버 "${server}" 의 색이 없다`);
      return c;
    }

    function caption(scene: RingScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'The ring is empty. Positions: 0–{max}.', { max: scene.size - 1 });
      }
      if (step.kind === 'server') {
        const i = scene.servers.indexOf(step.server);
        const pos = scene.serverPos[i];
        if (pos === null || pos === undefined) throw new Error(`ring-of-hashes-stage: "${step.server}" 의 자리가 없다`);
        return t('caption.server', '{server} hashes its own name and takes position {p}.', {
          server: step.server,
          p: pos,
        });
      }
      const i = scene.keys.indexOf(step.key);
      const seat = scene.keySeats[i];
      if (seat === null || seat === undefined) throw new Error(`ring-of-hashes-stage: "${step.key}" 의 자리가 없다`);
      if (seat.wrapped) {
        return t(
          'caption.keyWrap',
          '{key} hashes to position {p} and walks clockwise, past {max} back to 0. First server met: {server}. Positions walked: {d}.',
          { key: step.key, p: seat.pos, max: scene.size - 1, server: seat.owner, d: seat.dist },
        );
      }
      return t(
        'caption.key',
        '{key} hashes to position {p} and walks clockwise. First server met: {server}. Positions walked: {d}.',
        { key: step.key, p: seat.pos, server: seat.owner, d: seat.dist },
      );
    }

    /** 장면 전체를 세운다. 이번 걸음에 움직일 것의 손잡이를 돌려준다 */
    function drawStatic(scene: RingScene): Handles | null {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      let handles: Handles | null = null;

      // ── 고리와 눈금
      el(svg, 'circle', { cx: r2(g.cx), cy: r2(g.cy), r: r2(g.r), fill: 'none', stroke: colors.border, 'stroke-width': 2 });
      const ticks = el(svg, 'g', { stroke: colors.textMuted, 'stroke-width': 1, opacity: 0.5 });
      for (let p = 0; p < g.size; p += 1) {
        const a = at(g, p, g.r - 3);
        const b = at(g, p, g.r + 3);
        el(ticks, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
      const zeroOut = at(g, 0, g.r + 8);
      el(svg, 'line', { x1: zeroOut.x, y1: zeroOut.y, x2: zeroOut.x, y2: r2(zeroOut.y - 6), stroke: colors.textMuted, 'stroke-width': 1.5 });
      const zeroText = el(svg, 'text', {
        x: zeroOut.x,
        y: r2(zeroOut.y - 10),
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      zeroText.textContent = '0';

      // ── 발자국 (키에서 주인까지 걸은 호)
      const trailR = g.r - 8;
      const trails = el(svg, 'g', { fill: 'none', 'stroke-linecap': 'butt' });
      let nowTrail: SVGPathElement | null = null;
      for (let i = 0; i < scene.keys.length; i += 1) {
        const seat = scene.keySeats[i];
        if (seat === null || seat === undefined) continue;
        const isNow = step.kind === 'key' && step.key === scene.keys[i];
        const path = el(trails, 'path', {
          d: arcPath(g, seat.pos, seat.dist, trailR),
          stroke: serverColor(scene, seat.owner),
          'stroke-width': isNow ? 4 : 3,
          opacity: isNow ? 1 : 0.55,
        });
        if (isNow) nowTrail = path;
      }

      // ── 대기열
      const tray = el(svg, 'g', {});
      const serverHead = el(tray, 'text', {
        x: r2(g.trayX),
        y: r2(g.serverHeadY + smPx),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      serverHead.textContent = t('label.servers', 'Servers');
      const keyHead = el(tray, 'text', {
        x: r2(g.trayX),
        y: r2(g.keyHeadY + smPx),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      keyHead.textContent = t('label.keys', 'Keys');

      const chipH = g.rowH - 6;
      function chip(y: number, id: string, waiting: boolean, stripe: string | null): void {
        el(tray, 'rect', {
          x: r2(g.trayX),
          y: r2(y),
          width: TRAY_W,
          height: r2(chipH),
          rx: 4,
          fill: waiting ? colors.bgSubtle : 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': waiting ? 'none' : '3 3',
        });
        if (!waiting) return;
        if (stripe !== null) {
          el(tray, 'rect', { x: r2(g.trayX), y: r2(y), width: 5, height: r2(chipH), rx: 2, fill: stripe });
        }
        const label = el(tray, 'text', {
          x: r2(g.trayX + 12),
          y: r2(y + chipH / 2),
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        label.textContent = id;
      }
      scene.servers.forEach((s, i) => {
        const y = g.serverRowY[i];
        if (y === undefined) throw new Error(`ring-of-hashes-stage: 서버 줄 ${i} 가 없다`);
        chip(y, s, scene.serverPos[i] === null, serverColor(scene, s));
      });
      scene.keys.forEach((k, i) => {
        const y = g.keyRowY[i];
        if (y === undefined) throw new Error(`ring-of-hashes-stage: 키 줄 ${i} 가 없다`);
        chip(y, k, scene.keySeats[i] === null, null);
      });
      const trayPoint = (y: number): Pt => ({ x: r2(g.trayX + 12), y: r2(y + chipH / 2) });

      // ── 서버 (고리 위 표지 + 바깥 이름)
      for (let i = 0; i < scene.servers.length; i += 1) {
        const s = scene.servers[i];
        const pos = scene.serverPos[i];
        if (s === undefined || pos === null || pos === undefined) continue;
        const color = serverColor(scene, s);
        const isNow = step.kind === 'server' && step.server === s;
        const grp = el(svg, 'g', {});
        const inner = at(g, pos, g.r - 11);
        const outer = at(g, pos, g.r + 11);
        const mid = at(g, pos, g.r);
        if (isNow) {
          el(grp, 'circle', { cx: mid.x, cy: mid.y, r: 13, fill: 'none', stroke: colors.accent, 'stroke-width': 3 });
        }
        el(grp, 'line', { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' });
        el(grp, 'circle', { cx: mid.x, cy: mid.y, r: 5, fill: color, stroke: colors.bg, 'stroke-width': 1.5 });
        const lp = at(g, pos, g.r + 22);
        const label = el(grp, 'text', {
          x: lp.x,
          y: lp.y,
          'text-anchor': anchorFor(g, pos, true),
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
          'font-weight': 600,
        });
        const nameSpan = el(label, 'tspan', {});
        nameSpan.textContent = s;
        const posSpan = el(label, 'tspan', { fill: colors.textMuted, 'font-weight': 400, dx: 6 });
        posSpan.textContent = String(pos);
        if (isNow) {
          const y = g.serverRowY[i];
          if (y === undefined) throw new Error(`ring-of-hashes-stage: 서버 줄 ${i} 가 없다`);
          const from = trayPoint(y);
          handles = { mover: grp, fromOffset: { x: r2(from.x - mid.x), y: r2(from.y - mid.y) }, walk: null };
        }
      }

      // ── 키 (고리 위 점 + 안쪽 이름). 글자가 겹치면 안쪽으로 한 칸씩 민다 — 데이터 차례대로 정한다
      const placedBoxes: Box[] = [];
      const labelH = xsPx + 3;
      for (let i = 0; i < scene.keys.length; i += 1) {
        const k = scene.keys[i];
        const seat = scene.keySeats[i];
        if (k === undefined || seat === null || seat === undefined) continue;
        const color = serverColor(scene, seat.owner);
        const isNow = step.kind === 'key' && step.key === k;
        const grp = el(svg, 'g', {});
        const mid = at(g, seat.pos, g.r);
        const anchor = anchorFor(g, seat.pos, false);
        const w = [...k].length * xsPx * 0.62; // 고정폭 글꼴
        let rad = g.r - 24;
        let lp = at(g, seat.pos, rad);
        let box = boxOf(lp, w, labelH, anchor);
        for (let n = 0; n < 6 && placedBoxes.some((b) => overlaps(b, box)); n += 1) {
          rad -= labelH;
          lp = at(g, seat.pos, rad);
          box = boxOf(lp, w, labelH, anchor);
        }
        placedBoxes.push(box);
        if (isNow) {
          el(grp, 'circle', { cx: mid.x, cy: mid.y, r: 10, fill: 'none', stroke: colors.accent, 'stroke-width': 3 });
        }
        const dot = el(grp, 'circle', { cx: mid.x, cy: mid.y, r: 5, fill: color, stroke: colors.bg, 'stroke-width': 1.5 });
        const label = el(grp, 'text', {
          x: lp.x,
          y: lp.y,
          'text-anchor': anchor,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        label.textContent = k;
        if (isNow) {
          const y = g.keyRowY[i];
          if (y === undefined) throw new Error(`ring-of-hashes-stage: 키 줄 ${i} 가 없다`);
          const from = trayPoint(y);
          if (nowTrail === null) throw new Error(`ring-of-hashes-stage: "${k}" 의 발자국이 없다`);
          handles = {
            mover: grp,
            fromOffset: { x: r2(from.x - mid.x), y: r2(from.y - mid.y) },
            walk: { trail: nowTrail, dot, pos: seat.pos, dist: seat.dist },
          };
        }
      }

      // ── 캡션
      const capLines = wrapLines(caption(scene), mdPx, PIECE_CANVAS_W - 24);
      const capTop = H - CAPTION_BAND + 8;
      capLines.forEach((line, n) => {
        const tx = el(svg, 'text', {
          x: 12,
          y: r2(capTop + mdPx + n * (mdPx + 5)),
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        tx.textContent = line;
      });

      return handles;
    }

    async function animate(next: RingScene, mine: number, h: Handles): Promise<void> {
      const g = geometry(next);
      const place = (u: number): void => {
        const k = 1 - easeInOut(u);
        if (k === 0) h.mover.removeAttribute('transform');
        else h.mover.setAttribute('transform', `translate(${r2(h.fromOffset.x * k)} ${r2(h.fromOffset.y * k)})`);
      };

      if (h.walk === null) {
        // 서버: 대기열에서 제 자리로 날아가 앉는다
        place(0);
        await tween(SERVER_FLY_MS, mine, place);
        return;
      }

      // 키: 먼저 제 자리로 날아가 앉는다. 주인은 아직 모른다 — 먹색으로
      const walk = h.walk;
      walk.dot.setAttribute('fill', colors.textMuted);
      walk.trail.setAttribute('stroke', colors.text);
      walk.trail.setAttribute('d', '');
      place(0);
      if (!(await tween(KEY_FLY_MS, mine, place))) return;

      // 이어 시계 방향으로 걷는다 — 발자국이 자라고, 처음 만난 서버에서 멈춘다
      const walker = el(svg, 'circle', { r: 5, fill: colors.text, stroke: colors.bg, 'stroke-width': 1.5 });
      const trailR = g.r - 8;
      const walkAt = (u: number): void => {
        const len = walk.dist * u;
        const p = at(g, walk.pos + len, g.r);
        walker.setAttribute('cx', String(p.x));
        walker.setAttribute('cy', String(p.y));
        walk.trail.setAttribute('d', arcPath(g, walk.pos, len, trailR));
      };
      walkAt(0);
      const ms = Math.min(WALK_MAX_MS, WALK_BASE_MS + WALK_PER_POS_MS * walk.dist);
      await tween(ms, mine, walkAt);
    }

    return {
      async render(next: RingScene, prev: RingScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || prev === null || handles === null) return;
        await animate(next, mine, handles);
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
  },
};
