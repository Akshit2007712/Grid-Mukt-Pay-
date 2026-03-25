import { v4 as uuidv4 } from 'uuid';

export interface Transaction {
  id: string;
  type: 'convert' | 'send' | 'receive';
  amount: number;
  counterparty?: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
  signature: string;
}

const STORAGE_KEY = 'tokenpay_data';

interface TokenData {
  tokenBalance: number;
  transactions: Transaction[];
}

function getData(): TokenData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { tokenBalance: 0, transactions: [] };
  return JSON.parse(raw);
}

function setData(data: TokenData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getTokenBalance(): number {
  return getData().tokenBalance;
}

export function setTokenBalance(balance: number) {
  const data = getData();
  data.tokenBalance = balance;
  setData(data);
}

export function getTransactions(): Transaction[] {
  return getData().transactions;
}

export function addTransaction(tx: Omit<Transaction, 'id' | 'signature' | 'timestamp'>): Transaction {
  const data = getData();
  const transaction: Transaction = {
    ...tx,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    signature: uuidv4().replace(/-/g, ''),
  };
  data.transactions.unshift(transaction);
  setData(data);
  return transaction;
}

export function updateTransactionStatus(id: string, status: Transaction['status']) {
  const data = getData();
  const tx = data.transactions.find(t => t.id === id);
  if (tx) tx.status = status;
  setData(data);
}

export function getPendingTransactions(): Transaction[] {
  return getData().transactions.filter(t => t.status === 'pending');
}
