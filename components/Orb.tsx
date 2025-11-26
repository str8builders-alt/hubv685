import React, { useEffect, useRef } from 'react';

interface OrbProps {
  active: boolean;
  speaking: boolean;
}

const Orb: React.FC<OrbProps> = ({ active, speaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    const render = () => {
      t += 0.01;
      // Clear with transparency
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Dynamic radius based on speaking state
      const baseRadius = active ? 100 : 80;
      const pulse = speaking ? Math.sin(t * 10) * 15 : Math.sin(t * 2) * 5;
      const radius = baseRadius + pulse;

      // Draw Core
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.8, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      
      // Green tradie theme
      if (active) {
        gradient.addColorStop(0, 'rgba(74, 222, 128, 0.2)'); // inner light
        gradient.addColorStop(0.5, 'rgba(74, 222, 128, 0.6)'); // mid
        gradient.addColorStop(1, 'rgba(74, 222, 128, 0)'); // outer fade
      } else {
         gradient.addColorStop(0, 'rgba(100, 100, 100, 0.1)');
         gradient.addColorStop(1, 'rgba(100, 100, 100, 0)');
      }
      
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw Swirling Lines (The "Siri" look but green)
      if (active) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#4ade80';
        
        for (let i = 0; i < 3; i++) {
           ctx.beginPath();
           for (let x = 0; x < canvas.width; x+=5) {
               const yOffset = Math.sin((x * 0.01) + t * (2 + i) + i) * (20 + (speaking ? 20 : 0));
               const y = centerY + yOffset;
               if (x===0) ctx.moveTo(x, y);
               else ctx.lineTo(x, y);
           }
           ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [active, speaking]);

  return (
    <div className="relative flex justify-center items-center">
      <div className={`absolute inset-0 bg-green-500 blur-[100px] opacity-20 rounded-full transition-opacity duration-1000 ${active ? 'opacity-30' : 'opacity-5'}`}></div>
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={400} 
        className="w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] z-10"
      />
    </div>
  );
};

export default Orb;
