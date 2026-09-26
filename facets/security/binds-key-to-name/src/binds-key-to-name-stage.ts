/**
 * binds-key-to-name 무대 — 한 장의 인증서와 그 아래 두 줄.
 *
 * 위: CA · 인증서 · 받는 쪽 (왼쪽 아래 칸은 열쇠를 바꿔 끼우는 쪽이 나타나는 자리).
 * 아래: CA 가 이은 줄, 받는 쪽이 다시 이은 줄. 두 줄은 같은 자리에서 시작해 토막이 위아래로 맞선다 —
 * 이름 토막은 그대로 겹치고, 바꿔 끼운 열쇠 토막만 다르다.
 *
 * 운동: 인증서의 이름 · 발급자 · 열쇠가 줄로 내려와 이어지고, 그 줄이 요약 칸 하나로 접혀 들어간다.
 * 요약은 CA 로 올라가 서명이 되어 인증서로 들어온다. 바꿔 끼우기에서는 두 열쇠가 엇갈려 자리를 바꾼다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { TBS_SEPARATOR } from './algorithm.js';
import type { BindsScene, CheckLine, SignedLine } from './scene.js';

const H = 400;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 8;
const GAP = 12;
const TOP_Y = 8;
const TOP_H = 172;
const CA_H = 92;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MD = parseFloat(fontSizes.md);
/** 고정폭 글자 한 칸의 폭 (글자 크기 × 0.6) */
const MONO_RATIO = 0.6;

const DIGEST_MS = 440;
const SIGN_MS = 420;
const VERIFY_MS = 560;
const SWAP_MS = 420;

type Pt = { x: number; y: number };

function hex4(v: number): string {
  return v.toString(16).padStart(4, '0');
}

function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/** 전체 시계 t(ms) 를 [t0, t1] 구간의 0..1 로 */
function phase(tMs: number, t0: number, t1: number): number {
  if (tMs <= t0) return 0;
  if (tMs >= t1) return 1;
  return (tMs - t0) / (t1 - t0);
}

