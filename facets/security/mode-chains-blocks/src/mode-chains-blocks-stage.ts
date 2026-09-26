/**
 * mode-chains-blocks 무대 — 덩어리마다 한 줄. 줄 안에서는 왼쪽에서 오른쪽으로
 * 평문 ⊕ 건너온 값 = 상자에 드는 값 → E → 암호문 이 흐르고, 나온 암호문은
 * 줄 끝에서 아래 줄의 "건너온 값" 자리로 **건너간다** (줄 바꿈처럼 되돌아 내려간다).
 * 첫 줄 위에는 IV 가 암호문 칸에 앉아 C_0 노릇을 한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ChainStep, ModeChainsBlocksScene } from './scene.js';

const H = 434;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;

const CAPTION_Y = 22;
const HEADER_Y = 52;
const ROW0_Y = 86;
const ROW_GAP = 62;
const COUNT_Y = 386;
const COUNT_GAP = 18;

/** 가로 자리 — 폭에서 역산한다 */
const COL = {
  index: 0.035,
  plain: 0.13,
  xor: 0.25,
  carried: 0.37,
  equals: 0.48,
  input: 0.585,
  box: 0.745,
  cipher: 0.9,
} as const;

type Hidden = { carryRow?: number; inputRow?: number; cipherRow?: number };

function x(col: keyof typeof COL): number {
  return Math.round(PIECE_CANVAS_W * COL[col]);
}

function rowY(i: number): number {
  return ROW0_Y + ROW_GAP * i;
}

/** i 번째 줄로 건너가는 길 — 앞 줄 암호문 자리에서 내려와, 줄 사이 틈을 따라 왼쪽으로, 건너온 값 자리로 */
function carryPath(i: number): [number, number][] {
  const fromY = rowY(i - 1);
  const gutter = fromY + ROW_GAP / 2;
  return [
    [x('cipher'), fromY],
    [x('cipher'), gutter],
    [x('carried'), gutter],
    [x('carried'), rowY(i)],
  ];
}

function pointOn(path: [number, number][], u: number): { at: [number, number]; passed: [number, number][] } {
  const lens: number[] = [];
  let total = 0;
  for (let k = 1; k < path.length; k += 1) {
    const len = Math.hypot(path[k]![0] - path[k - 1]![0], path[k]![1] - path[k - 1]![1]);
    lens.push(len);
    total += len;
  }
  let left = total * Math.min(1, Math.max(0, u));
  const passed: [number, number][] = [path[0]!];
  for (let k = 1; k < path.length; k += 1) {
    const len = lens[k - 1]!;
    const a = path[k - 1]!;
    const b = path[k]!;
    if (left <= len) {
      const f = len === 0 ? 1 : left / len;
      const at: [number, number] = [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f)];
      passed.push(at);
      return { at, passed };
    }
    left -= len;
    passed.push(b);
  }
  const end = path[path.length - 1]!;
  return { at: end, passed };
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

