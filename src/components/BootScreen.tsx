import React from 'react';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';

export default function BootScreen() {
  return (
    <div className="fixed inset-0 bg-slate-900 text-white flex flex-col items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        <Activity className="w-20 h-20 text-blue-500 mb-4" />
        <h1 className="text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          VELOX
        </h1>
        <p className="text-slate-400 mt-2 tracking-widest text-sm uppercase">GPS Speedometer</p>
      </motion.div>
    </div>
  );
}
