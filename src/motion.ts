export const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
export type HandSide = 'left' | 'right';

export const rest = {
  left: 0, right: 0, leftReach: 0, rightReach: 0, leftFlex: 0, rightFlex: 0,
  leftUpperX: 0, leftUpperY: 0, leftUpperZ: 0, rightUpperX: 0, rightUpperY: 0, rightUpperZ: 0,
  leftForeX: 0, leftForeY: 0, leftForeZ: 0, rightForeX: 0, rightForeY: 0, rightForeZ: 0,
  leftHandX: 0, leftHandY: 0, rightHandX: 0, rightHandY: 0,
  leftCross: 0, rightCross: 0, leftCover: 0, rightCover: 0,
  leftFan: 0, rightFan: 0, leftPalmX: 0, leftPalmY: 0, leftPalmZ: 0,
  rightPalmX: 0, rightPalmY: 0, rightPalmZ: 0,
  leftThumb: 0, leftIndex: 0, leftMiddle: 0, leftRing: 0, leftPinky: 0,
  rightThumb: 0, rightIndex: 0, rightMiddle: 0, rightRing: 0, rightPinky: 0,
  leftThumbSpread: 0, leftIndexSpread: 0, leftMiddleSpread: 0, leftRingSpread: 0, leftPinkySpread: 0,
  rightThumbSpread: 0, rightIndexSpread: 0, rightMiddleSpread: 0, rightRingSpread: 0, rightPinkySpread: 0,
  jaw: 0, blinkLeft: 0, blinkRight: 0, x: 0, y: 0,
  yaw: 0, roll: 0, pitch: 0, headYaw: 0, headPitch: 0, headRoll: 0,
};
export type Motion = typeof rest;
export const channels = Object.keys(rest) as (keyof Motion)[];
export const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));
