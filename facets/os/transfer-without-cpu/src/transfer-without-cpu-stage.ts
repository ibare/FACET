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
} from '@ffacet/core/runtime';
import type { TransferScene } from './scene';

const H = 384;
const NS = 'http://www.w3.org/2000/svg';

/** 한 틱의 운동 길이 (ms) */
const MOVE_MS = 700;
const PROGRAM_MS = 650;
const CALL_MS = 550;
const ACK_MS = 450;
const FRAME_MS = 16;

const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
const XL = parseFloat(fontSizes.xl);

/** 자리는 캔버스 폭에서 역산한다. 상수는 세로 띠와 상한만 쥔다. */
function makeLayout(n: number) {
  const W = PIECE_CANVAS_W;
  const pad = Math.round(W * 0.05);
  const cellW = Math.min(88, Math.round(W * 0.13));
  const addrW = Math.round(W * 0.07);
  const devX = pad;
  const memX = W - pad - addrW - cellW;
  const ctrlW = Math.round(W * 0.4);
  const ctrlX = Math.round((W - ctrlW) / 2);
  const ctrlTop = 40;
  const ctrlBottom = 162;
  const laneY = 148;
  const rowsTop = 60;
  const rowsSpan = 186;
  const rowH = Math.min(30, rowsSpan / Math.max(1, n));
  const cellH = Math.round(rowH * 0.8);
  const cpuTop = 274;
  const cpuBottom = H - 14;
  const wireX = Math.round(W / 2);
  const chipW = 30;
  const chipGap = 6;
  const chipX = pad + 14;
  const chipY = 324;
  const sumX = wireX + 60;
  const sumW = W - pad - 14 - sumX;
  return {
    W, pad, cellW, addrW, devX, memX, ctrlW, ctrlX, ctrlTop, ctrlBottom, laneY,
    rowsTop, rowH, cellH, cpuTop, cpuBottom, wireX, chipW, chipGap, chipX, chipY, sumX, sumW,
    rowY: (i: number) => Math.round(rowsTop + i * rowH + rowH / 2),
    regY: (k: number) => ctrlTop + 40 + k * 22,
    chipCx: (k: number) => chipX + k * (chipW + chipGap) + chipW / 2,
    sumCx: sumX + sumW / 2,
    sumCy: 320,
  };
}
type Layout = ReturnType<typeof makeLayout>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size?: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r(x),
    y: r(y),
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': opts.size ?? SM,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'central',
    fill: opts.fill,
  });
  if (opts.weight) node.setAttribute('font-weight', String(opts.weight));
  node.textContent = body;
  return node;
}

/** 좌표를 문자열로 만들기 전에 반올림하고 -0 을 없앤다 */
function r(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 여러 점을 잇는 꺾은 길 위에서 비율 p 의 자리 */
function along(points: [number, number][], p: number): [number, number] {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(d);
    total += d;
  }
  let want = total * p;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = lens[i - 1]!;
    if (want <= d || i === points.length - 1) {
      const q = d === 0 ? 1 : Math.min(1, want / d);
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];
    }
    want -= d;
  }
  return points[points.length - 1]!;
}

/** 낱말이 지나는 길 — 장치 칸에서 제어기의 통로를 지나 메모리 칸으로. CPU 는 이 길 위에 없다 */
function route(L: Layout, from: number, slot: number): [number, number][] {
  return [
    [L.devX + L.cellW, L.rowY(from)],
    [L.ctrlX, L.laneY],
    [L.ctrlX + L.ctrlW, L.laneY],
    [L.memX, L.rowY(slot)],
  ];
}

type Handles = {
  memText: SVGTextElement[];
  memCell: SVGRectElement[];
  addrText: SVGTextElement | null;
  countText: SVGTextElement | null;
  regValues: SVGTextElement[];
  sumText: SVGTextElement | null;
  callBadge: SVGGElement | null;
  top: SVGGElement;
};

