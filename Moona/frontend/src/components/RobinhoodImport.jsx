import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, ExternalLink, Download } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const RobinhoodImport = ({ onImportComplete }) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [status, setStatus] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      checkStatus();
    }
  }, [open]);

  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const response = await axios.get(`${API}/robinhood/status`, {
        withCredentials: true
      });
      setStatus(response.data);
    } catch (error) {
      console.error('Error checking Robinhood status:', error);
      setStatus({ connected: false, holdings_count: 0 });
    } finally {
      setIsCheckingStatus(false);
    }
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

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to import",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post(`${API}/robinhood/import/csv`, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000  // 60 second timeout for large files
      });

      const result = response.data;

      if (result.success) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${result.imported} holdings from Robinhood${result.failed > 0 ? ` (${result.failed} failed)` : ''}`,
        });

        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
        }

        setSelectedFile(null);
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
        description: error.response?.data?.detail || "Failed to import CSV file. Please check the file format.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to remove all Robinhood holdings? This cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.delete(`${API}/robinhood/disconnect`, {
        withCredentials: true
      });

      toast({
        title: "Disconnected",
        description: "All Robinhood holdings have been removed",
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
          <Upload className="w-4 h-4 mr-2" />
          Import from Robinhood
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <div className="p-2 bg-green-500 rounded-lg mr-3">
              <Upload className="w-5 h-5 text-white" />
            </div>
            Import from Robinhood
          </DialogTitle>
          <DialogDescription>
            Import your holdings from Robinhood by uploading a CSV export file
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
            <Card className={status.connected ? "bg-green-50 border-green-200" : "bg-gray-50"}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {status.connected ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
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
                          : 'No Robinhood holdings imported'}
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
          )}

          {/* Instructions */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-3 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-blue-600" />
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
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> The CSV should include columns like Symbol, Name, Quantity, and Average Cost.
                  If your CSV has different column names, the import will try to detect them automatically.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select CSV File
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
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

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={isLoading || !selectedFile}
              className="bg-green-600 hover:bg-green-700 text-white"
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

export default RobinhoodImport;

