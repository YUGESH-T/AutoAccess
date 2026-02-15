import React, { useEffect, useRef } from 'react';

/**
 * Liquid Grid Background — reactive dot grid that warps away from the cursor.
 * Purely decorative, aria-hidden.
 */
const LiquidGrid: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const spacing = 40;
    const rows = Math.ceil(height / spacing);
    const cols = Math.ceil(width / spacing);
    const points: { x: number; y: number; originX: number; originY: number }[] = [];

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * spacing;
        const y = j * spacing;
        points.push({ x, y, originX: x, originY: y });
      }
    }

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#1a1a1a';

      points.forEach((p) => {
        const dx = mouseX - p.originX;
        const dy = mouseY - p.originY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const force = Math.max(0, 100 - distance) / 100;
        const angle = Math.atan2(dy, dx);
        const move = force * 20;

        p.x = p.originX - Math.cos(angle) * move;
        p.y = p.originY - Math.sin(angle) * move;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fill();
      });

      // Store the latest frame ID so cleanup can cancel the correct one
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none opacity-40"
    />
  );
};

export default LiquidGrid;
