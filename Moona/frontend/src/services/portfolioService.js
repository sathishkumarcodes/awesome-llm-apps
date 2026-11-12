import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const portfolioService = {
  async getSummary() {
    try {
      const response = await axios.get(`${API}/portfolio/summary`, {
        withCredentials: true,
        timeout: 8000 // Reduced to 8s for faster fail
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio summary:', error);
      throw error;
    }
  },

  async getPerformance() {
    try {
      const response = await axios.get(`${API}/portfolio/performance`, {
        withCredentials: true,
        timeout: 10000 // Reduced to 10s
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio performance:', error);
      throw error;
    }
  },

  async getAllocation() {
    try {
      const response = await axios.get(`${API}/portfolio/allocation`, {
        withCredentials: true,
        timeout: 10000 // Reduced to 10s
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching portfolio allocation:', error);
      throw error;
    }
  },

  async getSPYComparison(assetTypes = []) {
    try {
      const params = assetTypes.length > 0 ? { asset_types: assetTypes.join(',') } : {};
      const response = await axios.get(`${API}/portfolio/spy-comparison`, {
        params,
        withCredentials: true,
        timeout: 12000 // Reduced to 12s
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching SPY comparison:', error);
      throw error;
    }
  },

  async getBenchmarkComparison(benchmarkId, fromDate, toDate, weights = null, adjustForInflation = false) {
    try {
      const params = {
        benchmark_id: benchmarkId,
        from_date: fromDate,
        to_date: toDate,
        adjust_for_inflation: adjustForInflation ? 'true' : 'false'
      };
      
      if (weights && benchmarkId === 'CUSTOM') {
        params.weights = JSON.stringify(weights);
      }
      
      const response = await axios.get(`${API}/portfolio/benchmark`, {
        params,
        withCredentials: true,
        timeout: 20000 // Longer timeout for historical data
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching benchmark comparison:', error);
      throw error;
    }
  },

  async getDailyInsight(date = null) {
    try {
      const params = date ? { date } : {};
      const response = await axios.get(`${API}/insights/daily`, {
        params,
        withCredentials: true,
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching daily insight:', error);
      throw error;
    }
  },

  async getWeeklyInsight() {
    try {
      const response = await axios.get(`${API}/insights/weekly`, {
        withCredentials: true,
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching weekly insight:', error);
      throw error;
    }
  },

  async calculateProjections(projectionInput) {
    try {
      const response = await axios.post(`${API}/portfolio/projections`, projectionInput, {
        withCredentials: true,
        timeout: 30000 // Longer timeout for Monte Carlo simulation
      });
      return response.data;
    } catch (error) {
      console.error('Error calculating projections:', error);
      throw error;
    }
  },

  async getTopPerformers(limit = 5) {
    try {
      const response = await axios.get(`${API}/portfolio/top-performers?limit=${limit}`, {
        withCredentials: true,
        timeout: 8000 // Reduced to 8s
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching top performers:', error);
      throw error;
    }
  }
};

export default portfolioService;

