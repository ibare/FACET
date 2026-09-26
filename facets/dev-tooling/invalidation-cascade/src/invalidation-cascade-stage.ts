/**
 * invalidation-cascade 의 stage.
 *
 * 층이 위에서 아래로 한 줄로 선다. 줄마다 열쇠 셈(앞 열쇠 | 층 | 파일 지문) → 이번 열쇠 → 캐시의 지난번 열쇠.
 * 걸음의 운동은 **앞 층의 새 열쇠 칩이 아래 층의 "앞 열쇠" 칸으로 실제로 내려앉는 것**이다. 바뀐 열쇠는
 * 붉은 테두리를 지니고 내려가므로 바뀜이 층을 타고 번지는 것이 칩의 이동으로 보인다. 이어서 이번 열쇠가
 * 셈 자리에서 제 칸으로 밀려 나오고, 캐시와 견준 판정이 선다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { CascadeRow, InvalidationCascadeScene } from './scene.js';

const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 14;
/** 한 칸 열쇠 칩에 보이는 지문 글자 수 */
const SHOWN = 6;
const CARRY_MS = 460;
const EMERGE_MS = 320;
const FRAME_MS = 16;
/** 열쇠 셈의 칸 사이 — 가운데에 가름대 '|' 가 선다 */
const GAP = 22;

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return Object.is(out, -0) ? 0 : out;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
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
  text: string,
  opts: { size: string; fill: string; anchor?: string; family?: string; weight?: string },
): SVGElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

function short(hash: string): string {
  return hash.slice(0, SHOWN);
}

/** 층 식별자의 표시 이름 — 키는 리터럴 표로 둔다. 모르는 식별자는 식별자 그대로 보인다. */
function layerName(t: Translate, id: string): string {
  switch (id) {
    case 'base':
      return t('label.base', 'Base');
    case 'copy-deps':
      return t('label.copyDeps', 'Add deps list');
    case 'install':
      return t('label.install', 'Install deps');
    case 'copy-src':
      return t('label.copySrc', 'Add source');
    case 'build':
      return t('label.build', 'Build');
    case 'test':
      return t('label.test', 'Test');
    default:
      return id;
  }
}

type ChipLook = 'plain' | 'changed' | 'hit' | 'empty' | 'muted';

type Geometry = {
  fileY0: number;
  fileGap: number;
  headY: number;
  rowTop: number;
  rowH: number;
  chipW: number;
  chipH: number;
  xName: number;
  xPrev: number;
  xId: number;
  xFp: number;
  xArrow: number;
  xNew: number;
  xRel: number;
  xOld: number;
  xOutcome: number;
  verdictY: number;
  reasonY: number;
  tallyY: number;
};

function geometry(scene: InvalidationCascadeScene): Geometry {
  const W = PIECE_CANVAS_W;
  const charW = parseFloat(fontSizes.sm) * 0.62;
  const chipW = Math.ceil(charW * SHOWN + 14);
  const idLen = Math.max(4, ...scene.layers.map((l) => l.id.length));
  const idW = charW * idLen;
  const fileGap = 20;
  const fileY0 = 20;
  const headY = fileY0 + Math.max(1, scene.files.length) * fileGap + 12;
  const rowTop = headY + 14;
  const verdictY = H - 54;
  const reasonY = H - 33;
  const tallyY = H - 12;
  const rowsSpace = verdictY - 26 - rowTop;
  const rowH = Math.min(46, rowsSpace / Math.max(1, scene.layers.length));
  const chipH = Math.min(24, rowH - 12);
  // 이름 칸은 남는 폭을 가진다 — 나머지 칸은 오른쪽 끝에서 거꾸로 셈한다.
  const xOutcome = W - PAD;
  const outcomeW = 64;
  const xOld = xOutcome - outcomeW - chipW;
  const xRel = xOld - 14;
  const xNew = xRel - 14 - chipW;
  const xArrow = xNew - 16;
  const xFp = xArrow - 16 - chipW;
  const xId = xFp - GAP - idW;
  const xPrev = xId - GAP - chipW;
  return {
    fileY0,
    fileGap,
    headY,
    rowTop,
    rowH,
    chipW,
    chipH,
    xName: PAD,
    xPrev,
    xId,
    xFp,
    xArrow,
    xNew,
    xRel,
    xOld,
    xOutcome,
    verdictY,
    reasonY,
    tallyY,
  };
}

