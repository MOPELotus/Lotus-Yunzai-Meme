import type { CanvasRenderingContext2D as Context } from "skia-canvas";

export interface MemeInfoCard {
  readonly infoCardColors: {
    readonly gold: string;
    readonly tile: string;
    readonly muted: string;
  };
  drawInfoText(ctx: Context, rows: readonly string[], x: number, y: number, options: {
    readonly size: number;
    readonly leading?: number;
    readonly color?: string;
    readonly align?: Context["textAlign"];
  }): void;
  measureInfoText(ctx: Context, value: string, maxWidth: number, size: number): string[];
  renderInfoCard(header: { readonly title: string; readonly metadata?: string; readonly width?: number },
    buildBody: (layout: { readonly x: number; readonly y: number; readonly width: number; readonly measure: Context }) =>
      { readonly height: number; draw(ctx: Context): void },
    options?: { readonly scale?: number; readonly allowHalfScale?: boolean }): Promise<{ readonly png: Uint8Array }>;
}

export type LoadMemeInfoCard = () => Promise<MemeInfoCard>;
