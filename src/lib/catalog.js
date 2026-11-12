const DEMO_PRODUCTS = [
  { id: "demo-headphones", name: "Wireless headphones", brand: "Soundwell", description: "Over-ear wireless headphones", price: "79.00", image: "", url: "" },
  { id: "demo-backpack", name: "Everyday backpack", brand: "Northline", description: "Water-resistant day backpack", price: "64.00", image: "", url: "" },
  { id: "demo-lamp", name: "Desk lamp", brand: "Form & Field", description: "Dimmable LED desk lamp", price: "38.00", image: "", url: "" },
  { id: "demo-mug", name: "Travel mug", brand: "Trail Works", description: "Insulated stainless steel travel mug", price: "24.00", image: "", url: "" },
  { id: "demo-keyboard", name: "Compact keyboard", brand: "Keyline", description: "Wireless compact keyboard", price: "89.00", image: "", url: "" },
  { id: "demo-sling", name: "Canvas sling bag", brand: "Harbor Supply", description: "Lightweight canvas crossbody bag", price: "32.00", image: "", url: "" },
];

function money(value) {
  if (typeof value === "number") return value.toFixed(2);
  if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value)) return Number(value).toFixed(2);
  if (value && typeof value === "object") return money(value.value ?? value.amount);
  return null;
}

function shapeChannel3(product) {
  const offer = (product.offers || []).find((candidate) => (candidate.currency || candidate.currency_code || candidate.price?.currency) === "USD") || product.offers?.[0];
  const currency = offer?.currency || offer?.currency_code || offer?.price?.currency || "USD";
  const price = currency === "USD" ? money(offer?.price) : null;
  if (!product.id || !product.title || !price || Number(price) > 100) return null;
  return {
    id: String(product.id), name: String(product.title).slice(0, 160),
    brand: String(product.brand?.name || product.brand || "").slice(0, 100),
    description: String(product.description || "").slice(0, 500),
    price, image: String(product.images?.[0]?.url || product.images?.[0] || product.image || ""),
    url: String(offer?.url || product.url || ""), source: "Channel3",
  };
}

export async function searchProducts(query, fetcher = fetch) {
  const key = process.env.CHANNEL3_API_KEY;
  if (key) {
    try {
      const response = await fetcher("https://api.trychannel3.com/v1/search", {
        method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ query: String(query).slice(0, 500), limit: 8 }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Channel3 returned ${response.status}.`);
      const result = await response.json();
      const products = (result.data || result.products || result.items || []).map(shapeChannel3).filter(Boolean).slice(0, 4);
      if (products.length) return { products, source: "Channel3" };
    } catch {
      // Catalog lookup is optional; keep shopping available with the demo list.
    }
  }
  const terms = String(query).toLowerCase().split(/\W+/).filter(Boolean);
  const ranked = DEMO_PRODUCTS.map((product) => ({
    ...product, source: "Demo catalog",
    score: terms.filter((term) => `${product.name} ${product.brand} ${product.description}`.toLowerCase().includes(term)).length,
  })).sort((a, b) => b.score - a.score);
  return { products: ranked.slice(0, 4).map(({ score, ...product }) => product), source: "Demo catalog" };
}

export const demoProducts = DEMO_PRODUCTS;
