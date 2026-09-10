import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface FibonacciSphereProps {
  className?: string;
  pointCount?: number;
}

export default function FibonacciSphere({ className = '', pointCount = 6000 }: FibonacciSphereProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
    const count = lowPower ? Math.max(3500, Math.round(pointCount * 0.72)) : pointCount;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 3.25;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    Object.assign(renderer.domElement.style, { display: 'block', height: '100%', width: '100%', touchAction: 'none' });
    container.appendChild(renderer.domElement);

    const positions = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i += 1) {
      const y = 1 - (i / Math.max(count - 1, 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const uniforms = {
      uTime: { value: 0 }, uPointSize: { value: 1.65 * pixelRatio },
      uMouse: { value: new THREE.Vector2() }, uOpen: { value: 0 }, uAspect: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      vertexShader: `
        uniform float uTime;
        uniform float uPointSize;
        uniform vec2 uMouse;
        uniform float uOpen;
        uniform float uAspect;

        void main() {
          vec3 p = position;
          float breathing = sin(p.y * 8.0 + uTime * 0.7) * 0.0025;
          p *= 1.0 + breathing;

          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          vec4 clipPosition = projectionMatrix * mvPosition;
          vec2 screenPosition = clipPosition.xy / clipPosition.w;
          vec2 correctedDelta = screenPosition - uMouse;
          correctedDelta.x *= uAspect;
          float distanceFromMouse = length(correctedDelta);

          float openingRadius = 0.36;
          float influence = 1.0 - smoothstep(openingRadius * 0.15, openingRadius, distanceFromMouse);
          vec2 direction = normalize(correctedDelta + vec2(0.00001));
          direction.x /= uAspect;
          float force = influence * influence;
          float openingStrength = 0.28;
          vec2 displacement = direction * force * openingStrength * uOpen;
          clipPosition.xy += displacement * clipPosition.w;

          float rimCenter = openingRadius * 0.78;
          float rimWidth = openingRadius * 0.12;
          float rim = exp(-pow((distanceFromMouse - rimCenter) / rimWidth, 2.0)) * uOpen;
          clipPosition.xy += direction * rim * 0.035 * clipPosition.w;
          clipPosition.z -= rim * 0.018 * clipPosition.w;
          gl_Position = clipPosition;
          gl_PointSize = uPointSize * (1.0 + rim * 0.35);
        }
      `,
      fragmentShader: `
        void main() {
          float distanceToCenter = length(gl_PointCoord - vec2(0.5));
          float alpha = 1.0 - smoothstep(0.31, 0.5, distanceToCenter);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
      `,
    });
    const sphere = new THREE.Points(geometry, material);
    scene.add(sphere);

    const canvas = renderer.domElement;
    const targetMouse = new THREE.Vector2();
    const currentMouse = new THREE.Vector2();
    let dragging = false; let previousX = 0; let previousY = 0;
    let targetYaw = 0; let targetPitch = 0; let currentYaw = 0; let currentPitch = 0;
    let hoverYaw = 0; let hoverPitch = 0; let targetOpen = 0; let currentOpen = 0;
    const openingStrength = reducedMotion ? 0.28 : 1;
    const updatePointer = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
      targetMouse.set(x, y); hoverYaw = x * 0.14; hoverPitch = -y * 0.09; targetOpen = openingStrength;
      if (dragging) {
        targetYaw += (event.clientX - previousX) * 0.005;
        targetPitch = THREE.MathUtils.clamp(targetPitch + (event.clientY - previousY) * 0.005, -1.25, 1.25);
        previousX = event.clientX; previousY = event.clientY;
      }
    };
    const pointerDown = (event: PointerEvent) => {
      dragging = true; previousX = event.clientX; previousY = event.clientY; targetOpen = openingStrength;
      canvas.style.cursor = 'grabbing'; canvas.setPointerCapture?.(event.pointerId);
    };
    const pointerUp = (event: PointerEvent) => {
      dragging = false; canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    };
    const pointerEnter = () => { targetOpen = openingStrength; };
    const pointerLeave = () => {
      if (dragging) return;
      targetOpen = 0; targetMouse.set(0, 0); hoverYaw = 0; hoverPitch = 0;
    };
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerenter', pointerEnter); canvas.addEventListener('pointerleave', pointerLeave);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.position.z = width < 600 ? 3.65 : 3.25;
      camera.updateProjectionMatrix(); uniforms.uPointSize.value = (width < 600 ? 1.55 : 1.65) * pixelRatio;
      uniforms.uAspect.value = width / height;
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
    const clock = new THREE.Clock(); let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate); uniforms.uTime.value = clock.getElapsedTime();
      if (!dragging && !reducedMotion) targetYaw += 0.0012;
      currentMouse.lerp(targetMouse, 0.07); uniforms.uMouse.value.copy(currentMouse);
      currentOpen += (targetOpen - currentOpen) * 0.075; uniforms.uOpen.value = currentOpen;
      currentYaw += (targetYaw + hoverYaw - currentYaw) * 0.075; currentPitch += (targetPitch + hoverPitch - currentPitch) * 0.075;
      sphere.rotation.set(currentPitch, currentYaw, 0); renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame); resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', updatePointer);
      canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('pointerenter', pointerEnter); canvas.removeEventListener('pointerleave', pointerLeave);
      geometry.dispose(); material.dispose(); renderer.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [pointCount]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', minHeight: 300 }} />;
}
