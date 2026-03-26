import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as tokenStore from '@/lib/token-store';
import type { Transaction } from '@/lib/token-store';

export function useWallet() {
  const [realBalance, setRealBalance] = useState(10000);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [user, setUser] = useState<any>(null);

  const refreshBalances = useCallback(() => {
    setRealBalance(tokenStore.getRealBalance());
    setTokenBalance(tokenStore.getTokenBalance());
    setTransactions(tokenStore.getTransactions());
  }, []);

  const syncTransactions = useCallback(async (forcedOnline?: boolean) => {
    if (!navigator.onLine && !forcedOnline) return;
    setIsSyncing(true);
    const pending = tokenStore.getPendingTransactions();
    // Simulate sync delay
    await new Promise(r => setTimeout(r, 1500));
    pending.forEach(tx => tokenStore.updateTransactionStatus(tx.id, 'completed'));
    refreshBalances();
    setIsSyncing(false);
  }, [refreshBalances]);

  useEffect(() => {
    refreshBalances();

    const checkRealConnectivity = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      try {
        // Try a tiny fetch to verify real internet access
        const response = await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
        setIsOnline(true);
      } catch (e) {
        setIsOnline(false);
      }
    };

    const handleOnline = () => {
      checkRealConnectivity();
      syncTransactions(true);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check every 10 seconds for more accuracy
    const interval = setInterval(checkRealConnectivity, 10000);
    checkRealConnectivity();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [refreshBalances, syncTransactions]);

  const convertToTokens = useCallback((amount: number) => {
    const currentReal = tokenStore.getRealBalance();
    if (amount <= 0 || amount > currentReal) return false;
    tokenStore.setRealBalance(currentReal - amount);
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() + amount);
    tokenStore.addTransaction({ type: 'convert', amount, status: 'completed' });
    refreshBalances();
    return true;
  }, [refreshBalances]);

  const convertToCash = useCallback((amount: number) => {
    const currentTokens = tokenStore.getTokenBalance();
    if (amount <= 0 || amount > currentTokens) return false;
    tokenStore.setTokenBalance(currentTokens - amount);
    tokenStore.setRealBalance(tokenStore.getRealBalance() + amount);
    tokenStore.addTransaction({ type: 'convert', amount, status: 'completed' });
    refreshBalances();
    return true;
  }, [refreshBalances]);

  const sendTokens = useCallback((amount: number, to: string) => {
    const currentTokens = tokenStore.getTokenBalance();
    if (amount <= 0 || amount > currentTokens) return false;
    tokenStore.setTokenBalance(currentTokens - amount);
    tokenStore.addTransaction({ type: 'send', amount, counterparty: to, status: 'pending' });
    refreshBalances();
    return true;
  }, [refreshBalances]);

  const receiveTokens = useCallback((amount: number, from: string) => {
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() + amount);
    tokenStore.addTransaction({ type: 'receive', amount, counterparty: from, status: 'pending' });
    refreshBalances();
  }, [refreshBalances]);

  return {
    realBalance,
    tokenBalance,
    transactions,
    isOnline,
    isSyncing,
    user,
    convertToTokens,
    convertToCash,
    sendTokens,
    receiveTokens,
    syncTransactions,
    refreshBalances,
  };
}
