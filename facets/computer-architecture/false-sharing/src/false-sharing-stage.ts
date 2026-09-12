/**
 * 거짓 공유 조각의 그림.
 *
 * ── 무엇이 어디에 있는가
 *
 *   선반 A          코어 A 가 쥔 줄이 올라앉는 자리
 *   메모리 띠       배열의 칸들. 넷씩 테두리로 묶여 한 줄이 된다
 *   선반 B          코어 B 가 쥔 줄이 내려앉는 자리
 *
 * 줄(사본)은 **덩어리**다. 코어가 제 칸 하나를 고치려면 그 덩어리를 통째로
 * 끌어와야 하고, 그러면 상대 선반에는 빈 자국만 남는다. 두 코어가 같은 줄을
 * 노리면 덩어리가 위아래로 일곱 번 끌려다니고, 줄이 갈리면 각자 제자리에
 * 가만히 앉아 있다. 움직이는 것은 덩어리이고, 안 움직이는 것이 곧 답이다.
 *
 * 코어가 노리는 칸은 선반에서 내려오는 **가는 선**으로 가리킨다. 두 선은 결코
 * 같은 칸에 닿지 않는다 — 값은 겹치지 않는데 울타리만 같다는 것이 이 조각의
 * 주장이고, 그것이 화면에서 보여야 한다.
 *
 * 세로는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view).
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CANVAS_H = 306;

/** 왼쪽은 선반 이름이 서는 자리, 오른쪽은 숨 쉴 여백. */
const SIDE_L = 92;
const SIDE_R = 12;
const BLOCK_GAP = 24;
/** 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 74;

const SHELF_A_Y = 14;
const SHELF_H = 48;
const SHELF_B_Y = 190;
const LINE_LABEL_Y = 86;
const STRIP_Y = 94;
const CELL_H = 56;
const BADGE_Y = 170;
const SLAB_H = 42;

const SLAB_HOME_Y = STRIP_Y + (CELL_H - SLAB_H) / 2;
const SHELF_A_SLAB_Y = SHELF_A_Y + (SHELF_H - SLAB_H) / 2;
const SHELF_B_SLAB_Y = SHELF_B_Y + (SHELF_H - SLAB_H) / 2;
const DY_A = SHELF_A_SLAB_Y - SLAB_HOME_Y;
const DY_B = SHELF_B_SLAB_Y - SLAB_HOME_Y;

const CAPTION_Y = 260;
const CAPTION_STEP = 19;
const CAPTION_MAX_LINES = 3;
const CAPTION_PAD = 24;

const FETCH_MS = 320;
const MOVE_MS = 300;
const HOLD_MS = 90;
const RISE_MS = 150;
const RETURN_MS = 260;
const SLIDE_MS = 320;
const GROW_MS = 220;
const NUDGE_MS = 200;

/** 코어 이름은 도형에 새긴 표식이라 번역하지 않는다 (C10). */
const CORE_A = 'A';
const CORE_B = 'B';
const CORE_A_MARK = 'core A';
const CORE_B_MARK = 'core B';
const MEMORY_MARK = 'RAM';

export type FalseSharingArrange = {
  aIndex: number;
  bIndex: number;
  caption: string;
};

export type FalseSharingRound = {
  cores: string[];
  indices: number[];
  values: number[];
  caption: string;
};

export type FalseSharingSettle = {
  caption: string;
};

type Scene = {
  lineBytes: number;
  elemBytes: number;
  together: number[];
  apart: number[];
};

/**
 * 선언을 그림이 쓰는 모양으로 좁힌다.
 *
 * `mount` 가 `params.initialData` 를 받는 유일한 자리이므로 좁히개도 여기 둔다
 * (S-piece). 선언이 없거나 모양이 맞지 않으면 **아무것도 그리지 않는다** —
 * 화면에 쓸 값을 지어내지 않기 위해서다.
 */
function readScene(data: Record<string, unknown> | undefined): Scene | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const lineBytes = d.lineBytes;
  const elemBytes = d.elemBytes;
  if (typeof lineBytes !== 'number' || lineBytes <= 0) return null;
  if (typeof elemBytes !== 'number' || elemBytes <= 0) return null;
  if (!Array.isArray(d.together) || !Array.isArray(d.apart)) return null;
  const pair = (v: unknown[]): number[] | null => {
    const out = v.filter((x): x is number => typeof x === 'number' && x >= 0);
    return out.length === 2 ? out : null;
  };
  const together = pair(d.together);
  const apart = pair(d.apart);
  if (together === null || apart === null) return null;
  return { lineBytes, elemBytes, together, apart };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

