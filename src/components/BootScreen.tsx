import React from 'react';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';

export default function BootScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050A15] px-6 text-white">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center"
      >
        <Activity className="mb-3 h-16 w-16 text-cyan-400 drop-shadow-[0_0_20px_rgba(0,229,255,0.4)]" />
        <h1 className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-3xl font-black tracking-widest text-transparent sm:text-4xl">
          VELOX
        </h1>
        <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
          GPS Speedometer
        </p>
      </motion.div>
    </div>
  );
}
