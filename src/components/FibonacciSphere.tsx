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
      uMouse: { value: new THREE.Vector2() }, uInteraction: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      vertexShader: `
        uniform float uTime; uniform float uPointSize; uniform vec2 uMouse; uniform float uInteraction;
        void main() {
          vec3 p = position;
          float ambient = sin(p.y * 11.0 + uTime * 0.75) * 0.004 + sin(p.x * 9.0 - uTime * 0.55) * 0.003;
          float influence = smoothstep(0.9, 0.0, distance(p.xy, uMouse * 0.7));
          float deformation = influence * sin(uTime * 1.8 + p.z * 7.0 + p.y * 4.0) * 0.018 * uInteraction;
          p *= 1.0 + ambient + deformation;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition; gl_PointSize = uPointSize;
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
    let hoverYaw = 0; let hoverPitch = 0; let targetInteraction = 0; let currentInteraction = 0;
    const updatePointer = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
      targetMouse.set(x, y); hoverYaw = x * 0.14; hoverPitch = -y * 0.09; targetInteraction = reducedMotion ? 0.12 : 1;
      if (dragging) {
        targetYaw += (event.clientX - previousX) * 0.005;
        targetPitch = THREE.MathUtils.clamp(targetPitch + (event.clientY - previousY) * 0.005, -1.25, 1.25);
        previousX = event.clientX; previousY = event.clientY;
      }
    };
    const pointerDown = (event: PointerEvent) => {
      dragging = true; previousX = event.clientX; previousY = event.clientY; targetInteraction = reducedMotion ? 0.12 : 1;
      canvas.style.cursor = 'grabbing'; canvas.setPointerCapture?.(event.pointerId);
    };
    const pointerUp = (event: PointerEvent) => {
      dragging = false; canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    };
    const pointerEnter = () => { targetInteraction = reducedMotion ? 0.12 : 1; };
    const pointerLeave = () => {
      if (dragging) return;
      targetInteraction = 0; targetMouse.set(0, 0); hoverYaw = 0; hoverPitch = 0;
    };
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerenter', pointerEnter); canvas.addEventListener('pointerleave', pointerLeave);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.position.z = width < 600 ? 3.65 : 3.25;
      camera.updateProjectionMatrix(); uniforms.uPointSize.value = (width < 600 ? 1.55 : 1.65) * pixelRatio;
    };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize();
    const clock = new THREE.Clock(); let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate); uniforms.uTime.value = clock.getElapsedTime();
      if (!dragging && !reducedMotion) targetYaw += 0.0012;
      currentMouse.lerp(targetMouse, 0.07); uniforms.uMouse.value.copy(currentMouse);
      currentInteraction += (targetInteraction - currentInteraction) * 0.06; uniforms.uInteraction.value = currentInteraction;
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
