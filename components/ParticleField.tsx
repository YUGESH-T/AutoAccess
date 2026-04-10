import React, { useEffect, useRef } from 'react';

/**
 * ParticleField — Three.js WebGL floating particles with connection lines.
 * Renders a full-screen background layer with depth.
 * Emerald-themed, respects prefers-reduced-motion.
 *
 * Performance: Three.js is lazy-loaded (removes ~600KB from initial bundle).
 * Adaptive particle count: 60 on mobile, 120 on desktop.
 * Pauses animation when tab is hidden (saves CPU/battery).
 * Early-exit distance check in connection loop (avoids sqrt for far pairs).
 */

const CONNECTION_DISTANCE = 150;
const MOUSE_RADIUS = 200;

const ParticleField: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !mountRef.current) return;

    const container = mountRef.current;
    let animationId: number;
    let mounted = true;

    // Adaptive particle count — mobile uses half to save CPU/battery
    const isMobile = window.innerWidth < 768;
    const PARTICLE_COUNT = isMobile ? 60 : 120;

    // Lazy-load Three.js — keeps it out of the initial bundle (~600KB savings)
    import('three').then((THREE) => {
      if (!mounted) return;

      let width = window.innerWidth;
      let height = window.innerHeight;

      const mouse = new THREE.Vector2(9999, 9999);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1000);
      camera.position.z = 400;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      // Particles
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const velocities = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);

      const accentColor = new THREE.Color(0x10b981);
      const dimColor = new THREE.Color(0x3f3f46);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        positions[i3]     = (Math.random() - 0.5) * width;
        positions[i3 + 1] = (Math.random() - 0.5) * height;
        positions[i3 + 2] = (Math.random() - 0.5) * 300;

        velocities[i3]     = (Math.random() - 0.5) * 0.3;
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.3;
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.15;

        const c = Math.random() < 0.3 ? accentColor : dimColor;
        colors[i3]     = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
      }

      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const particleMat = new THREE.PointsMaterial({
        size: 2.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(particleGeo, particleMat);
      scene.add(points);

      // Lines geometry (dynamic)
      const maxLines = PARTICLE_COUNT * 10;
      const linePositions = new Float32Array(maxLines * 6);
      const lineColors = new Float32Array(maxLines * 6);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
      lineGeo.setDrawRange(0, 0);

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);

      const getMouseWorld = () =>
        new THREE.Vector2((mouse.x - 0.5) * width, -(mouse.y - 0.5) * height);

      // Animation loop
      const animate = () => {
        if (!mounted) return;

        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        const posArray = posAttr.array as Float32Array;
        const mouseWorld = getMouseWorld();

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const i3 = i * 3;
          posArray[i3]     += velocities[i3];
          posArray[i3 + 1] += velocities[i3 + 1];
          posArray[i3 + 2] += velocities[i3 + 2];

          // Boundary wrapping
          const hw = width * 0.6;
          const hh = height * 0.6;
          if (posArray[i3]     >  hw)  posArray[i3]     = -hw;
          if (posArray[i3]     < -hw)  posArray[i3]     =  hw;
          if (posArray[i3 + 1] >  hh)  posArray[i3 + 1] = -hh;
          if (posArray[i3 + 1] < -hh)  posArray[i3 + 1] =  hh;
          if (posArray[i3 + 2] >  150) posArray[i3 + 2] = -150;
          if (posArray[i3 + 2] < -150) posArray[i3 + 2] =  150;

          // Mouse repulsion
          const dx = posArray[i3]     - mouseWorld.x;
          const dy = posArray[i3 + 1] - mouseWorld.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_RADIUS && dist > 0) {
            const force = ((MOUSE_RADIUS - dist) / MOUSE_RADIUS) * 0.8;
            posArray[i3]     += (dx / dist) * force;
            posArray[i3 + 1] += (dy / dist) * force;
          }
        }
        posAttr.needsUpdate = true;

        // Connection lines — early-exit check avoids sqrt for far pairs (perf win)
        let lineIdx = 0;
        const lPosArray = lineGeo.getAttribute('position').array as Float32Array;
        const lColArray = lineGeo.getAttribute('color').array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          for (let j = i + 1; j < PARTICLE_COUNT; j++) {
            if (lineIdx >= maxLines) break;
            const i3 = i * 3;
            const j3 = j * 3;
            const dx = posArray[i3]     - posArray[j3];
            const dy = posArray[i3 + 1] - posArray[j3 + 1];

            // Early exit: skip sqrt if clearly out of range on x or y axis
            if (Math.abs(dx) > CONNECTION_DISTANCE || Math.abs(dy) > CONNECTION_DISTANCE) continue;

            const dz = posArray[i3 + 2] - posArray[j3 + 2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= CONNECTION_DISTANCE) continue;

            const alpha = 1 - dist / CONNECTION_DISTANCE;
            const li = lineIdx * 6;
            lPosArray[li]     = posArray[i3];
            lPosArray[li + 1] = posArray[i3 + 1];
            lPosArray[li + 2] = posArray[i3 + 2];
            lPosArray[li + 3] = posArray[j3];
            lPosArray[li + 4] = posArray[j3 + 1];
            lPosArray[li + 5] = posArray[j3 + 2];

            const r = accentColor.r * alpha * 0.5;
            const g = accentColor.g * alpha * 0.5;
            const b = accentColor.b * alpha * 0.5;
            lColArray[li] = r; lColArray[li + 1] = g; lColArray[li + 2] = b;
            lColArray[li + 3] = r; lColArray[li + 4] = g; lColArray[li + 5] = b;

            lineIdx++;
          }
        }
        lineGeo.setDrawRange(0, lineIdx * 2);
        (lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (lineGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

        // Subtle camera sway
        camera.position.x += (mouseWorld.x * 0.02 - camera.position.x) * 0.01;
        camera.position.y += (mouseWorld.y * 0.02 - camera.position.y) * 0.01;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };

      animate();

      // ── Event listeners ────────────────────────────────────────────────────
      const onMouseMove = (e: MouseEvent) => {
        mouse.x = e.clientX / width;
        mouse.y = e.clientY / height;
      };

      const onResize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };

      // Pause animation when tab is hidden — saves CPU and battery
      const onVisibilityChange = () => {
        if (document.hidden) {
          cancelAnimationFrame(animationId);
        } else {
          animate();
        }
      };

      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      document.addEventListener('visibilitychange', onVisibilityChange);

      // Store cleanup for this scope so the outer cleanup can call it
      container._threeCleanup = () => {
        cancelAnimationFrame(animationId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        renderer.dispose();
        particleGeo.dispose();
        particleMat.dispose();
        lineGeo.dispose();
        lineMat.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(animationId);
      if ((container as any)._threeCleanup) {
        (container as any)._threeCleanup();
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
};

export default React.memo(ParticleField);
