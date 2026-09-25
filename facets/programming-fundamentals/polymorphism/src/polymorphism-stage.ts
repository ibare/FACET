/**
 * polymorphism-stage — 클래스 상자 셋(부모가 위) · 약속 카드 · 객체 자리 · 부르는 줄 · 출력 창.
 *
 * 움직이는 것:
 * - 찍기    객체가 제 클래스 상자에서 떨어져 나와 객체 자리에 앉고, 클래스 표식(화살) 끝이 새 상자로 옮겨 간다
 * - 찾기    찾기 표식이 받는 객체의 클래스 머리에서 나타나 한 층씩 **위로** 오른다. 뿌리에도 없으면 뿌리 위 빈자리로
 * - 돈다    부르는 줄 끝의 가지가 앞 판의 몸에서 새 몸으로 옮겨 뻗고, 찾은 줄의 테가 그 줄로 옮겨 간다.
 *           약속 이름이면 몸 칩이 제 줄에서 올라와 약속 칸에 꽂히고, 칸에 있던 앞 판의 칩은 제 줄로 내려간다
 * - 실패    가지가 부르는 줄로 거둬지고 출력 창에 `NoMethod`
 *
 * 움직임 길이는 projector 가 걸음마다 재생 속도에서 셈해 넘긴다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 470;

/** projector 가 부르는 표면 — projector 는 `views.stage as unknown as PolymorphismStage` 로 좁힌다. */
export type PolymorphismStage = ViewInstance & {
  reset(): void;
  start(receiver: string, method: string): void;
  stamp(cls: string, ms: number, caption: string): void;
  look(cls: string, found: boolean, method: string, ms: number, caption: string): void;
  run(owner: string, method: string, out: string, slot: boolean, ms: number, captions: string[]): void;
  fail(ms: number, captions: string[]): void;
};

type ClassSpec = { name: string; parent: string | null; methods: { name: string; out: string }[] };

type Geo = {
  name: string;
  parent: string | null;
  y: number;
  h: number;
  color: string;
  /** 메서드 이름 → function 줄의 y (글자 기준선) */
  lines: Map<string, number>;
};

function readClasses(data: Record<string, unknown> | undefined): ClassSpec[] {
  const raw = data?.classes;
  if (!Array.isArray(raw)) return [];
  const out: ClassSpec[] = [];
  for (const c of raw) {
    if (typeof c !== 'object' || c === null) continue;
    const r = c as { name?: unknown; parent?: unknown; methods?: unknown };
    if (typeof r.name !== 'string') continue;
    const methods: { name: string; out: string }[] = [];
    if (Array.isArray(r.methods)) {
      for (const m of r.methods) {
        if (typeof m !== 'object' || m === null) continue;
        const mm = m as { name?: unknown; out?: unknown };
        if (typeof mm.name === 'string' && typeof mm.out === 'string') methods.push({ name: mm.name, out: mm.out });
      }
    }
    out.push({ name: r.name, parent: typeof r.parent === 'string' ? r.parent : null, methods });
  }
  return out;
}

/** 뿌리에서의 깊이 — 부모가 위, 자식이 아래로 늘어놓는다. */
function depthOf(classes: ClassSpec[], name: string): number {
  let d = 0;
  let cur = classes.find((c) => c.name === name);
  while (cur && cur.parent !== null && d < 10) {
    const parentName: string = cur.parent;
    cur = classes.find((c) => c.name === parentName);
    d += 1;
  }
  return d;
}

