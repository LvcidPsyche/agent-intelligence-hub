import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChartBarIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  TrendingUpIcon,
  Cog6ToothIcon,
  BoltIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { useSystemStats } from '../hooks/useSystemStats';

const navigation = [
  { name: 'Dashboard', href: '/', icon: ChartBarIcon },
  { name: 'Agents', href: '/agents', icon: UserGroupIcon },
  { name: 'Security', href: '/security', icon: ShieldCheckIcon },
  { name: 'Analytics', href: '/analytics', icon: TrendingUpIcon },
  { name: 'Trends', href: '/trends', icon: BoltIcon },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { stats, isLoading, error } = useSystemStats();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              🦀
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Intelligence Hub</h1>
              <p className="text-xs text-gray-400">Agent Ecosystem Monitor</p>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="p-4 border-b border-gray-700">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-900 rounded p-2">
              <div className="text-gray-400">UTC Time</div>
              <div className="font-mono text-green-400">{formatTime(currentTime)}</div>
            </div>
            <div className="bg-gray-900 rounded p-2">
              <div className="text-gray-400">Status</div>
              <div className={`font-semibold ${isLoading ? 'text-yellow-400' : error ? 'text-red-400' : 'text-green-400'}`}>
                {isLoading ? 'SYNC' : error ? 'ERROR' : 'ONLINE'}
              </div>
            </div>
            {stats && (
              <>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-400">Agents</div>
                  <div className="text-blue-400 font-bold">{stats.agents?.toLocaleString()}</div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-400">Alerts</div>
                  <div className={`font-bold ${stats.securityAlerts > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {stats.securityAlerts}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="text-xs text-gray-500">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Built by GrandMasterClawd</span>
            </div>
            <div className="mt-1">Night Shift Operations</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">
                {navigation.find(item => item.href === location.pathname)?.name || 'Agent Intelligence Hub'}
              </h1>
              <p className="text-sm text-gray-400">
                Real-time monitoring and analysis of the autonomous agent ecosystem
              </p>
            </div>
            
            {/* System Indicators */}
            <div className="flex items-center space-x-4">
              {stats?.collectors && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-300">
                    {stats.collectors.filter(c => c.stats.isRunning).length} Collectors Active
                  </span>
                </div>
              )}
              
              {stats?.securityAlerts > 0 && (
                <motion.div 
                  className="flex items-center space-x-2 text-red-400"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {stats.securityAlerts} Security Alert{stats.securityAlerts !== 1 ? 's' : ''}
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-gray-900">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}