import * as THREE from 'three';

const sphere = new THREE.SphereGeometry(1, 28, 20);

export function oval(parent: THREE.Object3D, color: number, position: [number, number, number],
  scale: [number, number, number], roughness = .67) {
  const mesh = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color, roughness }));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

export function createExpression(head: THREE.Object3D, jaw: THREE.Object3D) {
  // Recess the mouth lining so the cheeks retain their scanned silhouette.
  oval(head, 0x8b3f51, [-.006, .072, .042], [.034, .034, .039]);
  oval(head, 0x733544, [-.004, .092, .067], [.027, .014, .030]);
  const tongue = oval(jaw, 0xc67b89, [0, -.003, .028], [.017, .007, .019], .54);
  return (mouth: number) => {
    tongue.visible = mouth > .13;
    tongue.position.z = .027 + mouth * .004;
    tongue.rotation.x = mouth * -.12;
  };
}