export const polymorphismStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const data = params.initialData;
    const all = readClasses(data);
    const classes = [...all].sort((a, b) => depthOf(all, a.name) - depthOf(all, b.name));
    const promiseRaw = (data?.promise ?? {}) as { name?: unknown; methods?: unknown; implementedBy?: unknown };
    const promiseName = typeof promiseRaw.name === 'string' ? promiseRaw.name : '';
    const promiseMethods = Array.isArray(promiseRaw.methods) ? promiseRaw.methods.filter((m): m is string => typeof m === 'string') : [];
    const implementedBy = typeof promiseRaw.implementedBy === 'string' ? promiseRaw.implementedBy : '';

    const CODE = parseFloat(fontSizes.sm);
    const SMALL = parseFloat(fontSizes.xs);
    const CHAR = CODE * 0.6;
    const LH = 18;
    const PAD = 8;
    const LANE_X = 24;
    const BOX_X = 48;
    const BOX_W = 272;
    const RX = 400;
    const RW = 340;
    const EMPTY_Y = 14;
    const EMPTY_H = 26;
    const SLOT_W = 150;
    const SLOT_X = RX + RW - SLOT_W - 6;

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = svg): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const text = (s: string, attrs: Record<string, string | number>, parent: Element = svg): SVGTextElement => {
      const e = el('text', { 'font-family': fonts.mono, 'font-size': CODE, fill: pal.text, ...attrs }, parent);
      e.textContent = s;
      return e;
    };

    // ── 움직임 — 요소마다 지금 값을 들고 목표로 옮긴다
    const frames = new Map<string, number>();
    const current = new Map<string, number[]>();
    const targets = new Map<string, { to: number[]; draw: (v: number[]) => void; done?: () => void }>();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
    let destroyed = false;
    const finish = (key: string): void => {
      const f = frames.get(key);
      if (f !== undefined && caf) caf(f);
      frames.delete(key);
      const tg = targets.get(key);
      targets.delete(key);
      if (tg) {
        current.set(key, tg.to);
        tg.draw(tg.to);
        tg.done?.();
      }
    };
    const animate = (key: string, to: number[], ms: number, draw: (v: number[]) => void, done?: () => void): void => {
      if (targets.has(key)) finish(key);
      const from = current.get(key) ?? to;
      targets.set(key, { to, draw, done });
      if (!raf || ms <= 0 || destroyed || isInstant() || from.length !== to.length) {
        finish(key);
        return;
      }
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (now: number): void => {
        if (destroyed) return;
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const v = from.map((a, i) => a + (to[i]! - a) * e);
        current.set(key, v);
        draw(v);
        if (k >= 1) finish(key);
        else frames.set(key, raf(tick));
      };
      frames.set(key, raf(tick));
    };
    const place = (key: string, v: number[], draw: (v: number[]) => void): void => {
      if (targets.has(key)) {
        const f = frames.get(key);
        if (f !== undefined && caf) caf(f);
        frames.delete(key);
        targets.delete(key);
      }
      current.set(key, v);
      draw(v);
    };
    params.onScrubStart?.(() => {
      for (const key of [...targets.keys()]) finish(key);
    });

    // ── 클래스 상자
    const colors = categorical(Math.max(1, classes.length), 'vivid');
    const geos = new Map<string, Geo>();
    let y = EMPTY_Y + EMPTY_H + 18;
    classes.forEach((c, i) => {
      const h = PAD * 2 + LH * (1 + c.methods.length * 2);
      const lines = new Map<string, number>();
      c.methods.forEach((m, j) => lines.set(m.name, y + PAD + LH * (2 + j * 2) - 5));
      geos.set(c.name, { name: c.name, parent: c.parent, y, h, color: colors[i] ?? pal.border, lines });
      y += h + 30;
    });
    const contentBottom = y - 30;
    const height = Math.max(H, contentBottom + 70);
    if (height !== H) svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    // 뿌리 위 빈자리 — 찾지 못한 표식이 멈추는 곳
    el('rect', { x: BOX_X, y: EMPTY_Y, width: BOX_W, height: EMPTY_H, rx: 4, fill: 'none', stroke: pal.border, 'stroke-dasharray': '4 4' });

    const boxRects = new Map<string, SVGRectElement>();
    const tags = new Map<string, SVGTextElement>();
    for (const c of classes) {
      const g = geos.get(c.name)!;
      // 부모로 잇는 선 (자식 머리 → 부모 바닥)
      const pg = c.parent !== null ? geos.get(c.parent) : undefined;
      if (pg) {
        const x = BOX_X + BOX_W / 2;
        el('line', { x1: x, y1: g.y, x2: x, y2: pg.y + pg.h + 6, stroke: pal.textMuted, 'stroke-width': 1.2 });
        el('path', { d: `M ${x - 6} ${pg.y + pg.h + 8} L ${x} ${pg.y + pg.h + 1} L ${x + 6} ${pg.y + pg.h + 8} Z`, fill: pal.bg, stroke: pal.textMuted, 'stroke-width': 1.2 });
      }
      boxRects.set(c.name, el('rect', { x: BOX_X, y: g.y, width: BOX_W, height: g.h, rx: 6, fill: pal.bgSubtle, stroke: pal.border, 'stroke-width': 1.5 }));
      el('rect', { x: BOX_X, y: g.y, width: 5, height: g.h, fill: g.color });
      const head = c.parent !== null ? `class ${c.name} extends ${c.parent}` : c.name === implementedBy && promiseName ? `class ${c.name} implements ${promiseName}` : `class ${c.name}`;
      text(head, { x: BOX_X + 14, y: g.y + PAD + LH - 5, 'font-weight': 700 });
      c.methods.forEach((m) => {
        const ly = g.lines.get(m.name)!;
        text(`function ${m.name}()`, { x: BOX_X + 14 + CHAR * 4, y: ly });
        text(`show "${m.out}"`, { x: BOX_X + 14 + CHAR * 8, y: ly + LH, fill: pal.textMuted });
      });
      tags.set(c.name, text('', { x: BOX_X + BOX_W, y: g.y - 6, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': SMALL, fill: pal.textMuted }));
    }

    // ── 약속 카드
    const cardY = geos.values().next().value?.y ?? 58;
    const cardH = PAD * 2 + LH * (1 + promiseMethods.length);
    const slotY = new Map<string, number>();
    if (promiseName) {
      el('rect', { x: RX, y: cardY, width: RW, height: cardH, rx: 6, fill: pal.bg, stroke: pal.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '6 3' });
      text(`interface ${promiseName}`, { x: RX + 12, y: cardY + PAD + LH - 5, 'font-weight': 700 });
      promiseMethods.forEach((m, j) => {
        const ly = cardY + PAD + LH * (2 + j) - 5;
        text(`function ${m}()`, { x: RX + 12 + CHAR * 4, y: ly });
        el('rect', { x: SLOT_X, y: ly - LH + 5, width: SLOT_W, height: LH, rx: 3, fill: 'none', stroke: pal.border, 'stroke-dasharray': '3 3' });
        slotY.set(m, ly);
      });
    }

    // ── 객체 자리 · 부르는 줄 · 출력 창
    const OBJ_W = 120;
    const OBJ_H = 40;
    const seatX = RX;
    const seatY = cardY + cardH + 44;
    el('text', { x: seatX, y: seatY - 8, 'font-family': fonts.body, 'font-size': SMALL, fill: pal.textMuted }).textContent = t('label.object', 'object');
    el('rect', { x: seatX, y: seatY, width: OBJ_W, height: OBJ_H, rx: 6, fill: 'none', stroke: pal.border, 'stroke-dasharray': '4 4' });

    const progY = seatY + OBJ_H + 30;
    el('rect', { x: RX, y: progY, width: RW, height: LH * 2 + PAD * 2, rx: 6, fill: pal.bgSubtle, stroke: pal.border });
    const line1 = text('', { x: RX + 12, y: progY + PAD + LH - 5, opacity: 0.35 });
    const line2 = text('', { x: RX + 12, y: progY + PAD + LH * 2 - 5, opacity: 0.35 });

    const conY = progY + LH * 2 + PAD * 2 + 26;
    el('text', { x: RX, y: conY - 6, 'font-family': fonts.body, 'font-size': SMALL, fill: pal.textMuted }).textContent = t('label.console', 'Console');
    el('rect', { x: RX, y: conY, width: RW, height: 30, rx: 4, fill: pal.bg, stroke: pal.textMuted });
    const consoleText = text('', { x: RX + 12, y: conY + 20 });

    const cap1 = el('text', { x: W / 2, y: height - 36, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text });
    const cap2 = el('text', { x: W / 2, y: height - 14, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.textMuted });
    const setCaptions = (lines: string[]): void => {
      cap1.textContent = lines[0] ?? '';
      cap2.textContent = lines[1] ?? '';
    };

    // 찾은 줄의 테 — 판마다 새 줄로 옮겨 간다
    const found = el('rect', { x: BOX_X + 8, y: 0, width: BOX_W - 16, height: LH * 2 + 4, rx: 4, fill: 'none', stroke: pal.itemActive, 'stroke-width': 2, opacity: 0 });
    // 가지 — 부르는 줄 끝에서 찾은 몸으로
    const branch = el('path', { d: '', fill: 'none', stroke: pal.itemActive, 'stroke-width': 2, opacity: 0 });
    const branchHead = el('path', { d: '', fill: pal.itemActive, opacity: 0 });
    // 객체와 클래스 표식
    const classArrow = el('path', { d: '', fill: 'none', stroke: pal.text, 'stroke-width': 1.5, opacity: 0 });
    const classHead = el('path', { d: '', fill: pal.text, opacity: 0 });
    const obj = el('g', { opacity: 0 });
    const objRect = el('rect', { x: 0, y: 0, width: OBJ_W, height: OBJ_H, rx: 6, fill: pal.bg, stroke: pal.text, 'stroke-width': 1.5 }, obj);
    const objStripe = el('rect', { x: 0, y: 0, width: 5, height: OBJ_H, fill: pal.border }, obj);
    text('s', { x: 16, y: OBJ_H / 2 + 5, 'font-weight': 700, 'font-size': fontSizes.lg }, obj);
    const objCls = text('', { x: OBJ_W - 10, y: OBJ_H / 2 + 4, 'text-anchor': 'end', fill: pal.textMuted, 'font-size': SMALL }, obj);
    // 찾기 표식 — 위를 가리키는 세모
    const marker = el('path', { d: '', fill: pal.risingMarker, opacity: 0 });

    // 몸 칩 — (클래스, 메서드) 마다 하나, 쓸 때 만든다
    type Chip = { g: SVGGElement; key: string; home: [number, number]; slot: string | null };
    const chips = new Map<string, Chip>();
    const chipOf = (owner: string, method: string, out: string): Chip | null => {
      const key = `${owner}.${method}`;
      const have = chips.get(key);
      if (have) return have;
      const g = geos.get(owner);
      const ly = g?.lines.get(method);
      if (!g || ly === undefined) return null;
      const home: [number, number] = [BOX_X + 14 + CHAR * 8 - 6, ly + 5];
      const cg = el('g', { opacity: 0 });
      el('rect', { x: 0, y: 0, width: SLOT_W, height: LH, rx: 3, fill: pal.bg, stroke: g.color, 'stroke-width': 1.5 }, cg);
      text(`show "${out}"`, { x: 6, y: LH - 5, 'font-size': SMALL }, cg);
      const chip: Chip = { g: cg, key, home, slot: null };
      chips.set(key, chip);
      return chip;
    };
    const drawChip = (chip: Chip) => (v: number[]): void => {
      chip.g.setAttribute('transform', `translate(${v[0]} ${v[1]})`);
    };

    // 그리는 함수들
    const objPos = (v: number[]): void => {
      obj.setAttribute('transform', `translate(${v[0]} ${v[1]})`);
      drawArrow();
    };
    let arrowY = 0;
    const drawArrow = (): void => {
      const o = current.get('obj') ?? [seatX, seatY];
      const sx = o[0]!;
      const sy = o[1]! + OBJ_H / 2;
      const tx = BOX_X + BOX_W + 2;
      const ty = arrowY;
      const mx = (sx + tx) / 2;
      classArrow.setAttribute('d', `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx + 8} ${ty}`);
      classHead.setAttribute('d', `M ${tx} ${ty} L ${tx + 10} ${ty - 5} L ${tx + 10} ${ty + 5} Z`);
    };
    const arrowTo = (v: number[]): void => {
      arrowY = v[0]!;
      drawArrow();
    };
    // 가지는 부르는 줄의 왼쪽 끝에서 나간다 — 글자를 가로지르지 않게
    const branchStart = (): [number, number] => [RX - 2, progY + PAD + LH * 2 - 9];
    const drawBranch = (v: number[]): void => {
      const [sx, sy] = branchStart();
      const ex = v[0]!;
      const ey = v[1]!;
      const mx = (sx + ex) / 2;
      branch.setAttribute('d', `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex + 8} ${ey}`);
      branchHead.setAttribute('d', `M ${ex} ${ey} L ${ex + 10} ${ey - 5} L ${ex + 10} ${ey + 5} Z`);
    };
    const drawMarker = (v: number[]): void => {
      const my = v[0]!;
      marker.setAttribute('d', `M ${LANE_X} ${my - 9} L ${LANE_X + 9} ${my + 7} L ${LANE_X - 9} ${my + 7} Z`);
    };
    const drawFound = (v: number[]): void => {
      found.setAttribute('y', String(v[0]));
    };
    const headY = (cls: string): number => {
      const g = geos.get(cls);
      return g ? g.y + PAD + LH / 2 : EMPTY_Y + EMPTY_H / 2;
    };

    let markerShown = false;
    let branchShown = false;

    const clearLook = (): void => {
      for (const [name, r] of boxRects) {
        r.setAttribute('stroke', pal.border);
        tags.get(name)!.textContent = '';
      }
    };

    const stage: PolymorphismStage = {
      destroy(): void {
        destroyed = true;
        if (caf) for (const f of frames.values()) caf(f);
        frames.clear();
        targets.clear();
      },
      reset(): void {
        for (const key of [...targets.keys()]) finish(key);
        clearLook();
        for (const e of [found, branch, branchHead, classArrow, classHead, obj, marker]) e.setAttribute('opacity', '0');
        for (const c of chips.values()) {
          c.g.setAttribute('opacity', '0');
          c.slot = null;
          place(`chip:${c.key}`, c.home, drawChip(c));
        }
        current.delete('obj');
        current.delete('arrow');
        current.delete('branch');
        current.delete('found');
        markerShown = false;
        branchShown = false;
        line1.textContent = '';
        line2.textContent = '';
        consoleText.textContent = '';
        setCaptions([]);
      },
      start(receiver: string, method: string): void {
        clearLook();
        marker.setAttribute('opacity', '0');
        markerShown = false;
        line1.textContent = `let s = new ${receiver}()`;
        line2.textContent = `s.${method}()`;
        line1.setAttribute('opacity', '0.35');
        line2.setAttribute('opacity', '0.35');
        setCaptions([]);
      },
      stamp(cls: string, ms: number, caption: string): void {
        const g = geos.get(cls);
        if (!g) return;
        line1.setAttribute('opacity', '1');
        objCls.textContent = cls;
        objStripe.setAttribute('fill', g.color);
        objRect.setAttribute('stroke', g.color);
        // 객체가 제 클래스 상자에서 떨어져 나와 자리에 앉는다
        place('obj', [BOX_X + BOX_W - OBJ_W - 10, g.y + 6], objPos);
        obj.setAttribute('opacity', '1');
        animate('obj', [seatX, seatY], ms, objPos);
        // 클래스 표식 끝이 새 상자로 옮겨 간다
        const ty = headY(cls);
        if (classArrow.getAttribute('opacity') === '0') place('arrow', [ty], arrowTo);
        classArrow.setAttribute('opacity', '1');
        classHead.setAttribute('opacity', '1');
        animate('arrow', [ty], ms, arrowTo);
        setCaptions([caption]);
      },
      look(cls: string, hit: boolean, method: string, ms: number, caption: string): void {
        const r = boxRects.get(cls);
        if (r) r.setAttribute('stroke', hit ? pal.itemActive : pal.risingMarker);
        const tag = tags.get(cls);
        if (tag) tag.textContent = `${method}()  ${hit ? t('tag.found', 'found') : t('tag.none', 'not here')}`;
        const my = headY(cls);
        if (!markerShown) {
          place('marker', [my], drawMarker);
          marker.setAttribute('opacity', '1');
          markerShown = true;
        } else {
          animate('marker', [my], ms, drawMarker);
        }
        setCaptions([caption]);
      },
      run(owner: string, method: string, out: string, slot: boolean, ms: number, captions: string[]): void {
        const g = geos.get(owner);
        const ly = g?.lines.get(method);
        if (!g || ly === undefined) return;
        line2.setAttribute('opacity', '1');
        // 찾은 줄의 테와 가지가 새 몸으로 옮겨 간다
        const fy = ly - LH + 1;
        if (found.getAttribute('opacity') === '0') place('found', [fy], drawFound);
        found.setAttribute('opacity', '1');
        animate('found', [fy], ms, drawFound);
        const target = [BOX_X + BOX_W + 2, ly - 4];
        if (!branchShown) place('branch', branchStart(), drawBranch);
        branch.setAttribute('opacity', '1');
        branchHead.setAttribute('opacity', '1');
        branchShown = true;
        animate('branch', target, ms, drawBranch);
        // 칸 — 부른 이름의 칸 하나만. 칸에 있던 다른 칩은 제 줄로 내려간다
        const chip = chipOf(owner, method, out);
        const wanted = slot && chip && slotY.has(method) ? chip : null;
        for (const c of chips.values()) {
          if (c.slot === null || c === wanted) continue;
          c.slot = null;
          const cc = c;
          animate(`chip:${c.key}`, c.home, ms, drawChip(c), () => cc.g.setAttribute('opacity', '0'));
        }
        if (wanted && wanted.slot !== method) {
          const sy = slotY.get(method)!;
          place(`chip:${wanted.key}`, wanted.home, drawChip(wanted));
          wanted.g.setAttribute('opacity', '1');
          wanted.slot = method;
          animate(`chip:${wanted.key}`, [SLOT_X, sy - LH + 5], ms, drawChip(wanted));
        }
        consoleText.setAttribute('fill', pal.text);
        consoleText.textContent = out;
        setCaptions(captions);
      },
      fail(ms: number, captions: string[]): void {
        line2.setAttribute('opacity', '1');
        // 표식이 뿌리 위 빈자리로 한 칸 오른다
        animate('marker', [EMPTY_Y + EMPTY_H / 2 + 2], ms, drawMarker);
        // 가지는 뻗지 않는다 — 앞 판의 가지를 부르는 줄로 거둔다
        if (branchShown) {
          branchShown = false;
          animate('branch', branchStart(), ms, drawBranch, () => {
            branch.setAttribute('opacity', '0');
            branchHead.setAttribute('opacity', '0');
          });
        }
        found.setAttribute('opacity', '0');
        for (const c of chips.values()) {
          if (c.slot === null) continue;
          c.slot = null;
          const cc = c;
          animate(`chip:${c.key}`, c.home, ms, drawChip(c), () => cc.g.setAttribute('opacity', '0'));
        }
        consoleText.setAttribute('fill', pal.danger);
        consoleText.textContent = 'NoMethod';
        setCaptions(captions);
      },
    };
    return stage;
  },
};
