# Showroom heading typography

Owner decision: use the airy, light sans-serif direction of concept 1; preserve the existing layout and approved raster logo.

Implementation: Manrope variable font, normal heading weight 400, modest letter spacing, balanced hero wrapping and emergency wrapping for long words. Body/control sizing, catalogue structure, photos and motion rules are unchanged. The font is scoped to the showroom through next/font/local and served by Next.js from this application, with existing Arial/Helvetica/sans-serif fallback. The logo remains the original PNG.

Source: https://github.com/google/fonts/tree/main/ofl/manrope (SIL OFL 1.1; full license at public/fonts/Manrope-OFL.txt). Actual downloaded cmap checked for all Russian uppercase/lowercase letters including Ё/ё. Some additional Kazakh letters are absent from this font and use the system fallback; no claim of full Kazakh glyph coverage.

Reference limitation: the selected Library image was not materialized because the required Python helper runtime is unavailable. This implementation follows the textual direction, not a claimed exact match to unviewed pixels. Real browser wrapping, cards, buttons and iPhone appearance require Preview visual review. Logo animation remains blocked on separated brand assets.
