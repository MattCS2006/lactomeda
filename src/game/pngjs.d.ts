// Minimal types for pngjs (no @types/pngjs installed); only what spritePalette.test.ts uses.
declare module 'pngjs' {
  export class PNG {
    width: number
    height: number
    /** RGBA, 4 bytes per pixel. */
    data: Uint8Array
    static sync: { read(buffer: Uint8Array): PNG }
  }
}