function rowMid(g: Geometry, i: number): number {
  return g.rowTop + g.rowH * i + g.rowH / 2;
}

function drawChip(
  parent: Element,
  c: Palette,
  g: Geometry,
  x: number,
  cy: number,
  text: string,
  look: ChipLook,
): SVGElement {
  const group = el('g', {}, parent);
  const fill = look === 'hit' ? c.accent : look === 'empty' ? 'none' : c.bg;
  const stroke =
    look === 'changed' ? c.itemSwapping : look === 'hit' ? c.accent : look === 'empty' ? c.border : c.textMuted;
  const rect = el(
    'rect',
    {
      x,
      y: cy - g.chipH / 2,
      width: g.chipW,
      height: g.chipH,
      rx: 4,
      fill,
      stroke,
      'stroke-width': look === 'changed' ? 2 : 1,
    },
    group,
  );
  if (look === 'empty') rect.setAttribute('stroke-dasharray', '3 3');
  if (text !== '') {
    const ink =
      look === 'changed' ? c.itemSwapping : look === 'hit' ? c.stateInk : look === 'muted' ? c.textMuted : c.text;
    label(group, x + g.chipW / 2, cy, text, {
      size: fontSizes.sm,
      fill: ink,
      anchor: 'middle',
      family: fonts.mono,
      weight: look === 'changed' || look === 'hit' ? '700' : '400',
    });
  }
  return group;
}

type RowParts = { prevChip: SVGElement | null; reveal: SVGElement | null };

function tally(rows: readonly CascadeRow[]): { hit: number; miss: number; chain: number } {
  let hit = 0;
  let miss = 0;
  let chain = 0;
  for (const r of rows) {
    if (r.hit) hit += 1;
    else {
      miss += 1;
      if (!r.fileChanged) chain += 1;
    }
  }
  return { hit, miss, chain };
}

