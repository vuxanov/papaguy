import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { dressMaterial } from './stage-material';
import { fingers, type HandSide, type Motion } from './motion';
const color = new THREE.Color();
const amber = new THREE.Color(0xc18a48);
const umber = new THREE.Color(0x684136);

// The local X axis runs from shoulder to wingtip. The trailing edge is negative Y.
// The positive Z surface is the underside and follows the performer's palm.
function vane(length: number, width: number, dorsal: number, ventral: number, seed: number, asymmetry: number) {
  const steps = 24;
  const columns = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pointsPerFace = (steps + 1) * (columns + 1);
  for (const top of [true, false]) {
    const side = top ? 1 : -1;
    const offset = top ? 0 : pointsPerFace;
    const tint = new THREE.Color(top ? ventral : dorsal);
    for (let row = 0; row <= steps; row++) {
      const t = row / steps;
      const envelope = .003 + (.55 + .45 * t) * Math.sin(Math.PI * t ** 1.45) ** .52;
      for (let col = 0; col <= columns; col++) {
        const s = col / columns * 2 - 1;
        const edge = s * width * envelope * (1 + s * asymmetry);
        const barb = Math.cos(t * 137 + Math.abs(s) * 4.3 + seed);
        const camber = (1 - s * s) * width * .19 * envelope;
        positions.push(t * length, edge - t * t * width * .52,
          side * (.0006 + camber + barb * Math.abs(s) * .0005) - t * t * length * .077);
        const shaft = col === columns / 2 ? .13 * envelope : 0;
        color.copy(tint);
        if (top && asymmetry > .2) {
          color.lerp(amber, .36 * (1 - t) + .16 * (1 - Math.abs(s)));
          color.lerp(umber, THREE.MathUtils.smoothstep(t, .68, 1) * .51);
        }
        color.multiplyScalar(.82 + t * .13 + .08 * s + barb * .045 + shaft);
        colors.push(color.r, color.g, color.b);
        if (row === steps || col === columns) continue;
        const a = offset + row * (columns + 1) + col;
        const b = a + columns + 1;
        if (top) indices.push(a, b, a + 1, a + 1, b, b + 1);
        else indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  for (let row = 0; row < steps; row++) {
    const a = row * (columns + 1);
    const b = a + columns + 1;
    indices.push(a, a + pointsPerFace, b, b, a + pointsPerFace, b + pointsPerFace);
    indices.push(a + columns, b + columns, a + columns + pointsPerFace,
      b + columns, b + columns + pointsPerFace, a + columns + pointsPerFace);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const spreadBasis = new THREE.Matrix4();
const lengthAxis = new THREE.Vector3();
const cameraLength = new THREE.Vector3();
const chordAxis = new THREE.Vector3();
const surface = new THREE.Vector3();
const palm = new THREE.Vector3();
const towardCamera = new THREE.Vector3(0, 0, 1);
const dorsalNormal = new THREE.Vector3();
const twistAxis = new THREE.Vector3();
const upperArm = new THREE.Vector3();
const forearm = new THREE.Vector3();
const handDirection = new THREE.Vector3();
const localForearm = new THREE.Vector3();
const featherAim = new THREE.Vector3();
const featherUp = new THREE.Vector3();
const featherNormal = new THREE.Vector3();
const mountInverse = new THREE.Quaternion();
const featherOrientation = new THREE.Quaternion();
const featherBasis = new THREE.Matrix4();
const browClearance = new THREE.Vector3();

function signedRoll(from: THREE.Vector3, to: THREE.Vector3, axis: THREE.Vector3) {
  return Math.atan2(axis.dot(twistAxis.crossVectors(from, to)), from.dot(to));
}

// Two layered rows of coverts lie over the roots of the independently fanned remiges.
export function createWing(side: 1 | -1) {
  const hand: HandSide = side === 1 ? 'left' : 'right';
  const root = new THREE.Group();
  const attachment = new THREE.Group();
  const feathers = new THREE.Group();
  const trunk = new THREE.Bone();
  const elbow = new THREE.Bone();
  const joint = .258;
  const elbowBind = new THREE.Vector3(joint, -.014, 0);
  elbow.position.copy(elbowBind);
  feathers.scale.x = side;
  trunk.add(elbow);
  root.add(feathers);
  const revealed = { amount: 0, folded: false };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 });
  dressMaterial(material, revealed);
  const rows = 15;
  const strip = new THREE.BufferGeometry();
  const stripPoints = new THREE.BufferAttribute(new Float32Array(rows * 3 * 3), 3);
  stripPoints.setUsage(THREE.DynamicDrawUsage);
  strip.setAttribute('position', stripPoints);
  const stripColors: number[] = [];
  const stripIndices: number[] = [];
  const stripe = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      stripe.setHex(col === 1 ? 0x8b2829 : 0xa32d2a).multiplyScalar(.91 + .09 * Math.sin(row * 1.47));
      stripColors.push(stripe.r, stripe.g, stripe.b);
      if (row < rows - 1 && col < 2) stripIndices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
    }
  }
  strip.setAttribute('color', new THREE.Float32BufferAttribute(stripColors, 3));
  strip.setIndex(stripIndices);
  const liningMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, side: THREE.DoubleSide });
  dressMaterial(liningMaterial, revealed);
  const web = new THREE.Mesh(strip, liningMaterial);
  web.frustumCulled = false;
  attachment.add(web);
  const joiningFeathers = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: 3 }, (_, layer) => {
      const feather = new THREE.Mesh(vane(1, .022 + .004 * layer, 0xa32b29, 0x902629,
        row * 1.8 + layer * 2.3, .07), material);
      attachment.add(feather);
      return feather;
    }));
  const anchor = new THREE.Vector3();
  const link = new THREE.Vector3();
  const line = new THREE.Vector3();
  const linkUp = new THREE.Vector3();
  const linkNormal = new THREE.Vector3();
  const linkBasis = new THREE.Matrix4();
  const midpoint = new THREE.Vector3();

  const fixed: THREE.BufferGeometry[] = [];
  const moving: { feather: THREE.Mesh; mount: THREE.Group; base: THREE.Vector3; open: number; folded: number; finger?: number; covert?: boolean }[] = [];
  function cover(geometry: THREE.BufferGeometry, x: number, y: number, z: number) {
    fixed.push(geometry.translate(x, y, z));
  }

  function movingFeather(feather: THREE.Mesh, base: THREE.Vector3, open: number, folded: number,
    finger?: number, covert = false) {
    const mount = new THREE.Group();
    mount.add(feather);
    moving.push({ feather, mount, base, open, folded, finger, covert });
    feathers.add(mount);
  }

  function flight(x: number, y: number, length: number, width: number, angle: number, fan: number, seed: number, finger?: number) {
    const feather = new THREE.Mesh(vane(length, width, 0x284fa7, seed < 10 ? 0x98704a : 0xa05a3d, seed, .25), material);
    const base = new THREE.Vector3(x, y, -.006 + seed * .00072);
    const folded = angle * .62 + .035;
    movingFeather(feather, base, angle + fan, folded, finger);
  }

  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    flight(.067 + t * .23, -.064 + t * .009, .167 + t * .046,
      .025 + t * .005, -1.62 + t * .76, -.10 + t * .06, i);
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    flight(.264 + t * .12, -.073 + t * .052, .224 + Math.sin(t * Math.PI * .84) * .097,
      .031 - t * .009, -1.02 + t * .92, -.25 + t * .40, i + 10, i >= 5 ? 9 - i : undefined);
  }

  for (let row = 0; row < 4; row++) {
    const count = row === 3 ? 10 : 15;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = .006 + t * (.361 + row * .024);
      const y = .009 - row * .037 + .057 * Math.sin(t * Math.PI * .91) - .041 * t * t;
      const tilt = -1.05 + t * .78 + .08 * Math.sin(i * 2.6);
      const shade = [.96, 1, 1, .94][row] + .055 * Math.sin(i * 1.85 + row * .72);
      const top = new THREE.Color(row < 2 ? 0xb7312a : row === 2 ? 0xd2a83a : 0x335ba0).multiplyScalar(shade);
      const bottom = new THREE.Color(row < 2 ? 0x982c27 : row === 2 ? 0x8e8042 : 0xa16b45).multiplyScalar(shade);
      if (row === 3) {
        for (const face of [1, -1]) {
          const feather = new THREE.Mesh(vane(.132 + t * .026, .026 - t * .003,
            top.getHex(), bottom.getHex(), i * 2.6 + face, .11), material);
          const base = new THREE.Vector3(x, y - (face < 0 ? .006 : 0), face > 0 ? .013 : -.008);
          movingFeather(feather, base, tilt, tilt, undefined, true);
        }
      } else {
        cover(vane(.084 + row * .018 + t * .026, .027 - t * .003,
          top.getHex(), bottom.getHex(), i * 2.6 + row, .11).rotateZ(tilt), x, y, .025 - row * .004);
        cover(vane(.080 + row * .018 + t * .024, .026 - t * .003,
          top.getHex(), bottom.getHex(), i * 2.6 - row, .11).rotateZ(tilt - .045),
          x - .006, y - .008, -.014 + row * .002);
      }
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      cover(vane(.065 + t * .019, .017, 0x9d2426 + row * 0x030100, 0x8d2529,
        row * 3 + i, .07).rotateZ(-.46 - row * .22),
        -.063 + t * .142, .022 - row * .034, .025 - row * .007);
    }
  }
  const lining = new THREE.SphereGeometry(1, 30, 16);
  lining.deleteAttribute('uv');
  lining.scale(.280, .065, .008);
  lining.rotateZ(-.13);
  lining.translate(.213, -.037, 0);
  const liningColors = new Float32Array(lining.getAttribute('position').count * 3);
  color.setHex(0x88272a);
  for (let i = 0; i < liningColors.length; i += 3) color.toArray(liningColors, i);
  lining.setAttribute('color', new THREE.BufferAttribute(liningColors, 3));
  fixed.push(lining);

  const skin = mergeGeometries(fixed);
  fixed.forEach(geometry => geometry.dispose());
  const vertices = skin.getAttribute('position');
  const bones = new Uint16Array(vertices.count * 4);
  const weights = new Float32Array(vertices.count * 4);
  const elbowWeight = (x: number) => THREE.MathUtils.smoothstep(x, .135, .389);
  for (let i = 0; i < vertices.count; i++) {
    const weight = elbowWeight(vertices.getX(i));
    bones[i * 4 + 1] = 1;
    weights[i * 4] = 1 - weight;
    weights[i * 4 + 1] = weight;
  }
  skin.setAttribute('skinIndex', new THREE.BufferAttribute(bones, 4));
  skin.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  const wing = new THREE.SkinnedMesh(skin, material);
  wing.frustumCulled = false;
  wing.add(trunk);
  wing.bind(new THREE.Skeleton([trunk, elbow]));
  feathers.add(wing);
  const deformed = new THREE.Vector3();

  function join() {
    attachment.visible = root.visible;
    if (!root.visible) return;
    for (const [index, layers] of joiningFeathers.entries()) {
      const t = index / (rows - 1);
      anchor.set(side * (.057 + t * .012), .368 + t * .164, .281 + .023 * Math.sin(t * Math.PI));
      link.set(.025 + t * .131, -.182 + t * .116, .002 + t * .011)
        .multiply(feathers.scale).applyQuaternion(root.quaternion).add(root.position);
      line.copy(anchor).sub(link);
      const length = Math.max(.035, line.length());
      line.multiplyScalar(1 / length);
      linkNormal.set(0, .20, 1).addScaledVector(line, -line.dot(linkNormal)).normalize();
      linkUp.crossVectors(linkNormal, line).normalize();
      linkBasis.makeBasis(line, linkUp, linkNormal);

      midpoint.copy(link).lerp(anchor, .51).addScaledVector(linkNormal, -.018);
      stripPoints.setXYZ(index * 3, link.x, link.y, link.z);
      stripPoints.setXYZ(index * 3 + 1, midpoint.x, midpoint.y, midpoint.z);
      stripPoints.setXYZ(index * 3 + 2, anchor.x, anchor.y, anchor.z);

      for (const [layer, feather] of layers.entries()) {
        feather.position.copy(link).lerp(anchor, layer * .285)
          .addScaledVector(linkNormal, .006 + layer * .006)
          .addScaledVector(linkUp, layer * .009 - .005);
        feather.quaternion.setFromRotationMatrix(linkBasis);
        feather.rotateZ((layer ? .10 : -.03) + Math.sin(index * 1.3) * .07);
        feather.scale.set(length * .46 + .032, .87 + t * .19, .32);
      }
    }
    stripPoints.needsUpdate = true;
    strip.computeVertexNormals();
  }

  function pose(controls: Motion, inverseBody: THREE.Quaternion) {
    const lift = controls[hand];
    const reach = controls[`${hand}Reach`];
    const flex = controls[`${hand}Flex`];
    const fan = controls[`${hand}Fan`];
    const cross = controls[`${hand}Cross`];
    const nx = controls[`${hand}PalmX`], ny = controls[`${hand}PalmY`], nz = controls[`${hand}PalmZ`];
    const cover = controls[`${hand}Cover`];
    const acrossFace = cover;
    const elevation = THREE.MathUtils.lerp(Math.min(1.17, -1.43 + lift * 2.73), .57, cover);
    const ordinarySweep = THREE.MathUtils.clamp(reach * .84 + cross * .27, -.35, 1.02);
    const sweep = THREE.MathUtils.lerp(ordinarySweep, 2.19, cover);
    const hangingArm = THREE.MathUtils.smoothstep(-controls[`${hand}UpperY`], .53, .87);
    const liftOpen = THREE.MathUtils.smoothstep(lift, .155 + hangingArm * .10, .235 + hangingArm * .10);
    revealed.amount = Math.max(liftOpen, THREE.MathUtils.smoothstep(reach, .33, .57)
      * THREE.MathUtils.smoothstep(lift, .04, .22), acrossFace);
    root.visible = revealed.amount > 0;
    const extension = Math.cos(elevation);
    cameraLength.set(side * extension * Math.cos(sweep), Math.sin(elevation),
      extension * Math.sin(sweep)).normalize();
    upperArm.set(controls[`${hand}UpperX`], controls[`${hand}UpperY`], controls[`${hand}UpperZ`]);
    const upperConfidence = THREE.MathUtils.smoothstep(upperArm.length(), .22, .82);
    const alignment = Math.max(cover, acrossFace * .8, flex * .55) * upperConfidence;
    if (alignment > 0) {
      const measuredElevation = THREE.MathUtils.clamp(Math.atan2(upperArm.y, Math.hypot(upperArm.x, upperArm.z)), -1.35, 1.17);
      const measuredSweep = Math.atan2(upperArm.z, side * upperArm.x);
      const allowedSweep = THREE.MathUtils.lerp(THREE.MathUtils.clamp(measuredSweep, -.40, 1.12), measuredSweep, cover);
      const span = Math.cos(measuredElevation);
      upperArm.set(side * span * Math.cos(allowedSweep), Math.sin(measuredElevation), span * Math.sin(allowedSweep));
      cameraLength.lerp(upperArm, alignment).normalize();
    }
    lengthAxis.copy(cameraLength).multiplyScalar(side);
    const opened = Math.max(THREE.MathUtils.smoothstep(lift, .04, .43), cover);
    surface.set(-side * (1 - opened), 0, opened);
    surface.addScaledVector(lengthAxis, -surface.dot(lengthAxis));
    if (surface.lengthSq() < .0001) surface.set(0, 1, 0).addScaledVector(lengthAxis, -lengthAxis.y);
    surface.normalize();

    palm.set(nx, ny, nz);
    const strength = Math.min(1, palm.length());
    palm.addScaledVector(lengthAxis, -palm.dot(lengthAxis));
    let palmRoll = 0;
    if (palm.lengthSq() > .014) {
      palm.normalize();
      palmRoll = Math.atan2(lengthAxis.dot(twistAxis.crossVectors(surface, palm)), Math.max(.19, surface.dot(palm)))
        * Math.min(1, strength * (.42 + opened * .71));
      palmRoll = THREE.MathUtils.clamp(palmRoll, -.74, .74);
    }
    // During a cross-body sweep the dorsal side remains outside. Blend rotations
    // around the span instead of averaging opposed normals through zero.
    dorsalNormal.copy(towardCamera).negate().addScaledVector(lengthAxis, lengthAxis.z).normalize();
    let coverRoll = signedRoll(surface, dorsalNormal, lengthAxis);
    if (Math.abs(coverRoll) > 2.75 && Math.sign(coverRoll) === side) coverRoll -= side * Math.PI * 2;
    const crossing = THREE.MathUtils.smoothstep(acrossFace, .12, .66);
    surface.applyAxisAngle(lengthAxis, THREE.MathUtils.lerp(palmRoll, coverRoll, crossing));
    chordAxis.crossVectors(surface, lengthAxis).normalize();
    surface.crossVectors(lengthAxis, chordAxis).normalize();
    spreadBasis.makeBasis(lengthAxis, chordAxis, surface);
    root.quaternion.setFromRotationMatrix(spreadBasis).premultiply(inverseBody);
    const forwardFold = THREE.MathUtils.smoothstep(reach, .40, .95);
    feathers.scale.set(side * (.47 + opened * .53) * (1 - flex * .29),
      (.51 + opened * .49) * (1 - forwardFold * .37) * (1 + cover * .14), 1);
    const bend = flex * (1 - crossing * .78);
    const bendDepth = -bend * (.42 + Math.max(0, reach) * .74) + crossing * .13;
    const bendAcross = -bend * .61 - crossing * .19;
    forearm.set(controls[`${hand}ForeX`], controls[`${hand}ForeY`], controls[`${hand}ForeZ`]);
    handDirection.set(controls[`${hand}HandX`], controls[`${hand}HandY`], 0);
    const handConfidence = THREE.MathUtils.smoothstep(handDirection.length(), .27, .81);
    const foreConfidence = THREE.MathUtils.smoothstep(forearm.length(), .23, .81);
    if (handConfidence > 0) {
      handDirection.normalize();
      // The photographed hand provides the cleanest screen-space angle when depth jitters.
      forearm.lerp(handDirection, cover * handConfidence * .80);
    }
    const foreWeight = Math.max(cover, flex * .58, acrossFace * .72) * Math.max(foreConfidence, cover * handConfidence);
    let pitch = bendDepth;
    let swing = bendAcross;
    if (foreWeight > .01 && forearm.lengthSq() > .025) {
      localForearm.set(side * lengthAxis.dot(forearm) / Math.abs(feathers.scale.x),
        chordAxis.dot(forearm) / feathers.scale.y, surface.dot(forearm)).normalize();
      const desiredPitch = -Math.asin(THREE.MathUtils.clamp(localForearm.z, -.88, .88));
      const desiredSwing = Math.atan2(localForearm.y, localForearm.x);
      const coverBlend = THREE.MathUtils.smoothstep(cover, .35, .84);
      const safePitch = THREE.MathUtils.lerp(THREE.MathUtils.clamp(desiredPitch, -.47, .47), desiredPitch, coverBlend);
      const safeSwing = THREE.MathUtils.lerp(THREE.MathUtils.clamp(desiredSwing, -.79, .79), desiredSwing, coverBlend);
      pitch = THREE.MathUtils.lerp(bendDepth, safePitch, foreWeight);
      swing = THREE.MathUtils.lerp(bendAcross, safeSwing, foreWeight);
    }
    elbow.rotation.set(0, pitch, swing, 'ZYX');
    // Keep the arm angles while clearing the taller brow and protruding bill.
    browClearance.set(-side * .064, .107, .086);
    elbow.position.copy(elbowBind);
    elbow.position.x += cover * side * lengthAxis.dot(browClearance) / Math.abs(feathers.scale.x);
    elbow.position.y += cover * chordAxis.dot(browClearance) / feathers.scale.y;
    elbow.position.z += cover * surface.dot(browClearance);
    const splay = (.54 * opened + .26 * fan + Math.max(0, nz) * opened * .31)
      * (1 - flex * .66) * (1 - cover * .32);
    const unfurl = Math.min(1, splay);
    const shield = THREE.MathUtils.smoothstep(cover, .04, .43);
    for (const { feather, mount, base, open, folded, finger, covert } of moving) {
      const weight = elbowWeight(base.x);
      deformed.copy(base).sub(elbowBind).applyQuaternion(elbow.quaternion).add(elbow.position);
      mount.position.copy(base).lerp(deformed, weight);
      mount.quaternion.identity().slerp(elbow.quaternion, weight);
      const curl = finger === undefined ? 0 : controls[`${hand}${fingers[finger]}`];
      const fingerSpread = finger === undefined ? 0 : controls[`${hand}${fingers[finger]}Spread`];
      feather.rotation.z = THREE.MathUtils.lerp(folded, open, unfurl) + opened * (fingerSpread * .23 - curl * .20);
      feather.rotation.y = curl * opened * 1.05;
      feather.rotation.x = covert ? 0 : fan * .11 + curl * .08;
      if (shield > 0) {
        const inward = handConfidence > .3 && Math.abs(handDirection.x) > .35
          ? Math.sign(handDirection.x) : -side;
        const angle = (covert ? 1.53 : 1.38) - .68 * THREE.MathUtils.smoothstep(base.x, .07, .39);
        // Keep the visible vane dorsal, with the trailing tips hanging beneath the hand.
        featherAim.set(inward * Math.cos(angle), -Math.sin(angle), .03 + curl * .18);
        mountInverse.copy(mount.quaternion).invert();
        const screenX = featherAim.dot(lengthAxis) / feathers.scale.x;
        const screenY = featherAim.dot(chordAxis) / feathers.scale.y;
        const screenZ = featherAim.dot(surface);
        featherAim.set(screenX, screenY, screenZ).applyQuaternion(mountInverse).normalize();
        featherNormal.set(-lengthAxis.z * feathers.scale.x, -chordAxis.z * feathers.scale.y, -surface.z)
          .applyQuaternion(mountInverse);
        featherNormal.addScaledVector(featherAim, -featherAim.dot(featherNormal)).normalize();
        featherUp.crossVectors(featherNormal, featherAim).normalize();
        featherBasis.makeBasis(featherAim, featherUp, featherNormal);
        feather.quaternion.slerp(featherOrientation.setFromRotationMatrix(featherBasis), shield);
      }
    }
    join();
    return revealed.amount;
  }
  return { root, attachment, pose };
}
