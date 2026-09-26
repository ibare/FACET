/**
 * assign-once 의 그림 — 이름이 판으로 **갈라진다**.
 *
 * 왼쪽은 세 주소 코드. 줄 하나가 바뀔 때 읽는 자리에 먼저 판 번호가 내려앉고(줄이 그만큼 벌어진다),
 * 그다음 넣는 자리에 새 판이 붙는다.
 * 오른쪽은 이름마다의 넣기. 이름 x 옆에 넣는 줄(점) 셋이 매달려 있다가, 줄이 바뀔 때마다 점 하나가
 * 이름에서 떨어져 나와 제 판(x1 · x2 · x3) 자리로 내려간다. 끝에는 이름 쪽이 비고 판마다 점이 하나씩 남는다.
 *
 * 화면은 늘 장면 전체에서 선다 (`drawStatic`). 운동은 앞 장면의 자리(`place(앞 장면)`)에서 지금 자리까지
 * 아직 못 온 만큼을 옮긴다. 앞 장면은 지금 장면에서 이번 걸음의 줄만 되돌려 셈한다 — prev 는 쓰지 않는다.
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
import { instrTokens, type Token } from './algorithm.js';
import { assignOnceScene, type AssignOnceScene, type Renamed } from './scene.js';

const H = 300;
const SVG = 'http://www.w3.org/2000/svg';
/** 걸음 하나의 운동 — 읽기(앞 45%) 다음 넣기(뒤 55%). */
const MOVE_MS = 400;
const READ_PART = 0.45;

const CODE_PX = parseFloat(fontSizes.xl);
const CW = CODE_PX * 0.6;
const CHIP_PX = parseFloat(fontSizes.md);
const CHIP_CW = CHIP_PX * 0.6;
const NAME_PX = parseFloat(fontSizes.xl);
const DOT_R = 9;

const MARGIN = 24;
const CODE_TOP = 36;
const CODE_BOTTOM = 228;
const LINE_NO_X = 36;
const CODE_X = 52;

type Pos = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  o: { fill: string; px: number; mono?: boolean; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill: o.fill,
    'font-family': o.mono === true ? fonts.mono : fonts.body,
    'font-size': o.px,
    'text-anchor': o.anchor ?? 'start',
    'dominant-baseline': 'central',
  });
  if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
  node.textContent = text;
  return node;
}

/** 이 걸음 바로 앞의 장면 — 이번 줄만 아직 안 바뀐 꼴. */
function before(scene: AssignOnceScene): AssignOnceScene {
  if (scene.step === null) return scene;
  const renamed = scene.renamed.slice();
  renamed[scene.step.line - 1] = null;
  return { ...scene, renamed, step: null };
}

/** 판 (이름, 번호) 의 색 번호 — 이름 차례대로 판을 늘어놓은 자리. */
function colorIndex(scene: AssignOnceScene, name: string, ver: number): number {
  let offset = 0;
  for (const n of scene.names) {
    if (n.name === name) return offset + ver - 1;
    offset += n.lines.length;
  }
  return -1;
}

function totalVersions(scene: AssignOnceScene): number {
  return scene.names.reduce((s, n) => s + n.lines.length, 0);
}

/** 토막에 붙을 판 번호 글자 (없으면 ''). */
function suffixOf(tok: Token, done: Renamed | null): string {
  if (done === null) return '';
  if (tok.role === 'def') return done.dst === null ? '' : String(done.dst.ver);
  if (tok.role === 'use') {
    const r = done.reads[tok.use];
    if (r === undefined) throw new Error(`assign-once: 읽는 자리 ${tok.use + 1} 의 판이 없다`);
    return r.ver === null ? '' : String(r.ver);
  }
  return '';
}

function tokText(tok: Token): string {
  return tok.role === 'plain' ? tok.text : tok.name;
}

type Geometry = {
  rh: number;
  rowY: (i: number) => number;
  panelX: number;
  colX: (k: number) => number;
  headY: number;
  slotY: (ver: number) => number;
};

function geometry(scene: AssignOnceScene): Geometry {
  const n = Math.max(1, scene.code.length);
  const rh = Math.min(40, (CODE_BOTTOM - CODE_TOP) / n);
  const panelX = PIECE_CANVAS_W / 2;
  const cols = Math.max(1, scene.names.length);
  const colStart = panelX + 76;
  const colW = Math.min(150, (PIECE_CANVAS_W - MARGIN - colStart) / cols);
  const headY = CODE_TOP + rh / 2;
  const slot0 = headY + 52;
  const maxDefs = scene.names.reduce((m, x) => Math.max(m, x.lines.length), 1);
  const pitch = Math.min(40, (CODE_BOTTOM - 14 - slot0) / Math.max(1, maxDefs - 1));
  return {
    rh,
    rowY: (i) => CODE_TOP + rh * (i + 0.5),
    panelX,
    colX: (k) => colStart + colW * k,
    headY,
    slotY: (ver) => slot0 + pitch * (ver - 1),
  };
}

