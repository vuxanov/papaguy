declare module '*.task' { const bytes: Uint8Array; export default bytes; }
declare module '*.wasm' { const bytes: Uint8Array<ArrayBuffer>; export default bytes; }
declare module '*.glb' { const bytes: Uint8Array<ArrayBuffer>; export default bytes; }
declare module 'mediapipe-wasm-loader' { const source: string; export default source; }
declare module '*.css';
