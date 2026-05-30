import * as THREE from 'three';
import { GENE_DEFS, getOrganismHue } from './config.js';

// Shared geometries (reused)
const _sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const _coneGeo   = new THREE.ConeGeometry(0.15, 0.6, 6);
const _eyeGeo    = new THREE.SphereGeometry(0.18, 10, 8);

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

export class OrganismRenderer {
  constructor(scene) {
    this.scene = scene;
  }

  // Build a full Three.js Group representing an organism
  buildMesh(dna, radius, depth = 0) {
    const group = new THREE.Group();
    const genes = dna.genes;

    const { h, s, l } = getOrganismHue(genes, depth);
    const bodyColor   = hslToHex(h, s, l);
    const emissiveCol = hslToHex(h, s * 0.5, l * 0.3);

    // ── Body ──
    const bodyMat = new THREE.MeshPhongMaterial({
      color: bodyColor,
      emissive: emissiveCol,
      emissiveIntensity: 0.4,
      shininess: 80,
      specular: 0x88bbff,
      transparent: true,
      opacity: 0.92,
    });
    const body = new THREE.Mesh(_sphereGeo, bodyMat);
    body.scale.set(radius, radius * 0.45, radius);  // flatten for top-down
    group.add(body);

    // ── Eyes ──
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x111111, emissive: 0x222222, shininess: 120 });
    const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 100 });
    const eyeAngle = genes.has('carnivore') ? 0.35 : 0.6;
    for (let side = -1; side <= 1; side += 2) {
      const eye = new THREE.Group();
      const eyeWhite = new THREE.Mesh(_eyeGeo, eyeWhiteMat);
      eyeWhite.scale.setScalar(1);
      eye.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
      pupil.position.set(0, 0, 0.14);
      eye.add(pupil);
      eye.position.set(side * radius * 0.38, radius * 0.32, radius * 0.72);
      eye.scale.setScalar(radius * 0.22);
      group.add(eye);
    }

    // ── Cilia ──
    if (genes.has('cilia')) {
      const ciliaCount = 24;
      const ciliaMat = new THREE.LineBasicMaterial({ color: hslToHex(h, s, l + 20), linewidth: 1 });
      for (let i = 0; i < ciliaCount; i++) {
        const angle = (i / ciliaCount) * Math.PI * 2;
        const points = [
          new THREE.Vector3(Math.cos(angle) * radius * 1.0, 0, Math.sin(angle) * radius * 1.0),
          new THREE.Vector3(Math.cos(angle) * radius * 1.5, 0, Math.sin(angle) * radius * 1.5),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, ciliaMat);
        group.add(line);
      }
    }

    // ── Flagellum ──
    if (genes.has('flagellum')) {
      const tailCount = genes.has('cilia') ? 1 : 2;
      for (let ti = 0; ti < tailCount; ti++) {
        const baseAngle = Math.PI + (ti * 0.4 - 0.2);
        const SEGMENTS = 13;
        const positions = new Float32Array(SEGMENTS * 3);
        for (let i = 0; i < SEGMENTS; i++) {
          const u = i / (SEGMENTS - 1);
          positions[i * 3]     = Math.cos(baseAngle) * (radius + u * radius * 3.5);
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = Math.sin(baseAngle) * (radius + u * radius * 3.5) + Math.sin(u * Math.PI * 2) * radius * 0.4 * u;
        }
        const tailGeo = new THREE.BufferGeometry();
        tailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const tailMat = new THREE.LineBasicMaterial({ color: hslToHex(h, s, l + 10), linewidth: 2 });
        const tail = new THREE.Line(tailGeo, tailMat);
        group.add(tail);
        tail.userData.isTail = true;
        tail.userData.tailIndex = ti;
        tail.userData.radius = radius;
        tail.userData.baseAngle = baseAngle;
      }
    }

    // ── Pseudopods ──
    if (genes.has('pseudopod')) {
      const podCount = 3;
      const podMat = new THREE.MeshPhongMaterial({ color: bodyColor, emissive: emissiveCol, transparent: true, opacity: 0.75, shininess: 60 });
      for (let i = 0; i < podCount; i++) {
        const angle = (i / podCount) * Math.PI * 2;
        const pod = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), podMat);
        pod.position.set(Math.cos(angle) * radius * 1.2, 0, Math.sin(angle) * radius * 1.2);
        pod.scale.set(radius * 0.35, radius * 0.25, radius * 0.5);
        pod.userData.isPod = true;
        pod.userData.baseAngle = angle;
        pod.userData.podIndex = i;
        group.add(pod);
      }
    }

    // ── Spines ──
    if (genes.has('spines')) {
      const spineCount = genes.has('carapace') ? 6 : 10;
      const spineMat = new THREE.MeshPhongMaterial({ color: hslToHex(h + 30, s, l - 15), shininess: 60 });
      for (let i = 0; i < spineCount; i++) {
        const angle = (i / spineCount) * Math.PI * 2;
        const spine = new THREE.Mesh(_coneGeo, spineMat);
        spine.position.set(Math.cos(angle) * radius * 1.1, 0, Math.sin(angle) * radius * 1.1);
        spine.rotation.z = -Math.PI / 2;
        spine.rotation.y = angle;
        spine.scale.setScalar(radius * 0.18);
        group.add(spine);
      }
    }

    // ── Chemical Defense ──
    if (genes.has('chemical_defense')) {
      const bubbleMat = new THREE.MeshPhongMaterial({
        color: hslToHex((h + 120) % 360, 60, 60),
        transparent: true, opacity: 0.45, shininess: 100,
      });
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bubbleMat);
        orb.position.set(Math.cos(angle) * radius * 1.4, 0, Math.sin(angle) * radius * 1.4);
        orb.scale.setScalar(radius * 0.14);
        orb.userData.isOrb = true;
        orb.userData.orbAngle = angle;
        group.add(orb);
      }
    }

    // ── Carapace ──
    if (genes.has('carapace')) {
      const carapaceMat = new THREE.MeshPhongMaterial({
        color: hslToHex(h, s * 0.4, l * 0.6),
        shininess: 120, specular: 0xaaaaff,
      });
      const carapace = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        carapaceMat
      );
      carapace.scale.set(radius * 0.95, radius * 0.35, radius * 0.95);
      carapace.position.y = radius * 0.15;
      group.add(carapace);
    }

    // ── Photosynthetic glow dots ──
    if (genes.has('photosynthetic')) {
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffee44 });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), dotMat);
        dot.position.set(Math.cos(angle) * radius * 0.7, radius * 0.35, Math.sin(angle) * radius * 0.7);
        dot.scale.setScalar(radius * 0.1);
        group.add(dot);
      }
    }

    // Shadow circle on ground
    const shadowGeo = new THREE.CircleGeometry(radius * 1.1, 20);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0, -radius * 0.42, 0);
    group.add(shadow);

    group.userData.bodyMat = bodyMat;
    group.userData.radius = radius;
    group.userData.genes = genes;
    group.userData.animTime = Math.random() * Math.PI * 2;

    return group;
  }

  // Animate appendages each frame
  animateOrganism(group, dt, speed = 0) {
    group.userData.animTime += dt;
    const t = group.userData.animTime;
    const r = group.userData.radius || 8;

    for (const child of group.children) {
      // Flagellum wave
      if (child.userData.isTail) {
        const baseAngle = child.userData.baseAngle;
        const posArr = child.geometry.attributes.position;
        if (!posArr) continue;
        const SEGMENTS = 13;
        for (let i = 0; i < SEGMENTS; i++) {
          const u = i / (SEGMENTS - 1);
          const wave = Math.sin(u * Math.PI * 2 - t * 4) * r * 0.5 * u * (0.5 + speed * 0.5);
          posArr.setXYZ(i,
            Math.cos(baseAngle) * (r + u * r * 3.5),
            0,
            Math.sin(baseAngle) * (r + u * r * 3.5) + wave
          );
        }
        posArr.needsUpdate = true;
      }

      // Pseudopod pulse
      if (child.userData.isPod) {
        const pulse = 1 + Math.sin(t * 1.5 + child.userData.podIndex * 2.1) * 0.15;
        child.scale.set(r * 0.35 * pulse, r * 0.25, r * 0.5 * pulse);
      }

      // Chemical orbs orbit
      if (child.userData.isOrb) {
        const angle = child.userData.orbAngle + t * 0.8;
        child.position.set(Math.cos(angle) * r * 1.4, 0, Math.sin(angle) * r * 1.4);
      }
    }

    // Subtle body pulse (breathing)
    const body = group.children[0];
    if (body && body.geometry === _sphereGeo) {
      const pulse = 1 + Math.sin(t * 1.2) * 0.03;
      body.scale.set(r * pulse, r * 0.45, r * pulse);
    }
  }

  // Flash organism red/white on hit
  flashDamage(group) {
    const mat = group.userData.bodyMat;
    if (!mat) return;
    const origColor = mat.color.getHex();
    mat.color.setHex(0xff2222);
    setTimeout(() => mat.color.setHex(origColor), 150);
  }

  // Rebuild mesh when genes change (call after evolution)
  rebuildMesh(group, dna, radius, depth = 0) {
    // Remove children except add new ones
    while (group.children.length > 0) group.remove(group.children[0]);
    const newGroup = this.buildMesh(dna, radius, depth);
    newGroup.children.forEach(c => group.add(c));
    group.userData = newGroup.userData;
  }
}