function chipW(text: string): number {
  return text.length * CHIP_CW + 14;
}

function nameW(name: string): number {
  return name.length * NAME_PX * 0.6;
}

/**
 * 움직이는 것의 자리. 열쇠
 *   T{i}.{j}  코드 줄 i 의 토막 j (글자 시작점)
 *   D{line}   넣는 줄 점 — 이름 옆(아직) 이거나 판 옆(바뀜)
 *   V{name}.{ver}  판 칩 (왼쪽 끝)
 */
function place(scene: AssignOnceScene): Map<string, Pos> {
  const g = geometry(scene);
  const out = new Map<string, Pos>();
  scene.code.forEach((ins, i) => {
    const done = scene.renamed[i] ?? null;
    let x = CODE_X;
    instrTokens(ins).forEach((tok, j) => {
      out.set(`T${i}.${j}`, { x, y: g.rowY(i) });
      x += (tokText(tok).length + suffixOf(tok, done).length) * CW;
    });
  });
  scene.names.forEach((n, k) => {
    const cx = g.colX(k);
    let pool = 0;
    for (const line of n.lines) {
      const done = scene.renamed[line - 1] ?? null;
      if (done === null || done.dst === null) {
        out.set(`D${line}`, { x: cx + nameW(n.name) + 14 + DOT_R + pool * (DOT_R * 2 + 5), y: g.headY });
        pool += 1;
      } else {
        const v = done.dst.ver;
        const text = `${n.name}${v}`;
        out.set(`V${n.name}.${v}`, { x: cx, y: g.slotY(v) });
        out.set(`D${line}`, { x: cx + chipW(text) + 10 + DOT_R, y: g.slotY(v) });
      }
    }
  });
  return out;
}

type Moving = { node: SVGGElement; at: Pos; from: Pos; phase: 'read' | 'def' };

type Painted = {
  groups: Map<string, SVGGElement>;
  /** 이번 걸음에 새로 붙은 판 번호 글자 — 위에서 내려앉는다. */
  fresh: { node: SVGElement; phase: 'read' | 'def' }[];
};

function readsText(done: Renamed): string {
  return done.reads
    .filter((r) => r.ver !== null)
    .map((r) => `${r.name} → ${r.name}${String(r.ver)}`)
    .join(', ');
}

