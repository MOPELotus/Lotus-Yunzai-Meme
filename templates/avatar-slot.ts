import type { CanvasRenderingContext2D, Image } from "skia-canvas";

export interface AvatarPlacement {
  readonly slot: readonly [left: number, top: number, width: number, height: number];
  readonly fit?: "contain" | "square";
  readonly whitePadding?: boolean;
  readonly replaceSlot?: boolean;
}

export function drawAvatar(draw: CanvasRenderingContext2D, image: Image, layout: AvatarPlacement, isStill: boolean) {
  const { slot: [left, top, width, height], fit, whitePadding, replaceSlot } = layout;
  draw.save();
  draw.beginPath();
  draw.rect(left, top, width, height);
  draw.clip();
  draw.imageSmoothingQuality = "high";
  if (replaceSlot) {
    if (isStill) {
      draw.fillStyle = "white";
      draw.fillRect(left, top, width, height);
    } else draw.clearRect(left, top, width, height);
  }
  if (fit === "square") {
    const square = Math.min(image.width, image.height);
    draw.drawImage(image, Math.floor((image.width - square) / 2), Math.floor((image.height - square) / 2), square, square,
      left, top, width, height);
  } else {
    const ratio = fit === "contain" ? Math.min(width / image.width, height / image.height) : Math.max(width / image.width, height / image.height);
    const scaledWidth = Math.max(fit === "contain" ? 1 : width, Math.trunc(image.width * ratio));
    const scaledHeight = Math.max(fit === "contain" ? 1 : height, Math.trunc(image.height * ratio));
    const x = left + Math.trunc((width - scaledWidth) / 2), y = top + Math.trunc((height - scaledHeight) / 2);
    if (whitePadding) {
      draw.fillStyle = "white";
      draw.fillRect(left, top, width, height);
      if (fit === "contain" && !isStill) draw.clearRect(x, y, scaledWidth, scaledHeight);
    }
    draw.drawImage(image, x, y, scaledWidth, scaledHeight);
  }
  draw.restore();
}
