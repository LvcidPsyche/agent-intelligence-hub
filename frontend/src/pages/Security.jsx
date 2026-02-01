import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  BugAntIcon,
  EyeIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { api } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

const severityConfig = {
  high: {
    color: 'red',
    bg: 'bg-red-900/30',
    border: 'border-red-700',
    text: 'text-red-100',
    icon: ExclamationTriangleIcon,
  },
  medium: {
    color: 'yellow',
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-700',
    text: 'text-yellow-100',
    icon: ExclamationTriangleIcon,
  },
  low: {
    color: 'blue',
    bg: 'bg-blue-900/30',
    border: 'border-blue-700',
    text: 'text-blue-100',
    icon: BugAntIcon,
  },
};

export default function Security() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchSecurityData();
  }, [filter]);

  const fetchSecurityData = async () => {
    try {
      setIsLoading(true);
      const [alertsResponse, statsResponse] = await Promise.all([
        api.getSecurityAlerts({ 
          severity: filter !== 'all' ? filter : undefined,
          resolved: false 
        }),
        api.getStats(),
      ]);
      
      setAlerts(alertsResponse.data.alerts || []);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Failed to fetch security data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const securitySummary = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  const filterOptions = [
    { value: 'all', label: 'All Alerts', count: securitySummary.total },
    { value: 'high', label: 'High Priority', count: securitySummary.high },
    { value: 'medium', label: 'Medium Priority', count: securitySummary.medium },
    { value: 'low', label: 'Low Priority', count: securitySummary.low },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Security Intelligence</h1>
          <p className="text-gray-400 mt-1">Monitoring threats across the agent ecosystem</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={fetchSecurityData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? 'Scanning...' : 'Refresh Scan'}
          </button>
        </div>
      </div>

      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Threats</p>
              <p className="text-2xl font-bold text-white">{securitySummary.total}</p>
            </div>
            <ExclamationTriangleIcon className="w-8 h-8 text-orange-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">High Priority</p>
              <p className="text-2xl font-bold text-red-400">{securitySummary.high}</p>
            </div>
            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Skills Monitored</p>
              <p className="text-2xl font-bold text-blue-400">286</p>
            </div>
            <EyeIcon className="w-8 h-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">System Status</p>
              <p className="text-lg font-bold text-green-400">SECURE</p>
            </div>
            <ShieldCheckIcon className="w-8 h-8 text-green-500" />
          </div>
        </motion.div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg border border-gray-700">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              filter === option.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {option.label}
            {option.count > 0 && (
              <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                filter === option.value ? 'bg-blue-500' : 'bg-gray-600'
              }`}>
                {option.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Security Alerts */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-gray-800 rounded-xl border border-gray-700"
      >
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Active Security Alerts</h3>
          <p className="text-gray-400 text-sm mt-1">
            Real-time threat detection across the agent ecosystem
          </p>
        </div>
        
        <div className="divide-y divide-gray-700">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="spinner w-8 h-8 mx-auto mb-4"></div>
              <p className="text-gray-400">Scanning for threats...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheckIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-green-500 font-semibold">No Active Threats</p>
              <p className="text-gray-400 text-sm mt-2">
                All monitored systems are secure
              </p>
            </div>
          ) : (
            alerts.map((alert, index) => {
              const config = severityConfig[alert.severity] || severityConfig.low;
              const IconComponent = config.icon;
              
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-6 hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex items-start space-x-4">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} ${config.border} border flex items-center justify-center`}>
                      <IconComponent className={`w-5 h-5 text-${config.color}-500`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white font-semibold">{alert.title}</h4>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-400">
                            {alert.type}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-gray-300 mt-1">{alert.description}</p>
                      
                      {alert.metadata && (
                        <div className="mt-3 p-3 bg-gray-900 rounded-lg">
                          <div className="text-xs text-gray-400 space-y-1">
                            {alert.metadata.skill_name && (
                              <div>
                                <span className="font-medium">Skill:</span> {alert.metadata.skill_name}
                              </div>
                            )}
                            {alert.metadata.pattern && (
                              <div>
                                <span className="font-medium">Pattern:</span>{' '}
                                <code className="bg-gray-800 px-2 py-1 rounded text-red-400">
                                  {alert.metadata.pattern}
                                </code>
                              </div>
                            )}
                            {alert.metadata.matches && (
                              <div>
                                <span className="font-medium">Matches:</span>{' '}
                                {alert.metadata.matches.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2 text-xs text-gray-400">
                          <ClockIcon className="w-4 h-4" />
                          <span>
                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                            Resolve
                          </button>
                          <button className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>

      {/* Security Recommendations */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      >
        <h3 className="text-xl font-semibold text-white mb-4">Security Recommendations</h3>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
            <CheckCircleIcon className="w-5 h-5 text-blue-400" />
            <span className="text-blue-100">Implement skill signature verification</span>
          </div>
          
          <div className="flex items-center space-x-3 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-100">Enable ClawdHub skill sandboxing</span>
          </div>
          
          <div className="flex items-center space-x-3 p-3 bg-green-900/30 border border-green-700 rounded-lg">
            <ShieldCheckIcon className="w-5 h-5 text-green-400" />
            <span className="text-green-100">Set up automated security monitoring</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}