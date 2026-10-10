import manifest from "@/lib/showroom/marketing-photos.json";
export type HeroSlide = { src: string; width: number; height: number; alt: string; mobile?: { src: string; width: number; height: number } };
// Owner-selected order; editorial only, no CRM product/execution association.
export const heroSlides: HeroSlide[] = manifest.photos.filter(photo => photo.role === "hero").map(photo => ({
  src: photo.assets[0].src, width: photo.assets[0].width, height: photo.assets[0].height, alt: photo.alt,
  mobile: { src: photo.assets[1].src, width: photo.assets[1].width, height: photo.assets[1].height },
}));
