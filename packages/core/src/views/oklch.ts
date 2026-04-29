/**
 * OKLCH → sRGB hex 단방향 변환.
 *
 * Björn Ottosson OKLAB (2020) 기반. 의존성 없음.
 * gamut 초과 시 채널별 단순 클램프 — vivid/deep/pastel 톤 범위 안에서는
 * 거의 발생하지 않는다.
 *
 * 참고: https://bottosson.github.io/posts/oklab/
 */

export type OklchInput = {
  /** Lightness 0..1 */
  l: number;
  /** Chroma 0..0.4 정도 */
  c: number;
  /** Hue 0..360 (도) */
  h: number;
};

/** OKLCH 좌표 한 점을 sRGB hex 문자열 (#rrggbb) 로 변환한다. */
export function oklchToHex({ l, c, h }: OklchInput): string {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;

  const rLin = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bLin = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return rgbToHex(linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin));
}

function linearToSrgb(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function toByte(v: number): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return n.toString(16).padStart(2, '0');
}

/** sRGB hex 문자열 (#rgb / #rrggbb) 을 OKLCH 좌표로 변환. */
export function hexToOklch(hex: string): OklchInput {
  const { r, g, b } = parseHex(hex);
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const lLin = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const mLin = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const sLin = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const lCbrt = Math.cbrt(lLin);
  const mCbrt = Math.cbrt(mLin);
  const sCbrt = Math.cbrt(sLin);

  const L = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const a = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const bAxis = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;

  const c = Math.sqrt(a * a + bAxis * bAxis);
  let h = (Math.atan2(bAxis, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let s = hex.startsWith('#') ? hex.slice(1) : hex;
  if (s.length === 3) {
    s = s
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * hex 색의 OKLCH lightness 에 deltaL 을 더해 새 hex 반환.
 * 양수면 밝게, 음수면 어둡게. lightness 는 0..1 로 클램프.
 */
export function shiftLightness(hex: string, deltaL: number): string {
  const oklch = hexToOklch(hex);
  const l = Math.max(0, Math.min(1, oklch.l + deltaL));
  return oklchToHex({ l, c: oklch.c, h: oklch.h });
}
