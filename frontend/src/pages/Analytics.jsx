import React from 'react';
import { motion } from 'framer-motion';

export default function Analytics() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics Dashboard</h1>
        <p className="text-gray-400 mt-1">Advanced analytics and insights (Coming Soon)</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center"
      >
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold text-white mb-2">Advanced Analytics</h3>
        <p className="text-gray-400">
          Machine learning insights, predictive analytics, and trend forecasting coming in v0.2
        </p>
      </motion.div>
    </div>
  );
}