export const modeChainsBlocksStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);
    const xsPx = parseFloat(fontSizes.xs);
    const chipW = Math.round(mdPx * 4.4);
    const chipH = Math.round(mdPx * 2.1);
    const boxW = Math.round(mdPx * 4.6);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, px: number, py: number, text: string, opts: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: number }): void {
      el(
        parent,
        'text',
        {
          x: px,
          y: py,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill,
        },
        text,
      );
    }

    type ChipKind = 'plain' | 'chain' | 'iv' | 'input' | 'slot';

    function chip(parent: Element, cx: number, cy: number, kind: ChipKind, text: string | null, strong = false): void {
      const g = el(parent, 'g', { transform: `translate(${cx},${cy})` });
      const stroke =
        kind === 'plain' ? colors.border : kind === 'input' ? colors.text : kind === 'slot' ? colors.border : colors.itemActive;
      el(g, 'rect', {
        x: -chipW / 2,
        y: -chipH / 2,
        width: chipW,
        height: chipH,
        rx: 5,
        fill: kind === 'plain' ? colors.bgSubtle : colors.bg,
        stroke,
        'stroke-width': kind === 'slot' ? 1 : strong ? 2.5 : 1.5,
        ...(kind === 'slot' || kind === 'iv' ? { 'stroke-dasharray': '4 3' } : {}),
      });
      if (text !== null) label(g, 0, 0, text, { size: mdPx, fill: colors.text, mono: true, weight: kind === 'plain' ? 400 : 600 });
    }

    function arrow(parent: Element, x1: number, x2: number, y: number): void {
      el(parent, 'line', { x1, y1: y, x2: x2 - 6, y2: y, stroke: colors.textMuted, 'stroke-width': 1.5 });
      el(parent, 'path', { d: `M${x2},${y} L${x2 - 7},${y - 4} L${x2 - 7},${y + 4} Z`, fill: colors.textMuted });
    }

    function trail(parent: Element, points: [number, number][]): void {
      el(parent, 'polyline', {
        points: points.map((p) => `${p[0]},${p[1]}`).join(' '),
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 4',
        'stroke-linejoin': 'round',
      });
    }

    function captionText(scene: ModeChainsBlocksScene, step: ChainStep): string {
      const base = scene.base;
      if (!base) throw new Error('mode-chains-blocks 무대: 바탕이 없는 장면에 캡션을 셀 수 없다');
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Nothing locked yet — IV {iv} sits atop the ciphertext column', { iv: base.iv });
        case 'carry':
          if (step.from === 0)
            return t('caption.carryIv', 'IV {c} crosses to block {i}: {p} ⊕ {c} = {x}', {
              c: step.carried,
              i: step.index,
              p: step.plain,
              x: step.input,
            });
          return t('caption.carry', 'Ciphertext {c} of block {j} crosses to block {i}: {p} ⊕ {c} = {x}', {
            c: step.carried,
            j: step.from,
            i: step.index,
            p: step.plain,
            x: step.input,
          });
        case 'encrypt':
          return t('caption.encrypt', 'Block {i}: E({x}) = {c}', { i: step.index, x: step.input, c: step.cipher });
      }
    }

    function currentRow(step: ChainStep): number {
      return step.kind === 'start' ? 0 : step.index;
    }

    function drawStatic(scene: ModeChainsBlocksScene, hidden: Hidden): Element {
      svg.textContent = '';
      const root = el(svg, 'g', {});
      const base = scene.base;
      if (!base) return root;
      if (scene.rows.length !== base.blocks.length) throw new Error('mode-chains-blocks 무대: 줄 수가 덩어리 수와 다르다');

      label(root, PIECE_CANVAS_W / 2, CAPTION_Y, captionText(scene, scene.step), { size: mdPx, fill: colors.text, weight: 600 });

      // 머리줄
      const head = { size: xsPx, fill: colors.textMuted };
      label(root, x('plain'), HEADER_Y, t('header.plain', 'Plaintext'), head);
      label(root, x('carried'), HEADER_Y, t('header.carried', 'Carried in'), head);
      label(root, x('input'), HEADER_Y, t('header.input', 'Into box'), head);
      label(root, x('box'), HEADER_Y, t('header.box', 'Box E'), head);
      label(root, x('cipher'), HEADER_Y, t('header.cipher', 'Ciphertext'), head);

      // 줄 0 — 열쇠와 IV(C_0)
      label(root, x('box'), rowY(0), t('label.key', 'K {k}', { k: base.key }), { size: xsPx, fill: colors.textMuted, mono: true });
      label(root, x('cipher') - chipW / 2 - 8, rowY(0), t('label.iv', 'IV'), { size: smPx, fill: colors.text, anchor: 'end', weight: 600 });
      chip(root, x('cipher'), rowY(0), 'iv', base.iv);

      const trails = el(root, 'g', {});
      const now = currentRow(scene.step);

      scene.rows.forEach((row, k) => {
        const i = k + 1;
        const y = rowY(i);
        const block = base.blocks[k]!;
        const active = i === now;
        label(root, x('index'), y, String(i), {
          size: smPx,
          fill: active ? colors.text : colors.textMuted,
          weight: active ? 700 : 400,
        });
        chip(root, x('plain'), y, 'plain', block.plain);
        label(root, x('plain'), y + chipH / 2 + xsPx * 0.8, block.chars.join(' '), { size: xsPx, fill: colors.textMuted, mono: true });
        label(root, x('xor'), y, '⊕', { size: mdPx + 4, fill: colors.text });
        label(root, x('equals'), y, '=', { size: mdPx + 2, fill: colors.text });

        const carryShown = row.carried !== null && hidden.carryRow !== i;
        chip(root, x('carried'), y, carryShown ? 'chain' : 'slot', carryShown ? row.carried : null, active && scene.step.kind === 'carry');
        if (carryShown) trail(trails, carryPath(i));

        const inputShown = row.input !== null && hidden.inputRow !== i;
        chip(root, x('input'), y, inputShown ? 'input' : 'slot', inputShown ? row.input : null, active);

        arrow(root, x('input') + chipW / 2 + 4, x('box') - boxW / 2 - 2, y);
        el(root, 'rect', { x: x('box') - boxW / 2, y: y - chipH / 2, width: boxW, height: chipH, rx: 3, fill: colors.text });
        label(root, x('box'), y, t('label.box', 'E'), { size: mdPx, fill: colors.textInverse, weight: 700 });
        arrow(root, x('box') + boxW / 2 + 2, x('cipher') - chipW / 2 - 4, y);

        const cipherShown = row.cipher !== null && hidden.cipherRow !== i;
        chip(root, x('cipher'), y, cipherShown ? 'chain' : 'slot', cipherShown ? row.cipher : null, active && scene.step.kind === 'encrypt');
      });

      // 셈 — 서로 다른 값. 이름은 가운데에서 끝나고 값은 가운데에서 시작한다
      const mid = Math.round(PIECE_CANVAS_W / 2);
      const countName = { size: smPx, fill: colors.textMuted, anchor: 'end' };
      const countValue = { size: smPx, fill: colors.text, anchor: 'start', mono: true, weight: 700 };
      label(root, mid, COUNT_Y, t('count.plain', 'Distinct plaintext blocks'), countName);
      label(root, mid + 10, COUNT_Y, t('count.value', '{n} / {m}', { n: base.distinctPlain, m: base.blocks.length }), countValue);
      if (scene.inputs.total > 0) {
        label(root, mid, COUNT_Y + COUNT_GAP, t('count.inputs', 'Distinct values into the box'), countName);
        label(root, mid + 10, COUNT_Y + COUNT_GAP, t('count.value', '{n} / {m}', { n: scene.inputs.distinct, m: scene.inputs.total }), countValue);
      }
      if (scene.ciphers.total > 0) {
        label(root, mid, COUNT_Y + 2 * COUNT_GAP, t('count.ciphers', 'Distinct ciphertexts'), countName);
        label(root, mid + 10, COUNT_Y + 2 * COUNT_GAP, t('count.value', '{n} / {m}', { n: scene.ciphers.distinct, m: scene.ciphers.total }), countValue);
      }
      return root;
    }

    /** 한 시계 — u 0..1 을 frame 에 넘긴다. 새 render · destroy 가 오면 곧바로 풀린다 */
    function clock(mine: number, frame: (u: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
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
          const u = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(u);
          if (u >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function moveCarry(next: ModeChainsBlocksScene, step: Extract<ChainStep, { kind: 'carry' }>, mine: number): Promise<void> {
      const root = drawStatic(next, { carryRow: step.index, inputRow: step.index });
      const layer = el(root, 'g', {});
      const path = carryPath(step.index);
      const y = rowY(step.index);
      const split = 0.72;
      const ok = await clock(mine, (u) => {
        layer.textContent = '';
        if (u < split) {
          const { at, passed } = pointOn(path, ease(u / split));
          trail(layer, passed);
          chip(layer, at[0], at[1], 'chain', step.carried, true);
          return;
        }
        trail(layer, path);
        chip(layer, x('carried'), y, 'chain', step.carried, true);
        const f = ease((u - split) / (1 - split));
        chip(layer, Math.round(x('equals') + (x('input') - x('equals')) * f), y, 'input', step.input, true);
      });
      if (!ok) return;
      drawStatic(next, {});
    }

    async function moveEncrypt(next: ModeChainsBlocksScene, step: Extract<ChainStep, { kind: 'encrypt' }>, mine: number): Promise<void> {
      const root = drawStatic(next, { cipherRow: step.index });
      const layer = el(root, 'g', {});
      const y = rowY(step.index);
      const split = 0.5;
      const ok = await clock(mine, (u) => {
        layer.textContent = '';
        if (u < split) {
          // 상자에 드는 값의 사본이 상자로 들어간다 — 원본은 제자리에 남는다
          const f = ease(u / split);
          chip(layer, Math.round(x('input') + (x('box') - x('input')) * f), y, 'input', step.input, true);
          el(layer, 'rect', { x: x('box') - boxW / 2, y: y - chipH / 2, width: boxW, height: chipH, rx: 3, fill: colors.text });
          label(layer, x('box'), y, t('label.box', 'E'), { size: mdPx, fill: colors.textInverse, weight: 700 });
          return;
        }
        const f = ease((u - split) / (1 - split));
        chip(layer, Math.round(x('box') + (x('cipher') - x('box')) * f), y, 'chain', step.cipher, true);
        el(layer, 'rect', { x: x('box') - boxW / 2, y: y - chipH / 2, width: boxW, height: chipH, rx: 3, fill: colors.text });
        label(layer, x('box'), y, t('label.box', 'E'), { size: mdPx, fill: colors.textInverse, weight: 700 });
      });
      if (!ok) return;
      drawStatic(next, {});
    }

    const renderer: SceneRenderer<ModeChainsBlocksScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || !next.base || step.kind === 'start') {
          drawStatic(next, {});
          return;
        }
        if (step.kind === 'carry') await moveCarry(next, step, mine);
        else await moveEncrypt(next, step, mine);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
