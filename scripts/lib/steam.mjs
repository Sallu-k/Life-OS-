// Steam store lookups for game images. No API key needed.
// Images: library_capsule = portrait 600x900 poster, library_hero = wide banner.
import { USER_AGENT } from "./vault-write.mjs";

const CDN = "https://shared.cloudflare.steamstatic.com/store_item_assets/";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res.json();
}

// Best match for a title: { appid, name } or null.
export async function steamSearch(title) {
  const r = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=us&l=en`);
  const item = r.items?.[0];
  return item ? { appid: item.id, name: item.name } : null;
}

// { poster, backdrop } image URLs for a Steam app; either can be null.
export async function steamImages(appid) {
  const input = { ids: [{ appid: Number(appid) }], context: { language: "english", country_code: "US" }, data_request: { include_assets: true } };
  const r = await getJson(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
  const assets = r.response?.store_items?.[0]?.assets;
  if (!assets?.asset_url_format) return { poster: null, backdrop: null };
  const url = (file) => (file ? CDN + assets.asset_url_format.replace("${FILENAME}", file) : null);
  return { poster: url(assets.library_capsule), backdrop: url(assets.library_hero) };
}

// The infobox image of an English Wikipedia article (the box art for games), or null.
// Box art is "non-free" on Wikipedia, which the quick page-image API leaves out,
// so this reads the article's infobox and turns the thumbnail link into the original file.
export async function wikipediaImage(pageTitle) {
  const r = await getJson(
    `https://en.wikipedia.org/w/api.php?action=parse&prop=text&section=0&redirects=1&format=json&page=${encodeURIComponent(pageTitle)}`,
  );
  const html = r.parse?.text?.["*"] ?? "";
  const src = html.match(/class="infobox-image"[\s\S]*?<img[^>]*src="([^"]+)"/)?.[1];
  if (!src) return null;
  const url = new URL(src.replace(/&amp;/g, "&"), "https://upload.wikimedia.org");
  url.search = "";
  // .../thumb/1/1a/File.jpg/250px-File.jpg  ->  .../1/1a/File.jpg
  url.hostname = "upload.wikimedia.org";
  url.pathname = url.pathname.replace("/thumb/", "/").replace(/\/[^/]+$/, (last) => (/^\/\d+px-/.test(last) ? "" : last));
  return url.toString();
}
