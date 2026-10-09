export type HeroSlide = { src: string; width: number; height: number; alt: string; mobile?: { src: string; width: number; height: number } };
// Owner-supplied Downloads photographs; sources/hashes/crops in SHOWROOM_HERO_ASSETS_20261009.json.
// Editorial hero only: never used to infer a CRM product or execution association.
export const heroSlides: HeroSlide[] = [
  { src: "/brand/hero/pastel-pair-desktop.webp", width: 960, height: 1200, alt: "Два светлых праздничных платья — кремовое и розовое — на студийной съёмке MARIPOSA", mobile: { src: "/brand/hero/pastel-pair-mobile.webp", width: 800, height: 1200 } },
  { src: "/brand/hero/white-dress-desktop.webp", width: 960, height: 1200, alt: "Белое праздничное платье с воздушной юбкой на студийной съёмке MARIPOSA", mobile: { src: "/brand/hero/white-dress-mobile.webp", width: 800, height: 1200 } },
  { src: "/brand/hero/black-dress-desktop.webp", width: 960, height: 1200, alt: "Чёрное праздничное платье с объёмной юбкой и светлым поясом на студийной съёмке MARIPOSA", mobile: { src: "/brand/hero/black-dress-mobile.webp", width: 800, height: 1200 } },
];
