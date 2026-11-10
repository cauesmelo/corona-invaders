/** Adjuvants on the board (RESEARCH_CARDS §6.2): the few accessories the
 * syringe wears, the JET INJECTOR stream and the FOAM disc. Kept out of
 * render.mjs so the campaign squad's syringe work and this layer meet in a
 * handful of lines.
 *
 * Readability rules (the syringe stays short and readable):
 *   - at most 3 accessories at once, nothing on the barrel (the glass capsule
 *     around the dose) and nothing ring-shaped around the core: the coating
 *     glazes the finger collar (+0.31 to +0.41 u) and the thumb rest
 *     (+0.64 u), both behind the 0.2 u core;
 *   - the tip glint stays INJECT's alone (the twin needle has none);
 *   - the jet is drawn at exactly its collider (hitboxes.JET: 0.5 u wide,
 *     from the needle tip to the back edge), under the bullets at <= 45%
 *     opacity, like a lane beam; the foam disc at exactly its cancel radius.
 */
import { SYRINGE } from './shapes.mjs';
import { JET, jetRect } from './hitboxes.mjs';

export function createKitLayer(THREE, { scene, syringe, steel, bulletY }) {
  const part = (role) => SYRINGE.parts.find((p) => p.role === role);
  const collar = part('finger grip'),
    thumb = part('thumb rest'),
    needle = part('needle');
  const glaze = () => new THREE.MeshStandardMaterial({ color: '#9ff2ff', emissive: '#4fd8f5', emissiveIntensity: 0.9, transparent: true, opacity: 0, depthWrite: false, roughness: 0.1 });
  // ENTERIC / LNP: a cyan glaze over the collar (charge 1) and the thumb rest
  // (LNP's charge 2). A breaking charge drains; a re-forming one refills from
  // the collar outward, so the shield's state is on the character.
  const collarTube = (collar.z1 - collar.z0) / 2;
  const collarGlaze = new THREE.Mesh(new THREE.TorusGeometry(collar.r - collarTube, collarTube * 1.3, 10, 28), glaze());
  collarGlaze.position.z = (collar.z0 + collar.z1) / 2;
  const thumbGlaze = new THREE.Mesh(new THREE.CylinderGeometry(thumb.r * 1.06, thumb.r * 1.06, (thumb.z1 - thumb.z0) * 1.6, 24).rotateX(Math.PI / 2), glaze());
  thumbGlaze.position.z = (thumb.z0 + thumb.z1) / 2;
  // TWIN BARREL: a second, plain needle beside the first, hub forward.
  const twinLen = needle.z1 - needle.z0 - 0.08;
  const twin = new THREE.Mesh(new THREE.CylinderGeometry(needle.r * 0.8, needle.r, twinLen, 8).rotateX(Math.PI / 2), steel);
  twin.position.set(0.085, 0, needle.z1 - twinLen / 2);
  syringe.add(collarGlaze, thumbGlaze, twin);
  // The jet: one flat quad on the bullet plane (scaled to the rectangle).
  const jetMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const jet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), jetMat);
  jet.renderOrder = 40; // under every bullet family (54+)
  // FOAM: a translucent disc at its cancel radius.
  const foamMat = new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), foamMat);
  foam.renderOrder = 41;
  scene.add(jet, foam);

  return {
    jet,
    sync(s, dt, { time = 0, motion = true, ghost = 1 } = {}) {
      const kit = s.kit || {},
        sh = s.ship;
      const playing = s.phase !== 'title';
      // Coating charges: full, re-forming (opacity follows the timer), empty.
      const max = kit.coatMax || 0,
        coat = sh.coat || 0;
      const reform = max && coat < max && kit.coatReform ? 1 - Math.max(0, sh.coatTimer || 0) / kit.coatReform : 0;
      const level = (i) => (i < coat ? 0.55 : i === coat ? 0.1 + 0.25 * reform : 0);
      collarGlaze.visible = playing && max > 0;
      thumbGlaze.visible = playing && max > 1;
      collarGlaze.material.opacity = level(0) * ghost;
      thumbGlaze.material.opacity = level(1) * ghost;
      twin.visible = playing && !!kit.twin;
      // JET: exactly the collider rectangle.
      jet.visible = !!sh.jetOn && s.phase === 'playing';
      if (jet.visible) {
        const r = jetRect(sh.x, sh.z);
        jet.scale.set(r.width, 1, r.toZ - r.fromZ);
        jet.position.set(r.x, bulletY - 0.01, (r.fromZ + r.toZ) / 2);
        jetMat.opacity = motion ? 0.34 + 0.06 * Math.sin(time * 40) : 0.4;
      }
      const f = s.foam;
      foam.visible = !!f && playing;
      if (f) {
        foam.scale.setScalar(f.r);
        foam.position.set(f.x, bulletY - 0.02, f.z);
        foamMat.opacity = 0.16 * Math.min(1, f.t / 0.4);
      }
      void dt;
    },
    /** QA: the drawn jet's width in world units (it must equal JET.width). */
    jetWidth: () => (jet.visible ? jet.scale.x : JET.width),
  };
}
