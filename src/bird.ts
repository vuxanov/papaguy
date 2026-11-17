import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import macaw from '../public/character/macaw.glb';

import type { Motion } from './motion';
import { createWing } from './wing';
import { createExpression, oval } from './face';
import { dressMaterial } from './stage-material';

const smooth = THREE.MathUtils.smoothstep;
const cropHeight = .29;
const neckReduction = .084;
const neckBase = .485;
const neckTop = .700;
function shortenNeck(y: number) {
  return y - neckReduction * smooth(y, neckBase, neckTop);
}

function lowerMandible() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rings = 18, sides = 24;
  const tint = new THREE.Color();
  for (let row = 0; row <= rings; row++) {
    const t = row / rings;
    const shape = .02 + .98 * Math.sin(Math.PI * t ** .62) ** .6;
    for (let col = 0; col <= sides; col++) {
      const angle = col / sides * Math.PI * 2;
      const y = Math.sin(angle);
      positions.push(Math.cos(angle) * .021 * shape,
        -.014 - t * .010 + y * shape * (y > 0 ? .009 : .020), .004 + .049 * t);
      tint.setHex(y > .28 ? 0x743d46 : 0x302c2e).multiplyScalar(.88 + t * .3);
      colors.push(tint.r, tint.g, tint.b);
      if (row < rings && col < sides) {
        const a = row * (sides + 1) + col;
        const b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .59 }));
}

