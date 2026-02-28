export const formatUnit = (val: number, unit: string, precision: number = 3) => {
  const format = (v: number) => parseFloat(v.toFixed(precision));
  const absVal = Math.abs(val);

  if (absVal < 1e-12) return `0 ${unit}`;
  if (absVal < 1e-9) return `${format(val * 1e12)} p${unit}`;
  if (absVal < 1e-6) return `${format(val * 1e9)} n${unit}`;
  if (absVal < 1e-3) return `${format(val * 1e6)} µ${unit}`;
  if (absVal < 1) return `${format(val * 1e3)} m${unit}`;
  if (absVal >= 1000) return `${format(val / 1000)} k${unit}`;
  return `${format(val)} ${unit}`;
};
