import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Upload, CheckCircle, XCircle, AlertCircle, Loader2, 
  Key, Eye, EyeOff, FileText, Building2
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const PLATFORMS = [
  {
    id: 'robinhood',
    name: 'Robinhood',
    icon: Building2,
    type: 'csv',
    description: 'Import from CSV export file',
    color: 'green'
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    icon: Key,
    type: 'api',
    description: 'Connect using API credentials',
    color: 'blue'
  },
  {
    id: 'binance',
    name: 'Binance',
    icon: Key,
    type: 'api',
    description: 'Connect using API credentials',
    color: 'yellow'
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: Key,
    type: 'wallet',
    description: 'Connect your MetaMask wallet',
    color: 'orange'
  },
  {
    id: 'phantom',
    name: 'Phantom',
    icon: Key,
    type: 'wallet',
    description: 'Connect your Phantom wallet',
    color: 'purple'
  },
  {
    id: 'fidelity',
    name: 'Fidelity',
    icon: Building2,
    type: 'csv',
    description: 'Import from CSV export file',
    color: 'red'
  }
];

const ImportHoldingsModal = ({ onImportComplete }) => {
  const [open, setOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [status, setStatus] = useState(null);
  
  // CSV import (Robinhood)
  const [selectedFile, setSelectedFile] = useState(null);
  
  // API import (Coinbase, Binance)
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [useSandbox, setUseSandbox] = useState(false);
  const [useTestnet, setUseTestnet] = useState(false);
  
  // Wallet (MetaMask/Phantom) - shared state
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [walletBalances, setWalletBalances] = useState([]);
  
  const { toast } = useToast();

  useEffect(() => {
    if (open && selectedPlatform && selectedPlatform !== 'fidelity' && selectedPlatform !== 'robinhood') {
      checkStatus();
    } else if (open && selectedPlatform && (selectedPlatform === 'fidelity' || selectedPlatform === 'robinhood')) {
      // For CSV platforms, check status after a short delay
      const timer = setTimeout(() => checkStatus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, selectedPlatform]);

  const checkStatus = async () => {
    if (!selectedPlatform) return;
    
    setIsCheckingStatus(true);
    try {
      const response = await axios.get(`${API}/${selectedPlatform}/status`, {
        withCredentials: true
      });
      setStatus(response.data);
    } catch (error) {
      console.error(`Error checking ${selectedPlatform} status:`, error);
      setStatus({ connected: false, holdings_count: 0 });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handlePlatformChange = (platformId) => {
    setSelectedPlatform(platformId);
    setSelectedFile(null);
    setApiKey('');
    setApiSecret('');
    setStatus(null);
    setWalletAddress('');
    setWalletBalances([]);
    setUseSandbox(false);
    setUseTestnet(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast({
          title: "Invalid File",
          description: "Please select a CSV file",
          variant: "destructive"
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey || !apiSecret) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both API Key and API Secret",
        variant: "destructive"
      });
      return;
    }

    setIsTestingConnection(true);
    try {
      const endpoint = selectedPlatform === 'coinbase' 
        ? `${API}/coinbase/test-connection`
        : `${API}/binance/test-connection`;
      
      const payload = selectedPlatform === 'coinbase'
        ? { api_key: apiKey, api_secret: apiSecret, sandbox: useSandbox }
        : { api_key: apiKey, api_secret: apiSecret, testnet: useTestnet };

      const response = await axios.post(
        endpoint,
        payload,
        {
          withCredentials: true,
          timeout: 30000
        }
      );

      toast({
        title: "Connection Successful",
        description: response.data.message,
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error.response?.data?.detail || "Failed to connect. Please check your API credentials.",
        variant: "destructive"
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const connectMetaMask = async () => {
    // Check specifically for MetaMask
    if (typeof window.ethereum === 'undefined') {
      toast({
        title: "MetaMask Not Found",
        description: "Please install MetaMask extension to connect your wallet.",
        variant: "destructive"
      });
      return;
    }

    // Check if it's MetaMask specifically (not other wallets)
    const isMetaMask = window.ethereum.isMetaMask === true;
    if (!isMetaMask) {
      toast({
        title: "MetaMask Not Detected",
        description: "Please make sure MetaMask is your default wallet. Other wallets like Phantom are not supported for this option.",
        variant: "destructive"
      });
      return;
    }

    setIsConnectingWallet(true);
    try {
      // Request account access - this will only trigger MetaMask if it's the default
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }

      const address = accounts[0];
      setWalletAddress(address);

      // Get token balances (simplified - in production, you'd want to fetch all tokens)
      // For now, we'll get ETH balance and common tokens
      const balances = [];
      
      // Get ETH balance
      const ethBalance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      
      const ethBalanceFormatted = parseInt(ethBalance, 16) / Math.pow(10, 18);
      if (ethBalanceFormatted > 0) {
        balances.push({
          symbol: 'ETH',
          name: 'Ethereum',
          balance: ethBalanceFormatted,
          chain: 'ethereum'
        });
      }

      // Note: To get ERC-20 token balances, you'd need to:
      // 1. Query the blockchain for token contracts
      // 2. Use a service like Etherscan API or Alchemy
      // 3. For now, we'll just show ETH

      setWalletBalances(balances);

      toast({
        title: "MetaMask Connected",
        description: `Connected to ${address.substring(0, 6)}...${address.substring(38)}`,
      });
    } catch (error) {
      console.error('MetaMask connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to MetaMask",
        variant: "destructive"
      });
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const connectPhantom = async () => {
    // Check specifically for Phantom wallet
    if (typeof window.solana === 'undefined') {
      toast({
        title: "Phantom Not Found",
        description: "Please install Phantom extension to connect your wallet.",
        variant: "destructive"
      });
      return;
    }

    // Check if it's Phantom specifically
    const isPhantom = window.solana.isPhantom === true;
    if (!isPhantom) {
      toast({
        title: "Phantom Not Detected",
        description: "Please make sure Phantom is installed and unlocked.",
        variant: "destructive"
      });
      return;
    }

    setIsConnectingWallet(true);
    try {
      // Connect to Phantom wallet
      const resp = await window.solana.connect();
      const address = resp.publicKey.toString();
      setWalletAddress(address);

      // Get SOL balance
      const balances = [];
      
      try {
        // Get SOL balance using Phantom's RPC
        const connection = new window.solana.connection || null;
        if (connection) {
          const balance = await connection.getBalance(resp.publicKey);
          const solBalance = balance / Math.pow(10, 9); // SOL has 9 decimals
          if (solBalance > 0) {
            balances.push({
              symbol: 'SOL',
              name: 'Solana',
              balance: solBalance,
              chain: 'solana'
            });
          }
        } else {
          // Fallback: try to get balance via Phantom API
          const balance = await window.solana.getBalance();
          if (balance > 0) {
            balances.push({
              symbol: 'SOL',
              name: 'Solana',
              balance: balance / Math.pow(10, 9),
              chain: 'solana'
            });
          }
        }
      } catch (balanceError) {
        console.warn('Could not fetch SOL balance:', balanceError);
        // Still allow connection even if balance fetch fails
        balances.push({
          symbol: 'SOL',
          name: 'Solana',
          balance: 0,
          chain: 'solana'
        });
      }

      // Note: To get SPL token balances, you'd need to:
      // 1. Query Solana RPC for token accounts
      // 2. Use a service like Solana API
      // 3. For now, we'll just show SOL

      setWalletBalances(balances);

      toast({
        title: "Phantom Connected",
        description: `Connected to ${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
      });
    } catch (error) {
      console.error('Phantom connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Phantom",
        variant: "destructive"
      });
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleImport = async () => {
    if (!selectedPlatform) {
      toast({
        title: "No Platform Selected",
        description: "Please select a platform to import from",
        variant: "destructive"
      });
      return;
    }

    const platform = PLATFORMS.find(p => p.id === selectedPlatform);
    if (!platform) return;

    setIsLoading(true);

    try {
      let response;

      if (platform.type === 'csv') {
        // CSV import (Robinhood, Fidelity)
        if (!selectedFile) {
          toast({
            title: "No File Selected",
            description: "Please select a CSV file to import",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);

        const endpoint = selectedPlatform === 'robinhood'
          ? `${API}/robinhood/import/csv`
          : `${API}/fidelity/import/csv`;

        response = await axios.post(
          endpoint,
          formData,
          {
            withCredentials: true,
            headers: {
              'Content-Type': 'multipart/form-data'
            },
            timeout: 60000
          }
        );
      } else if (platform.type === 'api') {
        // API import (Coinbase, Binance)
        if (!apiKey || !apiSecret) {
          toast({
            title: "Missing Credentials",
            description: "Please enter both API Key and API Secret",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        const endpoint = selectedPlatform === 'coinbase'
          ? `${API}/coinbase/connect`
          : `${API}/binance/connect`;
        
        const payload = selectedPlatform === 'coinbase'
          ? { api_key: apiKey, api_secret: apiSecret, sandbox: useSandbox }
          : { api_key: apiKey, api_secret: apiSecret, testnet: useTestnet };

        response = await axios.post(
          endpoint,
          payload,
          {
            withCredentials: true,
            timeout: 60000
          }
        );
      } else if (platform.type === 'wallet') {
        // Wallet import (MetaMask or Phantom)
        if (!walletAddress || walletBalances.length === 0) {
          toast({
            title: "Wallet Not Connected",
            description: `Please connect your ${platform.name} wallet first`,
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }

        const endpoint = selectedPlatform === 'metamask'
          ? `${API}/metamask/connect`
          : `${API}/phantom/connect`;
        
        response = await axios.post(
          endpoint,
          {
            address: walletAddress,
            balances: walletBalances
          },
          {
            withCredentials: true,
            timeout: 60000
          }
        );
      }

      const result = response.data;

      if (result.success) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${result.imported} holdings from ${platform.name}${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
        });

        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
        }

        // Clear form
        setSelectedFile(null);
        setApiKey('');
        setApiSecret('');
        setOpen(false);
        
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        toast({
          title: "Import Failed",
          description: result.errors?.[0] || "Failed to import holdings",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.response?.data?.detail || `Failed to import from ${platform.name}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Are you sure you want to remove all ${PLATFORMS.find(p => p.id === selectedPlatform)?.name || 'platform'} holdings? This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.delete(`${API}/${selectedPlatform}/disconnect`, {
        withCredentials: true
      });

      toast({
        title: "Disconnected",
        description: `All ${PLATFORMS.find(p => p.id === selectedPlatform)?.name || 'platform'} holdings have been removed`,
      });

      setStatus({ connected: false, holdings_count: 0 });
      setOpen(false);
      
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: error.response?.data?.detail || "Failed to disconnect",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPlatformData = PLATFORMS.find(p => p.id === selectedPlatform);
  const PlatformIcon = selectedPlatformData?.icon || Upload;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white hover:bg-gray-50">
          <Upload className="w-4 h-4 mr-2" />
          Import Holdings
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg mr-3">
              <Upload className="w-5 h-5 text-white" />
            </div>
            Import Holdings
          </DialogTitle>
          <DialogDescription>
            Import your holdings from various exchanges and platforms
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Platform Selection */}
          <div>
            <Label htmlFor="platform" className="text-base font-semibold mb-2 block">
              Select Platform
            </Label>
            <Select value={selectedPlatform} onValueChange={handlePlatformChange}>
              <SelectTrigger id="platform" className="w-full">
                <SelectValue placeholder="Choose a platform to import from" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <SelectItem key={platform.id} value={platform.id}>
                      <div className="flex items-center space-x-2">
                        <Icon className="w-4 h-4" />
                        <span>{platform.name}</span>
                        <span className="text-xs text-gray-500 ml-2">({platform.description})</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedPlatform && (
            <>
              {/* Status Card */}
              {isCheckingStatus ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      <span className="ml-2 text-sm text-gray-600">Checking status...</span>
                    </div>
                  </CardContent>
                </Card>
              ) : status ? (
                <Card className={status.connected ? (
                  selectedPlatformData.color === 'green' ? 'bg-green-50 border-green-200' :
                  selectedPlatformData.color === 'blue' ? 'bg-blue-50 border-blue-200' :
                  selectedPlatformData.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                  selectedPlatformData.color === 'orange' ? 'bg-orange-50 border-orange-200' :
                  selectedPlatformData.color === 'purple' ? 'bg-purple-50 border-purple-200' :
                  'bg-red-50 border-red-200'
                ) : "bg-gray-50"}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {status.connected ? (
                          <CheckCircle className={`w-6 h-6 ${
                            selectedPlatformData.color === 'green' ? 'text-green-600' :
                            selectedPlatformData.color === 'blue' ? 'text-blue-600' :
                            selectedPlatformData.color === 'yellow' ? 'text-yellow-600' :
                            selectedPlatformData.color === 'orange' ? 'text-orange-600' :
                            selectedPlatformData.color === 'purple' ? 'text-purple-600' :
                            'text-red-600'
                          }`} />
                        ) : (
                          <XCircle className="w-6 h-6 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">
                            {status.connected ? 'Connected' : 'Not Connected'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {status.connected 
                              ? `${status.holdings_count} holdings imported`
                              : `No ${selectedPlatformData.name} holdings imported`}
                          </p>
                          {status.last_sync && (
                            <p className="text-xs text-gray-500 mt-1">
                              Last sync: {new Date(status.last_sync).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {status.connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnect}
                          disabled={isLoading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Disconnect
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Platform-specific Instructions */}
              {selectedPlatform === 'robinhood' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-green-600" />
                      How to Export from Robinhood
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Log in to your Robinhood account on the web</li>
                      <li>Go to <strong>Account → Investing → History</strong></li>
                      <li>Click <strong>"Export"</strong> or <strong>"Download CSV"</strong></li>
                      <li>Select the date range (or all time)</li>
                      <li>Download the CSV file</li>
                      <li>Upload it here to import your holdings</li>
                    </ol>
                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-800">
                        <strong>Note:</strong> The CSV should include columns like Symbol, Name, Quantity, and Average Cost.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedPlatform === 'fidelity' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                      How to Export from Fidelity
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Log in to your Fidelity account at <a href="https://www.fidelity.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">fidelity.com</a></li>
                      <li>Go to <strong>Accounts & Trade → Portfolio</strong></li>
                      <li>Click on your account (e.g., "Individual", "IRA", "401(k)")</li>
                      <li>Click <strong>"Positions"</strong> tab</li>
                      <li>Click <strong>"Export"</strong> or <strong>"Download"</strong> button</li>
                      <li>Select <strong>"CSV"</strong> format</li>
                      <li>Download and upload the CSV file here</li>
                    </ol>
                    <div className="mt-4 p-3 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-800">
                        <strong>Note:</strong> Fidelity doesn't provide a public API. This method uses CSV export.
                        The CSV should include columns like Symbol, Description, Quantity, and Cost Basis.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedPlatform === 'coinbase' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
                      How to Get Coinbase API Credentials
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Log in to your Coinbase account</li>
                      <li>Go to <strong>Settings → API</strong> or visit <a href="https://www.coinbase.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">coinbase.com/settings/api</a></li>
                      <li>Click <strong>"New API Key"</strong></li>
                      <li>Select permissions: <strong>"View"</strong> (read-only access)</li>
                      <li>Copy your <strong>API Key</strong> and <strong>API Secret</strong></li>
                      <li>Enter them below to import your holdings</li>
                    </ol>
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-800">
                        <strong>Security Note:</strong> Your API credentials are only used to fetch your holdings. 
                        We recommend using read-only API keys. Credentials are not stored permanently.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedPlatform === 'binance' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                      How to Get Binance API Credentials
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Log in to your Binance account</li>
                      <li>Go to <strong>API Management</strong> or visit <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:underline">binance.com API Management</a></li>
                      <li>Click <strong>"Create API"</strong></li>
                      <li>Select <strong>"Read Only"</strong> permissions</li>
                      <li>Complete security verification</li>
                      <li>Copy your <strong>API Key</strong> and <strong>Secret Key</strong></li>
                      <li>Enter them below to import your holdings</li>
                    </ol>
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                      <p className="text-xs text-yellow-800">
                        <strong>Security Note:</strong> Use read-only API keys. Never share your Secret Key. 
                        Credentials are not stored permanently.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedPlatform === 'metamask' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-orange-600" />
                      How to Connect MetaMask Wallet
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Install MetaMask browser extension if you haven't already</li>
                      <li>Click <strong>"Connect MetaMask Wallet"</strong> button below</li>
                      <li>Approve the connection request in MetaMask (only MetaMask will pop up)</li>
                      <li>Your wallet address and balances will be imported</li>
                    </ol>
                    <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                      <p className="text-xs text-orange-800">
                        <strong>Note:</strong> We only read your wallet balances. We never request transaction permissions.
                        Currently supports ETH and major tokens. More tokens coming soon.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {selectedPlatform === 'phantom' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-purple-600" />
                      How to Connect Phantom Wallet
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>Install Phantom browser extension if you haven't already</li>
                      <li>Click <strong>"Connect Phantom Wallet"</strong> button below</li>
                      <li>Approve the connection request in Phantom</li>
                      <li>Your wallet address and SOL balances will be imported</li>
                    </ol>
                    <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-800">
                        <strong>Note:</strong> We only read your wallet balances. We never request transaction permissions.
                        Currently supports SOL and major SPL tokens. More tokens coming soon.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Platform-specific Input Forms */}
              {(selectedPlatform === 'robinhood' || selectedPlatform === 'fidelity') && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="csvFile" className="text-base font-semibold mb-2 block">
                      Select CSV File {selectedPlatform === 'fidelity' ? '(Fidelity)' : '(Robinhood)'}
                    </Label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="file"
                        id="csvFile"
                        accept=".csv,text/csv"
                        onChange={handleFileSelect}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-semibold
                          file:bg-green-50 file:text-green-700
                          hover:file:bg-green-100
                          ${selectedPlatform === 'fidelity' ? 'file:bg-red-50 file:text-red-700 hover:file:bg-red-100' : ''}"
                        disabled={isLoading}
                      />
                    </div>
                    {selectedFile && (
                      <div className="mt-2 flex items-center space-x-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>{selectedFile.name}</span>
                        <span className="text-gray-400">
                          ({(selectedFile.size / 1024).toFixed(2)} KB)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(selectedPlatform === 'coinbase' || selectedPlatform === 'binance') && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="text"
                      placeholder={`Enter your ${selectedPlatformData.name} API Key`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      disabled={isLoading}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="apiSecret">API Secret</Label>
                    <div className="relative mt-1">
                      <Input
                        id="apiSecret"
                        type={showSecret ? "text" : "password"}
                        placeholder={`Enter your ${selectedPlatformData.name} API Secret`}
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        disabled={isLoading}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {selectedPlatform === 'coinbase' && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="sandbox"
                        checked={useSandbox}
                        onChange={(e) => setUseSandbox(e.target.checked)}
                        disabled={isLoading}
                        className="rounded"
                      />
                      <Label htmlFor="sandbox" className="text-sm text-gray-600">
                        Use Sandbox (for testing)
                      </Label>
                    </div>
                  )}

                  {selectedPlatform === 'binance' && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="testnet"
                        checked={useTestnet}
                        onChange={(e) => setUseTestnet(e.target.checked)}
                        disabled={isLoading}
                        className="rounded"
                      />
                      <Label htmlFor="testnet" className="text-sm text-gray-600">
                        Use Testnet (for testing)
                      </Label>
                    </div>
                  )}
                </div>
              )}

              {selectedPlatform === 'metamask' && (
                <div className="space-y-4">
                  {!walletAddress ? (
                    <div>
                      <Button
                        onClick={connectMetaMask}
                        disabled={isConnectingWallet || isLoading}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        {isConnectingWallet ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4 mr-2" />
                            Connect MetaMask Wallet
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        Make sure MetaMask extension is installed and unlocked. If Phantom appears, disable it temporarily.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Wallet Address</Label>
                        <div className="mt-1 p-3 bg-gray-50 rounded-lg border">
                          <p className="text-sm font-mono text-gray-700 break-all">
                            {walletAddress}
                          </p>
                        </div>
                      </div>
                      {walletBalances.length > 0 && (
                        <div>
                          <Label>Detected Balances</Label>
                          <div className="mt-1 space-y-2">
                            {walletBalances.map((balance, idx) => (
                              <div key={idx} className="p-2 bg-gray-50 rounded border flex justify-between items-center">
                                <span className="text-sm font-medium">{balance.symbol}</span>
                                <span className="text-sm text-gray-600">{balance.balance.toFixed(6)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setWalletAddress('');
                          setWalletBalances([]);
                        }}
                        className="w-full"
                      >
                        Disconnect Wallet
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {selectedPlatform === 'phantom' && (
                <div className="space-y-4">
                  {!walletAddress ? (
                    <div>
                      <Button
                        onClick={connectPhantom}
                        disabled={isConnectingWallet || isLoading}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {isConnectingWallet ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4 mr-2" />
                            Connect Phantom Wallet
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        Make sure Phantom extension is installed and unlocked
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label>Wallet Address</Label>
                        <div className="mt-1 p-3 bg-gray-50 rounded-lg border">
                          <p className="text-sm font-mono text-gray-700 break-all">
                            {walletAddress}
                          </p>
                        </div>
                      </div>
                      {walletBalances.length > 0 && (
                        <div>
                          <Label>Detected Balances</Label>
                          <div className="mt-1 space-y-2">
                            {walletBalances.map((balance, idx) => (
                              <div key={idx} className="p-2 bg-gray-50 rounded border flex justify-between items-center">
                                <span className="text-sm font-medium">{balance.symbol}</span>
                                <span className="text-sm text-gray-600">{balance.balance.toFixed(6)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setWalletAddress('');
                          setWalletBalances([]);
                        }}
                        className="w-full"
                      >
                        Disconnect Wallet
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setSelectedPlatform('');
                setSelectedFile(null);
                setApiKey('');
                setApiSecret('');
              }}
              disabled={isLoading || isTestingConnection}
            >
              Cancel
            </Button>
            {(selectedPlatform === 'coinbase' || selectedPlatform === 'binance') && (
              <Button
                onClick={handleTestConnection}
                disabled={isLoading || isTestingConnection || !apiKey || !apiSecret}
                variant="outline"
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
            )}
            <Button
              onClick={handleImport}
              disabled={
                isLoading || 
                isTestingConnection || 
                !selectedPlatform ||
                ((selectedPlatform === 'robinhood' || selectedPlatform === 'fidelity') && !selectedFile) ||
                ((selectedPlatform === 'coinbase' || selectedPlatform === 'binance') && (!apiKey || !apiSecret)) ||
                ((selectedPlatform === 'metamask' || selectedPlatform === 'phantom') && (!walletAddress || walletBalances.length === 0))
              }
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Holdings
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportHoldingsModal;

