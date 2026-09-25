import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { HeldValue, SharedSecretScene } from './scene.js';

/**
 * 두 끝(기둥)과 그 사이 공개된 선, 선 가운데에서 아래로 늘어진 엿듣는 이의 손.
 * 공개값은 보낸 쪽 칸에서 나와 선을 건너 받는 쪽 칸으로 들어가고, 선 한가운데를 지나는
 * 순간 사본이 줄을 타고 엿듣는 이의 손으로 떨어진다. 비밀 칸은 한 번도 움직이지 않는다.
 * 섞기는 재료가 비밀 칸으로 모였다가 새 값이 비밀 칸에서 제 자리로 나오는 운동이다.
 */

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CROSS_MS = 900;
const CROSS_STAGGER_MS = 160;
const MIX_MS = 600;
const EAVESDROP_MS = 700;

type Pt = { x: number; y: number };
type Slot = Pt & { w: number };

type Layout = {
  pad: number;
  colW: number;
  gap: number;
  chipW: number;
  chipH: number;
  colTop: number;
  colBottom: number;
  pubY: number;
  secY: number;
  shareY: number;
  keyY: number;
  wireY: number;
  midX0: number;
  midX1: number;
  midX: number;
  trayTop: number;
  trayH: number;
  trayChipW: number;
  trayGap: number;
  productY: number;
  captionY1: number;
  captionY2: number;
};

