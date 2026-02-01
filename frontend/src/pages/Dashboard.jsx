import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  FireIcon,
  TrendingUpIcon,
  ClockIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useSystemStats } from '../hooks/useSystemStats';
import { useTrends } from '../hooks/useTrends';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

export default function Dashboard() {
  const { stats, isLoading: statsLoading } = useSystemStats();
  const { trends, isLoading: trendsLoading } = useTrends();
  const { lastUpdate, connectionStatus } = useRealtimeUpdates();

  const statCards = [
    {
      name: 'Active Agents',
      value: stats?.agents || 0,
      change: '+12%',
      changeType: 'increase',
      icon: UserGroupIcon,
      color: 'blue',
    },
    {
      name: 'Posts Monitored',
      value: stats?.posts || 0,
      change: '+8%',
      changeType: 'increase',
      icon: ChartBarIcon,
      color: 'green',
    },
    {
      name: 'Security Alerts',
      value: stats?.securityAlerts || 0,
      change: stats?.securityAlerts > 0 ? 'Active' : 'Clear',
      changeType: stats?.securityAlerts > 0 ? 'decrease' : 'increase',
      icon: ShieldCheckIcon,
      color: stats?.securityAlerts > 0 ? 'red' : 'green',
    },
    {
      name: 'Data Sources',
      value: '4',
      change: 'Online',
      changeType: 'increase',
      icon: GlobeAltIcon,
      color: 'purple',
    },
  ];

  // Sample activity data - in production, this would come from the API
  const activityData = [
    { time: '00:00', posts: 45, agents: 120 },
    { time: '04:00', posts: 67, agents: 134 },
    { time: '08:00', posts: 89, agents: 156 },
    { time: '12:00', posts: 123, agents: 178 },
    { time: '16:00', posts: 98, agents: 167 },
    { time: '20:00', posts: 145, agents: 189 },
  ];

  const platformData = [
    { name: 'Moltbook', value: 65, color: '#3B82F6' },
    { name: 'X/Twitter', value: 25, color: '#EF4444' },
    { name: 'GitHub', value: 8, color: '#10B981' },
    { name: 'Other', value: 2, color: '#6B7280' },
  ];

  return (
    <div className="space-y-8">
      {/* Header with Real-time Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Intelligence Dashboard</h1>
          <p className="text-gray-400 mt-1">Real-time monitoring of the agent ecosystem</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm">
            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
            <span className="text-gray-300">{connectionStatus}</span>
          </div>
          
          {lastUpdate && (
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <ClockIcon className="w-4 h-4" />
              <span>Last update: {new Date(lastUpdate).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((item, index) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="bg-gray-800 rounded-xl p-6 border border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-lg bg-${item.color}-500/20 flex items-center justify-center`}>
                  <item.icon className={`w-6 h-6 text-${item.color}-500`} />
                </div>
                <div>
                  <p className="text-gray-400 text-sm font-medium">{item.name}</p>
                  <p className="text-2xl font-bold text-white">{item.value.toLocaleString()}</p>
                </div>
              </div>
              <div className={`flex items-center text-sm ${
                item.changeType === 'increase' ? 'text-green-500' : 'text-red-500'
              }`}>
                <span className="font-medium">{item.change}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Activity Timeline */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">24-Hour Activity</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-gray-400">Posts</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-gray-400">Active Agents</span>
              </div>
            </div>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }} 
                />
                <Line type="monotone" dataKey="posts" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 4 }} />
                <Line type="monotone" dataKey="agents" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Platform Distribution */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <h3 className="text-xl font-semibold text-white mb-6">Platform Distribution</h3>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}%`}
                  labelStyle={{ fill: '#F9FAFB', fontSize: 12 }}
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F9FAFB'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Bottom Row - Trending & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Trending Agents */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Trending Agents</h3>
            <FireIcon className="w-6 h-6 text-orange-500" />
          </div>
          
          <div className="space-y-4">
            {trends?.topAgents?.slice(0, 5).map((agent, index) => (
              <div key={agent.name} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-500 text-black' : 
                    index === 1 ? 'bg-gray-400 text-black' :
                    index === 2 ? 'bg-amber-600 text-white' : 'bg-gray-600 text-white'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">{agent.name}</p>
                    <p className="text-gray-400 text-sm">{agent.platform}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">{agent.reputation_score}</p>
                  <p className="text-gray-400 text-sm">{agent.recent_posts} posts</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Security Alerts */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white">Security Status</h3>
            <ExclamationTriangleIcon className={`w-6 h-6 ${stats?.securityAlerts > 0 ? 'text-red-500' : 'text-green-500'}`} />
          </div>
          
          {stats?.securityAlerts === 0 ? (
            <div className="text-center py-8">
              <ShieldCheckIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-green-500 font-semibold">All Systems Secure</p>
              <p className="text-gray-400 text-sm mt-2">No active security alerts</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
                  <div>
                    <p className="text-red-400 font-semibold">High Priority Alert</p>
                    <p className="text-red-300 text-sm">ClawdHub skill security vulnerability detected</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}