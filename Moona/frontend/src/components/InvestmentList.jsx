import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search, Filter, TrendingUp, TrendingDown, Edit3, Trash2, MoreVertical, Wallet } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const InvestmentList = ({ investments, onEdit, onDelete, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [sortBy, setSortBy] = useState('value');
  const [deletingId, setDeletingId] = useState(null);
  const [minReturnFilter, setMinReturnFilter] = useState(null);
  const [showDebug, setShowDebug] = useState(true); // Show debug panel by default
  const { toast } = useToast();

  // Listen for filter events from QuickInsights
  useEffect(() => {
    const handleFilterHoldings = (event) => {
      const filter = event.detail;
      if (filter.minReturn !== undefined) {
        setMinReturnFilter(filter.minReturn);
        // Clear other filters when applying return filter
        setFilterType('all');
        setFilterPlatform('all');
        setSearchTerm('');
      }
    };

    window.addEventListener('filterHoldings', handleFilterHoldings);
    return () => window.removeEventListener('filterHoldings', handleFilterHoldings);
  }, []);

  // Safety check for investments
  const safeInvestments = investments || [];
  
  // Debug logging
  useEffect(() => {
    console.log('InvestmentList - investments:', investments);
    console.log('InvestmentList - safeInvestments:', safeInvestments);
    console.log('InvestmentList - safeInvestments.length:', safeInvestments.length);
    console.log('InvestmentList - isLoading:', isLoading);
    if (safeInvestments.length > 0) {
      console.log('InvestmentList - First investment:', safeInvestments[0]);
    }
  }, [investments, isLoading, safeInvestments]);
  
  // Get unique platforms for filtering
  const uniquePlatforms = [...new Set(safeInvestments.map(inv => inv?.platform).filter(Boolean))].sort();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const formatAssetTypeName = (type) => {
    const names = {
      'stock': 'Stocks',
      'stocks': 'Stocks',
      'crypto': 'Crypto',
      'cryptocurrency': 'Crypto',
      'cash': 'Cash',
      'hysa': 'HYSA',
      'bank': 'Bank Account',
      'home_equity': 'Home Equity',
      'home equity': 'Home Equity',
      'roth_ira': 'Roth IRA',
      'roth ira': 'Roth IRA',
      'etf': 'ETF',
      'bond': 'Bonds',
      '401k': '401(k)',
      '529': '529 Plan',
      'child_roth': "Child's Roth IRA",
      'childs_roth': "Child's Roth IRA",
      'hsa': 'HSA',
      'traditional_ira': 'Traditional IRA',
      'sep_ira': 'SEP IRA',
      'other': 'Other'
    };
    const normalized = type?.toLowerCase().replace(/\s+/g, '_');
    return names[normalized] || type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getChangeColor = (value) => {
    return value >= 0 ? 'text-emerald-600' : 'text-red-600';
  };

  const getChangeBgColor = (value) => {
    return value >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200';
  };

  const handleDelete = async (investment) => {
    if (!window.confirm(`Are you sure you want to delete ${investment.symbol}?`)) {
      return;
    }

    setDeletingId(investment.id);
    try {
      await axios.delete(`${API}/holdings/${investment.id}`, {
        withCredentials: true
      });

      toast({
        title: "Holding Deleted",
        description: `Successfully deleted ${investment.symbol} from your portfolio`,
      });

      if (onDelete) onDelete();
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: error.response?.data?.detail || "Failed to delete holding",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredInvestments = safeInvestments
    .filter(investment => {
      if (!investment) {
        console.warn('⚠️ InvestmentList - Filtered out null/undefined investment');
        return false;
      }
      const matchesSearch = (investment.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (investment.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || investment.type === filterType;
      const matchesPlatform = filterPlatform === 'all' || investment.platform === filterPlatform;
      const matchesMinReturn = minReturnFilter === null || 
        (investment.return_percent || investment.gain_loss_percent || 0) >= minReturnFilter;
      
      const passes = matchesSearch && matchesType && matchesPlatform && matchesMinReturn;
      
      if (!passes) {
        console.log('🔍 InvestmentList - Filtered out:', {
          symbol: investment.symbol,
          name: investment.name,
          matchesSearch,
          matchesType,
          matchesPlatform,
          matchesMinReturn,
          filterType,
          filterPlatform,
          minReturnFilter
        });
      }
      
      return passes;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return (b.total_value || 0) - (a.total_value || 0);
        case 'gainLoss':
          return (b.gain_loss_percent || 0) - (a.gain_loss_percent || 0);
        case 'symbol':
          return (a.symbol || '').localeCompare(b.symbol || '');
        default:
          return 0;
      }
    });
  
  // Debug filtered results
  useEffect(() => {
    console.log('InvestmentList - filteredInvestments.length:', filteredInvestments.length);
    console.log('InvestmentList - searchTerm:', searchTerm);
    console.log('InvestmentList - filterType:', filterType);
    console.log('InvestmentList - filterPlatform:', filterPlatform);
  }, [filteredInvestments.length, searchTerm, filterType, filterPlatform]);

  return (
    <Card className="bg-white/80 dark:bg-[#112334] backdrop-blur-sm border-0 dark:border-[rgba(255,255,255,0.05)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2)] shadow-sm rounded-2xl">
      {/* Debug Panel - Visible in UI */}
      {showDebug && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 m-4 mb-0">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">🔍 Debug Info</h4>
            <button
              onClick={() => setShowDebug(false)}
              className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
            >
              ×
            </button>
          </div>
          <div className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
            <div><strong>Total Holdings from API:</strong> {safeInvestments.length}</div>
            <div><strong>After Filtering:</strong> {filteredInvestments.length}</div>
            <div><strong>Active Filters:</strong></div>
            <div className="ml-4">
              - Search: "{searchTerm || '(none)'}"<br/>
              - Type: {filterType}<br/>
              - Platform: {filterPlatform}<br/>
              - Min Return: {minReturnFilter !== null ? `${minReturnFilter}%` : '(none)'}
            </div>
            {safeInvestments.length > 0 && (
              <div className="mt-2">
                <strong>First Holding:</strong> {safeInvestments[0]?.symbol || 'N/A'} ({safeInvestments[0]?.type || 'N/A'})
              </div>
            )}
            {safeInvestments.length === 0 && (
              <div className="text-red-600 dark:text-red-400 mt-2">
                ⚠️ <strong>No holdings received from API!</strong>
              </div>
            )}
          </div>
        </div>
      )}
      {!showDebug && (
        <div className="p-2 text-center">
          <button
            onClick={() => setShowDebug(true)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Show Debug Info
          </button>
        </div>
      )}
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center gap-3">
            <CardTitle className="text-gray-900 dark:text-slate-200">Investment Holdings</CardTitle>
            {minReturnFilter !== null && (
              <Badge 
                variant="outline" 
                className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              >
                Return &gt; {minReturnFilter}%
                <button
                  onClick={() => setMinReturnFilter(null)}
                  className="ml-2 hover:text-emerald-900 dark:hover:text-emerald-100"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search investments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full sm:w-64"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-32">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="stock">Stocks</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="hysa">HYSA</SelectItem>
                <SelectItem value="bank">Bank Account</SelectItem>
                <SelectItem value="home_equity">Home Equity</SelectItem>
                <SelectItem value="roth_ira">Roth IRA</SelectItem>
                <SelectItem value="etf">ETF</SelectItem>
                <SelectItem value="bond">Bond</SelectItem>
                <SelectItem value="401k">401(k)</SelectItem>
                <SelectItem value="529">529 Plan</SelectItem>
                <SelectItem value="child_roth">Child's Roth IRA</SelectItem>
                <SelectItem value="hsa">HSA</SelectItem>
                <SelectItem value="traditional_ira">Traditional IRA</SelectItem>
                <SelectItem value="sep_ira">SEP IRA</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {uniquePlatforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">By Value</SelectItem>
                <SelectItem value="gainLoss">By Gain/Loss</SelectItem>
                <SelectItem value="symbol">By Symbol</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInvestments.map((investment) => (
              <div
                key={investment.id}
                className="border border-gray-200 rounded-lg p-3 hover:shadow-sm hover:border-gray-300 transition-all duration-200 bg-white"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg flex items-center justify-center border border-blue-100">
                        <span className="text-xs font-bold text-blue-700">
                          {(investment.symbol || '').substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm">{investment.symbol || 'N/A'}</h3>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {formatAssetTypeName(investment.type || 'stock')}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 truncate">{investment.name || investment.symbol || 'Unknown'}</p>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        {investment.sector && (
                          <>
                            <p className="text-xs text-gray-500">{investment.sector}</p>
                            {investment.platform && <span className="text-xs text-gray-400">•</span>}
                          </>
                        )}
                        {investment.platform && (
                          <span className="text-xs text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                            {investment.platform}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 lg:gap-4 mt-2 lg:mt-0">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Asset Type</p>
                      <p className="font-medium text-sm">{formatAssetTypeName(investment.type) || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Platform</p>
                      <p className="font-medium text-sm">{investment.platform || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Cost Basis</p>
                      <p className="font-medium text-sm">{formatCurrency(investment.total_cost || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Current Value</p>
                      <p className="font-semibold text-sm">{formatCurrency(investment.total_value || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Gain/Loss</p>
                      <div className="flex items-center space-x-0.5">
                        {investment.gain_loss >= 0 ? (
                          <TrendingUp className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                        <span className={`font-semibold text-sm ${getChangeColor(investment.gain_loss || 0)}`}>
                          {formatCurrency(investment.gain_loss || 0)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Return %</p>
                      <Badge variant="outline" className={`text-xs px-1.5 py-0 ${getChangeBgColor(investment.gain_loss_percent || 0)}`}>
                        <span className={`flex items-center ${getChangeColor(investment.gain_loss_percent || 0)}`}>
                          {investment.gain_loss_percent >= 0 ? (
                            <TrendingUp className="w-3 h-3 mr-0.5" />
                          ) : (
                            <TrendingDown className="w-3 h-3 mr-0.5" />
                          )}
                          {formatPercent(investment.gain_loss_percent || 0)}
                        </span>
                      </Badge>
                    </div>
                    <div className="flex justify-end items-start">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-100">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => onEdit && onEdit(investment)}
                            className="flex items-center space-x-2 cursor-pointer"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>Edit</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(investment)}
                            disabled={deletingId === investment.id}
                            className="flex items-center space-x-2 cursor-pointer text-red-600 hover:text-red-700"
                          >
                            {deletingId === investment.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filteredInvestments.length === 0 && safeInvestments.length === 0 && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <Wallet className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No investments yet</h3>
              <p className="text-sm text-gray-600 mb-4">
                Start building your portfolio by adding your first investment.
              </p>
            </div>
          </div>
        )}
        
        {!isLoading && filteredInvestments.length === 0 && safeInvestments.length > 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No investments found matching your criteria.</p>
            <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filters.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InvestmentList;