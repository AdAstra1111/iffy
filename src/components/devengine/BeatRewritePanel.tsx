import React, { useState } from 'react';

interface BeatProps {
  number: number;
  name: string;
  turningPoint: boolean;
  scene: string;
  status: 'idle' | 'pending' | 'done';
  onRewrite: () => void;
}

const Beat: React.FC<BeatProps> = ({ number, name, turningPoint, scene, status, onRewrite }) => {
  return (
    <div>
      <p>Beat {number}: {name} — {turningPoint ? 'Yes' : 'No'} — {scene} <button onClick={onRewrite}>Rewrite</button></p>
      <p>Status: {status}</p>
    </div>
  );
};

const BeatRewritePanel: React.FC = () => {
  const [beats, setBeats] = useState<BeatProps[]>([
    { number: 1, name: 'Opening Image', turningPoint: false, scene: 'Scene 1', status: 'idle', onRewrite: () => {}},
    // Add more beats as needed...
  ]);

  const handleRewrite = (index: number) => {
    // Implement rewrite logic
    console.log(`Rewriting beat ${index}`);
    setBeats(current => current.map((beat, idx) => idx === index ? { ...beat, status: 'pending' } : beat));
  };

  return (
    <div>
      <h3>Beat Rewrite Panel</h3>
      {beats.map((beat, index) => (
        <Beat key={index} {...beat} onRewrite={() => handleRewrite(index)}/>
      ))}
    </div>
  );
};

export default BeatRewritePanel;