function drawStatic(svg: SVGSVGElement, scene: TransferScene, c: Palette, t: Translate): Handles {
  svg.textContent = '';
  const n = scene.words.length;
  const L = makeLayout(n);
  const root = el(svg, 'g', {});
  const step = scene.step;

  // 캡션 — 지금 일어나는 일만
  let caption = '';
  if (step.kind === 'start') {
    caption = t('caption.start', 'Words waiting in the device: {n}', { n });
  } else if (step.kind === 'program') {
    caption = t('caption.program', 'CPU writes to the controller — address {addr} · count {count}', {
      addr: scene.addr ?? '',
      count: scene.count ?? '',
    });
  } else if (step.kind === 'move') {
    caption = t('caption.move', 'Word {word} → memory {to} · meanwhile CPU sum: {sum}', {
      word: step.word,
      to: step.to,
      sum: scene.sum,
    });
  } else if (step.kind === 'interrupt') {
    caption = t('caption.interrupt', 'Count: {count} — the controller calls the CPU', { count: scene.count ?? '' });
  } else {
    caption = t('caption.ack', 'CPU takes the call — words moved: {moved} · calls: {calls}', {
      moved: step.moved,
      calls: scene.calls,
    });
  }
  label(root, L.W / 2, 18, caption, { size: MD, fill: c.text, anchor: 'middle', weight: 600 });

  // 장치 버퍼
  label(root, L.devX, L.rowsTop - 12, t('label.device', 'Device buffer'), { fill: c.textMuted });
  for (let i = 0; i < n; i += 1) {
    const y = L.rowY(i);
    const gone = i < scene.taken;
    el(root, 'rect', {
      x: L.devX, y: r(y - L.cellH / 2), width: L.cellW, height: L.cellH, rx: 4,
      fill: gone ? c.bgSubtle : c.itemDefault,
      stroke: c.border,
      ...(gone ? { 'stroke-dasharray': '3 3' } : {}),
    });
    label(root, L.devX + L.cellW / 2, y, String(scene.words[i]), {
      fill: gone ? c.textMuted : c.text, anchor: 'middle', mono: true,
    });
  }

  // 메모리
  label(root, L.memX, L.rowsTop - 12, t('label.memory', 'Memory'), { fill: c.textMuted });
  const memText: SVGTextElement[] = [];
  const memCell: SVGRectElement[] = [];
  const fresh = step.kind === 'move' ? step.slot : -1;
  for (let i = 0; i < scene.slots.length; i += 1) {
    const y = L.rowY(i);
    const v = scene.memory[i];
    const filled = v !== null && v !== undefined;
    const isFresh = i === fresh;
    memCell.push(
      el(root, 'rect', {
        x: L.memX, y: r(y - L.cellH / 2), width: L.cellW, height: L.cellH, rx: 4,
        fill: isFresh ? c.itemActive : filled ? c.itemSorted : c.bg,
        stroke: filled ? 'none' : c.border,
        ...(filled ? {} : { 'stroke-dasharray': '3 3' }),
      }),
    );
    memText.push(
      label(root, L.memX + L.cellW / 2, y, filled ? String(v) : '', {
        fill: isFresh ? c.stateInk : c.textInverse, anchor: 'middle', mono: true,
      }),
    );
    label(root, L.memX + L.cellW + 8, y, String(scene.slots[i]), { fill: c.textMuted, mono: true, size: SM });
  }

  // 제어기
  el(root, 'rect', {
    x: L.ctrlX, y: L.ctrlTop, width: L.ctrlW, height: L.ctrlBottom - L.ctrlTop, rx: 6,
    fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5,
  });
  label(root, L.ctrlX + L.ctrlW / 2, L.ctrlTop + 16, t('label.controller', 'DMA controller'), {
    fill: c.text, anchor: 'middle', weight: 600,
  });
  // 낱말이 지나는 통로 — 제어기 안을 가로지른다. CPU 는 이 길 위에 없다
  el(root, 'rect', {
    x: L.ctrlX, y: L.laneY - 9, width: L.ctrlW, height: 18,
    fill: c.bg, stroke: c.border, 'stroke-dasharray': '3 3',
  });
  if (step.kind === 'move') {
    // 이번 틱에 낱말이 지난 길 — 되짚어도 남는다
    el(root, 'polyline', {
      points: route(L, step.index, step.slot).map(([x, y]) => `${r(x)},${r(y)}`).join(' '),
      fill: 'none', stroke: c.itemActive, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    });
  }
  const regNames = [
    t('label.addr', 'Address'),
    t('label.count', 'Count'),
    t('label.dir', 'Direction'),
  ];
  const regBodies = [
    scene.addr === null ? '—' : String(scene.addr),
    scene.count === null ? '—' : String(scene.count),
    scene.direction === null ? '—' : t('dir.deviceToMemory', 'device → memory'),
  ];
  const regValues: SVGTextElement[] = [];
  for (let k = 0; k < 3; k += 1) {
    const y = L.regY(k);
    label(root, L.ctrlX + 12, y, regNames[k]!, { fill: c.textMuted });
    regValues.push(
      label(root, L.ctrlX + L.ctrlW - 12, y, regBodies[k]!, {
        fill: c.text, anchor: 'end', mono: k < 2, weight: 600,
      }),
    );
  }

  // 제어기와 CPU 를 잇는 선 — 적기와 부름이 이 선을 탄다
  el(root, 'line', {
    x1: L.wireX, y1: L.ctrlBottom, x2: L.wireX, y2: L.cpuTop,
    stroke: c.border, 'stroke-width': 1.5,
  });

  // CPU
  el(root, 'rect', {
    x: L.pad, y: L.cpuTop, width: L.W - 2 * L.pad, height: L.cpuBottom - L.cpuTop, rx: 6,
    fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5,
  });
  label(root, L.pad + 14, L.cpuTop + 18, t('label.cpu', 'CPU'), { fill: c.text, weight: 700 });
  label(root, L.chipX, L.chipY - 14, t('label.work', 'Own work'), { fill: c.textMuted });
  for (let k = 0; k < scene.job.length; k += 1) {
    const used = k < scene.done;
    const cx = L.chipCx(k);
    el(root, 'rect', {
      x: r(cx - L.chipW / 2), y: L.chipY, width: L.chipW, height: 24, rx: 4,
      fill: used ? c.bgSubtle : c.itemDefault, stroke: c.border,
      ...(used ? { 'stroke-dasharray': '3 3' } : {}),
    });
    label(root, cx, L.chipY + 12, String(scene.job[k]), {
      fill: used ? c.textMuted : c.text, anchor: 'middle', mono: true,
    });
  }
  el(root, 'rect', {
    x: L.sumX, y: L.sumCy - 30, width: L.sumW, height: 60, rx: 6,
    fill: c.itemDefault, stroke: c.primary,
  });
  label(root, L.sumX + 10, L.sumCy - 18, t('label.sum', 'Sum'), { fill: c.textMuted });
  const sumText = label(root, L.sumCx, L.sumCy + 6, String(scene.sum), {
    size: XL, fill: c.text, anchor: 'middle', mono: true, weight: 700,
  });

  // 부름 표 — 올라오면 CPU 의 윗변에, 받으면 CPU 안으로
  let callBadge: SVGGElement | null = null;
  if (scene.call !== 'none') {
    const taken = scene.call === 'taken';
    callBadge = el(root, 'g', {
      transform: `translate(${L.wireX} ${taken ? L.sumCy : L.cpuTop})`,
    });
    el(callBadge, 'rect', {
      x: -38, y: -12, width: 76, height: 24, rx: 12,
      fill: taken ? c.itemSorted : c.accent,
    });
    label(callBadge, 0, 0, t('label.call', 'Call'), {
      fill: taken ? c.textInverse : c.stateInk, anchor: 'middle', weight: 600,
    });
  }

  const top = el(root, 'g', {});
  return {
    memText,
    memCell,
    addrText: regValues[0] ?? null,
    countText: regValues[1] ?? null,
    regValues,
    sumText,
    callBadge,
    top,
  };
}