function drawStatic(svg: SVGSVGElement, scene: AssignOnceScene, c: Palette, dark: boolean, t: Translate): Painted {
  svg.textContent = '';
  const groups = new Map<string, SVGGElement>();
  const fresh: Painted['fresh'] = [];
  if (scene.code.length === 0) return { groups, fresh };

  const g = geometry(scene);
  const pos = place(scene);
  const total = totalVersions(scene);
  const ink = categorical(total, dark ? 'vivid' : 'deep');
  const fill = categorical(total, dark ? 'deep' : 'pastel');
  const pick = (list: readonly string[], name: string, ver: number): string => {
    const color = list[colorIndex(scene, name, ver)];
    if (color === undefined) throw new Error(`assign-once: 판 ${name}${ver} 이 이름 목록에 없다`);
    return color;
  };
  const inkOf = (name: string, ver: number): string => pick(ink, name, ver);
  const fillOf = (name: string, ver: number): string => pick(fill, name, ver);
  const stepLine = scene.step === null ? -1 : scene.step.line - 1;
  const stepDone = stepLine < 0 ? null : (scene.renamed[stepLine] ?? null);

  const at = (key: string): Pos => {
    const p = pos.get(key);
    if (p === undefined) throw new Error(`assign-once: 자리 ${key} 가 셈되지 않았다`);
    return p;
  };
  const group = (key: string, parent: Element): SVGGElement => {
    const p = at(key);
    const node = el(parent, 'g', { transform: `translate(${r2(p.x)},${r2(p.y)})` });
    groups.set(key, node);
    return node;
  };

  // ── 코드
  const codeLayer = el(svg, 'g', {});
  if (stepLine >= 0) {
    const y = g.rowY(stepLine);
    el(codeLayer, 'rect', { x: 12, y: y - g.rh / 2 + 2, width: g.panelX - 36, height: g.rh - 4, rx: 4, fill: c.bgSubtle });
    el(codeLayer, 'rect', { x: 12, y: y - g.rh / 2 + 2, width: 4, height: g.rh - 4, rx: 2, fill: c.accent });
  }
  scene.code.forEach((ins, i) => {
    const done = scene.renamed[i] ?? null;
    label(codeLayer, LINE_NO_X, g.rowY(i), String(i + 1), {
      fill: c.textMuted,
      px: parseFloat(fontSizes.sm),
      mono: true,
      anchor: 'end',
    });
    instrTokens(ins).forEach((tok, j) => {
      const node = group(`T${i}.${j}`, codeLayer);
      const base = tokText(tok);
      const suf = suffixOf(tok, done);
      const color = done === null ? c.textMuted : c.text;
      if (tok.role === 'def' && suf !== '') {
        const v = Number(suf);
        const w = (base.length + suf.length) * CW;
        const chip = el(node, 'rect', {
          x: -4,
          y: -CODE_PX * 0.7,
          width: w + 8,
          height: CODE_PX * 1.4,
          rx: 4,
          fill: fillOf(tok.name, v),
          stroke: inkOf(tok.name, v),
          'stroke-width': 1.5,
        });
        if (i === stepLine) fresh.push({ node: chip, phase: 'def' });
      }
      if (tok.role === 'use' && suf !== '') {
        const v = Number(suf);
        el(node, 'line', {
          x1: 0,
          y1: CODE_PX * 0.62,
          x2: (base.length + suf.length) * CW,
          y2: CODE_PX * 0.62,
          stroke: inkOf(tok.name, v),
          'stroke-width': 2,
        });
      }
      // SVG 글자는 앞뒤 빈칸을 접는다 — 빈칸은 자리로 옮긴다
      const lead = base.length - base.trimStart().length;
      label(node, lead * CW, 0, base.trim(), { fill: color, px: CODE_PX, mono: true });
      if (suf !== '' && tok.role !== 'plain') {
        const v = Number(suf);
        const s = label(node, base.length * CW, 0, suf, {
          fill: tok.role === 'def' ? c.text : inkOf(tok.name, v),
          px: CODE_PX,
          mono: true,
          weight: '700',
        });
        if (i === stepLine) fresh.push({ node: s, phase: tok.role === 'def' ? 'def' : 'read' });
      }
    });
  });

  // ── 이름과 판
  const panel = el(svg, 'g', {});
  const px = g.panelX;
  label(panel, px, g.headY, t('label.name', 'name'), { fill: c.textMuted, px: parseFloat(fontSizes.sm) });
  label(panel, px, g.slotY(1), t('label.versions', 'versions'), { fill: c.textMuted, px: parseFloat(fontSizes.sm) });
  el(panel, 'line', {
    x1: px,
    y1: g.headY + 26,
    x2: PIECE_CANVAS_W - MARGIN,
    y2: g.headY + 26,
    stroke: c.border,
    'stroke-width': 1,
  });
  const readNow = new Set(
    (stepDone?.reads ?? []).filter((r) => r.ver !== null).map((r) => `${r.name}.${String(r.ver)}`),
  );
  scene.names.forEach((n, k) => {
    const cx = g.colX(k);
    label(panel, cx, g.headY, n.name, { fill: c.text, px: NAME_PX, mono: true, weight: '700' });
    for (const line of n.lines) {
      const done = scene.renamed[line - 1] ?? null;
      if (done !== null && done.dst !== null) {
        const v = done.dst.ver;
        const text = `${n.name}${v}`;
        const chip = group(`V${n.name}.${v}`, panel);
        const w = chipW(text);
        el(chip, 'rect', {
          x: 0,
          y: -13,
          width: w,
          height: 26,
          rx: 5,
          fill: fillOf(n.name, v),
          stroke: inkOf(n.name, v),
          'stroke-width': line - 1 === stepLine ? 2.5 : 1.5,
        });
        if (readNow.has(`${n.name}.${v}`)) {
          el(chip, 'rect', {
            x: -4,
            y: -17,
            width: w + 8,
            height: 34,
            rx: 7,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
        }
        label(chip, w / 2, 0, text, { fill: c.text, px: CHIP_PX, mono: true, anchor: 'middle', weight: '700' });
      }
      const dot = group(`D${line}`, panel);
      const moved = done !== null && done.dst !== null;
      el(dot, 'circle', {
        cx: 0,
        cy: 0,
        r: DOT_R,
        fill: c.bg,
        stroke: moved && done.dst !== null ? inkOf(n.name, done.dst.ver) : c.textMuted,
        'stroke-width': 1.5,
      });
      label(dot, 0, 0, String(line), {
        fill: c.text,
        px: parseFloat(fontSizes.xs),
        mono: true,
        anchor: 'middle',
      });
    }
  });

  // ── 캡션 — 지금 일어나는 일만
  const capPx = parseFloat(fontSizes.md);
  const capX = PIECE_CANVAS_W / 2;
  const first = ((): string => {
    if (scene.step === null || stepDone === null) {
      const counts = scene.names.map((n) => `${n.name} ${n.lines.length}`).join(' · ');
      return scene.names.length === 0 ? '' : t('caption.start', 'Assignments per name — {counts}', { counts });
    }
    const line = scene.step.line;
    const reads = readsText(stepDone);
    const dst = stepDone.dst === null ? '' : `${stepDone.dst.name}${stepDone.dst.ver}`;
    if (reads !== '' && dst !== '') {
      return t('caption.both', 'Line {line} — reads: {reads} · new version: {dst}', { line, reads, dst });
    }
    if (dst !== '') return t('caption.def', 'Line {line} — new version: {dst}', { line, dst });
    if (reads !== '') return t('caption.read', 'Line {line} — reads: {reads}', { line, reads });
    return t('caption.none', 'Line {line} — no name to version', { line });
  })();
  label(svg, capX, H - 50, first, { fill: c.text, px: capPx, anchor: 'middle' });
  if (scene.end !== null) {
    const counts = scene.end.map((v) => `${v.name}${v.ver} ${v.n}`).join(' · ');
    label(svg, capX, H - 24, t('caption.end', 'Assignments per version — {counts}', { counts }), {
      fill: c.textMuted,
      px: capPx,
      anchor: 'middle',
    });
  }
  return { groups, fresh };
}

export const assignOnceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const dark = params.theme === 'dark';
    const t = params.t ?? makeTranslator(params.locale);
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    // 처음 화면 — 장면이 오기 전에도 코드를 세워 둔다. initialData 없이 마운트되면 빈 캔버스로 둔다
    // (좁히개 readCode 는 모양이 틀리면 던지므로, 없음과 틀림을 여기서 가른다)
    if (params.initialData !== undefined) {
      drawStatic(svg, assignOnceScene.initial(params.initialData), c, dark, t);
    }

    function run(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return wake();
          if (start === null) start = now;
          const e = Math.min(1, (now - start) / ms);
          frame(e);
          if (e < 1) {
            id = requestAnimationFrame(tick);
            frames.add(id);
          } else wake();
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    async function render(next: AssignOnceScene, _prev: AssignOnceScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const painted = drawStatic(svg, next, c, dark, t);
      if (!opts.animate || next.step === null) return;

      const to = place(next);
      const from = place(before(next));
      const line = next.step.line;
      const done = next.renamed[line - 1] ?? null;
      const moving: Moving[] = [];
      for (const [key, node] of painted.groups) {
        const at = to.get(key);
        if (at === undefined) continue;
        let origin = from.get(key);
        let phase: Moving['phase'] = key.startsWith('T') ? 'read' : 'def';
        if (origin === undefined && key.startsWith('V') && done !== null) {
          // 새 판 칩은 이름 옆의 점과 한 몸으로 떨어져 내려온다
          const dotFrom = from.get(`D${line}`);
          const dotTo = to.get(`D${line}`);
          if (dotFrom !== undefined && dotTo !== undefined) {
            origin = { x: at.x + dotFrom.x - dotTo.x, y: at.y + dotFrom.y - dotTo.y };
          }
          phase = 'def';
        }
        if (origin === undefined) continue;
        if (Math.abs(origin.x - at.x) < 0.01 && Math.abs(origin.y - at.y) < 0.01) continue;
        moving.push({ node, at, from: origin, phase });
      }

      const ease = (e: number): number => 1 - (1 - e) * (1 - e);
      const part = (e: number, phase: 'read' | 'def'): number =>
        phase === 'read' ? Math.min(1, e / READ_PART) : Math.max(0, (e - READ_PART) / (1 - READ_PART));
      const frame = (e: number): void => {
        for (const m of moving) {
          const k = 1 - ease(part(e, m.phase));
          const x = m.at.x + (m.from.x - m.at.x) * k;
          const y = m.at.y + (m.from.y - m.at.y) * k;
          m.node.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
        }
        for (const f of painted.fresh) {
          const p = ease(part(e, f.phase));
          f.node.setAttribute('transform', `translate(0,${r2(-12 * (1 - p))})`);
          f.node.setAttribute('opacity', String(r2(p)));
        }
      };
      frame(0);
      await run(MOVE_MS, mine, frame);
      if (destroyed || mine !== gen) return;
      drawStatic(svg, next, c, dark, t);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
