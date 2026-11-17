import type { FaceLandmarker, HandLandmarker, Landmark, PoseLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import loaderSource from 'mediapipe-wasm-loader';
import wasmBytes from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm';
import poseModel from '../public/models/pose-full.task';
import handModel from '../public/models/hand.task';
import { channels, clamp, fingers, rest, type Motion } from './motion';
import faceModel from '../public/models/face.task';

type Channel = keyof Motion;
type Point = Pick<Landmark, 'x' | 'y' | 'z'>;
const visible = (point: Landmark) => point.visibility > .24;
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
});
const distance = (a: Point, b: Point, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

function kneeBend(hip: Point, knee: Point, ankle: Point) {
  const upper = [hip.x - knee.x, hip.y - knee.y, hip.z - knee.z];
  const lower = [ankle.x - knee.x, ankle.y - knee.y, ankle.z - knee.z];
  const dot = upper[0] * lower[0] + upper[1] * lower[1] + upper[2] * lower[2];
  const length = Math.hypot(...upper) * Math.hypot(...lower);
  return clamp((1 + dot / Math.max(.0001, length)) * 1.5);
}

export function createTracking(video: HTMLVideoElement, notify: (message: string) => void) {
  let stream: MediaStream | undefined;
  let detector: PoseLandmarker | undefined;
  let face: FaceLandmarker | undefined;
  let hands: HandLandmarker | undefined;
  let lastVideoTime = -1;
  let generation = 0;
  let nextPose = 0;
  let nextFace = 0;
  let nextHands = 0;
  let lastPose: Landmark[] | undefined;
  let poseSeen = -Infinity;
  let screenFace: { point: Point; span: number; time: number } | undefined;
  let faceWindow = { x: 0, y: 0, edge: 0 };
  const signals: Partial<Record<Channel, { value: number; time: number }>> = {};
  const faceCrop = document.createElement('canvas');
  faceCrop.width = faceCrop.height = 256;
  const cropContext = faceCrop.getContext('2d')!;
  const handCrop = document.createElement('canvas');
  handCrop.width = handCrop.height = 320;
  const handContext = handCrop.getContext('2d')!;

  function forget() {
    for (const channel of channels) delete signals[channel];
    lastPose = undefined;
    screenFace = undefined;
    poseSeen = -Infinity;
    lastVideoTime = -1;
    nextPose = nextFace = nextHands = 0;
  }

  function stop() {
    generation++;
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
    video.srcObject = null;
    detector?.close();
    face?.close();
    hands?.close();
    detector = undefined;
    face = undefined;
    hands = undefined;
    forget();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has not made camera access available.');
    const attempt = ++generation;
    let pendingPose: PoseLandmarker | undefined;
    let pendingFace: FaceLandmarker | undefined;
    let pendingHands: HandLandmarker | undefined;
    let pendingStream: MediaStream | undefined;
    try {
      pendingStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: false,
      });
      if (attempt !== generation) return false;
      stream = pendingStream;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (attempt !== generation) return;
        stop();
        notify('Camera disconnected. Start it again to reconnect.');
      });
      video.srcObject = stream;
      await video.play();
      if (attempt !== generation) return false;
      const sdk = await import('@mediapipe/tasks-vision');
      if (attempt !== generation) return false;
      const files = {
        wasmLoaderPath: URL.createObjectURL(new Blob([loaderSource], { type: 'text/javascript' })),
        wasmBinaryPath: URL.createObjectURL(new Blob([wasmBytes], { type: 'application/wasm' })),
      };
      try {
        pendingPose = await sdk.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetBuffer: poseModel, delegate: 'CPU' },
          runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: .4, minPosePresenceConfidence: .4, minTrackingConfidence: .4,
        });
        if (attempt !== generation) return false;
        pendingFace = await sdk.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetBuffer: faceModel, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
          minFaceDetectionConfidence: .4, minFacePresenceConfidence: .4, minTrackingConfidence: .4,
        });
        if (attempt !== generation) return false;
        pendingHands = await sdk.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetBuffer: handModel, delegate: 'CPU' },
          runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4,
        });
      } finally {
        URL.revokeObjectURL(files.wasmLoaderPath);
        URL.revokeObjectURL(files.wasmBinaryPath);
      }
      if (attempt !== generation) return false;
      detector = pendingPose;
      face = pendingFace;
      hands = pendingHands;
      pendingPose = pendingFace = pendingHands = undefined;
      pendingStream = undefined;
      forget();
      return true;
    } catch (error) {
      if (attempt !== generation) return false;
      stop();
      throw error;
    } finally {
      pendingStream?.getTracks().forEach(track => track.stop());
      pendingPose?.close();
      pendingFace?.close();
      pendingHands?.close();
    }
  }

  function write(channel: Channel, value: number, time: number) {
    if (Number.isFinite(value)) signals[channel] = { value, time };
  }

  function writeLimb(side: 'left' | 'right', segment: 'Upper' | 'Fore',
    from: Point, to: Point, depth: number, aspect: number, time: number) {
    const x = (to.x - from.x) * aspect;
    const y = from.y - to.y;
    const length = Math.max(.035, Math.hypot(x, y));
    const z = clamp(depth * 1.32, -.78, .78);
    const plane = Math.sqrt(1 - z * z);
    write(`${side}${segment}X`, x / length * plane, time);
    write(`${side}${segment}Y`, y / length * plane, time);
    write(`${side}${segment}Z`, z, time);
  }

  function updateBody(pose: Landmark[], world: Landmark[], aspect: number, time: number) {
    const left = pose[11];
    const right = pose[12];
    const shoulders = midpoint(left, right);
    const hips = midpoint(pose[23], pose[24]);
    const hipsVisible = visible(pose[23]) && visible(pose[24]);
    const span = Math.max(.085, distance(left, right, aspect));
    if (visible(left) && visible(right)) {
      write('x', clamp((.5 - shoulders.x) * aspect * .34, -.13, .13), time);
      const legsVisible = hipsVisible && [25, 26, 27, 28].every(index => visible(pose[index]));
      const crouch = legsVisible ? Math.min(
        kneeBend(world[23], world[25], world[27]),
        kneeBend(world[24], world[26], world[28]),
      ) : 0;
      write('y', clamp((.41 - shoulders.y) * .27 - crouch * .04, -.13, .1), time);
      const worldShoulders = midpoint(world[11], world[12]);
      const worldHips = midpoint(world[23], world[24]);
      const yaw = Math.atan2(world[12].z - world[11].z, world[11].x - world[12].x);
      const hipYaw = Math.atan2(world[24].z - world[23].z, world[23].x - world[24].x);
      write('yaw', clamp(-yaw * .85 - (hipsVisible ? hipYaw * .15 : 0), -1.1, 1.1), time);
      const shoulderRoll = Math.atan2(left.y - right.y, Math.max(.045, (left.x - right.x) * aspect));
      const lean = hipsVisible ? Math.atan2((hips.x - shoulders.x) * aspect, Math.max(.08, hips.y - shoulders.y)) : 0;
      write('roll', clamp(shoulderRoll * .72 - lean * .42, -.58, .58), time);
      if (hipsVisible) {
        const pitch = Math.atan2(worldHips.z - worldShoulders.z, Math.max(.12, worldHips.y - worldShoulders.y));
        write('pitch', clamp(pitch, -.48, .48), time);
      }
    }

    for (const [key, upper, middle, lower] of [['left', 11, 13, 15], ['right', 12, 14, 16]] as const) {
      const shoulder = pose[upper];
      const elbow = pose[middle];
      const wrist = pose[lower];
      if (!visible(shoulder) || (!visible(elbow) && !visible(wrist))) continue;
      const point = visible(wrist) ? wrist : elbow;
      if (visible(elbow)) {
        writeLimb(key, 'Upper', shoulder, elbow, world[upper].z - world[middle].z, aspect, time);
        if (visible(wrist)) writeLimb(key, 'Fore', elbow, wrist, world[middle].z - world[lower].z, aspect, time);
      }
      const armAngle = (p: Point) => Math.atan2(shoulder.y - p.y, Math.abs(p.x - shoulder.x) * aspect);
      const angle = visible(elbow) && visible(wrist) ? .42 * armAngle(elbow) + .58 * armAngle(wrist) : armAngle(point);
      write(key, clamp((angle + 1.23) / 2.55), time);
      const depth = world[upper].z - world[visible(wrist) ? lower : middle].z;
      write(`${key}Reach`, clamp((depth - .035) / .40, -.4, 1), time);
      const inward = (point.x - shoulder.x) * aspect * (key === 'left' ? -1 : 1);
      write(`${key}Cross`, clamp((inward / span - .03) / .67), time);
      const extension = visible(elbow) && visible(wrist)
        ? distance(shoulder, wrist, aspect) / Math.max(.015, distance(shoulder, elbow, aspect) + distance(elbow, wrist, aspect))
        : distance(shoulder, point, aspect) / span;
      write(key === 'left' ? 'leftFlex' : 'rightFlex', clamp((1 - extension) * 2.25), time);
    }
  }

  function faceInput(time: number) {
    if (!lastPose || time - poseSeen > 420 || !visible(lastPose[0])) return video;
    const nose = lastPose[0];
    const width = video.videoWidth;
    const height = video.videoHeight;
    const eyeSpan = distance(lastPose[2], lastPose[5], width / height) * height;
    if (eyeSpan >= 85) return video;
    const shoulderSpan = distance(lastPose[11], lastPose[12], width / height) * height;
    const edge = clamp(Math.max(eyeSpan * 5.3, shoulderSpan * .92), 100, Math.min(width, height));
    const x = clamp(nose.x * width - edge * .5, 0, width - edge);
    const y = clamp(nose.y * height - edge * .53, 0, height - edge);
    faceWindow = { x, y, edge };
    cropContext.drawImage(video, x, y, edge, edge, 0, 0, 256, 256);
    return faceCrop;
  }

  function updateFace(landmarks: Point[], blend: number, aspect: number, time: number) {
    const eye = midpoint(landmarks[33], landmarks[263]);
    const nose = landmarks[1];
    const mouth = midpoint(landmarks[13], landmarks[14]);
    const eyeSpan = Math.max(.001, distance(landmarks[33], landmarks[263], aspect));
    const aperture = distance(landmarks[13], landmarks[14], aspect)
      / Math.max(.001, distance(landmarks[61], landmarks[291], aspect));
    write('jaw', clamp(Math.max((blend - .035) * 1.7, (aperture - .045) * 2.5)), time);
    write('headYaw', clamp((eye.x - nose.x) * aspect / eyeSpan * 3.4, -.85, .85), time);
    const eyeToMouth = Math.max(.012, mouth.y - eye.y);
    write('headPitch', clamp(((nose.y - eye.y) / eyeToMouth - .54) * 1.8, -.46, .46), time);
    write('headRoll', clamp(Math.atan2(landmarks[263].y - landmarks[33].y,
      (landmarks[263].x - landmarks[33].x) * aspect), -.65, .65), time);
  }

  function foreheadCover(hand: Point[], forehead: Point, span: number, aspect: number) {
    const near = Math.min(...[0, 5, 9, 13, 17, 8, 12, 16].map(index => distance(hand[index], forehead, aspect)));
    const nearPalm = distance(midpoint(hand[0], hand[9]), forehead, aspect);
    return clamp((1.08 - near / span) / .62) * clamp((1.68 - nearPalm / span) / .63);
  }

  function updateHands(result: HandLandmarkerResult, aspect: number, time: number) {
    const claimed = new Set<string>();
    for (const [i, hand] of result.landmarks.entries()) {
      const wrist = hand[0];
      const pose = lastPose && time - poseSeen < 400 ? lastPose : undefined;
      const left = pose && visible(pose[15]) ? distance(wrist, pose[15], aspect) : Infinity;
      const right = pose && visible(pose[16]) ? distance(wrist, pose[16], aspect) : Infinity;
      const side = Math.min(left, right) < .19 ? (left < right ? 'left' : 'right')
        : result.handedness[i]?.[0]?.categoryName === 'Left' ? 'left' : 'right';
      if (claimed.has(side)) continue;
      claimed.add(side);
      const knuckles = midpoint(hand[5], hand[17]);
      const handX = (knuckles.x - wrist.x) * aspect;
      const handY = wrist.y - knuckles.y;
      const handSpan = Math.max(.018, Math.hypot(handX, handY));
      write(`${side}HandX`, handX / handSpan, time);
      write(`${side}HandY`, handY / handSpan, time);
      if (pose) {
        const elbowIndex = side === 'left' ? 13 : 14;
        if (visible(pose[elbowIndex])) {
          const depth = (signals[`${side}ForeZ`]?.value ?? 0) / 1.32;
          writeLimb(side, 'Fore', pose[elbowIndex], wrist, depth, aspect, time);
        }
      }
      const face = screenFace && time - screenFace.time < 900 ? screenFace : undefined;
      const direct = face ? foreheadCover(hand, face.point, face.span, aspect) : 0;
      let bentAcross = 0;
      if (pose) {
        const shoulders = distance(pose[11], pose[12], aspect);
        const shoulder = midpoint(pose[11], pose[12]);
        const inferred = { ...shoulder, y: shoulder.y - shoulders * .52 };
        const proximity = foreheadCover(hand, inferred, Math.max(.048, shoulders * .46), aspect);
        const bent = signals[`${side}Flex`]?.value ?? 0;
        const lift = signals[side]?.value ?? 0;
        bentAcross = clamp((lift - .46) / .24) * clamp((bent - .29) / .60) * proximity;
      }
      const cover = clamp(Math.max(direct, bentAcross) * 1.38);
      const previousCover = signals[`${side}Cover`];
      if (cover > .28 || !previousCover || time - previousCover.time > 265) write(`${side}Cover`, cover, time);
      const palm = Math.max(.006, distance(wrist, hand[9], aspect));
      const open = [8, 12, 16, 20].reduce((sum, tip) => sum + distance(wrist, hand[tip], aspect), 0) / (4 * palm);
      const fan = distance(hand[8], hand[20], aspect) / palm;
      write(side === 'left' ? 'leftFan' : 'rightFan', clamp((open - 1.2) * .85 + (fan - .3) * .35), time);

      // The wrist, index knuckle and pinky knuckle define the palm plane in camera space.
      const points = result.worldLandmarks[i];
      if (!points) continue;
      const index = points[5];
      const pinky = points[17];
      const base = points[0];
      const unit = (a: Point, b: Point) => {
        const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
        const length = Math.hypot(x, y, z) || 1;
        return { x: x / length, y: y / length, z: z / length };
      };
      const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z;
      const across = unit(pinky, index);
      const lengthwise = unit(base, points[9]);
      for (let finger = 0; finger < fingers.length; finger++) {
        const joint = 1 + finger * 4;
        const proximal = unit(points[joint], points[joint + 1]);
        const middle = unit(points[joint + 1], points[joint + 2]);
        const distal = unit(points[joint + 2], points[joint + 3]);
        const alignment = dot(proximal, middle) * .61 + dot(middle, distal) * .39;
        const curl = clamp((1 - alignment) * (finger === 0 ? 1.05 : 1.40));
        const gesture = unit(points[joint], points[joint + 3]);
        const angle = Math.atan2(dot(gesture, across), dot(gesture, lengthwise));
        write(`${side}${fingers[finger]}`, curl, time);
        write(`${side}${fingers[finger]}Spread`, clamp(angle / 1.4, -1, 1), time);
      }
      const ax = index.x - base.x, ay = index.y - base.y, az = index.z - base.z;
      const bx = pinky.x - base.x, by = pinky.y - base.y, bz = pinky.z - base.z;
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const area = Math.hypot(nx, ny, nz);
      if (area < .00008) continue;
      // Match the palm normal to the wing's screen-facing coordinates.
      const direction = (side === 'left' ? 1 : -1) / area;
      write(side === 'left' ? 'leftPalmX' : 'rightPalmX', -nx * direction, time);
      write(side === 'left' ? 'leftPalmY' : 'rightPalmY', ny * direction, time);
      write(side === 'left' ? 'leftPalmZ' : 'rightPalmZ', nz * direction, time);
    }
  }

  function retryHand(now: number, result: HandLandmarkerResult) {
    if (!hands || !lastPose || now - poseSeen > 320 || result.landmarks.length > 0) return result;
    const pose = lastPose;
    const wrists = [pose[15], pose[16]].filter(visible);
    if (!wrists.length) return result;
    wrists.sort((a, b) => a.y - b.y);
    const wrist = wrists[0];
    const width = video.videoWidth, height = video.videoHeight;
    const shoulders = distance(pose[11], pose[12], width / height) * height;
    const edge = clamp(shoulders * 1.08, 115, Math.min(width, height));
    const x = clamp(wrist.x * width - edge * .5, 0, width - edge);
    const y = clamp(wrist.y * height - edge * .5, 0, height - edge);
    handContext.drawImage(video, x, y, edge, edge, 0, 0, 320, 320);
    const found = hands.detectForVideo(handCrop, now + .01);
    for (const hand of found.landmarks) for (const point of hand) {
      point.x = (x + point.x * edge) / width;
      point.y = (y + point.y * edge) / height;
    }
    return found;
  }

  function sample(now: number) {
    if (!detector || !face || !hands || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    const next = Math.min(nextPose, nextFace, nextHands);
    if (now < next) return;
    lastVideoTime = video.currentTime;
    const aspect = video.videoWidth / video.videoHeight;
    if (next === nextPose) {
      const result = detector.detectForVideo(video, now);
      const time = performance.now();
      nextPose = now + 48;
      if (result.landmarks[0] && result.worldLandmarks[0]) {
        lastPose = result.landmarks[0];
        poseSeen = time;
        updateBody(lastPose, result.worldLandmarks[0], aspect, time);
      }
    } else if (next === nextFace) {
      const input = faceInput(now);
      let result = face.detectForVideo(input, now);
      let cropped = input !== video;
      if (!result.faceLandmarks[0] && input !== video) {
        result = face.detectForVideo(video, now + .01);
        cropped = false;
      }
      nextFace = now + 48;
      if (result.faceLandmarks[0]) {
        const shapes = result.faceBlendshapes[0]?.categories ?? [];
        const score = (name: string) => shapes.find(item => item.categoryName === name)?.score ?? 0;
        const time = performance.now();
        const landmarks = result.faceLandmarks[0];
        const toFrame = (point: Point) => !cropped ? point : {
          x: (faceWindow.x + point.x * faceWindow.edge) / video.videoWidth,
          y: (faceWindow.y + point.y * faceWindow.edge) / video.videoHeight, z: point.z,
        };
        const brow = midpoint(toFrame(landmarks[33]), toFrame(landmarks[263]));
        const span = Math.max(.043, distance(toFrame(landmarks[234]), toFrame(landmarks[454]), aspect));
        screenFace = { point: { ...brow, y: brow.y - span * .14 }, span, time };
        updateFace(landmarks, score('jawOpen'), cropped ? 1 : aspect, time);
        write('blinkLeft', clamp((score('eyeBlinkLeft') - .24) * 1.55), time);
        write('blinkRight', clamp((score('eyeBlinkRight') - .24) * 1.55), time);
      }
    } else {
      const result = hands.detectForVideo(video, now);
      nextHands = now + 63;
      updateHands(retryHand(now, result), aspect, performance.now());
    }
  }

  function motion() {
    const result = { ...rest };
    const now = performance.now();
    for (const key of channels) {
      const signal = signals[key];
      if (signal && now - signal.time < (key.endsWith('Cover') ? 780 : key === 'jaw' ? 350 : 490)) result[key] = signal.value;
    }
    return result;
  }

  return { start, stop, forget, sample, motion };
}
