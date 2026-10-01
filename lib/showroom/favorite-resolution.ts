import "server-only";
import { parseFavoriteQuery } from "./favorites";
import { publicProduct, ShowroomError } from "./service";
// Reuse the same tenant/publication validation as product detail. Bounded by the parser.
export async function resolveFavoriteProducts(raw: unknown) {
  return Promise.all(parseFavoriteQuery(raw).map(async ref => {
    try { return { ref, product: await publicProduct({ productId: ref.productId, executionId: ref.executionId ?? "" }), unavailable: false }; }
    catch (error) { return { ref, product: null, unavailable: error instanceof ShowroomError && error.status === 404 }; }
  }));
}