export const transferWithoutCpuStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    const live = (mine: number) => mine === gen && !destroyed;

    /** 프레임 수로 나눈 운동. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let k = 0;
        const tick = () => {
          if (!live(mine)) {
            finish();
            return;
          }
          k += 1;
          frame(ease(Math.min(1, k / frames)));
          if (k >= frames) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 0);
        timers.add(id);
      });
    }

    function chipWidth(body: string): number {
      return Math.max(30, body.length * SM * 0.62 + 14);
    }

    function chip(parent: Element, body: string, fill: string, ink: string, mono: boolean): SVGGElement {
      const g = el(parent, 'g', {});
      const w = chipWidth(body);
      el(g, 'rect', { x: r(-w / 2), y: -12, width: r(w), height: 24, rx: 4, fill });
      label(g, 0, 0, body, { fill: ink, anchor: 'middle', mono, weight: 600 });
      return g;
    }

    function place(g: SVGGElement, x: number, y: number) {
      g.setAttribute('transform', `translate(${r(x)} ${r(y)})`);
    }

    async function animateStep(mine: number, next: TransferScene): Promise<void> {
      const step = next.step;
      const L = makeLayout(next.words.length);
      const h = drawStatic(svg, next, colors, t);

      if (step.kind === 'program') {
        // CPU 가 세 값을 선을 따라 제어기로 올려 보낸다
        if (next.addr === null || next.count === null) {
          throw new Error('transfer-without-cpu-stage: program 걸음에 주소 · 개수가 없다');
        }
        const bodies = [String(next.addr), String(next.count), t('dir.deviceToMemory', 'device → memory')];
        const chips = bodies.map((b, k) => chip(h.top, b, colors.primary, colors.textInverse, k < 2));
        for (const v of h.regValues) v.setAttribute('opacity', '0');
        const valueRight = L.ctrlX + L.ctrlW - 12;
        const targets = bodies.map((b, k) => [valueRight - chipWidth(b) / 2, L.regY(k)] as const);
        await tween(mine, PROGRAM_MS, (p) => {
          chips.forEach((g, k) => {
            const q = Math.max(0, Math.min(1, p * 1.5 - k * 0.25));
            const aim = targets[k]!;
            place(g, L.wireX + (aim[0] - L.wireX) * q, L.cpuTop + (aim[1] - L.cpuTop) * q);
          });
        });
        return;
      }

      if (step.kind === 'move') {
        // 한 틱 — 낱말은 제어기의 통로를 지나 메모리로, 주소와 개수는 한 칸씩, CPU 는 다음 수를 합에 더한다
        const path = route(L, step.index, step.slot);
        const wordChip = chip(h.top, String(step.word), colors.itemActive, colors.stateInk, true);
        const memCell = h.memCell[step.slot];
        const memText = h.memText[step.slot];
        if (!memCell || !memText) throw new Error(`transfer-without-cpu-stage: 메모리 칸 ${step.slot} 이 없다`);
        memCell.setAttribute('fill', colors.bg);
        memCell.setAttribute('stroke', colors.border);
        memCell.setAttribute('stroke-dasharray', '3 3');
        memText.setAttribute('opacity', '0');

        const rolls: { now: SVGTextElement; was: SVGTextElement }[] = [];
        const pairs: [SVGTextElement | null, number][] = [
          [h.addrText, step.addrWas],
          [h.countText, step.countWas],
        ];
        for (const [now, wasValue] of pairs) {
          if (!now) continue;
          const was = now.cloneNode(true) as SVGTextElement;
          was.textContent = String(wasValue);
          now.parentNode?.appendChild(was);
          rolls.push({ now, was });
        }

        const from: [number, number] = [L.chipCx(step.index), L.chipY + 12];
        const to: [number, number] = [L.sumCx, L.sumCy + 6];
        const addChip = chip(h.top, `+${step.add}`, colors.accent, colors.stateInk, true);
        const sumText = h.sumText;
        if (sumText) sumText.textContent = String(step.sumWas);

        await tween(mine, MOVE_MS, (p) => {
          const [x, y] = along(path, p);
          place(wordChip, x, y);
          place(addChip, from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p - Math.sin(p * Math.PI) * 30);
          for (const { now, was } of rolls) {
            was.setAttribute('transform', `translate(0 ${r(-p * 10)})`);
            was.setAttribute('opacity', String(r(1 - p)));
            now.setAttribute('transform', `translate(0 ${r((1 - p) * 10)})`);
            now.setAttribute('opacity', String(r(p)));
          }
        });
        return;
      }

      if (step.kind === 'interrupt') {
        // 제어기가 선을 따라 CPU 를 부른다
        const badge = h.callBadge;
        if (!badge) throw new Error('transfer-without-cpu-stage: 부름 표가 없다');
        await tween(mine, CALL_MS, (p) => {
          place(badge, L.wireX, L.ctrlBottom + (L.cpuTop - L.ctrlBottom) * p);
        });
        return;
      }

      if (step.kind === 'ack') {
        // CPU 가 부름을 안으로 받아들인다
        const badge = h.callBadge;
        if (!badge) throw new Error('transfer-without-cpu-stage: 부름 표가 없다');
        await tween(mine, ACK_MS, (p) => {
          place(badge, L.wireX, L.cpuTop + (L.sumCy - L.cpuTop) * p);
        });
      }
    }

    return {
      async render(next: TransferScene, _prev: TransferScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'start') {
          drawStatic(svg, next, colors, t);
          return;
        }
        await animateStep(mine, next);
        if (!live(mine)) return;
        drawStatic(svg, next, colors, t);
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
