import type { OldMaidTellStyle } from "./contracts.ts";

/** Owner-approved gameplay interpretations; these are not claims of literal CHARX fields. */
export const TEMEROSA_CASINO_TELL_STYLES: Readonly<Record<string, OldMaidTellStyle>> = {
  adesha: "guarded", anna: "open", apollyon: "guarded", bche: "open",
  camille: "bluffer", cicero: "guarded", cradle: "open", deokbae: "guarded",
  diamo: "standard", echo: "open", esther: "bluffer", hiro: "guarded",
  katrinka: "guarded", kreva: "guarded", levillotte: "bluffer", lilim: "open",
  machina: "open", morsisa: "open", nostalgia: "guarded", phaeo: "guarded",
  raven: "bluffer", temute: "open", traver: "guarded", ttaengchil: "open",
  "tumit-tu": "open", yul: "standard",
};