/** 한글·한자·가나는 라틴 글자의 두 배 폭으로 센다. 줄을 접을 자리를 고르는 자다. */
function widthUnits(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch) ? 2 : 1;
  }
  return n;
}

function wrapCaption(text: string, maxUnits: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    if (cur !== '') lines.push(cur);
    cur = '';
  };
  for (const word of text.split(' ')) {
    let rest = word;
    // 띄어쓰기가 없는 글은 낱말 하나가 한 줄을 넘는다. 글자로 끊는다.
    while (widthUnits(rest) > maxUnits) {
      let take = '';
      for (const ch of rest) {
        if (widthUnits(take + ch) > maxUnits) break;
        take += ch;
      }
      if (take === '') break;
      flush();
      lines.push(take);
      rest = rest.slice(take.length);
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
    const next = cur === '' ? rest : `${cur} ${rest}`;
    if (widthUnits(next) > maxUnits) {
      flush();
      cur = rest;
    } else {
      cur = next;
    }
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }
  flush();
  return lines.slice(0, maxLines);
}

type Slab = {
  g: SVGGElement;
  box: SVGRectElement;
  minis: SVGRectElement[];
  values: SVGTextElement[];
  owner: string;
  dy: number;
};

export const falseSharingStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const scene = readScene(params.initialData);
    if (scene === null) return { destroy(): void {} };

    const hues = categorical(2, 'vivid');
    const COLOR_A = hues[0];
    const COLOR_B = hues[1];
    const coreColor = (core: string): string => (core === CORE_A ? COLOR_A : COLOR_B);

    // ── 자리 셈. 캔버스에서 역산한다.
    const elemsPerLine = Math.max(1, Math.floor(scene.lineBytes / scene.elemBytes));
    const maxIndex = Math.max(
      scene.together[0],
      scene.together[1],
      scene.apart[0],
      scene.apart[1],
    );
    const lineCount = Math.floor((maxIndex * scene.elemBytes) / scene.lineBytes) + 1;
    const cellCount = lineCount * elemsPerLine;
    const avail = W - SIDE_L - SIDE_R - BLOCK_GAP * (lineCount - 1);
    const cellW = Math.min(CELL_MAX_W, Math.floor(avail / cellCount));
    const blockW = cellW * elemsPerLine;
    const stripW = blockW * lineCount + BLOCK_GAP * (lineCount - 1);
    const originX = SIDE_L + Math.round((W - SIDE_L - SIDE_R - stripW) / 2);

    const blockX = (line: number): number => originX + line * (blockW + BLOCK_GAP);
    const cellX = (index: number): number =>
      blockX(Math.floor(index / elemsPerLine)) + (index % elemsPerLine) * cellW;
    const cellMid = (index: number): number => cellX(index) + cellW / 2;
    const lineOf = (index: number): number => Math.floor(index / elemsPerLine);

    // ── 기다리는 것을 거두는 장치 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, step: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          return resolve();
        }
        const started = Date.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          if (id !== 0) {
            frames.delete(id);
            cancelAnimationFrame(id);
            id = 0;
          }
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          id = 0;
          if (destroyed) {
            step(1);
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          step(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 껍데기. 러너가 붙여 준 캔버스를 비우지 않는다 (S-view).
    const root = el('g', {});
    const gShelf = el('g', {});
    const gStrip = el('g', {});
    const gConn = el('g', {});
    const gGhost = el('g', {});
    const gBadge = el('g', {});
    const gSlab = el('g', {});
    const gCaption = el('g', {});
    for (const layer of [gShelf, gStrip, gConn, gGhost, gBadge, gSlab, gCaption]) {
      root.appendChild(layer);
    }
    svg.appendChild(root);

    function textNode(
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; weight?: number; family?: string },
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        fill: opts.fill,
        'font-size': opts.size,
        'font-family': opts.family ?? fonts.body,
        'font-weight': opts.weight ?? 400,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = content;
      return node;
    }

    // ── 선반 둘과 메모리 띠.
    for (const shelf of [SHELF_A_Y, SHELF_B_Y]) {
      gShelf.appendChild(
        el('rect', {
          x: originX - 10,
          y: shelf,
          width: stripW + 20,
          height: SHELF_H,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
    }
    const nameX = originX - 20;
    gShelf.appendChild(
      textNode(nameX, SHELF_A_Y + SHELF_H / 2 + 5, CORE_A_MARK, {
        size: fontSizes.sm,
        fill: c.text,
        anchor: 'end',
        weight: 600,
      }),
    );
    gShelf.appendChild(
      textNode(nameX, SHELF_B_Y + SHELF_H / 2 + 5, CORE_B_MARK, {
        size: fontSizes.sm,
        fill: c.text,
        anchor: 'end',
        weight: 600,
      }),
    );
    gShelf.appendChild(
      textNode(nameX, STRIP_Y + CELL_H / 2 + 4, MEMORY_MARK, {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'end',
        weight: 600,
      }),
    );

    for (let line = 0; line < lineCount; line += 1) {
      gStrip.appendChild(
        el('rect', {
          x: blockX(line) - 5,
          y: STRIP_Y - 5,
          width: blockW + 10,
          height: CELL_H + 10,
          rx: 7,
          fill: 'none',
          stroke: c.textMuted,
        }),
      );
      gStrip.appendChild(
        textNode(
          blockX(line),
          LINE_LABEL_Y,
          t('label.line', 'line {n} · {bytes} B', { n: line, bytes: scene.lineBytes }),
          { size: fontSizes.xs, fill: c.textMuted, weight: 600 },
        ),
      );
    }

    const cellRects: SVGRectElement[] = [];
    const cellNames: SVGTextElement[] = [];
    const cellAddrs: SVGTextElement[] = [];
    const cellValues: SVGTextElement[] = [];
    const values: number[] = [];
    for (let i = 0; i < cellCount; i += 1) {
      values.push(0);
      const rect = el('rect', {
        x: cellX(i) + 1.5,
        y: STRIP_Y,
        width: cellW - 3,
        height: CELL_H,
        rx: 4,
        fill: c.bg,
        stroke: c.border,
      });
      gStrip.appendChild(rect);
      cellRects.push(rect);

      const name = textNode(cellX(i) + 8, STRIP_Y + 16, `a[${i}]`, {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      gStrip.appendChild(name);
      cellNames.push(name);

      const addr = textNode(cellX(i) + cellW - 8, STRIP_Y + 16, String(i * scene.elemBytes), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'end',
        family: fonts.mono,
      });
      gStrip.appendChild(addr);
      cellAddrs.push(addr);

      const value = textNode(cellMid(i), STRIP_Y + 45, '0', {
        size: fontSizes.lg,
        fill: c.textMuted,
        anchor: 'middle',
        weight: 700,
        family: fonts.mono,
      });
      gStrip.appendChild(value);
      cellValues.push(value);
    }

    const captionLines: SVGTextElement[] = [];
    for (let i = 0; i < CAPTION_MAX_LINES; i += 1) {
      const node = textNode(W / 2, CAPTION_Y + i * CAPTION_STEP, '', {
        size: fontSizes.md,
        fill: c.text,
        anchor: 'middle',
      });
      gCaption.appendChild(node);
      captionLines.push(node);
    }
    const capUnits = Math.floor((W - CAPTION_PAD * 2) / (parseFloat(fontSizes.md) * 0.55));

    function setCaption(text: string): void {
      const rows = wrapCaption(text, capUnits, CAPTION_MAX_LINES);
      for (let i = 0; i < captionLines.length; i += 1) {
        captionLines[i].textContent = rows[i] ?? '';
      }
    }

    // ── 지금 배치의 상태.
    let aIndex = -1;
    let bIndex = -1;
    let connA: SVGLineElement | null = null;
    let connB: SVGLineElement | null = null;
    const slabs = new Map<number, Slab>();
    const ghosts = new Map<string, SVGRectElement>();
    const badges = new Map<number, { node: SVGTextElement; count: number }>();

    const claimFill = (index: number): string => {
      if (index === aIndex) return COLOR_A;
      if (index === bIndex) return COLOR_B;
      return c.bgSubtle;
    };
    const claimed = (index: number): boolean => index === aIndex || index === bIndex;

    function paintCells(): void {
      for (let i = 0; i < cellCount; i += 1) {
        const mine = claimed(i);
        cellRects[i].setAttribute('fill', mine ? claimFill(i) : c.bg);
        cellNames[i].setAttribute('fill', mine ? c.stateInk : c.textMuted);
        cellAddrs[i].setAttribute('fill', mine ? c.stateInk : c.textMuted);
        cellValues[i].setAttribute('fill', mine ? c.stateInk : c.textMuted);
        cellValues[i].textContent = String(values[i]);
      }
    }

    function makeSlab(line: number, owner: string): Slab {
      const g = el('g', { opacity: 0 });
      const x = blockX(line);
      const box = el('rect', {
        x,
        y: SLAB_HOME_Y,
        width: blockW,
        height: SLAB_H,
        rx: 7,
        fill: c.bg,
        stroke: coreColor(owner),
        'stroke-width': 2,
      });
      g.appendChild(box);
      const minis: SVGRectElement[] = [];
      const texts: SVGTextElement[] = [];
      for (let j = 0; j < elemsPerLine; j += 1) {
        const index = line * elemsPerLine + j;
        const mx = x + j * cellW;
        const mini = el('rect', {
          x: mx + 4,
          y: SLAB_HOME_Y + 7,
          width: cellW - 8,
          height: SLAB_H - 14,
          rx: 3,
          fill: claimFill(index),
          stroke: c.border,
        });
        g.appendChild(mini);
        minis.push(mini);
        const node = textNode(mx + cellW / 2, SLAB_HOME_Y + SLAB_H / 2 + 5, String(values[index]), {
          size: fontSizes.sm,
          fill: claimed(index) ? c.stateInk : c.textMuted,
          anchor: 'middle',
          weight: 700,
          family: fonts.mono,
        });
        g.appendChild(node);
        texts.push(node);
      }
      gSlab.appendChild(g);
      return { g, box, minis, values: texts, owner, dy: 0 };
    }

    function setDy(slab: Slab, dy: number): void {
      slab.dy = dy;
      slab.g.setAttribute('transform', `translate(0, ${dy})`);
    }

    function ghostOn(line: number, core: string): void {
      const key = `${line}:${core}`;
      if (ghosts.has(key)) return;
      const node = el('rect', {
        x: blockX(line),
        y: core === CORE_A ? SHELF_A_SLAB_Y : SHELF_B_SLAB_Y,
        width: blockW,
        height: SLAB_H,
        rx: 7,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
      });
      gGhost.appendChild(node);
      ghosts.set(key, node);
    }

    function ghostOff(line: number, core: string): void {
      const key = `${line}:${core}`;
      const node = ghosts.get(key);
      if (!node) return;
      node.remove();
      ghosts.delete(key);
    }

    function makeBadge(line: number): void {
      if (badges.has(line)) return;
      const node = textNode(blockX(line) + blockW, BADGE_Y, t('label.inval', 'invalidated: {n}', { n: 0 }), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'end',
        weight: 600,
      });
      gBadge.appendChild(node);
      badges.set(line, { node, count: 0 });
    }

    async function bumpBadge(line: number): Promise<void> {
      const badge = badges.get(line);
      if (!badge) return;
      badge.count += 1;
      badge.node.textContent = t('label.inval', 'invalidated: {n}', { n: badge.count });
      badge.node.setAttribute('fill', c.danger);
      await tween(NUDGE_MS, (p) => {
        const dy = Math.sin(p * Math.PI) * -5;
        badge.node.setAttribute('transform', `translate(0, ${dy})`);
      });
    }

    /**
     * 코어가 그 줄을 손에 넣는다.
     *
     * 쥔 적 없으면 메모리에서 끌어올리고 (그건 벌이 아니다), 상대가 쥐고 있으면
     * 빼앗는다 — 상대 선반에 빈 자국이 남고 셈이 하나 올라간다.
     */
    async function acquire(core: string, line: number): Promise<void> {
      const target = core === CORE_A ? DY_A : DY_B;
      const held = slabs.get(line);
      if (!held) {
        const slab = makeSlab(line, core);
        slabs.set(line, slab);
        await tween(FETCH_MS, (p) => {
          slab.g.setAttribute('opacity', String(Math.min(1, p * 3)));
          setDy(slab, lerp(0, target, p));
        });
        slab.g.setAttribute('opacity', '1');
        return;
      }
      if (held.owner === core) {
        await wait(HOLD_MS);
        return;
      }
      const loser = held.owner;
      ghostOn(line, loser);
      held.owner = core;
      held.box.setAttribute('stroke', coreColor(core));
      const from = held.dy;
      await Promise.all([
        tween(MOVE_MS, (p) => setDy(held, lerp(from, target, p))),
        bumpBadge(line),
      ]);
      ghostOff(line, core);
    }

    /** 고친 자리의 수를 한 칸 올린다. 값은 제자리에서 튀어 오른다. */
    async function bump(index: number, value: number): Promise<void> {
      values[index] = value;
      const memory = cellValues[index];
      memory.textContent = String(value);
      const slab = slabs.get(lineOf(index));
      const mirror = slab ? slab.values[index % elemsPerLine] : null;
      if (mirror) mirror.textContent = String(value);
      await tween(RISE_MS, (p) => {
        const dy = (1 - p) * -8;
        memory.setAttribute('transform', `translate(0, ${dy})`);
        if (mirror) mirror.setAttribute('transform', `translate(0, ${dy})`);
      });
      memory.removeAttribute('transform');
      if (mirror) mirror.removeAttribute('transform');
    }

    function clearMarks(): void {
      for (const node of ghosts.values()) node.remove();
      ghosts.clear();
      for (const badge of badges.values()) badge.node.remove();
      badges.clear();
    }

    function clearAll(): void {
      for (const slab of slabs.values()) slab.g.remove();
      slabs.clear();
      clearMarks();
      connA?.remove();
      connB?.remove();
      connA = null;
      connB = null;
      aIndex = -1;
      bIndex = -1;
      for (let i = 0; i < cellCount; i += 1) values[i] = 0;
      paintCells();
      setCaption('');
    }

    function makeConnector(core: string, index: number): SVGLineElement {
      const x = cellMid(index);
      const isA = core === CORE_A;
      const from = isA ? SHELF_A_Y + SHELF_H : STRIP_Y + CELL_H;
      const node = el('line', {
        x1: x,
        y1: from,
        x2: x,
        y2: from,
        stroke: coreColor(core),
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
      gConn.appendChild(node);
      return node;
    }

    async function growConnector(node: SVGLineElement, core: string): Promise<void> {
      const isA = core === CORE_A;
      const from = isA ? SHELF_A_Y + SHELF_H : STRIP_Y + CELL_H;
      const to = isA ? STRIP_Y : SHELF_B_Y;
      await tween(GROW_MS, (p) => node.setAttribute('y2', String(lerp(from, to, p))));
    }

    async function slideConnector(node: SVGLineElement, toIndex: number): Promise<void> {
      const from = Number(node.getAttribute('x1') ?? 0);
      const to = cellMid(toIndex);
      await tween(SLIDE_MS, (p) => {
        const x = lerp(from, to, p);
        node.setAttribute('x1', String(x));
        node.setAttribute('x2', String(x));
      });
    }

    // ── projector 가 부르는 표면.

    async function arrange(input: FalseSharingArrange): Promise<void> {
      setCaption(input.caption);

      // 앞 배치를 거둔다 — 쥐고 있던 줄은 메모리로 내려앉고 자국도 지운다.
      const leaving = [...slabs.values()];
      slabs.clear();
      if (leaving.length > 0) {
        await Promise.all(
          leaving.map((slab) => {
            const from = slab.dy;
            return tween(RETURN_MS, (p) => {
              setDy(slab, lerp(from, 0, p));
              slab.g.setAttribute('opacity', String(1 - p));
            }).then(() => slab.g.remove());
          }),
        );
      }
      clearMarks();
      for (let i = 0; i < cellCount; i += 1) values[i] = 0;

      const movingB = connB !== null && bIndex !== input.bIndex;
      const movingA = connA !== null && aIndex !== input.aIndex;

      if (connA === null) {
        aIndex = input.aIndex;
        bIndex = input.bIndex;
        paintCells();
        connA = makeConnector(CORE_A, aIndex);
        connB = makeConnector(CORE_B, bIndex);
        await Promise.all([growConnector(connA, CORE_A), growConnector(connB, CORE_B)]);
      } else {
        // 옮겨 앉는 걸음이다. 선이 먼저 미끄러지고 칠이 따라간다.
        const moves: Array<Promise<void>> = [];
        if (movingA && connA) moves.push(slideConnector(connA, input.aIndex));
        if (movingB && connB) moves.push(slideConnector(connB, input.bIndex));
        if (moves.length > 0) await Promise.all(moves);
        aIndex = input.aIndex;
        bIndex = input.bIndex;
        paintCells();
      }

      for (const index of [aIndex, bIndex]) makeBadge(lineOf(index));
      paintCells();
    }

    async function writeRound(input: FalseSharingRound): Promise<void> {
      setCaption(input.caption);
      for (let k = 0; k < input.cores.length; k += 1) {
        const core = input.cores[k];
        const index = input.indices[k];
        if (index === undefined) continue;
        await acquire(core, lineOf(index));
        await bump(index, input.values[k] ?? values[index] + 1);
      }
    }

    async function settle(input: FalseSharingSettle): Promise<void> {
      setCaption(input.caption);
      await Promise.all(
        [...badges.values()].map((badge) =>
          tween(NUDGE_MS, (p) => {
            const dy = Math.sin(p * Math.PI) * -4;
            badge.node.setAttribute('transform', `translate(0, ${dy})`);
          }),
        ),
      );
    }

    async function finish(input: FalseSharingSettle): Promise<void> {
      setCaption(input.caption);
      await wait(HOLD_MS);
    }

    return {
      arrange,
      writeRound,
      settle,
      finish,
      rewind(): void {
        clearAll();
      },
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
