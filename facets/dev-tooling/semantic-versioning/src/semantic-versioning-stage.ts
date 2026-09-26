/**
 * semantic-versioning 무대.
 *
 * 위 — 세 칸 버전 글자. 오르는 자리 위로 `+1` 표지가 옮겨 가고, 그 칸이 들리며,
 *      오른쪽 칸의 수는 0 으로 떨어진다.
 * 가운데 — 차례 간격 수직선. 범위 띠(아래 끝 닫힘 · 위 끝 열림)의 위 끝이 오므라들고 펴진다.
 *      새 버전 점이 앞 판의 자리에서 이번 자리로 날아가 앉고, 잠금 핀이 깔린 자리에 박힌다.
 * 아래 — 설치 표식이 새 점으로 건너가거나 제자리에 남는다. 캡션 한 줄.
 *
 * 무대는 셈하지 않는다 — 눈금 · 두 끝 · 판정 · 깔린 것은 payload 로 받는다.
 */
import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const W = 720;
const H = 320;
const NS = 'http://www.w3.org/2000/svg';

const LINE_Y = 214;
const AXIS_X0 = 120;
const AXIS_X1 = 620;
const DOT_Y = 184;
const BOX_W = 60;
const BOX_H = 56;
const BOX_TOP = 72;
const BOX_GAP = 90;
const LIFT = 12;
const MARKER_Y = 258;
const PIN_Y = 176;

export type RoundView = {
  packageName: string;
  installed: string;
  installedTick: number;
  range: string;
  locked: boolean;
  lockLine: string | null;
  digits: number[];
};
export type BumpView = {
  change: string;
  digit: number;
  to: number[];
  tick: number;
  zeroed: number[];
};
export type RangeView = { range: string; lower: string; upper: string; lowerTick: number; upperTick: number };
export type LockView = { line: string; tick: number };
export type CompareView = { version: string; verdict: 'inside' | 'above' | 'below' };
export type InstallView = {
  accepted: boolean;
  from: string;
  to: string;
  fromTick: number;
  toTick: number;
  reason: 'accept' | 'reject' | 'lock';
};

