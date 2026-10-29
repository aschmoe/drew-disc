// Jets in and out of SEA. North SeaTac Park sits under the runways' northern approach a mile or
// so from the airport: arrivals pass low overhead heading south with their gear down, and
// departures climb away north over the hole with it up. One every 40 to 90 seconds (the first soon
// after load); about one in twelve is gold.

import * as THREE from 'three';
import { createRng } from '../sim/rng';

const ARRIVAL_ALTITUDE = [80, 110];
/** Departures cross the hole's middle at about this height, climbing. */
const DEPARTURE_ALTITUDE = [140, 180];
const SPEED = 72; // m/s, a typical final approach speed
const TRACK_LENGTH = 2600;
const FIRST_DELAY = 12;
const INTERVAL = [40, 90];

export interface Livery {
  body: string;
  belly: string;
  stripe: string;
  tail: string;
  gold?: boolean;
}

export const LIVERIES: Livery[] = [
  { body: '#f4f6f8', belly: '#c9d0d8', stripe: '#1f5fa8', tail: '#1f5fa8' },
  { body: '#f4f6f8', belly: '#d5d9dd', stripe: '#13846f', tail: '#0f5e9c' },
  { body: '#eef1f4', belly: '#cfd5db', stripe: '#d6402f', tail: '#d6402f' },
];
const GOLD: Livery = { body: '#e8b93c', belly: '#c99a2a', stripe: '#fff3c4', tail: '#ff3d8b', gold: true };

export function buildJet(l: Livery): THREE.Group {
  const mat = (color: string) =>
    // Emissive keeps the shaded underside from going dark against a bright sky.
    new THREE.MeshLambertMaterial({ color, flatShading: true, fog: false, emissive: l.gold ? '#6b4a00' : '#4d535c' });
  const jet = new THREE.Group();
  jet.rotation.order = 'YXZ';
  const gearGroup = new THREE.Group();
  gearGroup.name = 'gear';
  jet.add(gearGroup);
  // The jet is built nose toward -z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 30, 10).rotateX(Math.PI / 2), mat(l.body));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), mat(l.body));
  nose.position.z = -15;
  nose.scale.z = 1.6;
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 10).rotateX(Math.PI / 2), mat(l.body));
  tailCone.position.set(0, 0.5, 18.5);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.03, 2.03, 26, 10, 1, true, Math.PI * 0.35, Math.PI * 0.3).rotateX(Math.PI / 2), mat(l.stripe));
  stripe.material.side = THREE.DoubleSide;
  const stripe2 = stripe.clone();
  stripe2.rotation.z = Math.PI * 0.95;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, 28, 10, 1, true, Math.PI * 0.85, Math.PI * 0.3).rotateX(Math.PI / 2), mat(l.belly));
  belly.material.side = THREE.DoubleSide;

  // Swept wings and tailplane.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(17, 7);
  wingShape.lineTo(17, 9.5);
  wingShape.lineTo(0, 6);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.4, bevelEnabled: false }).rotateX(Math.PI / 2);
  for (const side of [1, -1]) {
    const wing = new THREE.Mesh(wingGeo, mat(l.body));
    wing.scale.x = side;
    wing.position.set(side * 1.5, -1, -3);
    jet.add(wing);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1, 4.5, 10).rotateX(Math.PI / 2), mat(l.belly));
    engine.position.set(side * 6.5, -2.4, -0.5);
    jet.add(engine);
    const tailplane = new THREE.Mesh(wingGeo, mat(l.body));
    tailplane.scale.set(side * 0.38, 1, 0.38);
    tailplane.position.set(side * 1, 0.6, 15);
    jet.add(tailplane);
    // Main gear, down for landing.
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 6), mat('#4a4f55'));
    gear.position.set(side * 2.4, -3, 1.5);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 8).rotateZ(Math.PI / 2), mat('#22262a'));
    wheel.position.set(side * 2.4, -4.1, 1.5);
    gearGroup.add(gear, wheel);
  }
  const noseGear = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 6), mat('#4a4f55'));
  noseGear.position.set(0, -2.8, -11);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(6, 0);
  finShape.lineTo(7.5, 8);
  finShape.lineTo(5, 8);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.4, bevelEnabled: false }).rotateY(-Math.PI / 2), mat(l.tail));
  fin.position.set(0.2, 1.5, 13);
  gearGroup.add(noseGear);
  jet.add(fuselage, nose, tailCone, stripe, stripe2, belly, fin);
  return jet;
}

