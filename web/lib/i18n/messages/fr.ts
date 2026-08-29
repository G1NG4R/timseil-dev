// French. Empty until P6 fills it — ../messages.ts explains what an empty
// language does and why that is this phase's deliverable rather than its debt.
//
// `Partial<Messages>` is what makes the empty object legal and a typo illegal:
// a key English does not have will not compile here.

import type { Messages } from "./en.ts";

export const fr: Partial<Messages> = {};
