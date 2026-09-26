/**
 * trapdoor-with-key 무대.
 *
 * 위 띠 — 공개(n · e) · 비밀 지수 d · φ · 숨김(p · q). 걸음 1 에서 숨긴 p · q 의 값이
 * φ 칸으로 날아가고, 걸음 2 에서 e 와 φ 가 d 칸으로 날아간다. d 가 서면 돌아오는
 * 아래 호가 그어진다.
 *
 * 아래 — 평문마다 고리 하나. 위 호(지수 e)로 나가 다른 수가 되고, 아래 호(지수 d)로
 * 제 자리로 돌아온다. 두 호의 셈은 같은 꼴(거듭제곱 후 mod n)이고 지수만 다르다 —
 * 고리 안에 두 셈이 위아래로 선다.
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
} from '@ffacet/core/runtime';
import type { TrapdoorScene } from './scene.js';

const H = 470;
const MARGIN = 16;
const MOVE_MS = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 기호는 번역하지 않는 자료다 — 문안에는 자리 표시자로 들어간다. */
const SYM = { n: 'n', e: 'e', p: 'p', q: 'q', phi: 'φ', d: 'd', m: 'm', c: 'c' } as const;
const SUP_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function sup(v: number): string {
  if (!Number.isInteger(v) || v < 0) throw new Error(`trapdoor-with-key-stage: 윗첨자로 쓸 수 없는 지수 ${v}`);
  return String(v)
    .split('')
    .map((ch) => {
      const s = SUP_DIGITS[Number(ch)];
      if (s === undefined) throw new Error(`trapdoor-with-key-stage: 윗첨자 숫자 ${ch} 가 없다`);
      return s;
    })
    .join('');
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

type Pt = { x: number; y: number };

/** 이차 베지어 위의 점 */
function onQuad(a: Pt, c: Pt, b: Pt, u: number): Pt {
  const k = 1 - u;
  return { x: k * k * a.x + 2 * k * u * c.x + u * u * b.x, y: k * k * a.y + 2 * k * u * c.y + u * u * b.y };
}

function quadLength(a: Pt, c: Pt, b: Pt): number {
  let len = 0;
  let prev = a;
  for (let i = 1; i <= 32; i += 1) {
    const pt = onQuad(a, c, b, i / 32);
    len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return len;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

type Box = { x: number; y: number; w: number; h: number };
const centerOf = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

type Loop = { home: Pt; lock: Pt; up: Pt; down: Pt; y: number };

type Geometry = {
  pub: Box;
  hidden: Box;
  nChip: Box;
  eChip: Box;
  pChip: Box;
  qChip: Box;
  dChip: Box;
  phiChip: Box;
  formulaY: number;
  headY: number;
  ruleDownY: number;
  captionY: number;
  loops: Loop[];
  laneChip: { w: number; h: number };
};

function geometry(count: number): Geometry {
  const W = PIECE_CANVAS_W;
  const gap = 8;
  const inner = W - 2 * MARGIN - 3 * gap;
  const fr = [0.21, 0.3, 0.26, 0.23];
  const cols: { x: number; w: number }[] = [];
  let x = MARGIN;
  for (const f of fr) {
    const w = inner * f;
    cols.push({ x, w });
    x += w + gap;
  }
  const [c0, c1, c2, c3] = cols as [typeof cols[0], typeof cols[0], typeof cols[0], typeof cols[0]];
  const chipY = 36;
  const chipH = 32;
  const pairChip = (col: { x: number; w: number }, i: number): Box => {
    const w = Math.min(64, (col.w - 18) / 2);
    const total = 2 * w + 6;
    const x0 = col.x + (col.w - total) / 2;
    return { x: x0 + i * (w + 6), y: chipY, w, h: chipH };
  };
  const single = (col: { x: number; w: number }): Box => {
    const w = Math.min(84, col.w - 12);
    return { x: col.x + (col.w - w) / 2, y: chipY, w, h: chipH };
  };

  const laneTop = 172;
  const laneBottom = H - 64;
  const spacing = Math.min(80, (laneBottom - laneTop) / count);
  const bulge = Math.min(30, spacing * 0.38);
  const homeX = MARGIN + 60;
  const lockX = W - MARGIN - 60;
  const mid = (homeX + lockX) / 2;
  const loops: Loop[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = laneTop + spacing * (i + 0.5);
    loops.push({
      home: { x: homeX, y },
      lock: { x: lockX, y },
      up: { x: mid, y: y - 2 * bulge },
      down: { x: mid, y: y + 2 * bulge },
      y,
    });
  }
  return {
    pub: { x: c0.x, y: 8, w: c0.w, h: 98 },
    hidden: { x: c3.x, y: 8, w: c3.w, h: 98 },
    nChip: pairChip(c0, 0),
    eChip: pairChip(c0, 1),
    pChip: pairChip(c3, 0),
    qChip: pairChip(c3, 1),
    dChip: single(c1),
    phiChip: single(c2),
    formulaY: 90,
    headY: 146,
    ruleDownY: laneBottom + 24,
    captionY: H - 14,
    loops,
    laneChip: { w: 56, h: 30 },
  };
}

export const trapdoorWithKeyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = svg.ownerDocument.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(node);
      return node;
    }

    function words(
      parent: Element,
      at: Pt,
      content: string,
      style: { size: string; color: string; mono?: boolean; weight?: number; anchor?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': style.anchor ?? 'middle',
          'font-family': style.mono ? fonts.mono : fonts.body,
          'font-size': style.size,
          'font-weight': style.weight ?? 400,
          fill: style.color,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    type ChipLook = 'plain' | 'known' | 'empty' | 'key' | 'locked' | 'ghostPlain' | 'ghostCipher' | 'back' | 'wrong';

    function chipColors(look: ChipLook): { fill: string; stroke: string; ink: string; dash: string; width: number } {
      switch (look) {
        case 'plain':
          return { fill: colors.itemDefault, stroke: colors.text, ink: colors.text, dash: '', width: 1.5 };
        case 'known':
          return { fill: colors.bgSubtle, stroke: colors.text, ink: colors.text, dash: '', width: 1.2 };
        case 'empty':
          return { fill: colors.bg, stroke: colors.ghostOutline, ink: colors.ghostOutline, dash: '4 3', width: 1.2 };
        case 'key':
          return { fill: colors.accent, stroke: colors.accent, ink: colors.stateInk, dash: '', width: 1.5 };
        case 'locked':
          return { fill: colors.bg, stroke: colors.itemComparing, ink: colors.text, dash: '', width: 2.2 };
        case 'ghostPlain':
          return { fill: colors.bg, stroke: colors.ghostOutline, ink: colors.ghostOutline, dash: '4 3', width: 1.2 };
        case 'ghostCipher':
          return { fill: colors.bg, stroke: colors.itemComparing, ink: colors.textMuted, dash: '4 3', width: 1.2 };
        case 'back':
          return { fill: colors.accent, stroke: colors.text, ink: colors.stateInk, dash: '', width: 1.5 };
        case 'wrong':
          return { fill: colors.danger, stroke: colors.danger, ink: colors.textInverse, dash: '', width: 1.5 };
      }
    }

    /** 칩 하나 — 가운데 at. 기호가 있으면 왼쪽에 작게, 값은 고정폭 굵게. */
    function chip(
      parent: Element,
      at: Pt,
      size: { w: number; h: number },
      look: ChipLook,
      value: string,
      symbol?: string,
    ): SVGGElement {
      const c = chipColors(look);
      const g = el('g', { transform: `translate(${r2(at.x)} ${r2(at.y)})` }, parent);
      el(
        'rect',
        {
          x: -size.w / 2,
          y: -size.h / 2,
          width: size.w,
          height: size.h,
          rx: 6,
          fill: c.fill,
          stroke: c.stroke,
          'stroke-width': c.width,
          ...(c.dash ? { 'stroke-dasharray': c.dash } : {}),
        },
        g,
      );
      const baseline = monoPx * 0.36;
      if (symbol !== undefined) {
        words(g, { x: -size.w / 2 + 8, y: baseline }, symbol, {
          size: fontSizes.sm,
          color: look === 'key' || look === 'back' ? c.ink : colors.textMuted,
          anchor: 'start',
        });
        if (value !== '') {
          words(g, { x: size.w / 2 - 8, y: baseline }, value, {
            size: fontSizes.md,
            color: c.ink,
            mono: true,
            weight: 700,
            anchor: 'end',
          });
        }
      } else if (value !== '') {
        words(g, { x: 0, y: baseline }, value, { size: fontSizes.md, color: c.ink, mono: true, weight: 700 });
      }
      return g;
    }

    function arrowHead(parent: Element, a: Pt, c: Pt, b: Pt, color: string): SVGPathElement {
      const u = 0.8;
      const tip = onQuad(a, c, b, u);
      const back = onQuad(a, c, b, u - 0.04);
      const ang = Math.atan2(tip.y - back.y, tip.x - back.x);
      const len = 8;
      const wing = 4;
      const bx = tip.x - len * Math.cos(ang);
      const by = tip.y - len * Math.sin(ang);
      const d = [
        `M ${r2(tip.x)} ${r2(tip.y)}`,
        `L ${r2(bx + wing * Math.sin(ang))} ${r2(by - wing * Math.cos(ang))}`,
        `L ${r2(bx - wing * Math.sin(ang))} ${r2(by + wing * Math.cos(ang))}`,
        'Z',
      ].join(' ');
      return el('path', { d, fill: color, stroke: 'none' }, parent);
    }

    type Handles = {
      geo: Geometry;
      phiParts: Element[];
      keyParts: Element[];
      lowerArcs: { path: SVGPathElement; head: SVGPathElement; len: number }[];
      ruleDown: Element | null;
      lockChips: (SVGGElement | null)[];
      homeChips: SVGGElement[];
      upperF: (Element | null)[];
      lowerF: (Element | null)[];
      overlay: SVGGElement;
    };

    function drawStatic(scene: TrapdoorScene): Handles {
      svg.textContent = '';
      const geo = geometry(scene.lanes.length);
      const root = el('g', {}, svg);
      const small = { size: fontSizes.xs, color: colors.textMuted };

      // ── 위 띠: 공개 · d · φ · 숨김
      el('rect', { x: geo.pub.x, y: geo.pub.y, width: geo.pub.w, height: geo.pub.h, rx: 8, fill: colors.bgSubtle, stroke: colors.border }, root);
      words(root, { x: geo.pub.x + geo.pub.w / 2, y: geo.pub.y + 16 }, t('label.public', 'Public'), small);
      chip(root, centerOf(geo.nChip), geo.nChip, 'known', String(scene.n), SYM.n);
      chip(root, centerOf(geo.eChip), geo.eChip, 'known', String(scene.e), SYM.e);

      el(
        'rect',
        {
          x: geo.hidden.x,
          y: geo.hidden.y,
          width: geo.hidden.w,
          height: geo.hidden.h,
          rx: 8,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-dasharray': '5 4',
        },
        root,
      );
      words(root, { x: geo.hidden.x + geo.hidden.w / 2, y: geo.hidden.y + 16 }, t('label.hidden', 'Hidden'), small);
      chip(root, centerOf(geo.pChip), geo.pChip, 'known', String(scene.p), SYM.p);
      chip(root, centerOf(geo.qChip), geo.qChip, 'known', String(scene.q), SYM.q);

      const phiParts: Element[] = [];
      if (scene.phi === null) {
        chip(root, centerOf(geo.phiChip), geo.phiChip, 'empty', '', SYM.phi);
      } else {
        phiParts.push(chip(root, centerOf(geo.phiChip), geo.phiChip, 'known', String(scene.phi), SYM.phi));
        phiParts.push(
          words(
            root,
            { x: geo.phiChip.x + geo.phiChip.w / 2, y: geo.formulaY },
            t('formula.phi', '({p} − 1)({q} − 1) = {phi}', { p: scene.p, q: scene.q, phi: scene.phi }),
            { size: fontSizes.xs, color: colors.text, mono: true },
          ),
        );
      }

      const keyParts: Element[] = [];
      if (scene.key === null) {
        chip(root, centerOf(geo.dChip), geo.dChip, 'empty', '', SYM.d);
      } else {
        if (scene.phi === null) throw new Error('trapdoor-with-key-stage: d 가 있는데 φ 가 없다');
        keyParts.push(chip(root, centerOf(geo.dChip), geo.dChip, 'key', String(scene.key.d), SYM.d));
        keyParts.push(
          words(
            root,
            { x: geo.dChip.x + geo.dChip.w / 2, y: geo.formulaY },
            t('formula.check', '{e} × {d} = {product} = {quotient} × {phi} + {remainder}', {
              e: scene.e,
              d: scene.key.d,
              product: scene.key.product,
              quotient: scene.key.quotient,
              phi: scene.phi,
              remainder: scene.key.remainder,
            }),
            { size: fontSizes.xs, color: colors.text, mono: true },
          ),
        );
      }

      // ── 아래: 고리
      const firstLoop = geo.loops[0];
      if (!firstLoop) throw new Error('trapdoor-with-key-stage: 평문이 없다');
      words(root, { x: firstLoop.home.x, y: geo.headY }, t('label.plain', 'Plaintext'), small);
      words(root, { x: firstLoop.lock.x, y: geo.headY }, t('label.cipher', 'Ciphertext'), small);
      words(
        root,
        { x: firstLoop.up.x, y: geo.headY },
        t('formula.rule', '{out} = {in}{exp} mod {n}', { out: SYM.c, in: SYM.m, exp: sup(scene.e), n: scene.n }),
        { size: fontSizes.sm, color: colors.itemComparing, mono: true, weight: 700 },
      );
      let ruleDown: Element | null = null;
      if (scene.key !== null) {
        ruleDown = words(
          root,
          { x: firstLoop.up.x, y: geo.ruleDownY },
          t('formula.rule', '{out} = {in}{exp} mod {n}', { out: SYM.m, in: SYM.c, exp: sup(scene.key.d), n: scene.n }),
          { size: fontSizes.sm, color: colors.text, mono: true, weight: 700 },
        );
      }

      const lowerArcs: Handles['lowerArcs'] = [];
      const lockChips: (SVGGElement | null)[] = [];
      const homeChips: SVGGElement[] = [];
      const upperF: (Element | null)[] = [];
      const lowerF: (Element | null)[] = [];
      const step = scene.step;

      scene.lanes.forEach((lane, i) => {
        const loop = geo.loops[i];
        if (!loop) throw new Error(`trapdoor-with-key-stage: 고리 ${i} 자리가 없다`);
        const g = el('g', {}, root);
        // 위 호 — 나가는 길 (지수 e)
        el(
          'path',
          {
            d: `M ${r2(loop.home.x)} ${r2(loop.y)} Q ${r2(loop.up.x)} ${r2(loop.up.y)} ${r2(loop.lock.x)} ${r2(loop.y)}`,
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 1.5,
          },
          g,
        );
        arrowHead(g, loop.home, loop.up, loop.lock, colors.itemComparing);
        // 아래 호 — 돌아오는 길 (지수 d). d 가 서야 그어진다
        if (scene.key !== null) {
          const path = el(
            'path',
            {
              d: `M ${r2(loop.lock.x)} ${r2(loop.y)} Q ${r2(loop.down.x)} ${r2(loop.down.y)} ${r2(loop.home.x)} ${r2(loop.y)}`,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 1.5,
            },
            g,
          );
          const head = arrowHead(g, loop.lock, loop.down, loop.home, colors.text);
          lowerArcs.push({ path, head, len: quadLength(loop.lock, loop.down, loop.home) });
        }

        // 고리 안의 두 셈 — 같은 꼴, 지수만 다르다
        const current =
          (step.kind === 'lock' || step.kind === 'unlock') && step.index === i ? step.kind : null;
        upperF.push(
          lane.cipher === null
            ? null
            : words(
                g,
                { x: loop.up.x, y: loop.y - 5 },
                t('formula.pow', '{base}{exp} mod {n} = {result}', {
                  base: lane.plain,
                  exp: sup(scene.e),
                  n: scene.n,
                  result: lane.cipher,
                }),
                { size: fontSizes.sm, color: colors.text, mono: true, weight: current === 'lock' ? 700 : 400 },
              ),
        );
        if (lane.back !== null && (scene.key === null || lane.cipher === null)) {
          throw new Error(`trapdoor-with-key-stage: 고리 ${i} 가 잠기거나 d 가 서기 전에 풀렸다`);
        }
        lowerF.push(
          lane.back === null || scene.key === null || lane.cipher === null
            ? null
            : words(
                g,
                { x: loop.down.x, y: loop.y + 15 },
                t('formula.pow', '{base}{exp} mod {n} = {result}', {
                  base: lane.cipher,
                  exp: sup(scene.key.d),
                  n: scene.n,
                  result: lane.back,
                }),
                { size: fontSizes.sm, color: colors.text, mono: true, weight: current === 'unlock' ? 700 : 400 },
              ),
        );

        // 두 끝의 칩
        const size = geo.laneChip;
        if (lane.cipher === null) {
          chip(g, loop.lock, size, 'empty', '');
          homeChips.push(chip(g, loop.home, size, 'plain', String(lane.plain)));
          lockChips.push(null);
        } else if (lane.back === null) {
          chip(g, loop.home, size, 'ghostPlain', String(lane.plain));
          lockChips.push(chip(g, loop.lock, size, 'locked', String(lane.cipher)));
          homeChips.push(el('g', {}, g));
        } else {
          chip(g, loop.lock, size, 'ghostCipher', String(lane.cipher));
          lockChips.push(null);
          chip(g, loop.home, size, 'ghostPlain', String(lane.plain));
          homeChips.push(chip(g, loop.home, size, lane.back === lane.plain ? 'back' : 'wrong', String(lane.back)));
        }
      });

      // ── 캡션 — 지금 일어나는 일
      words(root, { x: PIECE_CANVAS_W / 2, y: geo.captionY }, captionOf(scene), {
        size: fontSizes.md,
        color: colors.text,
      });

      const overlay = el('g', {}, svg);
      return { geo, phiParts, keyParts, lowerArcs, ruleDown, lockChips, homeChips, upperF, lowerF, overlay };
    }

    function captionOf(scene: TrapdoorScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Plaintexts to lock: {list}', {
            list: scene.lanes.map((l) => String(l.plain)).join(' · '),
          });
        case 'phi': {
          if (scene.phi === null) throw new Error('trapdoor-with-key-stage: φ 걸음인데 φ 가 없다');
          return t('caption.phi', 'The hidden {p} and {q} give {phi} = {value}', {
            p: SYM.p,
            q: SYM.q,
            phi: SYM.phi,
            value: scene.phi,
          });
        }
        case 'key': {
          if (scene.key === null) throw new Error('trapdoor-with-key-stage: d 걸음인데 d 가 없다');
          return t('caption.key', 'From {e} and {phi}, the private exponent {d} = {value}', {
            e: SYM.e,
            phi: SYM.phi,
            d: SYM.d,
            value: scene.key.d,
          });
        }
        case 'lock': {
          const lane = scene.lanes[step.index];
          if (!lane || lane.cipher === null) throw new Error(`trapdoor-with-key-stage: 잠금 걸음 ${step.index} 에 잠긴 값이 없다`);
          return t('caption.lock', 'Lock with {sym} = {exp}: {m} → {c}', {
            sym: SYM.e,
            exp: scene.e,
            m: lane.plain,
            c: lane.cipher,
          });
        }
        case 'unlock': {
          const lane = scene.lanes[step.index];
          if (!lane || lane.cipher === null || lane.back === null || scene.key === null) {
            throw new Error(`trapdoor-with-key-stage: 풀기 걸음 ${step.index} 에 풀린 값이 없다`);
          }
          const home = scene.lanes.filter((l) => l.back !== null && l.back === l.plain).length;
          return t('caption.unlock', 'Unlock with {sym} = {exp}: {c} → {m}. Back in place: {k} / {total}', {
            sym: SYM.d,
            exp: scene.key.d,
            c: lane.cipher,
            m: lane.back,
            k: home,
            total: scene.lanes.length,
          });
        }
      }
    }

    /** 한 시계 — 끝나거나 거두면 풀린다. 거둬서 풀렸으면 false. */
    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = () => finish(false);
        waiters.add(wake);
        const start = performance.now();
        const tick = (now: number) => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish(false);
          const u = Math.min(1, Math.max(0, (now - start) / ms));
          frame(ease(u));
          if (u >= 1) return finish(true);
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function hide(nodes: (Element | null | undefined)[]): void {
      for (const n of nodes) n?.setAttribute('visibility', 'hidden');
    }

    function flyer(h: Handles, from: Pt, value: string): SVGGElement {
      return chip(h.overlay, from, { w: 40, h: 26 }, 'known', value);
    }

    function place(g: Element, at: Pt): void {
      g.setAttribute('transform', `translate(${r2(at.x)} ${r2(at.y)})`);
    }

    async function move(scene: TrapdoorScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      const geo = h.geo;
      switch (step.kind) {
        case 'start':
          return;
        case 'phi': {
          // 숨긴 p · q 의 값이 φ 칸으로 날아간다
          hide(h.phiParts);
          const to = centerOf(geo.phiChip);
          const a = centerOf(geo.pChip);
          const b = centerOf(geo.qChip);
          const fa = flyer(h, a, String(scene.p));
          const fb = flyer(h, b, String(scene.q));
          await tween(MOVE_MS, mine, (u) => {
            place(fa, { x: a.x + (to.x - a.x) * u, y: a.y + (to.y - a.y) * u - 18 * Math.sin(Math.PI * u) });
            place(fb, { x: b.x + (to.x - b.x) * u, y: b.y + (to.y - b.y) * u - 18 * Math.sin(Math.PI * u) });
          });
          return;
        }
        case 'key': {
          // e 와 φ 가 d 칸으로 날아가고, 돌아오는 호가 그어진다
          if (scene.phi === null) throw new Error('trapdoor-with-key-stage: d 걸음에 φ 가 없다');
          hide(h.keyParts);
          hide([h.ruleDown]);
          const to = centerOf(geo.dChip);
          const a = centerOf(geo.eChip);
          const b = centerOf(geo.phiChip);
          const fa = flyer(h, a, String(scene.e));
          const fb = flyer(h, b, String(scene.phi));
          for (const arc of h.lowerArcs) {
            arc.path.setAttribute('stroke-dasharray', `${r2(arc.len)} ${r2(arc.len)}`);
            arc.path.setAttribute('stroke-dashoffset', String(r2(arc.len)));
            arc.head.setAttribute('visibility', 'hidden');
          }
          await tween(MOVE_MS, mine, (u) => {
            place(fa, { x: a.x + (to.x - a.x) * u, y: a.y + (to.y - a.y) * u - 18 * Math.sin(Math.PI * u) });
            place(fb, { x: b.x + (to.x - b.x) * u, y: b.y + (to.y - b.y) * u - 18 * Math.sin(Math.PI * u) });
            for (const arc of h.lowerArcs) arc.path.setAttribute('stroke-dashoffset', String(r2(arc.len * (1 - u))));
          });
          return;
        }
        case 'lock':
        case 'unlock': {
          const lane = scene.lanes[step.index];
          const loop = geo.loops[step.index];
          if (!lane || !loop || lane.cipher === null) {
            throw new Error(`trapdoor-with-key-stage: ${step.kind} 걸음 ${step.index} 의 고리가 없다`);
          }
          const going = step.kind === 'lock';
          if (!going && lane.back === null) throw new Error(`trapdoor-with-key-stage: 풀기 걸음 ${step.index} 에 돌아온 값이 없다`);
          const target = going ? h.lockChips[step.index] : h.homeChips[step.index];
          if (!target) throw new Error(`trapdoor-with-key-stage: ${step.kind} 걸음 ${step.index} 의 도착 칩이 없다`);
          hide([target, going ? h.upperF[step.index] : h.lowerF[step.index]]);
          const [from, ctrl, to] = going ? [loop.home, loop.up, loop.lock] : [loop.lock, loop.down, loop.home];
          const before = going ? String(lane.plain) : String(lane.cipher);
          const after = going ? String(lane.cipher) : String(lane.back);
          const lookBefore: ChipLook = going ? 'plain' : 'locked';
          const lookAfter: ChipLook = going ? 'locked' : lane.back === lane.plain ? 'back' : 'wrong';
          let flipped = false;
          let moving = chip(h.overlay, from, geo.laneChip, lookBefore, before);
          await tween(MOVE_MS, mine, (u) => {
            if (!flipped && u >= 0.5) {
              flipped = true;
              moving.remove();
              moving = chip(h.overlay, from, geo.laneChip, lookAfter, after);
            }
            place(moving, onQuad(from, ctrl, to, u));
          });
          return;
        }
      }
    }

    return {
      async render(next: TrapdoorScene, _prev: TrapdoorScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        await move(next, handles, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
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