async function makeMacaw() {
  const { scene } = await new GLTFLoader().parseAsync(macaw.buffer, '');
  const source = scene.getObjectByName('parrot') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const geometry = source.geometry;
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');

  const texture = source.material.map!.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(texture, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  const body = new THREE.Group();
  const left = createWing(1);
  const right = createWing(-1);
  const jaw = new THREE.Group();
  const upperBill = new THREE.Group();
  const trunk = new THREE.Bone();
  const head = new THREE.Bone();
  const headCenter = new THREE.Vector3(.017, .638, .322);
  const faceYaw = -1.51;
  const vertical = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normals = geometry.getAttribute('normal');
  head.position.copy(headCenter);
  head.position.y = shortenNeck(head.position.y);
  head.rotation.order = 'YXZ';
  trunk.add(head);
  body.add(left.root, right.root, left.attachment, right.attachment);
  head.add(jaw, upperBill);
  jaw.add(lowerMandible());

  function straighten(vertex: THREE.Vector3, fraction: number, isNormal = false) {
    if (!isNormal) vertex.sub(headCenter);
    vertex.applyAxisAngle(vertical, faceYaw * fraction).applyAxisAngle(forward, .085 * fraction);
    if (!isNormal) {
      vertex.add(headCenter);
      vertex.x += .012 * fraction;
    }
    return vertex;
  }

  const jawOrigin = straighten(new THREE.Vector3(.068, .716, .343), 1);
  const upperOrigin = straighten(new THREE.Vector3(.092, .759, .345), 1);
  jawOrigin.y = shortenNeck(jawOrigin.y);
  upperOrigin.y = shortenNeck(upperOrigin.y);
  jaw.position.copy(jawOrigin).sub(head.position);
  upperBill.position.copy(upperOrigin).sub(head.position);
  const faceInterior = new THREE.Group();
  faceInterior.position.y = headCenter.y - neckReduction - head.position.y;
  head.add(faceInterior);
  const express = createExpression(faceInterior, jaw);
  const backing = oval(body, 0x811e23, [-.011, .450, .243], [.086, .156, .060], .9);
  dressMaterial(backing.material);
  oval(head, 0x861f22, [-.009, -.017, -.039], [.061, .069, .049], .93);

  // Remove the folded wings from the scan and assign both bills to their own pivots.
  const parts = new Uint8Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const texelX = Math.min(canvas.width - 1, Math.max(0, Math.floor(uv.getX(i) * canvas.width)));
    const texelY = Math.min(canvas.height - 1, Math.max(0, Math.floor(uv.getY(i) * canvas.height)));
    const pixel = (texelY * canvas.width + texelX) * 4;
    const [red, green, blue] = [pixels[pixel], pixels[pixel + 1], pixels[pixel + 2]];
    const dark = 1 - smooth(Math.max(red, green, blue), 62, 95);
    const onJaw = smooth(x, .058, .077) * (1 - smooth(x, .113, .129)) *
      smooth(y, .651, .681) * (1 - smooth(y, .721, .744)) *
      smooth(z, .294, .319) * (1 - smooth(z, .369, .394)) * dark;
    const upperRoot = .099 + smooth(y, .725, .775) * .023;
    const upper = x > upperRoot && y > .649 && y < .782 && z > .291 && z < .399
      && (x > .132 || green / Math.max(1, red) > .53);
    const wingColor = (blue > red * 1.04 || green > red * .45) && Math.abs(x) > .037;
    const flank = Math.abs(x + .005) > (.091 + smooth(z, .25, .38) * .015);
    const oldWing = y < .572 && (wingColor || (flank && z < .377));
    parts[i] = onJaw > .33 ? 1 : upper ? 2 : oldWing ? (x > 0 ? 3 : 4) : 0;

    const flankFalloff = smooth(Math.abs(x), .058, .116) * (1 - smooth(y, .576, .659));
    const blend = upper || onJaw > .33 ? 1 : oldWing ? 0 : smooth(y, .557, .686) * (1 - flankFalloff * .86);
    if (blend > 0) {
      straighten(point.set(x, y, z), blend);
      straighten(normal.fromBufferAttribute(normals, i), blend, true);
      const baseOfNeck = smooth(y, .51, .59) * (1 - smooth(y, .646, .714));
      point.x -= Math.sign(point.x) * Math.max(0, Math.abs(point.x) - .069) * baseOfNeck * .65;
      positions.setXYZ(i, point.x, point.y, point.z);
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    if (y < .646) {
      const outer = smooth(Math.abs(x), .057, .104);
      const shoulder = outer * smooth(y, .476, .58) * (1 - smooth(y, .596, .646));
      const side = Math.abs(positions.getX(i));
      const slope = .557 - .122 * smooth(side, .047, .166);
      const relief = Math.max(0, positions.getY(i) - slope);
      const ridge = smooth(side, .051, .109) * (1 - smooth(y, .599, .646));
      positions.setY(i, positions.getY(i) - shoulder * .045 - relief * ridge * .66);
      positions.setX(i, positions.getX(i) - Math.sign(x) * (shoulder * .017 + ridge * .008));
    }
  }

  const triangles: number[][] = [[], [], [], [], []];
  const reflected: number[] = [];
  const index = geometry.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const part = parts[a] === parts[b] || parts[a] === parts[c] ? parts[a] : parts[b];
    if (part === 1 || Math.max(positions.getY(a), positions.getY(b), positions.getY(c)) < cropHeight) continue;
    const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
    const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
    if (part === 0 && y > .561 && y < .691) {
      const seam = .012 + .067 * (1 - smooth(y, .566, .608) * (1 - smooth(y, .653, .689)));
      if (x > seam) continue;
      if (x < -seam + .004) reflected.push(a, c, b);
    }
    triangles[part].push(a, b, c);
  }

  source.material.metalness = 0;
  source.material.roughness = .82;
  const eyes = { left: 0, right: 0 };
  dressMaterial(source.material, { eyes });
  const folded: THREE.Mesh[] = [];
  const foldedMaterial = source.material.clone();
  dressMaterial(foldedMaterial, { folded: true });

  const mirrored = new Map<number, number>();
  for (const vertex of reflected) {
    if (!mirrored.has(vertex)) mirrored.set(vertex, positions.count + mirrored.size);
    triangles[0].push(mirrored.get(vertex)!);
  }
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const data = new Float32Array((attribute.count + mirrored.size) * attribute.itemSize);
    data.set(attribute.array);
    for (const [from, to] of mirrored) {
      const src = from * attribute.itemSize, dst = to * attribute.itemSize;
      for (let axis = 0; axis < attribute.itemSize; axis++) data[dst + axis] = attribute.array[src + axis];
      if (name === 'normal' || name === 'position') data[dst] *= -1;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize, attribute.normalized));
  }
  const fitted = geometry.getAttribute('position');
  const fittedNormals = geometry.getAttribute('normal');
  const joints = new Uint16Array(fitted.count * 4);
  const weights = new Float32Array(fitted.count * 4);
  for (let i = 0; i < fitted.count; i++) {
    const y = fitted.getY(i);
    const blend = smooth(y, .564, .691);
    fitted.setY(i, shortenNeck(y));
    const t = THREE.MathUtils.clamp((y - neckBase) / (neckTop - neckBase), 0, 1);
    const compression = 1 - neckReduction * 6 * t * (1 - t) / (neckTop - neckBase);
    normal.fromBufferAttribute(fittedNormals, i);
    normal.y /= compression;
    normal.normalize();
    fittedNormals.setXYZ(i, normal.x, normal.y, normal.z);
    joints[i * 4 + 1] = 1;
    weights[i * 4] = 1 - blend;
    weights[i * 4 + 1] = blend;
  }
  for (const [index, pivot] of [[0, body], [2, upperBill], [3, body], [4, body]] as const) {
    const part = new THREE.BufferGeometry();
    for (const [key, attribute] of Object.entries(geometry.attributes)) part.setAttribute(key, attribute);
    part.setIndex(triangles[index]);
    if (index === 0) {
      part.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4));
      part.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
      const mesh = new THREE.SkinnedMesh(part, source.material);
      mesh.frustumCulled = false;
      mesh.add(trunk);
      mesh.bind(new THREE.Skeleton([trunk, head]));
      body.add(mesh);
    } else if (index === 2) {
      const mesh = new THREE.Mesh(part, source.material);
      mesh.position.copy(upperOrigin).negate();
      pivot.add(mesh);
    } else {
      const foldedWing = new THREE.Mesh(part, foldedMaterial);
      folded[index - 3] = foldedWing;
      pivot.add(foldedWing);
    }
  }
  const bird = new THREE.Group();
  bird.add(body);
  body.position.set(0, -.56, -.27);
  return { bird, left, right, head, jaw, upperBill, folded, express, eyes };
}