/** projector 가 부르는 무대의 표면 */
export type SemanticVersioningStage = ViewInstance & {
  setAxis(ticks: string[]): void;
  startRound(r: RoundView, ms: number): void;
  bump(b: BumpView, ms: number): void;
  showRange(r: RangeView, ms: number): void;
  readLock(l: LockView, ms: number): void;
  compare(c: CompareView, ms: number): void;
  install(i: InstallView, ms: number): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const semanticVersioningStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const root = el('g', {}, svg);

    // ── 움직임 — 같은 이름의 움직임은 앞 것을 끊는다
    const frames = new Map<string, number>();
    const tween = (key: string, ms: number, apply: (k: number) => void) => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        apply(1);
        return;
      }
      const t0 = performance.now();
      const frame = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        apply(ease(k));
        if (k < 1) frames.set(key, requestAnimationFrame(frame));
        else frames.delete(key);
      };
      apply(0);
      frames.set(key, requestAnimationFrame(frame));
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    // ── 머리 줄
    const pkgText = el('text', { x: 24, y: 30, 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text }, root);
    const recvRole = el('text', { x: W - 24, y: 24, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, root);
    const recvText = el('text', { x: W - 24, y: 42, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, root);
    const lockBox = el('g', { opacity: 0 }, root);
    const lockRect = el('rect', { x: W - 184, y: 50, width: 160, height: 36, rx: 4, fill: c.bg, stroke: c.border }, lockBox);
    const lockRole = el('text', { x: W - 176, y: 64, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, lockBox);
    const lockText = el('text', { x: W - 176, y: 80, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, lockBox);

    // ── 세 칸 버전 글자
    const centerX = W / 2 - 40;
    const boxX = (i: number) => centerX + (i - 1) * BOX_GAP;
    const roleText = el('text', { x: boxX(0) - BOX_W / 2 - 16, y: BOX_TOP + BOX_H / 2 + 5, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, root);
    type Digit = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; name: SVGTextElement; lift: number; drop: number };
    const digits: Digit[] = [];
    for (let i = 0; i < 3; i++) {
      const g = el('g', {}, root);
      const rect = el('rect', { x: boxX(i) - BOX_W / 2, y: BOX_TOP, width: BOX_W, height: BOX_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 }, g);
      const text = el('text', { x: boxX(i), y: BOX_TOP + BOX_H / 2 + 9, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700, fill: c.text }, g);
      const name = el('text', { x: boxX(i), y: BOX_TOP + BOX_H + 20, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, root);
      if (i < 2) el('text', { x: boxX(i) + BOX_GAP / 2, y: BOX_TOP + BOX_H / 2 + 9, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: c.textMuted }, root).textContent = '.';
      digits.push({ g, rect, text, name, lift: 0, drop: 0 });
    }
    const digitAt = (i: number): Digit => {
      const d = digits[i];
      if (!d) throw new Error(`semantic-versioning-stage: 버전 자리 ${i} 가 없다`);
      return d;
    };
    digitAt(0).name.textContent = t('label.digit.major', 'major');
    digitAt(1).name.textContent = t('label.digit.minor', 'minor');
    digitAt(2).name.textContent = t('label.digit.patch', 'patch');
    const setDigitPose = (d: Digit) => {
      d.rect.setAttribute('y', String(BOX_TOP - d.lift));
      d.text.setAttribute('y', String(BOX_TOP + BOX_H / 2 + 9 - d.lift - d.drop));
    };

    // `+1` 표지 — 오르는 자리 위로 옮겨 간다
    const caret = el('g', { opacity: 0 }, root);
    const caretText = el('text', { x: 0, y: BOX_TOP - LIFT - 8, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, caret);
    caretText.textContent = '+1';
    let caretX = boxX(2);

    // ── 수직선
    const axis = el('g', {}, root);
    el('line', { x1: AXIS_X0 - 30, y1: LINE_Y, x2: AXIS_X1 + 30, y2: LINE_Y, stroke: c.border, 'stroke-width': 1.5 }, axis);
    const tickLayer = el('g', {}, axis);
    let ticks: string[] = [];
    const tickX = (i: number) => {
      if (ticks.length === 0) throw new Error('semantic-versioning-stage: 눈금이 서기 전에 자리를 물었다');
      if (i < 0 || i >= ticks.length) throw new Error(`semantic-versioning-stage: 눈금 ${i} 가 없다`);
      return ticks.length === 1 ? (AXIS_X0 + AXIS_X1) / 2 : AXIS_X0 + (i * (AXIS_X1 - AXIS_X0)) / (ticks.length - 1);
    };

    // 범위 띠
    const band = el('g', { opacity: 0 }, root);
    const bandRect = el('rect', { x: 0, y: LINE_Y - 9, width: 0, height: 18, rx: 3, fill: c.primary, 'fill-opacity': 0.14, stroke: c.primary, 'stroke-width': 1.5 }, band);
    const bandLo = el('circle', { cx: 0, cy: LINE_Y, r: 6, fill: c.primary, stroke: c.primary, 'stroke-width': 2 }, band);
    const bandHi = el('circle', { cx: 0, cy: LINE_Y, r: 6, fill: c.bg, stroke: c.primary, 'stroke-width': 2 }, band);
    let loX = 0;
    let hiX = 0;
    let bandShown = false;
    const drawBand = () => {
      bandRect.setAttribute('x', String(loX));
      bandRect.setAttribute('width', String(Math.max(0, hiX - loX)));
      bandLo.setAttribute('cx', String(loX));
      bandHi.setAttribute('cx', String(hiX));
    };
    const bandGhost = (ghost: boolean) => {
      bandRect.setAttribute('fill-opacity', ghost ? '0' : '0.14');
      bandRect.setAttribute('stroke', ghost ? c.textMuted : c.primary);
      bandRect.setAttribute('stroke-dasharray', ghost ? '4 4' : 'none');
      bandLo.setAttribute('opacity', ghost ? '0' : '1');
      bandHi.setAttribute('opacity', ghost ? '0' : '1');
    };

    // 잠금 핀
    const pin = el('g', { opacity: 0 }, root);
    el('line', { x1: 0, y1: 0, x2: 0, y2: LINE_Y - PIN_Y, stroke: c.text, 'stroke-width': 2 }, pin);
    el('circle', { cx: 0, cy: 0, r: 8, fill: c.danger, stroke: c.stateInk, 'stroke-width': 1 }, pin);
    let pinX = 0;
    let pinY = PIN_Y - 70;
    const drawPin = () => pin.setAttribute('transform', `translate(${pinX} ${pinY})`);

    // 새 버전 점
    const dot = el('g', { opacity: 0 }, root);
    const dotGuide = el('line', { x1: 0, y1: 10, x2: 0, y2: LINE_Y - DOT_Y, stroke: c.textMuted, 'stroke-dasharray': '3 3' }, dot);
    const dotRing = el('circle', { cx: 0, cy: 0, r: 15, fill: 'none', stroke: c.primary, 'stroke-width': 3, opacity: 0 }, dot);
    const dotBody = el('circle', { cx: 0, cy: 0, r: 9, fill: c.itemComparing, stroke: c.itemComparing, 'stroke-width': 1.5 }, dot);
    const dotStrike = el('line', { x1: -13, y1: -13, x2: 13, y2: 13, stroke: c.danger, 'stroke-width': 3, opacity: 0 }, dot);
    let dotX = 0;
    let dotLift = 0;
    let dotShown = false;
    const drawDot = () => dot.setAttribute('transform', `translate(${dotX} ${DOT_Y - dotLift})`);
    const dotGhost = (ghost: boolean) => {
      dotBody.setAttribute('fill', ghost ? 'none' : c.itemComparing);
      dotBody.setAttribute('stroke', ghost ? c.textMuted : c.itemComparing);
      dotBody.setAttribute('stroke-dasharray', ghost ? '3 3' : 'none');
      dotGuide.setAttribute('opacity', ghost ? '0' : '1');
    };

    // 설치 표식
    const marker = el('g', { opacity: 0 }, root);
    const markerTri = el('path', { d: `M 0 ${-12} L 9 4 L -9 4 Z`, fill: c.bg, stroke: c.text, 'stroke-width': 2 }, marker);
    const markerText = el('text', { x: 0, y: 22, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.text }, marker);
    let markerX = 0;
    let markerLift = 0;
    let markerShown = false;
    const drawMarker = () => marker.setAttribute('transform', `translate(${markerX} ${MARKER_Y - markerLift})`);

    // 캡션
    const caption = el('text', { x: W / 2, y: H - 12, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, root);

    const changeName = (id: string): string => {
      switch (id) {
        case 'fix':
          return t('label.change.fix', 'Fix');
        case 'feature':
          return t('label.change.feature', 'New feature');
        case 'breaking':
          return t('label.change.breaking', 'Breaking change');
        default:
          throw new Error(`semantic-versioning-stage: 모르는 바뀜 — '${id}'`);
      }
    };
    const digitName = (i: number): string => {
      if (i === 0) return t('label.digit.major', 'major');
      if (i === 1) return t('label.digit.minor', 'minor');
      if (i === 2) return t('label.digit.patch', 'patch');
      throw new Error(`semantic-versioning-stage: 모르는 자리 — ${i}`);
    };
    const verdictName = (v: CompareView['verdict']): string => {
      switch (v) {
        case 'inside':
          return t('label.verdict.inside', 'inside');
        case 'above':
          return t('label.verdict.above', 'above the range');
        case 'below':
          return t('label.verdict.below', 'below the range');
        default:
          throw new Error(`semantic-versioning-stage: 모르는 판정 — '${String(v)}'`);
      }
    };

    const instance: SemanticVersioningStage = {
      setAxis(list) {
        if (list.length === 0) throw new Error('semantic-versioning-stage: 눈금이 비었다');
        ticks = [...list];
        while (tickLayer.firstChild) tickLayer.removeChild(tickLayer.firstChild);
        ticks.forEach((label, i) => {
          const x = tickX(i);
          el('line', { x1: x, y1: LINE_Y - 5, x2: x, y2: LINE_Y + 5, stroke: c.textMuted, 'stroke-width': 1.5 }, tickLayer);
          el('text', { x, y: LINE_Y + 24, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, tickLayer).textContent = label;
        });
      },

      startRound(r, ms) {
        pkgText.textContent = r.packageName;
        recvRole.textContent = t('label.role.receiver', 'Receiver');
        recvText.textContent = r.range;
        lockBox.setAttribute('opacity', r.locked ? '1' : '0');
        lockRect.setAttribute('stroke', c.border);
        lockRect.setAttribute('stroke-width', '1');
        lockRole.textContent = t('label.role.lockFile', 'Lock file');
        if (r.locked) {
          if (r.lockLine === null) throw new Error('semantic-versioning-stage: 잠금 칸인데 잠금 줄이 없다');
          lockText.textContent = r.lockLine;
        } else {
          lockText.textContent = '';
        }

        // 버전 글자는 깔린 것으로
        roleText.textContent = t('label.role.installed', 'Installed');
        if (r.digits.length !== 3) throw new Error('semantic-versioning-stage: 깔린 버전이 세 수가 아니다');
        r.digits.forEach((value, i) => {
          const d = digitAt(i);
          d.text.textContent = String(value);
          d.rect.setAttribute('fill', c.bg);
          d.rect.setAttribute('stroke', c.border);
          d.rect.setAttribute('stroke-dasharray', 'none');
          d.text.setAttribute('fill', c.text);
          const lift0 = d.lift;
          const drop0 = d.drop;
          tween(`digit${i}`, ms, (k) => {
            d.lift = lerp(lift0, 0, k);
            d.drop = lerp(drop0, 0, k);
            setDigitPose(d);
          });
        });
        caret.setAttribute('opacity', '0');

        // 앞 판의 결론을 걷는다 — 자리(점 · 띠의 틀)는 남긴다
        if (dotShown) {
          dotGhost(true);
          dotRing.setAttribute('opacity', '0');
          dotStrike.setAttribute('opacity', '0');
        }
        if (bandShown) {
          bandGhost(true);
          band.setAttribute('opacity', '1');
        }
        pin.setAttribute('opacity', '0');
        pinY = PIN_Y - 70;
        drawPin();

        // 설치 표식은 깔린 자리로
        const home = tickX(r.installedTick);
        markerText.textContent = t('label.role.installed', 'Installed');
        markerTri.setAttribute('fill', c.bg);
        if (!markerShown) {
          markerX = home;
          markerShown = true;
          marker.setAttribute('opacity', '1');
          drawMarker();
        } else {
          const x0 = markerX;
          tween('marker', ms, (k) => {
            markerX = lerp(x0, home, k);
            markerLift = Math.sin(Math.PI * k) * (x0 === home ? 0 : 18);
            drawMarker();
          });
        }

        caption.textContent = t('caption.head', 'Waiting for a new release');
      },

      bump(b, ms) {
        if (b.to.length !== 3) throw new Error('semantic-versioning-stage: 새 버전이 세 수가 아니다');
        roleText.textContent = t('label.role.new', 'New version');
        const target = boxX(b.digit);
        const from = caretX;
        caret.setAttribute('opacity', '1');
        tween('caret', ms, (k) => {
          caretX = lerp(from, target, k);
          caretText.setAttribute('x', String(caretX));
        });
        b.to.forEach((value, i) => {
          const d = digitAt(i);
          if (i === b.digit) {
            d.text.textContent = String(value);
            d.rect.setAttribute('fill', c.accent);
            d.rect.setAttribute('stroke', c.accent);
            d.text.setAttribute('fill', c.stateInk);
            tween(`digit${i}`, ms, (k) => {
              d.lift = lerp(0, LIFT, k);
              setDigitPose(d);
            });
          } else if (b.zeroed.includes(i)) {
            d.text.textContent = String(value);
            d.rect.setAttribute('stroke', c.textMuted);
            d.rect.setAttribute('stroke-dasharray', '4 3');
            tween(`digit${i}`, ms, (k) => {
              d.drop = lerp(26, 0, k);
              setDigitPose(d);
            });
          } else {
            d.text.textContent = String(value);
          }
        });

        // 새 버전 점 — 앞 판의 자리에서 날아가 앉는다
        const x1 = tickX(b.tick);
        dotGhost(false);
        dotRing.setAttribute('opacity', '0');
        dotStrike.setAttribute('opacity', '0');
        if (!dotShown) {
          dotShown = true;
          dotX = x1;
          dot.setAttribute('opacity', '1');
          tween('dot', ms, (k) => {
            dotLift = lerp(60, 0, k);
            drawDot();
          });
        } else {
          const x0 = dotX;
          tween('dot', ms, (k) => {
            dotX = lerp(x0, x1, k);
            dotLift = Math.sin(Math.PI * k) * 46;
            drawDot();
          });
        }

        // 0 으로 떨어진 자리는 payload 의 zeroed 로 말한다 — 없으면(고침) 그 말을 하지 않는다
        if (b.zeroed.length === 0) {
          caption.textContent = t('caption.bump', '{change}: {digit} +1', {
            change: changeName(b.change),
            digit: digitName(b.digit),
          });
        } else {
          caption.textContent = t('caption.bumpZeroed', '{change}: {digit} +1 · dropped to 0: {zeroed}', {
            change: changeName(b.change),
            digit: digitName(b.digit),
            zeroed: b.zeroed.map(digitName).join(', '),
          });
        }
      },

      showRange(r, ms) {
        const lo = tickX(r.lowerTick);
        const hi = tickX(r.upperTick);
        bandGhost(false);
        band.setAttribute('opacity', '1');
        const lo0 = bandShown ? loX : lo;
        const hi0 = bandShown ? hiX : lo;
        bandShown = true;
        tween('band', ms, (k) => {
          loX = lerp(lo0, lo, k);
          hiX = lerp(hi0, hi, k);
          drawBand();
        });
        caption.textContent = t('caption.range', '{range} → [{lower}, {upper})', {
          range: r.range,
          lower: r.lower,
          upper: r.upper,
        });
      },

      readLock(l, ms) {
        lockRect.setAttribute('stroke', c.danger);
        lockRect.setAttribute('stroke-width', '2');
        if (bandShown) {
          const o0 = 1;
          tween('bandFade', ms, (k) => band.setAttribute('opacity', String(lerp(o0, 0.25, k))));
        }
        pinX = tickX(l.tick);
        pin.setAttribute('opacity', '1');
        tween('pin', ms, (k) => {
          pinY = lerp(PIN_Y - 70, PIN_Y, k);
          drawPin();
        });
        caption.textContent = t('caption.readLock', 'Lock file read first: {line}', { line: l.line });
      },

      compare(v, ms) {
        const inside = v.verdict === 'inside';
        dotRing.setAttribute('stroke', inside ? c.primary : c.danger);
        dotRing.setAttribute('stroke-dasharray', inside ? 'none' : '5 4');
        tween('ring', ms, (k) => {
          dotRing.setAttribute('opacity', String(k));
          dotRing.setAttribute('r', String(lerp(26, 15, k)));
        });
        caption.textContent = t('caption.compare', '{version} — {verdict}', {
          version: v.version,
          verdict: verdictName(v.verdict),
        });
      },

      install(i, ms) {
        const x1 = tickX(i.toTick);
        if (i.accepted) {
          const x0 = markerX;
          markerTri.setAttribute('fill', c.primary);
          tween('marker', ms, (k) => {
            markerX = lerp(x0, x1, k);
            markerLift = Math.sin(Math.PI * k) * 26;
            drawMarker();
          });
          caption.textContent = t('caption.accept', 'Installed moves: {from} → {to}', { from: i.from, to: i.to });
          return;
        }
        // 제자리 — 표식이 한 번 들썩이고 그 자리에 남는다
        tween('marker', ms, (k) => {
          markerLift = Math.sin(Math.PI * k) * 8;
          drawMarker();
        });
        if (i.reason === 'reject') {
          tween('strike', ms, (k) => dotStrike.setAttribute('opacity', String(k)));
          caption.textContent = t('caption.reject', 'Installed stays: {version}', { version: i.to });
        } else if (i.reason === 'lock') {
          caption.textContent = t('caption.keepLock', 'Installed stays at the locked version: {version}', { version: i.to });
        } else {
          throw new Error(`semantic-versioning-stage: 받지 않았는데 까닭이 '${i.reason}'`);
        }
      },

      destroy() {
        for (const id of frames.values()) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };
    return instance;
  },
};
