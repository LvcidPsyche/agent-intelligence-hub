import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  UserGroupIcon,
  CheckBadgeIcon,
  ExclamationCircleIcon,
  TrendingUpIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { api } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState({ platform: 'all', sort: 'reputation_score' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAgents();
  }, [filter]);

  const fetchAgents = async () => {
    try {
      setIsLoading(true);
      const params = {
        ...(filter.platform !== 'all' && { platform: filter.platform }),
        sort: filter.sort,
        limit: 100,
      };
      
      const response = await api.getAgents(params);
      setAgents(response.data.agents || []);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const platformStats = {
    moltbook: agents.filter(a => a.platform === 'moltbook').length,
    twitter: agents.filter(a => a.platform === 'twitter').length,
    github: agents.filter(a => a.platform === 'github').length,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Agent Directory</h1>
          <p className="text-gray-400 mt-1">Monitoring {agents.length} agents across platforms</p>
        </div>
        
        <button
          onClick={fetchAgents}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Moltbook Agents</p>
              <p className="text-2xl font-bold text-blue-400">{platformStats.moltbook}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
              🦞
            </div>
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
              <p className="text-gray-400 text-sm">X/Twitter Agents</p>
              <p className="text-2xl font-bold text-purple-400">{platformStats.twitter}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              🐦
            </div>
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
              <p className="text-gray-400 text-sm">GitHub Agents</p>
              <p className="text-2xl font-bold text-green-400">{platformStats.github}</p>
            </div>
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              🐙
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FunnelIcon className="w-5 h-5 text-gray-400" />
            <select
              value={filter.platform}
              onChange={(e) => setFilter({ ...filter, platform: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="all">All Platforms</option>
              <option value="moltbook">Moltbook</option>
              <option value="twitter">X/Twitter</option>
              <option value="github">GitHub</option>
            </select>
          </div>

          <select
            value={filter.sort}
            onChange={(e) => setFilter({ ...filter, sort: e.target.value })}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="reputation_score">By Reputation</option>
            <option value="last_seen">By Activity</option>
            <option value="first_seen">By Age</option>
          </select>
        </div>

        <input
          type="text"
          placeholder="Search agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 w-full md:w-64"
        />
      </div>

      {/* Agents Table */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Platform</th>
                <th>Reputation</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>First Seen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-8">
                    <div className="spinner w-6 h-6 mx-auto mb-2"></div>
                    <span className="text-gray-400">Loading agents...</span>
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    No agents found matching your criteria
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent, index) => (
                  <motion.tr
                    key={`${agent.platform}-${agent.name}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-gray-700/30"
                  >
                    <td>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">{agent.name}</div>
                          {agent.external_id && (
                            <div className="text-xs text-gray-400">ID: {agent.external_id}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                          agent.platform === 'moltbook' ? 'bg-blue-500/20 text-blue-300' :
                          agent.platform === 'twitter' ? 'bg-purple-500/20 text-purple-300' :
                          agent.platform === 'github' ? 'bg-green-500/20 text-green-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {agent.platform}
                        </span>
                      </div>
                    </td>
                    
                    <td>
                      <div className="flex items-center space-x-2">
                        <TrendingUpIcon className="w-4 h-4 text-blue-400" />
                        <span className="font-medium text-white">
                          {agent.reputation_score?.toLocaleString() || '0'}
                        </span>
                      </div>
                    </td>
                    
                    <td>
                      <div className="flex items-center space-x-2">
                        {agent.is_verified ? (
                          <>
                            <CheckBadgeIcon className="w-5 h-5 text-green-400" />
                            <span className="text-green-400 text-sm">Verified</span>
                          </>
                        ) : (
                          <>
                            <ExclamationCircleIcon className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-400 text-sm">Unverified</span>
                          </>
                        )}
                      </div>
                    </td>
                    
                    <td>
                      <span className="text-gray-300 text-sm">
                        {agent.last_seen 
                          ? formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true })
                          : 'Unknown'
                        }
                      </span>
                    </td>
                    
                    <td>
                      <span className="text-gray-300 text-sm">
                        {agent.first_seen 
                          ? formatDistanceToNow(new Date(agent.first_seen), { addSuffix: true })
                          : 'Unknown'
                        }
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}