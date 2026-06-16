// utils/currency.js
// Multi-currency handling with conversion and balance validation

/**
 * Supported currencies with conversion rates
 * Rates are updated via the /api/currency-rates endpoint
 */
const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.92 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', rate: 0.79 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 154.32 },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 1.37 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rate: 1.52 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', rate: 7.24 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 83.45 },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', rate: 3.67 },
  SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', rate: 3.75 },
  EGP: { code: 'EGP', symbol: 'ج.م', name: 'Egyptian Pound', rate: 48.50 },
};

/**
 * Convert amount from one currency to another
 */
function convertCurrency(amount, fromCurrency, toCurrency, rates = CURRENCIES) {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = rates[fromCurrency]?.rate || 1;
  const toRate = rates[toCurrency]?.rate || 1;
  
  if (!fromRate || !toRate) {
    throw new Error(`Invalid currency: from=${fromCurrency}, to=${toCurrency}`);
  }
  
  return amount * (toRate / fromRate);
}

/**
 * Get base currency equivalent for a list of amounts in different currencies
 * Useful for journal entry balance validation with multi-currency
 */
function convertToBaseCurrency(items, baseCurrency = 'USD') {
  return items.map(item => ({
    ...item,
    baseAmount: item.currency === baseCurrency 
      ? item.amount 
      : convertCurrency(item.amount, item.currency, baseCurrency),
  }));
}

/**
 * Validate that a multi-currency journal entry balances when converted to base currency
 * @param {array} lines - journal lines with { account_id, debit, credit, currency }
 * @param {string} baseCurrency - currency to use for validation
 * @returns {object} - { isBalanced, totalDebit, totalCredit, difference }
 */
function validateMultiCurrencyBalance(lines, baseCurrency = 'USD') {
  const debits = [];
  const credits = [];

  for (const line of lines) {
    const currency = line.currency || 'USD';
    
    if (Number(line.debit) > 0) {
      debits.push({ amount: line.debit, currency });
    }
    if (Number(line.credit) > 0) {
      credits.push({ amount: line.credit, currency });
    }
  }

  const convertedDebits = convertToBaseCurrency(debits, baseCurrency);
  const convertedCredits = convertToBaseCurrency(credits, baseCurrency);

  const totalDebit = convertedDebits.reduce((sum, d) => sum + d.baseAmount, 0);
  const totalCredit = convertedCredits.reduce((sum, c) => sum + c.baseAmount, 0);
  const difference = Math.abs(totalDebit - totalCredit);

  return {
    isBalanced: difference < 0.01, // Allow 0.01 rounding difference
    totalDebit: parseFloat(totalDebit.toFixed(2)),
    totalCredit: parseFloat(totalCredit.toFixed(2)),
    difference: parseFloat(difference.toFixed(2)),
    baseCurrency,
  };
}

/**
 * Format amount with currency symbol
 */
function formatCurrency(amount, currency = 'USD') {
  const info = CURRENCIES[currency];
  if (!info) return `${amount}`;
  
  return `${info.symbol}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Update exchange rates from API response
 */
function updateExchangeRates(apiRates) {
  if (!apiRates || typeof apiRates !== 'object') {
    throw new Error('Invalid rates object');
  }

  for (const [code, rate] of Object.entries(apiRates)) {
    if (CURRENCIES[code]) {
      CURRENCIES[code].rate = Number(rate);
    }
  }

  return CURRENCIES;
}

module.exports = {
  CURRENCIES,
  convertCurrency,
  convertToBaseCurrency,
  validateMultiCurrencyBalance,
  formatCurrency,
  updateExchangeRates,
};
