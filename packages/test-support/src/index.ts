export const fixedUuid = (suffix: string): string => {
  const normalizedSuffix = suffix.padStart(12, "0");
  return `00000000-0000-4000-8000-${normalizedSuffix}`;
};
