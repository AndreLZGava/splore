import * as THREE from 'three';

// Pool-based particle system for ambient plankton, effects, DNA bursts

const PLANKTON_COUNT = 400;
const DEBRIS_COUNT   = 100;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this._time = 0;
    this._planktonGroup = null;
    this._debris = null;
    this._initPlankton();
    this._initDebris();

    // Effect pool
    this._effects = [];
  }

  _initPlankton() {
    const positions = new Float32Array(PLANKTON_COUNT * 3);
    const colors    = new Float32Array(PLANKTON_COUNT * 3);
    const sizes     = new Float32Array(PLANKTON_COUNT);
    const speeds    = new Float32Array(PLANKTON_COUNT * 3);

    for (let i = 0; i < PLANKTON_COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 800;
      positions[i*3+1] = (Math.random() - 0.5) * 30;
      positions[i*3+2] = (Math.random() - 0.5) * 800;

      const r = Math.random();
      colors[i*3]   = 0.1 + r * 0.2;
      colors[i*3+1] = 0.4 + r * 0.4;
      colors[i*3+2] = 0.5 + r * 0.4;

      sizes[i] = 1 + Math.random() * 4;
      speeds[i*3]   = (Math.random() - 0.5) * 8;
      speeds[i*3+1] = (Math.random() - 0.5) * 2;
      speeds[i*3+2] = (Math.random() - 0.5) * 8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('speed',    new THREE.BufferAttribute(speeds, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.45,
      size: 3,
      depthWrite: false,
    });

    this._plankton = new THREE.Points(geo, mat);
    this._planktonSpeeds = speeds;
    this._planktonPositions = positions;
    this.scene.add(this._plankton);
  }

  _initDebris() {
    const positions = new Float32Array(DEBRIS_COUNT * 3);
    const colors    = new Float32Array(DEBRIS_COUNT * 3);

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 800;
      positions[i*3+1] = (Math.random() - 0.5) * 20;
      positions[i*3+2] = (Math.random() - 0.5) * 800;
      colors[i*3]   = 0.3 + Math.random() * 0.2;
      colors[i*3+1] = 0.2 + Math.random() * 0.2;
      colors[i*3+2] = 0.1 + Math.random() * 0.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors: true, sizeAttenuation: true,
      transparent: true, opacity: 0.3, size: 2, depthWrite: false,
    });

    this._debris = new THREE.Points(geo, mat);
    this._debrisPositions = positions;
    this.scene.add(this._debris);
  }

  update(dt, playerX, playerZ, depth = 0) {
    this._time += dt;
    const t = this._time;

    // Center plankton around player
    this._plankton.position.set(playerX, 0, playerZ);
    this._debris.position.set(playerX, 0, playerZ);

    // Animate plankton drift
    const pos = this._planktonPositions;
    const spd = this._planktonSpeeds;
    for (let i = 0; i < PLANKTON_COUNT; i++) {
      const ii = i * 3;
      pos[ii]   += spd[ii]   * dt + Math.sin(t * 0.3 + i) * 0.5;
      pos[ii+1] += spd[ii+1] * dt;
      pos[ii+2] += spd[ii+2] * dt + Math.cos(t * 0.25 + i * 0.7) * 0.5;

      // Wrap around if too far
      if (pos[ii]   >  400) pos[ii]   = -400;
      if (pos[ii]   < -400) pos[ii]   =  400;
      if (pos[ii+2] >  400) pos[ii+2] = -400;
      if (pos[ii+2] < -400) pos[ii+2] =  400;
      if (pos[ii+1] >  20)  pos[ii+1] = -20;
      if (pos[ii+1] < -20)  pos[ii+1] =  20;
    }
    this._plankton.geometry.attributes.position.needsUpdate = true;

    // Color plankton based on depth
    const depthF = Math.max(0, Math.min(1, (-depth + 1500) / 3000));
    this._plankton.material.color.setRGB(depthF * 0.3 + 0.1, depthF * 0.5 + 0.2, depthF * 0.3 + 0.5);
    this._plankton.material.opacity = 0.3 + depthF * 0.2;

    // Animate effects
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const eff = this._effects[i];
      eff.age += dt;
      eff.mesh.children.forEach((p, j) => {
        if (!p.userData.v) return;
        p.position.x += p.userData.v.x * dt;
        p.position.y += p.userData.v.y * dt;
        p.position.z += p.userData.v.z * dt;
        p.userData.v.y += 5 * dt; // gravity-like float
        const alpha = 1 - eff.age / eff.duration;
        p.material.opacity = Math.max(0, alpha * 0.8);
      });
      if (eff.age >= eff.duration) {
        this.scene.remove(eff.mesh);
        this._effects.splice(i, 1);
      }
    }
  }

  // Burst effect: DNA gain (green)
  burstDNA(wx, wz) {
    this._burst(wx, wz, 0x44ff88, 12, 0.4);
  }

  // Burst effect: damage (red)
  burstDamage(wx, wz) {
    this._burst(wx, wz, 0xff3322, 8, 0.3);
  }

  // Burst effect: mating (pink/white)
  burstMate(wx, wz) {
    this._burst(wx, wz, 0xff88ff, 20, 0.6);
  }

  // Burst effect: death (dark)
  burstDeath(wx, wz) {
    this._burst(wx, wz, 0x884422, 30, 1.0);
  }

  _burst(wx, wz, color, count, duration) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const geo = new THREE.SphereGeometry(1.5, 4, 3);

    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(geo, mat.clone());
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      p.userData.v = {
        x: Math.cos(angle) * speed,
        y: 10 + Math.random() * 20,
        z: Math.sin(angle) * speed,
      };
      p.position.set(0, 2, 0);
      group.add(p);
    }
    group.position.set(wx, 0, wz);
    this.scene.add(group);
    this._effects.push({ mesh: group, age: 0, duration });
  }
}
