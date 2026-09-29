// Pixel bounds in the original generated 1254 × 1254 PNG. Sampling regions
// directly preserves alpha and avoids clipping sprites that cross cell edges.
export const ATLAS_SIZE = 1254;
export const ATLAS_REGIONS = [
  [24, 12, 287, 308],
  [394, 8, 192, 314],
  [712, 16, 140, 307],
  [1036, 16, 140, 307],
  [78, 327, 204, 288],
  [396, 328, 192, 287],
  [649, 343, 265, 265], // Square wheel crop, centered on the circular rim.
  [939, 406, 310, 188],
  [18, 624, 276, 294],
  [315, 692, 316, 218],
  [630, 673, 310, 235],
  [944, 661, 304, 249],
  [14, 930, 292, 290],
  [327, 930, 278, 290],
  [610, 954, 394, 154], // Locomotive body only; its painted wheels are excluded.
  [1006, 929, 245, 316],
  [610, 1108, 43, 100], // Rear steps, beside the independent driving wheels.
  [915, 1108, 89, 100], // Front cylinder and cowcatcher.
] as const;
