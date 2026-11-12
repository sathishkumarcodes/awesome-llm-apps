import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

class HoldingsService {
  constructor() {
    this.axios = axios.create({
      withCredentials: true,
      timeout: 10000
    });
  }

  async getHoldings() {
    try {
      console.log('🔍 HoldingsService - Fetching holdings from:', `${API}/holdings`);
      const response = await this.axios.get(`${API}/holdings`, {
        timeout: 8000, // Reduced to 8s for faster fail
        withCredentials: true
      });
      console.log('✅ HoldingsService - API Response:', {
        status: response.status,
        data: response.data,
        isArray: Array.isArray(response.data),
        length: response.data?.length,
        firstItem: response.data?.[0]
      });
      return response.data;
    } catch (error) {
      console.error('❌ HoldingsService - Error fetching holdings:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      // Return empty array instead of throwing to prevent breaking the UI
      return [];
    }
  }

  async getPortfolioSummary() {
    try {
      const response = await this.axios.get(`${API}/holdings/portfolio/summary`);
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio summary:', error);
      throw error;
    }
  }

  async addHolding(holdingData) {
    try {
      const response = await this.axios.post(`${API}/holdings`, holdingData);
      return response.data;
    } catch (error) {
      console.error('Error adding holding:', error);
      throw error;
    }
  }

  async updateHolding(holdingId, updateData) {
    try {
      const response = await this.axios.put(`${API}/holdings/${holdingId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('Error updating holding:', error);
      throw error;
    }
  }

  async deleteHolding(holdingId) {
    try {
      const response = await this.axios.delete(`${API}/holdings/${holdingId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting holding:', error);
      throw error;
    }
  }

  async searchSymbol(symbol) {
    try {
      const response = await this.axios.get(`${API}/holdings/search/${symbol}`);
      return response.data;
    } catch (error) {
      console.error('Error searching symbol:', error);
      throw error;
    }
  }

  // Transform holdings data for charts and analysis
  calculateAllocation(holdings) {
    if (!holdings || holdings.length === 0) {
      return {
        assetAllocation: [],
        sectorAllocation: []
      };
    }

    // Calculate asset type allocation
    const assetTypes = {};
    const sectors = {};
    let totalValue = 0;

    holdings.forEach(holding => {
      const value = holding.total_value || 0;
      totalValue += value;

      // Asset allocation
      if (!assetTypes[holding.type]) {
        assetTypes[holding.type] = 0;
      }
      assetTypes[holding.type] += value;

      // Sector allocation
      const sector = holding.sector || 'Other';
      if (!sectors[sector]) {
        sectors[sector] = 0;
      }
      sectors[sector] += value;
    });

    // Convert to chart format
    const assetAllocation = Object.entries(assetTypes).map(([type, value]) => ({
      type: this.formatAssetType(type),
      value: value,
      percentage: ((value / totalValue) * 100),
      color: this.getAssetTypeColor(type)
    }));

    const sectorAllocation = Object.entries(sectors).map(([sector, value]) => ({
      sector: sector,
      value: value,
      percentage: ((value / totalValue) * 100),
      color: this.getSectorColor(sector)
    }));

    return {
      assetAllocation,
      sectorAllocation
    };
  }

  formatAssetType(type) {
    switch (type) {
      case 'stock': return 'Stocks';
      case 'crypto': return 'Crypto';
      case 'roth_ira': return 'Roth IRA';
      default: return type;
    }
  }

  getAssetTypeColor(type) {
    switch (type) {
      case 'stock': return '#059669';
      case 'crypto': return '#dc2626';
      case 'roth_ira': return '#7c3aed';
      default: return '#6b7280';
    }
  }

  getSectorColor(sector) {
    const colors = [
      '#3b82f6', '#dc2626', '#7c3aed', '#059669', '#f59e0b',
      '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899'
    ];
    
    // Simple hash function to consistently assign colors
    let hash = 0;
    for (let i = 0; i < sector.length; i++) {
      hash = sector.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Generate performance history from holdings (simplified)
  generatePerformanceHistory(holdings, portfolioSummary) {
    // This is a simplified version - in a real app, you'd store historical data
    const today = new Date();
    const history = [];
    
    // Use safe defaults if no data
    const baseValue = portfolioSummary?.total_cost || 100000;
    const currentValue = portfolioSummary?.total_value || baseValue;
    const growth = currentValue > 0 ? (currentValue - baseValue) / baseValue : 0;
    
    for (let i = 8; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      
      // Simulate gradual growth over time
      const progressFactor = (8 - i) / 8;
      const historicalValue = baseValue + (growth * baseValue * progressFactor);
      
      history.push({
        date: date.toISOString().split('T')[0],
        portfolio: Math.max(historicalValue, baseValue * 0.8), // Minimum 80% of cost
        spy: baseValue * (1 + (progressFactor * 0.15)) // Assume 15% SPY growth
      });
    }
    
    return history;
  }
}

export default new HoldingsService();