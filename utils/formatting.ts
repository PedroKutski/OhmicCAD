export const formatUnit = (val: number, unit: string, precision: number = 3) => {
  const format = (v: number) => parseFloat(Number(v).toFixed(precision));
  const absVal = Math.abs(val);
  const prefixes: Array<{ threshold: number; scale: number; symbol: string }> = [
    { threshold: 1e3, scale: 1e-3, symbol: 'k' },
    { threshold: 1, scale: 1, symbol: '' },
    { threshold: 1e-3, scale: 1e3, symbol: 'm' },
    { threshold: 1e-6, scale: 1e6, symbol: 'µ' },
    { threshold: 1e-9, scale: 1e9, symbol: 'n' },
    { threshold: 1e-12, scale: 1e12, symbol: 'p' },
    { threshold: 1e-15, scale: 1e15, symbol: 'f' },
  ];

  if (absVal < 1e-15) {
    return `0 ${unit}`;
  }

  const prefix = prefixes.find(({ threshold }) => absVal >= threshold);

  if (!prefix) {
    return `${format(val)} ${unit}`;
  }

  const formattedValue = format(val * prefix.scale);
  const unitWithPrefix = `${prefix.symbol}${unit}`;
  return prefix.symbol ? `${formattedValue} ${unitWithPrefix}` : `${formattedValue} ${unit}`;
};