function makeLayout(): Layout {
  const W = PIECE_CANVAS_W;
  const pad = Math.round(W * 0.025);
  const colW = Math.round(W * 0.28);
  const gap = Math.round(colW * 0.06);
  const chipW = Math.min(76, Math.floor((colW - 3 * gap) / 2));
  const chipH = 36;
  const midX0 = pad + colW;
  const midX1 = W - pad - colW;
  const trayGap = 6;
  const trayChipW = Math.min(chipW, Math.floor((midX1 - midX0 - 2 * gap - 3 * trayGap) / 4));
  return {
    pad,
    colW,
    gap,
    chipW,
    chipH,
    colTop: 44,
    colBottom: 304,
    pubY: 86,
    secY: 148,
    shareY: 212,
    keyY: 274,
    wireY: 117,
    midX0,
    midX1,
    midX: Math.round((midX0 + midX1) / 2),
    trayTop: 182,
    trayH: 50,
    trayChipW,
    trayGap,
    productY: 274,
    captionY1: 334,
    captionY2: 358,
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 꺾인 선 위의 자리 — s 는 길이 비율 */
function along(points: Pt[], s: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  const first = points[0]!;
  if (total === 0) return { x: first.x, y: first.y };
  let d = Math.max(0, Math.min(1, s)) * total;
  for (let i = 0; i < lens.length; i += 1) {
    const len = lens[i]!;
    const a = points[i]!;
    const b = points[i + 1]!;
    if (d <= len || i === lens.length - 1) {
      const k = len === 0 ? 1 : Math.min(1, d / len);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= len;
  }
  return { x: first.x, y: first.y };
}

/** 꺾인 선에서 x 가 처음 target 에 닿는 길이 비율 (세 번째 꺾임 전의 가로 구간에서) */
function fractionAtX(points: Pt[], target: number): number {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lens.push(len);
    total += len;
  }
  if (total === 0) return 0;
  let acc = 0;
  for (let i = 0; i < lens.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (b.x !== a.x && target >= lo && target <= hi) {
      return (acc + lens[i]! * ((target - a.x) / (b.x - a.x))) / total;
    }
    acc += lens[i]!;
  }
  return 0.5;
}

export const sharedSecretInPublicStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const kindColor = categorical(3, 'vivid');
    const L = makeLayout();
    const chipPx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function roleName(id: string): string {
      if (id === 'client') return t('label.client', 'Client');
      if (id === 'server') return t('label.server', 'Server');
      if (id === 'eavesdropper') return t('label.eavesdropper', 'Eavesdropper');
      throw new Error(`모르는 역할: ${id}`);
    }

    function chipText(h: HeldValue): string {
      return t('label.chip', '{name} = {value}', { name: h.name, value: h.value });
    }

    function kindOf(scene: SharedSecretScene, name: string): 'public' | 'secret' | 'key' {
      if (name === scene.keyName) return 'key';
      if (scene.parties.some((p) => p.secretName === name)) return 'secret';
      return 'public';
    }

    function strokeOf(kind: 'public' | 'secret' | 'key'): string {
      const i = kind === 'public' ? 0 : kind === 'secret' ? 1 : 2;
      return kindColor[i] ?? colors.border;
    }

    function colX(index: number): number {
      return index === 0 ? L.pad : PIECE_CANVAS_W - L.pad - L.colW;
    }

    /** 한 끝 안에서 이름의 자리 */
    function slotOf(scene: SharedSecretScene, partyIndex: number, name: string): Slot {
      const x0 = colX(partyIndex);
      const cx = x0 + L.colW / 2;
      const left = x0 + L.gap + L.chipW / 2;
      const right = x0 + L.colW - L.gap - L.chipW / 2;
      if (name === scene.modName) return { x: left, y: L.pubY, w: L.chipW };
      if (name === scene.baseName) return { x: right, y: L.pubY, w: L.chipW };
      const party = scene.parties[partyIndex];
      if (party && name === party.secretName) return { x: cx, y: L.secY, w: L.chipW };
      const shareIndex = scene.parties.findIndex((p) => p.shareName === name);
      if (shareIndex === 0) return { x: left, y: L.shareY, w: L.chipW };
      if (shareIndex === 1) return { x: right, y: L.shareY, w: L.chipW };
      if (name === scene.keyName) return { x: cx, y: L.keyY, w: L.colW - 2 * L.gap };
      throw new Error(`자리 없는 이름: ${name}`);
    }

    function partyIndexOf(scene: SharedSecretScene, id: string): number {
      const i = scene.parties.findIndex((p) => p.id === id);
      if (i < 0) throw new Error(`모르는 끝: ${id}`);
      return i;
    }

    function trayCapacity(scene: SharedSecretScene): number {
      return 2 + scene.parties.length;
    }

    function traySlot(scene: SharedSecretScene, index: number): Slot {
      const n = trayCapacity(scene);
      const rowW = n * L.trayChipW + (n - 1) * L.trayGap;
      const x0 = L.midX - rowW / 2;
      return {
        x: x0 + index * (L.trayChipW + L.trayGap) + L.trayChipW / 2,
        y: L.trayTop + L.trayH / 2,
        w: L.trayChipW,
      };
    }

    function drawChip(
      parent: Element,
      at: Pt,
      w: number,
      text: string,
      stroke: string,
      opts: { small?: boolean; ring?: boolean },
    ): SVGGElement {
      const g = el('g', { transform: `translate(${r2(at.x)},${r2(at.y)})` }, parent);
      const h = L.chipH;
      if (opts.ring) {
        el(
          'rect',
          { x: r2(-w / 2 - 4), y: r2(-h / 2 - 4), width: r2(w + 8), height: h + 8, rx: 9, fill: 'none', stroke: colors.accent, 'stroke-width': 2.5 },
          g,
        );
      }
      el('rect', { x: r2(-w / 2), y: r2(-h / 2), width: r2(w), height: h, rx: 6, fill: colors.bg, stroke, 'stroke-width': 2 }, g);
      const label = el(
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': opts.small ? smallPx : chipPx,
          fill: colors.text,
        },
        g,
      );
      label.textContent = text;
      return g;
    }

    function drawEmpty(parent: Element, at: Slot, name: string): void {
      el(
        'rect',
        {
          x: r2(at.x - at.w / 2),
          y: r2(at.y - L.chipH / 2),
          width: r2(at.w),
          height: L.chipH,
          rx: 6,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '4 3',
        },
        parent,
      );
      const tx = el(
        'text',
        {
          x: r2(at.x),
          y: r2(at.y),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': chipPx,
          fill: colors.textMuted,
        },
        parent,
      );
      tx.textContent = name;
    }

    function drawLabel(parent: Element, x: number, y: number, text: string, px: number, fill: string): void {
      const tx = el(
        'text',
        { x: r2(x), y: r2(y), 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': px, fill },
        parent,
      );
      tx.textContent = text;
    }

    function captions(scene: SharedSecretScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') {
        return [t('caption.start', 'Each end keeps its own secret.'), t('caption.emptyHand', 'The eavesdropper’s hand is empty.')];
      }
      if (step.kind === 'cross') {
        return [
          t('caption.cross', 'Across the wire, {from} → {to}: {items}', {
            from: roleName(step.from),
            to: roleName(step.to),
            items: step.items.map(chipText).join(' · '),
          }),
          t('caption.copy', 'The eavesdropper keeps a copy.'),
        ];
      }
      if (step.kind === 'mix') {
        const first = t('caption.mix', '{who}: {name} = {base}^{exp} mod {mod} = {bv}^{ev} mod {mv} = {v}', {
          who: roleName(step.who),
          name: step.name,
          base: step.baseName,
          exp: step.expName,
          mod: step.modName,
          bv: step.baseValue,
          ev: step.expValue,
          mv: step.modValue,
          v: step.value,
        });
        const keys = scene.parties.map((p) => p.held.find((h) => h.name === scene.keyName));
        const [ka, kb] = keys;
        const [pa, pb] = scene.parties;
        if (step.name === scene.keyName && ka && kb && pa && pb) {
          return [
            first,
            t('caption.keys', '{a}: {k} = {ka} · {b}: {k} = {kb}', {
              a: roleName(pa.id),
              b: roleName(pb.id),
              k: scene.keyName,
              ka: ka.value,
              kb: kb.value,
            }),
          ];
        }
        return [first, ''];
      }
      const keyValues = [
        ...new Set(
          scene.parties
            .map((p) => p.held.find((h) => h.name === scene.keyName))
            .filter((h): h is HeldValue => h !== undefined)
            .map((h) => h.value),
        ),
      ];
      const vars = {
        left: step.leftName,
        right: step.rightName,
        mod: step.modName,
        v: step.value,
        k: scene.keyName,
        kv: keyValues.join(' · '),
      };
      const hit = keyValues.includes(step.value);
      return [
        t('caption.hand', '{who} holds {items}', {
          who: roleName(scene.eavesdropper),
          items: scene.hand.map(chipText).join(' · '),
        }),
        hit
          ? t('caption.productHit', '{left} × {right} mod {mod} = {v}, the same as {k} = {kv} at both ends.', vars)
          : t('caption.productMiss', '{left} × {right} mod {mod} = {v}, not {k} = {kv} at both ends.', vars),
      ];
    }

    function productText(scene: SharedSecretScene): string {
      const p = scene.product;
      if (!p) return '';
      return t('label.product', '{left} × {right} mod {mod} = {v}', {
        left: p.leftName,
        right: p.rightName,
        mod: p.modName,
        v: p.value,
      });
    }

    let overlay: SVGGElement | null = null;

    /** 장면 전체를 세운다. hide 에 든 칸은 운동이 그 자리로 데려올 것이라 비워 둔다 */
    function drawStatic(scene: SharedSecretScene, hide: Set<string> = new Set()): void {
      svg.textContent = '';
      const base = el('g', {}, svg);
      const chips = el('g', {}, svg);
      overlay = el('g', {}, svg);
      const step = scene.step;

      // 두 끝
      scene.parties.forEach((party, pi) => {
        const x0 = colX(pi);
        el(
          'rect',
          { x: x0, y: L.colTop, width: L.colW, height: L.colBottom - L.colTop, rx: 10, fill: colors.bgSubtle, stroke: colors.border },
          base,
        );
        drawLabel(base, x0 + L.colW / 2, L.colTop - 12, roleName(party.id), chipPx, colors.text);

        const names = [scene.modName, scene.baseName, ...scene.parties.map((p) => p.shareName), scene.keyName];
        for (const name of names) {
          const slot = slotOf(scene, pi, name);
          const held = party.held.find((h) => h.name === name);
          if (!held || hide.has(`${party.id}:${name}`)) {
            drawEmpty(chips, slot, name);
            continue;
          }
          let ring = false;
          if (step.kind === 'cross' && step.to === party.id && step.items.some((it) => it.name === name)) ring = true;
          if (step.kind === 'mix' && step.who === party.id && (name === step.name || name === step.baseName)) ring = true;
          drawChip(chips, slot, slot.w, chipText(held), strokeOf(kindOf(scene, name)), { ring });
        }

        // 비밀 — 제자리
        const sec = slotOf(scene, pi, party.secretName);
        const secRing = step.kind === 'mix' && step.who === party.id;
        drawChip(chips, sec, sec.w, chipText({ name: party.secretName, value: party.secret }), strokeOf('secret'), {
          ring: secRing,
        });
        drawLabel(base, sec.x, sec.y + L.chipH / 2 + 19, t('label.secret', 'secret'), smallPx, colors.textMuted);
      });

      // 공개된 선
      el('line', { x1: L.midX0, y1: L.wireY, x2: L.midX1, y2: L.wireY, stroke: colors.textMuted, 'stroke-width': 2 }, base);
      drawLabel(base, L.midX, L.wireY - 10, t('label.wire', 'public wire'), smallPx, colors.textMuted);

      // 엿듣는 이 — 선에서 늘어진 줄과 손
      el(
        'line',
        { x1: L.midX, y1: L.wireY, x2: L.midX, y2: L.trayTop, stroke: colors.textMuted, 'stroke-dasharray': '3 3' },
        base,
      );
      el('circle', { cx: L.midX, cy: L.wireY, r: 4, fill: colors.textMuted }, base);
      const n = trayCapacity(scene);
      const trayW = n * L.trayChipW + (n - 1) * L.trayGap + 2 * L.trayGap;
      el(
        'rect',
        {
          x: r2(L.midX - trayW / 2),
          y: L.trayTop,
          width: r2(trayW),
          height: L.trayH,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.border,
        },
        base,
      );
      drawLabel(base, (L.midX0 + L.midX) / 2, L.trayTop - 10, roleName(scene.eavesdropper), chipPx, colors.text);

      scene.hand.forEach((h, i) => {
        if (hide.has(`hand:${i}`)) return;
        const slot = traySlot(scene, i);
        let ring = false;
        if (step.kind === 'cross' && i >= step.handFrom) ring = true;
        if (step.kind === 'eavesdrop' && (h.name === step.leftName || h.name === step.rightName)) ring = true;
        drawChip(chips, slot, slot.w, chipText(h), strokeOf('public'), { small: true, ring });
      });

      if (scene.product && !hide.has('product')) {
        const w = L.midX1 - L.midX0 - 2 * L.gap;
        drawChip(chips, { x: L.midX, y: L.productY }, w, productText(scene), colors.textMuted, {
          ring: step.kind === 'eavesdrop',
        });
      }

      const [c1, c2] = captions(scene);
      drawLabel(base, PIECE_CANVAS_W / 2, L.captionY1, c1, chipPx, colors.text);
      if (c2) drawLabel(base, PIECE_CANVAS_W / 2, L.captionY2, c2, chipPx, colors.textMuted);
    }

    function tween(mine: number, ms: number, frame: (elapsed: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        let handle: number | null = null;
        const finish = (): void => {
          if (done) return;
          done = true;
          if (handle !== null) frames.delete(handle);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (now: number): void => {
          if (handle !== null) frames.delete(handle);
          handle = null;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const elapsed = Math.min(ms, now - start);
          frame(elapsed);
          if (elapsed >= ms) finish();
          else {
            handle = requestAnimationFrame(tick);
            frames.add(handle);
          }
        };
        handle = requestAnimationFrame(tick);
        frames.add(handle);
      });
    }

    async function animateCross(scene: SharedSecretScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'cross') return;
      const fromI = partyIndexOf(scene, step.from);
      const toI = partyIndexOf(scene, step.to);
      const fromEdge = fromI === 0 ? L.midX0 : L.midX1;
      const toEdge = toI === 0 ? L.midX0 : L.midX1;
      const hide = new Set<string>();
      step.items.forEach((it, k) => {
        hide.add(`${step.to}:${it.name}`);
        hide.add(`hand:${step.handFrom + k}`);
      });
      drawStatic(scene, hide);
      const layer = overlay;
      if (!layer) return;

      const runs = step.items.map((it, k) => {
        const src = slotOf(scene, fromI, it.name);
        const dst = slotOf(scene, toI, it.name);
        const path: Pt[] = [src, { x: fromEdge, y: L.wireY }, { x: toEdge, y: L.wireY }, dst];
        const tray = traySlot(scene, step.handFrom + k);
        const drop: Pt[] = [{ x: L.midX, y: L.wireY }, { x: L.midX, y: L.trayTop - 6 }, tray];
        const stroke = strokeOf(kindOf(scene, it.name));
        const moving = drawChip(layer, src, src.w, chipText(it), stroke, {});
        const copy = drawChip(layer, drop[0]!, tray.w, chipText(it), stroke, { small: true });
        copy.setAttribute('visibility', 'hidden');
        return { path, drop, moving, copy, delay: k * CROSS_STAGGER_MS, mid: fractionAtX(path, L.midX) };
      });
      const total = CROSS_MS + (runs.length - 1) * CROSS_STAGGER_MS;
      await tween(mine, total, (elapsed) => {
        for (const run of runs) {
          const u = Math.max(0, Math.min(1, (elapsed - run.delay) / CROSS_MS));
          const s = ease(u);
          const at = along(run.path, s);
          run.moving.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y)})`);
          if (s >= run.mid) {
            const c = run.mid >= 1 ? 1 : (s - run.mid) / (1 - run.mid);
            const d = along(run.drop, c);
            run.copy.removeAttribute('visibility');
            run.copy.setAttribute('transform', `translate(${r2(d.x)},${r2(d.y)})`);
          }
        }
      });
    }

    async function animateMix(scene: SharedSecretScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'mix') return;
      const pi = partyIndexOf(scene, step.who);
      drawStatic(scene, new Set([`${step.who}:${step.name}`]));
      const layer = overlay;
      if (!layer) return;
      const baseSlot = slotOf(scene, pi, step.baseName);
      const secSlot = slotOf(scene, pi, step.expName);
      const dst = slotOf(scene, pi, step.name);
      const ingredient = drawChip(
        layer,
        baseSlot,
        baseSlot.w,
        chipText({ name: step.baseName, value: step.baseValue }),
        strokeOf(kindOf(scene, step.baseName)),
        {},
      );
      const result = drawChip(layer, secSlot, dst.w, chipText({ name: step.name, value: step.value }), strokeOf(kindOf(scene, step.name)), {});
      result.setAttribute('visibility', 'hidden');
      await tween(mine, MIX_MS, (elapsed) => {
        const u = elapsed / MIX_MS;
        if (u < 0.5) {
          const at = along([baseSlot, secSlot], ease(u * 2));
          ingredient.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y)})`);
        } else {
          ingredient.setAttribute('visibility', 'hidden');
          result.removeAttribute('visibility');
          const at = along([secSlot, dst], ease((u - 0.5) * 2));
          result.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y)})`);
        }
      });
    }

    async function animateEavesdrop(scene: SharedSecretScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'eavesdrop') return;
      drawStatic(scene, new Set(['product']));
      const layer = overlay;
      if (!layer) return;
      const target: Pt = { x: L.midX, y: L.productY };
      const clones = scene.hand
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h.name === step.leftName || h.name === step.rightName)
        .map(({ h, i }) => {
          const from = traySlot(scene, i);
          return { from, g: drawChip(layer, from, from.w, chipText(h), strokeOf('public'), { small: true }) };
        });
      const MEET = 0.7;
      await tween(mine, EAVESDROP_MS, (elapsed) => {
        const u = elapsed / EAVESDROP_MS;
        const s = ease(Math.min(1, u / MEET));
        for (const c of clones) {
          const at = along([c.from, target], s);
          c.g.setAttribute('transform', `translate(${r2(at.x)},${r2(at.y)})`);
        }
      });
    }

    return {
      async render(next: SharedSecretScene, _prev: SharedSecretScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate) {
          drawStatic(next);
          return;
        }
        const kind = next.step.kind;
        if (kind === 'cross') await animateCross(next, mine);
        else if (kind === 'mix') await animateMix(next, mine);
        else if (kind === 'eavesdrop') await animateEavesdrop(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
