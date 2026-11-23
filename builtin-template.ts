export interface MemeTemplateInput {
  readonly images: readonly File[];
  readonly texts: readonly string[];
  readonly args: Readonly<Record<string, unknown>>;
}

export interface MemeTemplateContext {
  readonly signal: AbortSignal;
  imageAsset(path: string): Promise<Buffer>;
  fontAsset(path: string): Promise<Buffer>;
}

export interface MemeTemplateShortcut {
  readonly key: string;
  readonly args?: readonly string[];
  readonly humanized?: string | null;
}

export interface MemeTemplate {
  readonly info: {
    readonly key: string;
    readonly keywords: readonly string[];
    readonly tags?: readonly string[];
    readonly shortcuts?: readonly MemeTemplateShortcut[];
    readonly params_type: {
      readonly min_images: number;
      readonly max_images: number;
      readonly min_texts: number;
      readonly max_texts: number;
      readonly default_texts?: readonly string[];
      readonly args_type?: unknown;
    };
  };
  render(input: MemeTemplateInput, context: MemeTemplateContext): Promise<Uint8Array>;
  preview?(context: MemeTemplateContext): Promise<Uint8Array>;
}
