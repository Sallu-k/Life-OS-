// The accent colour of the Oxygen theme (globals.css --accent-dark / --accent-light). The colour picked
// in Settings is built into the pages; the phone app's wallpaper colour (Material You) and a colour just
// picked on the PC are kept on the device and applied before the first paint by ACCENT_SCRIPT.
const KEY = "lifeos-accent";
const HEX = /^#[0-9a-fA-F]{6}$/;

// Runs in <head> before the page paints (plain ES5, no imports).
export const ACCENT_SCRIPT = String.raw`(function(){try{var a=JSON.parse(localStorage.getItem("${KEY}")||"null");if(a&&/^#[0-9a-fA-F]{6}$/.test(a.dark)){var s=document.documentElement.style;s.setProperty("--accent-dark",a.dark);s.setProperty("--accent-light",/^#[0-9a-fA-F]{6}$/.test(a.light)?a.light:a.dark);if(/^#[0-9a-fA-F]{6}$/.test(a.dark2))s.setProperty("--accent2-dark",a.dark2);if(/^#[0-9a-fA-F]{6}$/.test(a.light2))s.setProperty("--accent2-light",a.light2)}}catch(e){}})()`;

// Use these colours now and on every later page load on this device; null goes back to the built-in one.
// dark2/light2: a second wallpaper colour (Material You tertiary) for the background glow.
export function applyAccent(dark: string | null, light: string | null = dark, dark2: string | null = null, light2: string | null = null) {
  const style = document.documentElement.style;
  const set = (name: string, value: string | null) => (value && HEX.test(value) ? style.setProperty(name, value) : style.removeProperty(name));
  try {
    if (dark && HEX.test(dark)) {
      set("--accent-dark", dark);
      set("--accent-light", light && HEX.test(light) ? light : dark);
      set("--accent2-dark", dark2);
      set("--accent2-light", light2);
      localStorage.setItem(KEY, JSON.stringify({ dark, light, dark2, light2 }));
    } else {
      for (const name of ["--accent-dark", "--accent-light", "--accent2-dark", "--accent2-light"]) style.removeProperty(name);
      localStorage.removeItem(KEY);
    }
  } catch {
    // No storage: the colour still applies to this page.
  }
}
