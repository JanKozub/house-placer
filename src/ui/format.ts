/** Polish number formatting for display (decimal comma). */
export const f = (x: number, digits = 2) => x.toFixed(digits).replace('.', ',');