export const invalidationCascadeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    let fx: SVGElement | null = null;
    let parts: RowParts[] = [];

    function drawStatic(scene: InvalidationCascadeScene): void {
      svg.textContent = '';
      parts = [];
      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg }, svg);
      if (scene.layers.length === 0) {
        fx = el('g', {}, svg);
        return;
      }
      const g = geometry(scene);
      const current = scene.step.kind === 'layer' ? scene.step.index : -1;

      // 파일 — 이름 · 내용 · 지문 (지난번 → 이번)
      scene.files.forEach((f, k) => {
        const y = g.fileY0 + g.fileGap * k;
        const changed = f.fpBefore !== null && f.fpAfter !== null && f.fpBefore !== f.fpAfter;
        label(svg, g.xName, y, f.name, { size: fontSizes.sm, fill: c.text, family: fonts.mono, weight: '700' });
        const content = f.before === f.after ? f.before : `${f.before}  →  ${f.after}`;
        label(svg, g.xName + 84, y, content, {
          size: fontSizes.sm,
          fill: changed ? c.itemSwapping : c.textMuted,
          family: fonts.mono,
        });
        if (f.fpBefore !== null && f.fpAfter !== null) {
          const prints = changed ? `${short(f.fpBefore)} → ${short(f.fpAfter)}` : short(f.fpAfter);
          label(svg, g.xOutcome, y, prints, {
            size: fontSizes.sm,
            fill: changed ? c.itemSwapping : c.textMuted,
            family: fonts.mono,
            anchor: 'end',
            weight: changed ? '700' : '400',
          });
          label(svg, g.xOutcome - (changed ? 17 : 6) * parseFloat(fontSizes.sm) * 0.62 - 10, y,
            t('label.fingerprint', 'Fingerprint'), { size: fontSizes.xs, fill: c.textMuted, anchor: 'end' });
        }
      });

      // 머리줄
      const head = { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' };
      label(svg, g.xName, g.headY, t('label.layer', 'Layer'), { ...head, anchor: 'start' });
      label(svg, g.xPrev + g.chipW / 2, g.headY, t('label.prevKey', 'Key above'), head);
      label(svg, g.xFp + g.chipW / 2, g.headY, t('label.filePrint', 'File print'), head);
      label(svg, g.xNew + g.chipW / 2, g.headY, t('label.newKey', 'New key'), head);
      label(svg, g.xOld + g.chipW / 2, g.headY, t('label.cache', 'Cache'), head);
      el('line', { x1: PAD, y1: g.rowTop - 2, x2: PIECE_CANVAS_W - PAD, y2: g.rowTop - 2, stroke: c.border }, svg);

      scene.layers.forEach((layer, i) => {
        const cy = rowMid(g, i);
        const row: CascadeRow | undefined = scene.rows[i];
        if (i === current) {
          el('rect', { x: PAD / 2, y: cy - g.rowH / 2 + 1, width: PIECE_CANVAS_W - PAD, height: g.rowH - 2, rx: 6, fill: c.bgSubtle }, svg);
        }
        const nameY = layer.file === null ? cy : cy - 7;
        label(svg, g.xName, nameY, layerName(t, layer.id), {
          size: fontSizes.sm,
          fill: row ? c.text : c.textMuted,
          weight: i === current ? '700' : '400',
        });
        if (layer.file !== null) {
          label(svg, g.xName, cy + 8, layer.file, { size: fontSizes.xs, fill: c.textMuted, family: fonts.mono });
        }

        // 열쇠 셈: 앞 열쇠 | 층 | 파일 지문
        const sep = { size: fontSizes.sm, fill: c.textMuted, anchor: 'middle', family: fonts.mono };
        label(svg, g.xId - GAP / 2, cy, '|', sep);
        label(svg, (g.xId + g.xFp - GAP) / 2, cy, layer.id, { ...sep, fill: row ? c.text : c.textMuted });
        label(svg, g.xFp - GAP / 2, cy, '|', sep);
        label(svg, g.xArrow + 8, cy, '→', sep);

        let prevChip: SVGElement | null = null;
        if (row === undefined || row.prevKey === '') {
          prevChip = drawChip(svg, c, g, g.xPrev, cy, '', 'empty');
        } else {
          prevChip = drawChip(svg, c, g, g.xPrev, cy, short(row.prevKey), row.prevChanged ? 'changed' : 'plain');
        }
        if (row === undefined || row.fileFp === '') {
          drawChip(svg, c, g, g.xFp, cy, '', 'empty');
        } else {
          drawChip(svg, c, g, g.xFp, cy, short(row.fileFp), row.fileChanged ? 'changed' : 'plain');
        }

        // 캐시에 남은 지난번 열쇠
        const old = scene.oldKeys[i];
        if (old !== undefined) drawChip(svg, c, g, g.xOld, cy, short(old), row && !row.hit ? 'muted' : 'plain');

        let reveal: SVGElement | null = null;
        if (row === undefined) {
          drawChip(svg, c, g, g.xNew, cy, '', 'empty');
        } else {
          reveal = el('g', {}, svg);
          drawChip(reveal, c, g, g.xNew, cy, short(row.key), row.hit ? 'hit' : 'changed');
          label(reveal, g.xRel + 0, cy, row.hit ? '=' : '≠', {
            size: fontSizes.md,
            fill: row.hit ? c.text : c.itemSwapping,
            anchor: 'middle',
            weight: '700',
          });
          if (row.hit) {
            drawChip(reveal, c, g, g.xOld, cy, short(old ?? row.key), 'hit');
            label(reveal, g.xOutcome, cy, t('label.reused', 'Reused'), {
              size: fontSizes.sm,
              fill: c.text,
              anchor: 'end',
              weight: '700',
            });
          } else {
            el('line', { x1: g.xOld + 4, y1: cy, x2: g.xOld + g.chipW - 4, y2: cy, stroke: c.textMuted, 'stroke-width': 1.5 }, reveal);
            label(reveal, g.xOutcome, cy, t('label.redo', 'Redo'), {
              size: fontSizes.sm,
              fill: c.itemSwapping,
              anchor: 'end',
              weight: '700',
            });
          }
        }
        parts.push({ prevChip, reveal });
      });

      // 캡션 — 이번 걸음의 판정과 그 까닭
      if (scene.step.kind === 'start') {
        if (scene.oldKeys.length > 0) {
          label(svg, PAD, g.verdictY, t('caption.start', 'Keys in the cache from the last build: {n}', { n: scene.oldKeys.length }), {
            size: fontSizes.md,
            fill: c.text,
          });
          const changed = scene.files.filter((f) => f.fpBefore !== f.fpAfter).map((f) => f.name);
          const reason =
            changed.length > 0
              ? t('caption.changed', 'Changed since then: {files}', { files: changed.join(', ') })
              : t('caption.unchanged', 'No file has changed since then.');
          label(svg, PAD, g.reasonY, reason, { size: fontSizes.sm, fill: c.textMuted });
        }
      } else {
        const i = scene.step.index;
        const row = scene.rows[i];
        const layer = scene.layers[i];
        if (row !== undefined && layer !== undefined) {
          const vars = { layer: layerName(t, layer.id), key: short(row.key) };
          const verdict = row.hit
            ? t('caption.hit', '{layer}: key {key} is in the cache — reused.', vars)
            : t('caption.miss', '{layer}: key {key} is not in the cache — redo.', vars);
          label(svg, PAD, g.verdictY, verdict, { size: fontSizes.md, fill: c.text, weight: '700' });
          const reason = row.fileChanged
            ? t('reason.file', 'Its own file print changed.')
            : row.prevChanged
              ? t('reason.prev', 'Its own input is unchanged — only the key above changed.')
              : t('reason.same', 'Nothing that goes into its key has changed.');
          label(svg, PAD, g.reasonY, reason, { size: fontSizes.sm, fill: row.hit ? c.textMuted : c.itemSwapping });
        }
      }
      if (scene.oldKeys.length > 0) {
        const n = tally(scene.rows);
        label(
          svg,
          PAD,
          g.tallyY,
          t('tally', 'Reused: {hit} · Redone: {miss} · redone only because of the layer above: {chain}', n),
          { size: fontSizes.xs, fill: c.textMuted },
        );
      }
      fx = el('g', {}, svg);
    }

    /** 한 시계로 흐르는 운동. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      return new Promise<void>((resolve) => {
        let k = 0;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          k += 1;
          const p = k / frames;
          const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          frame(eased);
          if (k >= frames) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function animateLayer(scene: InvalidationCascadeScene, i: number, mine: number): Promise<void> {
      const g = geometry(scene);
      const row = scene.rows[i];
      const part = parts[i];
      if (row === undefined || part === undefined || fx === null) return;
      const layer = fx;
      part.reveal?.setAttribute('visibility', 'hidden');

      // 1. 앞 층의 새 열쇠가 이 층의 "앞 열쇠" 칸으로 내려앉는다
      if (i > 0 && row.prevKey !== '' && part.prevChip !== null) {
        part.prevChip.setAttribute('visibility', 'hidden');
        const ghost = drawChip(layer, c, g, 0, 0, short(row.prevKey), row.prevChanged ? 'changed' : 'plain');
        const x0 = g.xNew;
        const y0 = rowMid(g, i - 1);
        const x1 = g.xPrev;
        const y1 = rowMid(g, i);
        await tween(CARRY_MS, mine, (p) => {
          ghost.setAttribute('transform', `translate(${r1(x0 + (x1 - x0) * p)} ${r1(y0 + (y1 - y0) * p)})`);
        });
        if (destroyed || mine !== gen) return;
        ghost.remove();
        part.prevChip.removeAttribute('visibility');
      }

      // 2. 셈 자리에서 이번 열쇠가 밀려 나와 제 칸에 선다
      const cy = rowMid(g, i);
      const born = drawChip(layer, c, g, 0, cy, short(row.key), row.hit ? 'hit' : 'changed');
      const xs = g.xFp;
      const xe = g.xNew;
      await tween(EMERGE_MS, mine, (p) => {
        born.setAttribute('transform', `translate(${r1(xs + (xe - xs) * p)} 0)`);
        born.setAttribute('opacity', String(r1(0.3 + 0.7 * p)));
      });
    }

    return {
      render(next: InvalidationCascadeScene, prev: InvalidationCascadeScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'layer' || prev === null) return;
        if (prev.rows.length !== next.rows.length - 1) return;
        const i = next.step.index;
        return animateLayer(next, i, mine).then(() => {
          if (!destroyed && mine === gen) drawStatic(next);
        });
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
  },
};
