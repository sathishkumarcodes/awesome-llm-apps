import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useGenerateQuoteFromEntry = () => {
  const [quote, setQuote] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuote = async (entryText: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'generate-shareable-quote',
        {
          body: { entryText }
        }
      );

      if (functionError) {
        console.error('Function error:', functionError);
        throw new Error(functionError.message || 'Failed to generate quote');
      }

      if (!data?.quote) {
        throw new Error('No quote returned from AI');
      }

      setQuote(data.quote);
      return data.quote;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate quote';
      setError(errorMessage);
      toast.error('Could not generate shareable quote. Please try again.');
      console.error('Error generating quote:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setQuote(null);
    setError(null);
    setIsLoading(false);
  };

  return {
    quote,
    isLoading,
    error,
    generateQuote,
    reset
  };
};
