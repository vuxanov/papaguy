# Papaguy technical architecture

Draft for review · November 17, 2026 · [Product requirements](PRD.md)

## Engine and tracking

| Option | Fit for Papaguy |
| --- | --- |
| **Three.js + MediaPipe Tasks Vision** | Recommended. Use vanilla TypeScript, esbuild and browser APIs. Three.js renders the rigged GLB in WebGL 2 and MediaPipe runs locally on the camera feed. The build embeds the application and assets into a single HTML file. [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer) · [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) |
| **Godot 4** | Viable if an editor-driven pipeline or native stage build becomes a priority. Its web export uses WebAssembly and WebGL 2 Compatibility rendering. Prototype the browser tracking bridge and mobile performance before committing. [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) |
| **Unreal Engine** | Consider for a dedicated native show rig if high-end rendering becomes a priority. Epic's Pixel Streaming serves an Unreal application from a separate host over WebRTC. For a browser-controlled show this adds host setup, camera tracking integration and a network path to validate at the venue. [Epic Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine) |

Use MediaPipe Pose Landmarker Full for body position, shoulder and hip orientation, and arm motion. Face Landmarker uses lip separation and the jaw blendshape to drive the beak, while eye, nose and mouth landmarks drive head rotation. Hand Landmarker resolves hand shape, with pose wrists used to associate a hand with its wing. [Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web) · [Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) · [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web)

## Runtime

The page requests the camera at launch. Three inference tasks alternate on new video frames. The face tracker uses a closer crop when the pose model finds a small face. Motion inputs are smoothed separately and decay to rest when their landmarks are lost. The stage interpolates the chest, head, beak and wings in Three.js. Show mode hides the interface.

esbuild bundles the character, camera models, WASM and the app into `dist/Papaguy.html`. Camera frames are processed locally. The macaw GLB uses articulated wings, a head joint and a beak pivot. The initial pose looks toward the camera.
