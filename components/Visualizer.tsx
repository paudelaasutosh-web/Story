import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VisualizerProps {
  prompt: string;
  genre: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ prompt, genre }) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  
  // Clean the prompt to make it URL safe and more effective for the generator
  useEffect(() => {
    if (prompt) {
      // We use pollintaions.ai for immediate, free AI generation based on the prompt
      const seed = Math.floor(Math.random() * 1000);
      
      // Updated to enforce Anime / Fantasy Art Style
      const styleKeywords = "anime art style, vibrant colors, fantasy illustration, studio ghibli inspired, detailed, 4k, digital art, cel shaded";
      const enhancedPrompt = encodeURIComponent(`${styleKeywords}, ${genre} theme, atmospheric, ${prompt}`);
      
      const url = `https://image.pollinations.ai/prompt/${enhancedPrompt}?nologo=true&seed=${seed}&width=1024&height=1024`;
      setImageUrl(url);
    }
  }, [prompt, genre]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#1a1a1a]">
      <AnimatePresence mode="wait">
        <motion.div
          key={imageUrl}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            transition: { duration: 0.4, ease: "easeOut" } // Sped up
          }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 w-full h-full"
        >
          {/* Removed Grayscale/Sepia filters to allow vibrant anime colors */}
          <motion.img
            src={imageUrl}
            alt="Story Visualization"
            className="w-full h-full object-cover"
            animate={{ 
              scale: [1, 1.15],
              x: ["0%", "2%"],
            }}
            transition={{ 
              duration: 20, 
              repeat: Infinity, 
              repeatType: "reverse", 
              ease: "linear" 
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Cinematic Overlays - Adjusted for Anime look */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
      
      {/* Subtle Grain Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/noise.png')]"></div>
    </div>
  );
};

export default Visualizer;