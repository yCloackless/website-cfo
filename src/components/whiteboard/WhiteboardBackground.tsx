import React from 'react';
import { useEditor, useValue } from 'tldraw';

export type WhiteboardBackgroundType =
  | 'pure_black'
  | 'dark_gray'
  | 'white'
  | 'dots'
  | 'grid'
  | 'large_grid'
  | 'ruled';

interface WhiteboardBackgroundProps {
  backgroundType: WhiteboardBackgroundType;
}

export const WhiteboardBackground: React.FC<WhiteboardBackgroundProps> = ({ backgroundType }) => {
  const editor = useEditor();
  const camera = useValue('camera', () => editor.getCamera(), [editor]);

  const bgStyle = React.useMemo(() => {
    if (backgroundType === 'white') {
      return {
        backgroundColor: '#ffffff',
      };
    }

    const baseColor = backgroundType === 'dark_gray' ? '#121214' : '#000000';

    if (backgroundType === 'pure_black' || backgroundType === 'dark_gray') {
      return {
        backgroundColor: baseColor,
      };
    }

    if (backgroundType === 'dots') {
      const step = 24 * camera.z;
      return {
        backgroundColor: '#000000',
        backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.28) 1.2px, transparent 1.2px)',
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      };
    }

    if (backgroundType === 'grid') {
      const step = 24 * camera.z;
      return {
        backgroundColor: '#000000',
        backgroundImage: `
          linear-gradient(to right, rgba(255, 255, 255, 0.09) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.09) 1px, transparent 1px)
        `,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      };
    }

    if (backgroundType === 'large_grid') {
      const step = 48 * camera.z;
      return {
        backgroundColor: '#000000',
        backgroundImage: `
          linear-gradient(to right, rgba(255, 255, 255, 0.11) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.11) 1px, transparent 1px)
        `,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      };
    }

    if (backgroundType === 'ruled') {
      const lineStep = 32 * camera.z;
      const marginX = 80 * camera.z + camera.x;
      return {
        backgroundColor: '#000000',
        backgroundImage: `
          linear-gradient(to bottom, rgba(255, 255, 255, 0.14) 1px, transparent 1px),
          linear-gradient(to right, rgba(239, 68, 68, 0.25) 1.5px, transparent 1.5px)
        `,
        backgroundSize: `100% ${lineStep}px, 100% 100%`,
        backgroundPosition: `0px ${camera.y}px, ${marginX}px 0px`,
      };
    }

    return { backgroundColor: '#000000' };
  }, [backgroundType, camera.x, camera.y, camera.z]);

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none transition-colors duration-150"
      style={{ ...bgStyle, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
};
