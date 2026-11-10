import { fail } from "../http";
export function detectImage(b: Uint8Array) {
  const s = (a: number, n: number) => String.fromCharCode(...b.slice(a, a + n));
  if (
    b.length >= 24 &&
    b[0] === 137 &&
    s(1, 3) === "PNG" &&
    s(12, 4) === "IHDR"
  ) {
    for (let p = 8; p + 12 <= b.length;) {
      const len = new DataView(b.buffer, b.byteOffset + p, 4).getUint32(0);
      if (p + 12 + len > b.length) fail(400, "invalid_image", "图片数据不完整");
      if (s(p + 4, 4) === "acTL")
        fail(400, "invalid_image", "暂不支持动画图片");
      p += len + 12;
    }
    return { mime: "image/png", extensions: ["png"] };
  }
  if (b.length >= 12 && s(0, 4) === "RIFF" && s(8, 4) === "WEBP") {
    if (s(12, 4) === "VP8X" && b[20] & 2)
      fail(400, "invalid_image", "暂不支持动画图片");
    return { mime: "image/webp", extensions: ["webp"] };
  }
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { mime: "image/jpeg", extensions: ["jpg", "jpeg"] };
  return fail(400, "invalid_image", "请选择真实的JPEG、PNG或WebP图片");
}
