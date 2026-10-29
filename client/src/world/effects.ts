// Short-lived particles: a puff of grass and dust where a disc lands, and confetti from the basket
// for a birdie or better (lots more for an ace). One pooled instanced mesh each, so a burst costs
// no new geometry.

import * as THREE from 'three';

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  age: number;
  life: number;
  size: number;
  drag: number;
  gravity: number;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private items: Particle[];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, material: THREE.Material, count: number) {
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: count }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      rot: new THREE.Euler(),
      age: 0,
      life: 1,
      size: 1,
      drag: 0,
      gravity: 0,
    }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
  }

  spawn(init: Partial<Particle> & { pos: THREE.Vector3; vel: THREE.Vector3 }, color: string): void {
    const i = this.next;
    this.next = (this.next + 1) % this.items.length;
    Object.assign(this.items[i], { alive: true, age: 0, spin: new THREE.Vector3(), rot: new THREE.Euler(), life: 1, size: 1, drag: 0, gravity: 9.8 }, init);
    this.items[i].pos = init.pos.clone();
    this.items[i].vel = init.vel.clone();
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    this.items.forEach((p, i) => {
      if (!p.alive) return;
      any = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.set(p.rot.x + p.spin.x * dt, p.rot.y + p.spin.y * dt, p.rot.z + p.spin.z * dt);
      const fade = 1 - Math.max(0, (p.age - p.life * 0.7) / (p.life * 0.3));
      this.q.setFromEuler(p.rot);
      this.s.setScalar(p.size * fade);
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const CONFETTI = ['#ff3d8b', '#ffe14d', '#3cc8f2', '#b6f23c', '#ff8a1f', '#ffffff', '#a77bff'];

export class Effects {
  readonly object = new THREE.Group();
  private confetti = new Pool(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 400);
  private dust = new Pool(new THREE.TetrahedronGeometry(0.06), new THREE.MeshLambertMaterial({ flatShading: true }), 60);

  constructor() {
    this.object.add(this.confetti.mesh, this.dust.mesh);
  }

  /** A little spray of grass and dirt where the disc lands. */
  landingPuff(at: THREE.Vector3, speed: number, color = '#7da552'): void {
    const n = Math.min(14, 4 + Math.round(speed * 0.8));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.6 + Math.random() * (0.4 + speed * 0.08);
      this.dust.spawn(
        {
          pos: at.clone().add(new THREE.Vector3(0, 0.03, 0)),
          vel: new THREE.Vector3(Math.cos(a) * v, 1 + Math.random() * 1.5, Math.sin(a) * v),
          spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
          life: 0.5 + Math.random() * 0.3,
          size: 0.6 + Math.random() * 0.8,
          drag: 2,
        },
        i % 3 === 0 ? '#9a7a55' : color,
      );
    }
  }

  /** Confetti bursting up out of the basket. ace = a bigger party. */
  celebrate(at: THREE.Vector3, ace: boolean): void {
    const n = ace ? 380 : 140;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = 1 + Math.random() * (ace ? 4 : 2.5);
      this.confetti.spawn(
        {
          pos: at.clone().add(new THREE.Vector3(0, 1.4, 0)),
          vel: new THREE.Vector3(Math.cos(a) * out, 4 + Math.random() * (ace ? 7 : 4), Math.sin(a) * out),
          spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
          life: 2.5 + Math.random() * 1.5,
          size: 1 + Math.random() * 0.6,
          drag: 1.6,
          gravity: 4,
        },
        CONFETTI[i % CONFETTI.length],
      );
    }
  }

  update(dt: number): void {
    this.confetti.update(dt);
    this.dust.update(dt);
  }
}
