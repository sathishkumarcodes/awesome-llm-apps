import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CheckCircle, XCircle, AlertCircle, Loader2, ExternalLink, Key, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const CoinbaseImport = ({ onImportComplete }) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [useSandbox, setUseSandbox] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      checkStatus();
    }
  }, [open]);

  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const response = await axios.get(`${API}/coinbase/status`, {
        withCredentials: true
      });
      setStatus(response.data);
    } catch (error) {
      console.error('Error checking Coinbase status:', error);
      setStatus({ connected: false, holdings_count: 0, api_key_configured: false });
    } finally {
      setIsCheckingStatus(false);
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
      const response = await axios.post(
        `${API}/coinbase/test-connection`,
        {
          api_key: apiKey,
          api_secret: apiSecret,
          sandbox: useSandbox
        },
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
        description: error.response?.data?.detail || "Failed to connect to Coinbase. Please check your API credentials.",
        variant: "destructive"
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleImport = async () => {
    if (!apiKey || !apiSecret) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both API Key and API Secret",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API}/coinbase/connect`,
        {
          api_key: apiKey,
          api_secret: apiSecret,
          sandbox: useSandbox
        },
        {
          withCredentials: true,
          timeout: 60000  // 60 second timeout
        }
      );

      const result = response.data;

      if (result.success) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${result.imported} holdings from Coinbase${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
        });

        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
        }

        // Clear credentials after successful import (for security)
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
        description: error.response?.data?.detail || "Failed to import from Coinbase. Please check your API credentials and try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to remove all Coinbase holdings? This cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.delete(`${API}/coinbase/disconnect`, {
        withCredentials: true
      });

      toast({
        title: "Disconnected",
        description: "All Coinbase holdings have been removed",
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white hover:bg-gray-50">
          <Key className="w-4 h-4 mr-2" />
          Import from Coinbase
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <div className="p-2 bg-blue-500 rounded-lg mr-3">
              <Key className="w-5 h-5 text-white" />
            </div>
            Import from Coinbase
          </DialogTitle>
          <DialogDescription>
            Connect your Coinbase account using API credentials to automatically import your cryptocurrency holdings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
          ) : status && (
            <Card className={status.connected ? "bg-blue-50 border-blue-200" : "bg-gray-50"}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {status.connected ? (
                      <CheckCircle className="w-6 h-6 text-blue-600" />
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
                          : 'No Coinbase holdings imported'}
                      </p>
                      {status.last_sync && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last sync: {new Date(status.last_sync).toLocaleString()}
                        </p>
                      )}
                      {status.error && (
                        <p className="text-xs text-red-500 mt-1">
                          Error: {status.error}
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
          )}

          {/* Instructions */}
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

          {/* API Credentials Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="text"
                placeholder="Enter your Coinbase API Key"
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
                  placeholder="Enter your Coinbase API Secret"
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
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading || isTestingConnection}
            >
              Cancel
            </Button>
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
            <Button
              onClick={handleImport}
              disabled={isLoading || isTestingConnection || !apiKey || !apiSecret}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 mr-2" />
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

export default CoinbaseImport;

