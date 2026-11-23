import type { ListPage } from './ui.ts';

/**
 * Module setup ka housekeeping: `list` me `prefix` se search karke har mila item ek-ek karke `remove` se
 * hatao, jab tak kuch na bache. List har baar dobara padhi jaati hai (hatne ke baad rows khisakti hain).
 *
 * Jo item na hate woh chhod ke baaki hatao, aur aakhir me un sab ke naam ke saath fail — purana test data
 * chupchaap jama na ho. (Naam har attempt ke naye hain, isliye bacha data naye tests ko nahi bigaadta;
 * failure sirf batata hai ki cleanup ya app ka delete kahin toota hai.)
 */
export async function sweep(what: string, list: ListPage, open: () => Promise<void>, prefix: string, remove: (key: string) => Promise<void>): Promise<void> {
  const failed = new Map<string, string>();
  await open();
  await list.search(prefix);
  for (;;) {
    const key = (await list.keys(prefix)).find((k) => !failed.has(k));
    if (!key) break;
    try {
      await remove(key);
    } catch (err) {
      failed.set(key, (err as Error).message.split('\n')[0]);
      await open(); // dialog / drawer adhoora khula ho sakta hai
      await list.search(prefix);
    }
  }
  if (failed.size) {
    throw new Error(`cleanup: ${failed.size} purane ${what} nahi hate:\n${[...failed].map(([k, e]) => `  ${k}: ${e}`).join('\n')}`);
  }
}
