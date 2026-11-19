import { useEffect, useRef } from "react";
import rankitModel from "@/assets/rankit_teacher.glb.asset.json";

/** Browser-only 3D talking avatar. Model has no face blendshapes, so speech drives head/neck motion. */
export const AVATAR_3D_MODELS: Record<string, string> = { rankit3d: rankitModel.url };

export default function Avatar3D({ modelKey, speaking, level }: { modelKey: string; speaking: boolean; level: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ speaking, level });
  live.current = { speaking, level };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;
      const w = el.clientWidth || 200, h = el.clientHeight || 200;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(22, w / h, 0.05, 50);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(1, 2, 3); scene.add(key);
      const gltf = await new GLTFLoader().loadAsync(AVATAR_3D_MODELS[modelKey] ?? rankitModel.url);
      if (disposed) { renderer.dispose(); return; }
      const model = gltf.scene; scene.add(model);
      const mixer = new THREE.AnimationMixer(model);
      if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play();
      const bone = (n: string) => model.getObjectByName(n);
      const head = bone("Head"), neck = bone("Neck"), spine = bone("Spine2");
      const rArm = bone("RightArm"), rFore = bone("RightForeArm"), rHand = bone("RightHand");
      const lArm = bone("LeftArm"), lFore = bone("LeftForeArm"), lHand = bone("LeftHand");
      model.updateMatrixWorld(true);
      // News-anchor framing: waist (hips) up to the top of the head.
      const box = new THREE.Box3().setFromObject(model);
      const hipsY = (() => { const v = new THREE.Vector3(); const b = bone("Hips"); if (b) b.getWorldPosition(v); else v.y = box.min.y + (box.max.y - box.min.y) * 0.5; return v.y; })();
      const top = box.max.y + 0.04, bottom = hipsY - 0.05;
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, cy = (top + bottom) / 2;
      const span = Math.max(top - bottom, (box.max.x - box.min.x) * 0.9 * (h / w));
      const dist = span / 2 / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(cx, cy, cz + dist);
      camera.lookAt(cx, cy, cz);
      const clock = new THREE.Clock(); let raf = 0; let smooth = 0;
      const tick = () => {
        const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
        mixer.update(dt);
        const target = live.current.speaking ? Math.min(live.current.level, 1) : 0;
        smooth += (target - smooth) * Math.min(1, dt * 12);
        if (head) { head.rotation.x += smooth * 0.12 * Math.sin(t * 9) + smooth * 0.05; head.rotation.y += smooth * 0.06 * Math.sin(t * 3.1); }
        if (neck) neck.rotation.z += smooth * 0.03 * Math.sin(t * 2.3);
        if (spine) spine.rotation.y += smooth * 0.05 * Math.sin(t * 1.3);
        // Teacher-style hand gestures while speaking: two out-of-phase arm cycles.
        const g1 = smooth * (0.5 + 0.5 * Math.sin(t * 2.2)), g2 = smooth * (0.5 + 0.5 * Math.sin(t * 1.7 + 2));
        if (rArm) { rArm.rotation.x -= g1 * 0.35; rArm.rotation.z += g1 * 0.15; }
        if (rFore) { rFore.rotation.x -= g1 * 0.9; rFore.rotation.y += g1 * 0.3 * Math.sin(t * 4); }
        if (rHand) rHand.rotation.z += g1 * 0.3 * Math.sin(t * 5);
        if (lArm) { lArm.rotation.x -= g2 * 0.25; lArm.rotation.z -= g2 * 0.12; }
        if (lFore) { lFore.rotation.x -= g2 * 0.7; lFore.rotation.y -= g2 * 0.25 * Math.sin(t * 3.5); }
        if (lHand) lHand.rotation.z -= g2 * 0.3 * Math.sin(t * 4.5);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
      el.dataset["sceneReady"] = "1";
      cleanup = () => { cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); };
    })().catch((e) => console.error("3D avatar failed", e));
    return () => { disposed = true; cleanup(); };
  }, [modelKey]);

  return <div ref={host} className="h-full w-full" />;
}