/** A soft shadow shaped roughly like the jet, cast down the sun's direction onto the ground. */
function buildShadow(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, -16);
  shape.lineTo(2, -6);
  shape.lineTo(18, 2);
  shape.lineTo(18, 4);
  shape.lineTo(2, 2);
  shape.lineTo(1.5, 13);
  shape.lineTo(6, 17);
  shape.lineTo(6, 18.5);
  shape.lineTo(0, 17);
  shape.lineTo(-6, 18.5);
  shape.lineTo(-6, 17);
  shape.lineTo(-1.5, 13);
  shape.lineTo(-2, 2);
  shape.lineTo(-18, 4);
  shape.lineTo(-18, 2);
  shape.lineTo(-2, -6);
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#0d1f12', transparent: true, opacity: 0.16, depthWrite: false }));
}

export class JetFlyovers {
  readonly object = new THREE.Group();
  private jets: THREE.Group[];
  private gold: THREE.Group;
  private shadow = buildShadow();
  private active: { jet: THREE.Group; t: number; x: number; alt: number; arrival: boolean } | null = null;
  private wait = FIRST_DELAY;
  private rng = createRng((Date.now() & 0xffff) ^ 0x737);

  constructor(
    /** World point the approach passes near (the middle of the hole). */
    private center: THREE.Vector3,
    private sunDir: THREE.Vector3,
  ) {
    this.jets = LIVERIES.map(buildJet);
    this.gold = buildJet(GOLD);
    for (const j of [...this.jets, this.gold]) {
      j.visible = false;
      this.object.add(j);
    }
    this.shadow.visible = false;
    this.object.add(this.shadow);
  }

  /** 0 when no jet is near, rising to 1 as one passes overhead. For the rumble and camera. */
  proximity(listener: THREE.Vector3): number {
    if (!this.active) return 0;
    const d = this.active.jet.position.distanceTo(listener);
    return Math.max(0, Math.min(1, 1 - (d - 90) / 900));
  }

  update(dt: number): void {
    if (!this.active) {
      this.wait -= dt;
      if (this.wait > 0) return;
      const gold = this.rng.next() < 1 / 12;
      const jet = gold ? this.gold : this.jets[Math.floor(this.rng.next() * this.jets.length)];
      const arrival = this.rng.next() < 0.5;
      const range = arrival ? ARRIVAL_ALTITUDE : DEPARTURE_ALTITUDE;
      this.active = { jet, t: 0, x: this.center.x + this.rng.range(-25, 45), alt: this.rng.range(range[0], range[1]), arrival };
      jet.visible = true;
      jet.getObjectByName('gear')!.visible = arrival;
      this.shadow.visible = true;
    }
    const a = this.active;
    a.t += dt;
    // Arrivals: north to south (world -z to +z), descending gently toward the runways.
    // Departures: south to north, climbing out.
    const along = -TRACK_LENGTH / 2 + a.t * SPEED;
    const z = this.center.z + (a.arrival ? along : -along);
    const y = a.arrival ? a.alt - along * 0.05 : Math.max(30, a.alt + along * 0.1);
    a.jet.position.set(a.x, y, z);
    a.jet.rotation.set(a.arrival ? 0.05 : 0.16, a.arrival ? Math.PI : 0, 0);
    // Shadow: straight down the sun's rays onto the ground (flat enough here).
    const s = this.sunDir;
    this.shadow.position.set(a.x - (s.x / s.y) * y, 0.06, z - (s.z / s.y) * y);
    this.shadow.rotation.y = a.arrival ? 0 : Math.PI;
    if (along > TRACK_LENGTH / 2) {
      a.jet.visible = false;
      this.shadow.visible = false;
      this.active = null;
      this.wait = this.rng.range(INTERVAL[0], INTERVAL[1]);
    }
  }
}
