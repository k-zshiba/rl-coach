declare module "*.replay" {
  const content: string;
  export default content;
}

declare module "*.wasm" {
  const content: string;
  export default content;
}

declare module "*?module" {
  const content: WebAssembly.Module;
  export default content;
}

declare module "*crate/pkg/rl_wasm" {
  export class Replay {
    header_json(pretty: boolean): string;
    full_json(pretty: boolean): Uint8Array;
    network_err(): string | null | undefined;
  }

  export interface InitOutput {
    readonly memory: WebAssembly.Memory;
  }

  export function parse(data: Uint8Array): Replay;

  export default function init(input?: unknown): Promise<InitOutput>;
}