export const bindsKeyToNameStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & {
    render(next: BindsScene, prev: BindsScene | null, opts: { animate: boolean }): Promise<void>;
  } {
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const W = PIECE_CANVAS_W;

    const sideW = Math.floor((W - 2 * PAD - 2 * GAP) * 0.24);
    const cardW = W - 2 * PAD - 2 * GAP - 2 * sideW;
    const xCA = PAD;
    const xCard = PAD + sideW + GAP;
    const xVer = xCard + cardW + GAP;
    const valueX = xCard + 88;
    const cardRowY = [TOP_Y + 52, TOP_Y + 82, TOP_Y + 112, TOP_Y + 144];
    const swapY = TOP_Y + CA_H + 10;
    const swapH = TOP_H - CA_H - 10;
    const rowTop = [TOP_Y + TOP_H + 34, TOP_Y + TOP_H + 96];
    const lineDy = 34;
    const captionTop = rowTop[1]! + 74;
    const monoSm = SM * MONO_RATIO;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: SVGElement,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round1(v) : v));
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: SVGElement,
      x: number,
      y: number,
      s: string,
      o: { size: number; mono?: boolean; fill: string; weight?: number; anchor?: 'start' | 'middle' | 'end' },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size,
        fill: o.fill,
        'text-anchor': o.anchor ?? 'start',
        'font-weight': o.weight ?? 400,
      });
      node.textContent = s;
      return node;
    }

    function keyText(n: number, e: number): string {
      return t('label.keyValue', '({n}, {e})', { n, e });
    }

    // ── 줄 배치 — 토막의 자리와 요약 칸의 자리 ──────────────────
    type LineGeo = { segX: number[]; sepX: number[]; tailX: number; box: { x: number; w: number }; tail: string };

    function lineGeo(segs: string[], h: number, digest: number, caN: number): LineGeo {
      const segX: number[] = [];
      const sepX: number[] = [];
      let x = PAD + 6;
      segs.forEach((s, i) => {
        if (i > 0) {
          sepX.push(x);
          x += monoSm;
        }
        segX.push(x);
        x += s.length * monoSm;
      });
      const tailX = x + monoSm;
      const tail = t('label.hashTail', '→ H {h} = {hd} → mod {n} →', { h: hex4(h), hd: h, n: caN });
      const boxX = tailX + tail.length * monoSm + monoSm;
      const boxW = Math.max(46, String(digest).length * monoSm + 18);
      if (boxX + boxW > W - PAD) throw new Error('binds-key-to-name 무대: 이은 줄이 캔버스 폭을 넘는다');
      return { segX, sepX, tailX, box: { x: boxX, w: boxW }, tail };
    }

    type LineHandles = { parts: SVGElement[]; box: SVGGElement; geo: LineGeo; baseY: number };

    function drawLine(
      layer: SVGGElement,
      row: 0 | 1,
      line: SignedLine | CheckLine,
      caN: number,
      same: boolean[] | null,
      match: boolean | null,
    ): LineHandles {
      const top = rowTop[row]!;
      const baseY = top + lineDy;
      const geo = lineGeo(line.segs, line.h, line.digest, caN);
      write(
        layer,
        PAD + 6,
        top + 12,
        row === 0 ? t('label.signedLine', 'Line CA joined and signed') : t('label.checkLine', 'Line the verifier joins again'),
        { size: XS, fill: colors.textMuted },
      );
      const parts: SVGElement[] = [];
      el(layer, 'rect', {
        x: PAD,
        y: baseY - 18,
        width: geo.box.x - PAD - 4,
        height: 26,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      line.segs.forEach((s, i) => {
        const differs = same !== null && same[i] === false;
        const node = write(layer, geo.segX[i]!, baseY, s, {
          size: SM,
          mono: true,
          fill: differs ? colors.danger : colors.text,
          weight: differs ? 700 : 400,
        });
        parts.push(node);
        if (differs) {
          parts.push(
            el(layer, 'line', {
              x1: geo.segX[i]!,
              x2: geo.segX[i]! + s.length * monoSm,
              y1: baseY + 4,
              y2: baseY + 4,
              stroke: colors.danger,
              'stroke-width': 2,
            }),
          );
        }
      });
      geo.sepX.forEach((x) => parts.push(write(layer, x, baseY, TBS_SEPARATOR, { size: SM, mono: true, fill: colors.textMuted })));
      parts.push(write(layer, geo.tailX, baseY, geo.tail, { size: SM, mono: true, fill: colors.textMuted }));

      const box = el(layer, 'g', {});
      const bad = match === false;
      el(box, 'rect', {
        x: geo.box.x,
        y: baseY - 18,
        width: geo.box.w,
        height: 26,
        rx: 5,
        fill: bad ? colors.bg : colors.accent,
        stroke: bad ? colors.danger : colors.accent,
        'stroke-width': bad ? 2 : 1,
      });
      write(box, geo.box.x + geo.box.w / 2, baseY, String(line.digest), {
        size: SM,
        mono: true,
        weight: 700,
        fill: bad ? colors.danger : colors.stateInk,
        anchor: 'middle',
      });
      return { parts, box, geo, baseY };
    }

    // ── 정적 그리기 — 장면 하나의 화면 전체 ──────────────────────
    type Handles = {
      card: { name: Pt; issuer: Pt; keyN: Pt; keyE: Pt; key: Pt; sig: Pt; sigEl: SVGElement | null; keyEl: SVGElement | null };
      caSecret: Pt;
      swapSlot: Pt;
      swapKeyEl: SVGElement | null;
      row: [LineHandles | null, LineHandles | null];
      verifier: { left: Pt; right: Pt; group: SVGGElement | null };
    };

    function drawStatic(scene: BindsScene): Handles | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const layer = el(svg, 'g', {});
      const certKey = scene.certKey;
      if (certKey === null) throw new Error('binds-key-to-name 무대: base 가 있는데 certKey 가 없다');

      // CA
      el(layer, 'rect', { x: xCA, y: TOP_Y, width: sideW, height: CA_H, rx: 6, fill: colors.bgSubtle, stroke: colors.border });
      write(layer, xCA + 10, TOP_Y + 18, t('label.ca', 'CA'), { size: MD, weight: 700, fill: colors.text });
      write(layer, xCA + 10, TOP_Y + 36, base.issuer, { size: XS, mono: true, fill: colors.text });
      write(layer, xCA + 10, TOP_Y + 54, t('label.caKey', 'n {n} · e {e}', { n: base.caN, e: base.caE }), {
        size: XS,
        mono: true,
        fill: colors.textMuted,
      });
      const secretY = TOP_Y + 76;
      if (scene.step.kind === 'sign') {
        el(layer, 'rect', { x: xCA + 5, y: secretY - 13, width: sideW - 10, height: 18, rx: 3, fill: colors.accent });
      }
      write(layer, xCA + 10, secretY, t('label.caSecret', 'd {d} — CA only', { d: base.caD }), {
        size: XS,
        mono: true,
        weight: 700,
        fill: scene.step.kind === 'sign' ? colors.stateInk : colors.text,
      });

      // 바꿔 끼우는 쪽 — 바꿔 끼운 뒤에만 선다
      const swapSlot: Pt = { x: xCA + 10, y: swapY + 50 };
      let swapKeyEl: SVGElement | null = null;
      if (scene.removed !== null) {
        el(layer, 'rect', {
          x: xCA,
          y: swapY,
          width: sideW,
          height: swapH,
          rx: 6,
          fill: colors.bg,
          stroke: colors.danger,
          'stroke-dasharray': '4 3',
        });
        write(layer, xCA + 10, swapY + 17, t('label.swapper', 'Key swapper'), { size: XS, weight: 700, fill: colors.danger });
        write(layer, xCA + 10, swapY + 33, t('label.removedKey', 'Key taken out'), { size: XS, fill: colors.textMuted });
        const g = el(layer, 'g', {});
        const s = keyText(scene.removed.n, scene.removed.e);
        write(g, swapSlot.x, swapSlot.y, s, { size: SM, mono: true, fill: colors.textMuted });
        el(g, 'line', {
          x1: swapSlot.x,
          x2: swapSlot.x + s.length * monoSm,
          y1: swapSlot.y - 4,
          y2: swapSlot.y - 4,
          stroke: colors.textMuted,
        });
        swapKeyEl = g;
      }

      // 인증서 — 한 장
      const signed = scene.sig !== null;
      el(layer, 'rect', {
        x: xCard,
        y: TOP_Y,
        width: cardW,
        height: TOP_H,
        rx: 8,
        fill: colors.bg,
        stroke: signed ? colors.text : colors.textMuted,
        'stroke-width': signed ? 2 : 1,
        ...(signed ? {} : { 'stroke-dasharray': '5 4' }),
      });
      write(layer, xCard + 12, TOP_Y + 22, t('label.cert', 'Certificate'), { size: MD, weight: 700, fill: colors.text });
      const rowLabels = [
        t('label.name', 'Name'),
        t('label.issuer', 'Issuer'),
        t('label.key', 'Key'),
        t('label.signature', 'Signature'),
      ];
      rowLabels.forEach((s, i) => write(layer, xCard + 12, cardRowY[i]!, s, { size: XS, fill: colors.textMuted }));
      write(layer, valueX, cardRowY[0]!, base.subject, { size: SM, mono: true, fill: colors.text });
      write(layer, valueX, cardRowY[1]!, base.issuer, { size: SM, mono: true, fill: colors.text });

      const swapped = scene.removed !== null;
      const keyStr = keyText(certKey.n, certKey.e);
      const keyG = el(layer, 'g', {});
      if (swapped) {
        el(keyG, 'rect', {
          x: valueX - 5,
          y: cardRowY[2]! - 16,
          width: keyStr.length * monoSm + 10,
          height: 22,
          rx: 4,
          fill: colors.bg,
          stroke: colors.danger,
          'stroke-width': 2,
        });
      }
      write(keyG, valueX, cardRowY[2]!, keyStr, {
        size: SM,
        mono: true,
        weight: swapped ? 700 : 400,
        fill: swapped ? colors.danger : colors.text,
      });

      let sigEl: SVGElement | null = null;
      const sigY = cardRowY[3]!;
      if (scene.sig !== null) {
        const g = el(layer, 'g', {});
        const s = String(scene.sig);
        el(g, 'rect', {
          x: valueX - 6,
          y: sigY - 16,
          width: s.length * monoSm + 12,
          height: 22,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        write(g, valueX, sigY, s, { size: SM, mono: true, weight: 700, fill: colors.text });
        sigEl = g;
      } else {
        write(layer, valueX, sigY, t('label.noSignature', 'none yet'), { size: XS, fill: colors.textMuted });
      }

      // 받는 쪽
      el(layer, 'rect', { x: xVer, y: TOP_Y, width: sideW, height: TOP_H, rx: 6, fill: colors.bgSubtle, stroke: colors.border });
      write(layer, xVer + 10, TOP_Y + 18, t('label.verifier', 'Verifier'), { size: MD, weight: 700, fill: colors.text });
      write(layer, xVer + 10, TOP_Y + 36, t('label.caPublic', 'CA key ({n}, {e})', { n: base.caN, e: base.caE }), {
        size: XS,
        mono: true,
        fill: colors.textMuted,
      });
      const boxW = Math.floor(sideW * 0.36);
      const left: Pt = { x: xVer + sideW * 0.24, y: TOP_Y + 104 };
      const right: Pt = { x: xVer + sideW * 0.76, y: TOP_Y + 104 };
      let verGroup: SVGGElement | null = null;
      const check = scene.check;
      if (check !== null) {
        const g = el(layer, 'g', {});
        verGroup = g;
        write(g, xVer + 10, TOP_Y + 58, t('label.unwrapExpr', '{s}^{e} mod {n}', { s: check.sig, e: base.caE, n: base.caN }), {
          size: XS,
          mono: true,
          fill: colors.text,
        });
        write(g, left.x, TOP_Y + 80, t('label.unwrapped', 'Unwrapped'), { size: XS, fill: colors.textMuted, anchor: 'middle' });
        write(g, right.x, TOP_Y + 80, t('label.digest', 'Digest'), { size: XS, fill: colors.textMuted, anchor: 'middle' });
        const bad = !check.match;
        const pairs: Array<[Pt, number, boolean]> = [
          [left, check.unwrapped, false],
          [right, check.digest, bad],
        ];
        for (const [pt, v, danger] of pairs) {
          el(g, 'rect', {
            x: pt.x - boxW / 2,
            y: pt.y - 17,
            width: boxW,
            height: 25,
            rx: 5,
            fill: danger ? colors.bg : colors.accent,
            stroke: danger ? colors.danger : colors.accent,
            'stroke-width': danger ? 2 : 1,
          });
          write(g, pt.x, pt.y, String(v), {
            size: SM,
            mono: true,
            weight: 700,
            fill: danger ? colors.danger : colors.stateInk,
            anchor: 'middle',
          });
        }
        write(g, (left.x + right.x) / 2, left.y, check.match ? '=' : '≠', {
          size: MD,
          weight: 700,
          fill: check.match ? colors.text : colors.danger,
          anchor: 'middle',
        });
        const vy = TOP_Y + 128;
        el(g, 'rect', {
          x: xVer + 10,
          y: vy,
          width: sideW - 20,
          height: 26,
          rx: 13,
          fill: check.match ? colors.accent : colors.danger,
        });
        write(g, xVer + sideW / 2, vy + 18, check.match ? t('label.match', 'Match') : t('label.mismatch', 'Mismatch'), {
          size: SM,
          weight: 700,
          fill: colors.stateInk,
          anchor: 'middle',
        });
      }

      // 아래 두 줄
      const row0 = scene.signed !== null ? drawLine(layer, 0, scene.signed, base.caN, null, null) : null;
      const row1 =
        check !== null ? drawLine(layer, 1, check, base.caN, check.same, check.match) : null;

      // 서명이 걸린 곳 — 인증서의 서명 칸에서 CA 가 이은 줄의 요약 칸으로
      if (row0 !== null && scene.sig !== null) {
        const sx = valueX + String(scene.sig).length * monoSm * 0.5;
        const bx = row0.geo.box.x + row0.geo.box.w / 2;
        const midY = TOP_Y + TOP_H + 14;
        el(layer, 'path', {
          d: `M ${round1(sx)} ${round1(sigY + 6)} L ${round1(sx)} ${round1(midY)} L ${round1(bx)} ${round1(midY)} L ${round1(bx)} ${round1(row0.baseY - 18)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-dasharray': '3 3',
        });
      }

      // 캡션
      drawCaption(layer, scene, base.caN);

      return {
        card: {
          name: { x: valueX, y: cardRowY[0]! },
          issuer: { x: valueX, y: cardRowY[1]! },
          keyN: { x: valueX + monoSm, y: cardRowY[2]! },
          keyE: { x: valueX + (String(certKey.n).length + 3) * monoSm, y: cardRowY[2]! },
          key: { x: valueX, y: cardRowY[2]! },
          sig: { x: valueX, y: sigY },
          sigEl,
          keyEl: keyG,
        },
        caSecret: { x: xCA + 10, y: secretY },
        swapSlot,
        swapKeyEl,
        row: [row0, row1],
        verifier: { left, right, group: verGroup },
      };
    }

    function captionText(scene: BindsScene, caN: number): string {
      const base = scene.base;
      const certKey = scene.certKey;
      if (base === null || certKey === null) throw new Error('binds-key-to-name 무대: 캡션을 쓸 바탕이 없다');
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Name {name}, key ({n}, {e}), issuer {issuer}. No signature yet.', {
            name: base.subject,
            n: certKey.n,
            e: certKey.e,
            issuer: base.issuer,
          });
        case 'digest': {
          if (scene.signed === null) throw new Error('binds-key-to-name 무대: digest 걸음인데 이은 줄이 없다');
          return t('caption.digest', 'CA joins name and key into one line and reduces it to one digest: {d}.', {
            d: scene.signed.digest,
          });
        }
        case 'sign': {
          if (scene.signed === null || scene.sig === null) throw new Error('binds-key-to-name 무대: sign 걸음인데 요약이나 서명이 없다');
          return t('caption.sign', 'CA signs that one digest: {d}^d mod {n} = {s}.', {
            d: scene.signed.digest,
            n: caN,
            s: scene.sig,
          });
        }
        case 'verify': {
          if (scene.check === null) throw new Error('binds-key-to-name 무대: verify 걸음인데 확인이 없다');
          return t('caption.verify', 'Verifier joins the line again: digest {d}. Unwraps the signature: {u}. {d} {rel} {u}.', {
            d: scene.check.digest,
            u: scene.check.unwrapped,
            rel: scene.check.match ? '=' : '≠',
          });
        }
        case 'swap':
          return t('caption.swap', 'Only the key is swapped: ({n1}, {e1}) → ({n2}, {e2}). Name, issuer and signature stay.', {
            n1: step.from.n,
            e1: step.from.e,
            n2: step.to.n,
            e2: step.to.e,
          });
      }
    }

    function wrap(s: string, maxW: number, size: number): string[] {
      const width = (w: string): number => {
        let sum = 0;
        for (const ch of w) sum += (ch.codePointAt(0) ?? 0) > 0x2e7f ? size : size * 0.56;
        return sum;
      };
      const words = s.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur === '' ? w : `${cur} ${w}`;
        if (cur !== '' && width(next) > maxW) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      if (cur !== '') lines.push(cur);
      return lines;
    }

    function drawCaption(layer: SVGGElement, scene: BindsScene, caN: number): void {
      const lines = wrap(captionText(scene, caN), W - 2 * PAD - 8, MD);
      if (lines.length > 3) throw new Error('binds-key-to-name 무대: 캡션이 세 줄을 넘는다');
      el(layer, 'line', { x1: PAD, x2: W - PAD, y1: captionTop - 8, y2: captionTop - 8, stroke: colors.border });
      lines.forEach((ln, i) => write(layer, PAD + 4, captionTop + 12 + i * 19, ln, { size: MD, fill: colors.text }));
    }

    // ── 운동 ───────────────────────────────────────────────
    function clock(ms: number, mine: number, frame: (tMs: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const tMs = Math.min(ms, performance.now() - start);
          frame(tMs);
          if (tMs >= ms) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    type Flyer = { node: SVGTextElement; from: Pt; to: Pt; t0: number; t1: number; fromSize: number; toSize: number; arc: number };

    function flyer(
      overlay: SVGGElement,
      s: string,
      from: Pt,
      to: Pt,
      t0: number,
      t1: number,
      o: { fill: string; weight?: number; toSize?: number; arc?: number },
    ): Flyer {
      const node = write(overlay, from.x, from.y, s, { size: SM, mono: true, fill: o.fill, weight: o.weight ?? 700 });
      node.setAttribute('opacity', '0');
      return { node, from, to, t0, t1, fromSize: SM, toSize: o.toSize ?? SM, arc: o.arc ?? 0 };
    }

    function moveFlyer(f: Flyer, tMs: number): void {
      if (tMs < f.t0 || tMs >= f.t1) {
        f.node.setAttribute('opacity', '0');
        return;
      }
      const k = ease(phase(tMs, f.t0, f.t1));
      const x = lerp(f.from.x, f.to.x, k);
      const y = lerp(f.from.y, f.to.y, k) - f.arc * Math.sin(Math.PI * k);
      f.node.setAttribute('opacity', '1');
      f.node.setAttribute('x', String(round1(x)));
      f.node.setAttribute('y', String(round1(y)));
      f.node.setAttribute('font-size', String(round1(lerp(f.fromSize, f.toSize, k))));
    }

    function hide(nodes: Array<SVGElement | null>): void {
      for (const n of nodes) {
        if (n === null) throw new Error('binds-key-to-name 무대: 운동이 가릴 요소를 못 찾았다');
        n.setAttribute('opacity', '0');
      }
    }

    function show(nodes: SVGElement[]): void {
      for (const n of nodes) n.removeAttribute('opacity');
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`binds-key-to-name 무대: 운동에 필요한 ${what} 가 없다`);
      return v;
    }

    /** 인증서의 네 값이 줄의 네 토막 자리로 내려오고(0..a), 줄 전체가 요약 칸으로 접혀 든다(a..b). */
    function joinFlyers(overlay: SVGGElement, h: Handles, line: LineHandles, segs: string[], a: number, b: number): Flyer[] {
      const src = [h.card.name, h.card.issuer, h.card.keyN, h.card.keyE];
      const out = segs.map((s, i) =>
        flyer(overlay, s, src[i]!, { x: line.geo.segX[i]!, y: line.baseY }, i * 30, a, { fill: colors.text }),
      );
      const whole = segs.join(TBS_SEPARATOR);
      const boxCenter = line.geo.box.x + line.geo.box.w / 2;
      out.push(
        flyer(
          overlay,
          whole,
          { x: line.geo.segX[0]!, y: line.baseY },
          { x: boxCenter - whole.length * monoSm * 0.12, y: line.baseY },
          a,
          b,
          { fill: colors.textMuted, weight: 400, toSize: SM * 0.2 },
        ),
      );
      return out;
    }

    async function animate(next: BindsScene, h: Handles, mine: number): Promise<void> {
      const overlay = el(svg, 'g', {});
      const step = next.step;
      let flyers: Flyer[] = [];
      let ms = 0;
      let reveal: Array<{ at: number; nodes: SVGElement[] }> = [];

      if (step.kind === 'digest') {
        const line = need(h.row[0], 'CA 가 이은 줄');
        const segs = need(next.signed, '이은 줄').segs;
        ms = DIGEST_MS;
        hide(line.parts);
        hide([line.box]);
        flyers = joinFlyers(overlay, h, line, segs, 260, ms);
        reveal = [
          { at: 260, nodes: line.parts },
          { at: ms, nodes: [line.box] },
        ];
      } else if (step.kind === 'sign') {
        const line = need(h.row[0], 'CA 가 이은 줄');
        const sigEl = need(h.card.sigEl, '서명 칸');
        const signed = need(next.signed, '이은 줄');
        ms = SIGN_MS;
        hide([sigEl]);
        const boxPt = { x: line.geo.box.x + 8, y: line.baseY };
        flyers = [
          flyer(overlay, String(signed.digest), boxPt, { x: h.caSecret.x + sideW * 0.55, y: h.caSecret.y }, 0, 200, {
            fill: colors.text,
          }),
          flyer(overlay, String(need(next.sig, '서명')), { x: h.caSecret.x + sideW * 0.55, y: h.caSecret.y }, h.card.sig, 200, ms, {
            fill: colors.text,
            arc: 16,
          }),
        ];
        reveal = [{ at: ms, nodes: [sigEl] }];
      } else if (step.kind === 'verify') {
        const line = need(h.row[1], '받는 쪽이 이은 줄');
        const group = need(h.verifier.group, '받는 쪽의 견줌');
        const check = need(next.check, '확인');
        ms = VERIFY_MS;
        hide(line.parts);
        hide([line.box, group]);
        flyers = joinFlyers(overlay, h, line, check.segs, 200, 330);
        const boxPt = { x: line.geo.box.x + 8, y: line.baseY };
        flyers.push(
          flyer(overlay, String(check.digest), boxPt, { x: h.verifier.right.x - 14, y: h.verifier.right.y }, 330, ms, {
            fill: check.match ? colors.text : colors.danger,
          }),
          flyer(overlay, String(check.sig), h.card.sig, { x: h.verifier.left.x - 14, y: h.verifier.left.y }, 330, 440, {
            fill: colors.text,
            arc: 14,
          }),
          flyer(
            overlay,
            String(check.unwrapped),
            { x: h.verifier.left.x - 14, y: h.verifier.left.y },
            { x: h.verifier.left.x - 14, y: h.verifier.left.y },
            440,
            ms,
            { fill: colors.text },
          ),
        );
        reveal = [
          { at: 200, nodes: line.parts },
          { at: 330, nodes: [line.box] },
          { at: ms, nodes: [group] },
        ];
      } else if (step.kind === 'swap') {
        const keyEl = need(h.card.keyEl, '인증서의 열쇠 칸');
        const swapKeyEl = need(h.swapKeyEl, '빼낸 열쇠 자리');
        ms = SWAP_MS;
        hide([keyEl, swapKeyEl]);
        flyers = [
          flyer(overlay, keyText(step.to.n, step.to.e), h.swapSlot, h.card.key, 0, ms, { fill: colors.danger, arc: 22 }),
          flyer(overlay, keyText(step.from.n, step.from.e), h.card.key, h.swapSlot, 0, ms, { fill: colors.textMuted, arc: -22 }),
        ];
        reveal = [{ at: ms, nodes: [keyEl, swapKeyEl] }];
      } else {
        overlay.remove();
        return;
      }

      await clock(ms, mine, (tMs) => {
        for (const f of flyers) moveFlyer(f, tMs);
        for (const r of reveal) if (tMs >= r.at) show(r.nodes);
      });
    }

    return {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || h === null) return;
        await animate(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
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