export async function createBird(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, .058, 3);
  camera.lookAt(0, .058, 0);
  scene.add(new THREE.HemisphereLight(0xfff5ee, 0x525871, 1.6));
  for (const [color, intensity, x, y, z] of [
    [0xffeee4, 2.1, 2, 4, 5], [0xb8c7ff, 1.65, -3, 2, -4],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }

  const { bird, left, right, head, jaw, upperBill, folded, express, eyes } = await makeMacaw();
  scene.add(bird);

  let aspect = 1;

  function frameBird(spread: number) {
    const halfHeight = Math.max(.40 + spread * .1, (.54 + spread * .33) / aspect);
    camera.position.y = .020 + spread * .083;
    camera.left = -aspect * halfHeight;
    camera.right = aspect * halfHeight;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    aspect = width / height;
    camera.near = .1;
    camera.far = 10;
    frameBird(0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
    renderer.setSize(width, height, false);
  }

  const inverseBody = new THREE.Quaternion();
  const towardCamera = new THREE.Vector3();
  function draw(controls: Motion, time = 0) {
    bird.position.set(controls.x, controls.y, 0);
    bird.rotation.set(controls.pitch, controls.yaw, controls.roll, 'YXZ');
    inverseBody.copy(bird.quaternion).invert();
    towardCamera.set(0, 0, 1).applyQuaternion(inverseBody);
    left.root.position.set(.068, shortenNeck(.559), .266)
      .addScaledVector(towardCamera, .148 * controls.leftCover);
    right.root.position.set(-.071, shortenNeck(.559), .266)
      .addScaledVector(towardCamera, .148 * controls.rightCover);
    head.rotation.set(controls.headPitch - controls.pitch * .55,
      THREE.MathUtils.clamp(controls.headYaw * 1.23 - controls.yaw * .4, -1.06, 1.06),
      controls.headRoll - controls.roll * .5);
    folded[0].visible = !left.pose(controls, inverseBody);
    folded[1].visible = !right.pose(controls, inverseBody);
    jaw.rotation.x = -.045 + controls.jaw * .67;
    upperBill.rotation.x = -controls.jaw * .205;
    express(controls.jaw);
    const phase = time % 4.63;
    const autoBlink = Math.max(0, 1 - Math.abs(phase - 3.56) / .12);
    eyes.left = Math.max(autoBlink, controls.blinkLeft);
    eyes.right = Math.max(autoBlink, controls.blinkRight);
    const sideways = (lift: number, reach: number, cross: number) =>
      smooth(lift, .13, .60) * (1 - Math.max(0, reach) * .65) * (1 - cross * .48);
    frameBird(Math.max(sideways(controls.left, controls.leftReach, controls.leftCross),
      sideways(controls.right, controls.rightReach, controls.rightCross)));
    renderer.render(scene, camera);
  }
  return { resize, draw };
}
