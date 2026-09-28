const supplied = (window as Window & { TRAIN_ASSETS?: { atlas: string; terrain: string } })
  .TRAIN_ASSETS;
export const assets = supplied ?? {
  atlas: `${import.meta.env.BASE_URL}assets/train-atlas.png`,
  terrain: `${import.meta.env.BASE_URL}assets/tundra.png`,
};
