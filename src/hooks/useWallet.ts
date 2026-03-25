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

  useEffect(() => {
    setTokenBalance(tokenStore.getTokenBalance());
    setTransactions(tokenStore.getTransactions());

    const handleOnline = () => {
      setIsOnline(true);
      syncTransactions();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      subscription.unsubscribe();
    };
  }, []);

  const refreshBalances = useCallback(() => {
    setTokenBalance(tokenStore.getTokenBalance());
    setTransactions(tokenStore.getTransactions());
  }, []);

  const convertToTokens = useCallback((amount: number) => {
    if (amount <= 0 || amount > realBalance) return false;
    setRealBalance(prev => prev - amount);
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() + amount);
    tokenStore.addTransaction({ type: 'convert', amount, status: 'completed' });
    refreshBalances();
    return true;
  }, [realBalance, refreshBalances]);

  const convertToCash = useCallback((amount: number) => {
    if (amount <= 0 || amount > tokenBalance) return false;
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() - amount);
    setRealBalance(prev => prev + amount);
    tokenStore.addTransaction({ type: 'convert', amount, status: 'completed' });
    refreshBalances();
    return true;
  }, [tokenBalance, refreshBalances]);

  const sendTokens = useCallback((amount: number, to: string) => {
    if (amount <= 0 || amount > tokenBalance) return false;
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() - amount);
    tokenStore.addTransaction({ type: 'send', amount, counterparty: to, status: 'pending' });
    refreshBalances();
    return true;
  }, [tokenBalance, refreshBalances]);

  const receiveTokens = useCallback((amount: number, from: string) => {
    tokenStore.setTokenBalance(tokenStore.getTokenBalance() + amount);
    tokenStore.addTransaction({ type: 'receive', amount, counterparty: from, status: 'pending' });
    refreshBalances();
  }, [refreshBalances]);

  const syncTransactions = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    const pending = tokenStore.getPendingTransactions();
    // Simulate sync delay
    await new Promise(r => setTimeout(r, 1500));
    pending.forEach(tx => tokenStore.updateTransactionStatus(tx.id, 'completed'));
    refreshBalances();
    setIsSyncing(false);
  }, [isOnline, refreshBalances]);

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
