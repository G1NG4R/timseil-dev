// Email and IP addresses do not reach this container's log, and neither do the
// bytes that let one line pretend to be two.
//
// A PORT, NOT A SECOND OPINION. The original is api/internal/logx/scrub.go and
// it is the one that has been fuzzed. Everything structural here — one
// left-to-right pass, longest candidate first and then shorter, the length cap,
// a marker built only from characters a domain may contain — is copied because
// each of those is a bug the fuzzer found in Go, and a rewrite from the
// description would find them again the hard way. The three inputs that
// disproved the Go version have tests here under the same names.
//
// WHY WEB NEEDS THIS AT ALL, given that web logs no form contents
//
// Because ADR 0037 does not divide the work by "our fields" and "their fields",
// it divides it by WHOSE WORDS THEY ARE. The scrubber is for foreign text — and
// web gets some the moment it fetches:
//
//     TypeError: fetch failed
//       cause: Error: connect ECONNREFUSED 172.18.0.3:8080
//
// That is undici's wording with an address in it, in the error line of
// serverFetch, and ADR 0035 says the api is briefly gone during step 3 of every
// rollout. Without a filter, every rollout writes container addresses into the
// log. Discipline at the call site cannot see it: the address is not a field
// anybody here chose.
//
// WHAT IS DELIBERATELY NOT PORTED
//
// The `selfAuthored` exemption. Go has exactly one entry, `message_id`, because
// an RFC 5322 Message-ID is genuinely address-shaped and internal/contact mints
// it. Web writes no such field, and a list guarding a case that does not exist
// is what "Maß halten" warns about. If web ever logs one, that is when the list
// appears — and it is a claim about the value, not a convenience for the key.

import { isIP } from "node:net";

// What a redacted value is replaced with. A marker rather than an empty string:
// "this line had an address and it was removed" is a different fact from "this
// line had no address", and only the first tells a reader the filter runs.
//
// Built only from characters that may appear inside a domain, and always
// containing a hyphen — not cosmetic, and the Go fuzzer is why it is written
// down. With brackets around it, redacting an address in the middle of a longer
// token ENDED the domain scan at the bracket and left the text before it looking
// like a valid domain, so a second pass redacted more than the first. A marker
// the scanner reads straight through cannot move a boundary, and the hyphen
// keeps the result from ever being a well-formed suffix.
const REDACTED_EMAIL = "redacted-email";
const REDACTED_IP = "redacted-ip";

// Bounds one candidate. See matchAddr for what it costs and why.
const MAX_ADDR_LEN = 64;

// C0 and DEL. Multi-byte characters are left alone: every continuation unit is
// above this range, so this cannot cut a character in half.
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Removes control characters, email addresses and IP addresses from one string.
 */
export function scrub(s: string): string {
  return redactAddresses(stripControl(s));
}

/**
 * Removes the characters that let one log line pretend to be two.
 *
 * `JSON.stringify` already escapes them, and that is measured rather than
 * assumed on the Go side: a newline in a path comes out as an escape INSIDE the
 * string and the line stays one line. So this is not what makes forging
 * impossible today — it is what keeps it impossible when the writer changes. F2
 * sends these lines through Alloy into Loki and F11 adds a second producer, and
 * "we are safe because of how the encoder at the bottom happens to behave" is a
 * guarantee living in a different file from the values it protects.
 *
 * A space, not a deletion: two tokens run together read as one value that was
 * never there.
 */
export function stripControl(s: string): string {
  return s.replace(CONTROL, " ");
}

/**
 * Renders any thrown value as the text worth logging.
 *
 * The cause chain is walked rather than dropped, and that is the whole reason
 * this function exists: `fetch` rejects with `TypeError: fetch failed`, and
 * everything that says WHICH failure it was — the refused address, the DNS
 * answer, the timeout — sits one level down in `cause`. Logging only the top
 * message would produce a line that is safe because it says nothing.
 *
 * Bounded at five links. A cycle in `cause` is possible and costs nothing to
 * rule out here.
 */
export function errorText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;

  while (current instanceof Error && parts.length < 5) {
    parts.push(current.message);
    current = current.cause;
  }

  if (parts.length > 0) return parts.join(": ");
  // Not String(err): a thrown object with the default toString renders as
  // "[object Object]", which is noise wearing the shape of information.
  return typeof err === "string" ? err : "non-error thrown";
}

/**
 * Replaces every email and IP address in one left-to-right pass.
 *
 * ONE pass, and the Go fuzzer is why. Doing emails and then addresses as two
 * sweeps was correct on every input anybody thinks of and wrong on two nobody
 * would: `a@b.tld@c.tld` left the second domain standing, and in `0@::0.XA` the
 * IP redaction BUILT an email that was not there. Walking once fixes the class
 * rather than the two cases — what this writes is never read again, so no
 * substitution can create a match.
 */
function redactAddresses(s: string): string {
  // The overwhelmingly common case is a line with none of this in it. One pass
  // to find out costs less than the walk below.
  if (!s.includes("@") && !s.includes(".") && !s.includes(":")) return s;

  let out = "";
  let i = 0;

  while (i < s.length) {
    if (runStart(s, i, isLocalChar)) {
      const end = matchEmail(s, i);
      if (end > 0) {
        out += REDACTED_EMAIL;
        i = end;
        continue;
      }
    }

    // No run-start guard on this one, and the Go fuzzer took it away: it assumed
    // that if the whole run fails to parse, no part of it can. That is false. In
    // "::0X%::0" the second run begins at '%', because '%' is a legal zone
    // separator — "%::0" does not parse, and the "::0" inside it was never
    // tried. An address survived in the output.
    //
    // The cost is a rescan from each position inside a run that failed. The
    // values reaching here are bounded, and correctness is not the thing to
    // trade for it.
    const end = matchAddr(s, i);
    if (end > 0) {
      out += REDACTED_IP;
      i = end;
      continue;
    }

    out += s[i];
    i++;
  }

  return out;
}

/**
 * Whether i begins a run of characters the predicate accepts.
 *
 * Safe for the email matcher and only for it: the local part is scanned greedily
 * and the '@' after it sits at a fixed offset, so starting later can only
 * shorten a match that would be found anyway. It is NOT safe for addresses — see
 * redactAddresses.
 */
function runStart(s: string, i: number, inClass: (c: string) => boolean): boolean {
  return inClass(s[i]) && (i === 0 || !inClass(s[i - 1]));
}

/**
 * How far an email address starting at i reaches, or -1.
 *
 * Deliberately looser than RFC 5321. This is not validating an address somebody
 * typed, it is finding one in a sentence somebody else's server wrote, and the
 * cost of being wrong runs one way: a redacted token that was not an address is
 * a small loss of detail, a missed address is a promise broken.
 */
function matchEmail(s: string, i: number): number {
  let at = i;
  while (at < s.length && isLocalChar(s[at])) at++;

  // No local part, or no '@' after it.
  if (at === i || at >= s.length || s[at] !== "@") return -1;

  let end = at + 1;
  while (end < s.length && isDomainChar(s[end])) end++;

  // An '@' right after the domain means the boundary was not clean —
  // "a@b.tld@c.tld". Swallow it and keep going rather than stop: consuming one
  // token too many costs a word, stopping early leaves half an address.
  while (end < s.length && s[end] === "@") {
    end++;
    while (end < s.length && isDomainChar(s[end])) end++;
  }

  // A trailing dot is punctuation, not domain: "…from a@b.tld." ends a sentence.
  while (end > at + 1 && s[end - 1] === ".") end--;

  if (!isDomainish(s.slice(at + 1, end))) return -1;
  return end;
}

/**
 * How far an IP address starting at i reaches, or -1.
 *
 * The candidate is cut out by shape and handed to a parser rather than matched
 * by a pattern. That is what keeps a timestamp out of it: "11:19:35" looks like
 * an IPv6 address to a regular expression and does not parse as one.
 *
 * Longest first, then shorter — and that second half is not tidiness. The
 * maximal run is often not an address while a prefix of it is: in "::0.::0" the
 * whole run parses as nothing, and trying only the whole run left the leading
 * "::0" in the output one character at a time.
 */
function matchAddr(s: string, i: number): number {
  let end = i;
  while (end < s.length && isAddrChar(s[end])) end++;
  if (end === i) return -1;

  // An IPv4 needs a dot and an IPv6 needs a colon, so a run with neither cannot
  // contain either — and no prefix of it can. This is what keeps the shrinking
  // loop off the values every line carries: a 32-character request id is hex and
  // nothing else, and it leaves here without a single parse.
  const run = s.slice(i, end);
  if (!run.includes(".") && !run.includes(":")) return -1;

  // The shrinking loop below is bounded, and the Go fuzzer is why it had to be.
  // Without this, a run of n characters costs n parses at each of n positions —
  // 2700 characters of colons and digits took SEVEN SECONDS in the Go logger,
  // and a request path is not length-limited. The filter that exists to protect
  // the log would have been the way to stall the service.
  //
  // Sixty-four is comfortably above the longest thing a parser accepts that this
  // service can see: "[ffff:…:255.255.255.255]:65535" is 53 characters.
  if (end > i + MAX_ADDR_LEN) end = i + MAX_ADDR_LEN;

  for (; end > i; end--) {
    if (!worthParsing(s, i, end)) continue;
    if (parsesAsAddr(s.slice(i, end))) return end;
  }

  return -1;
}

/**
 * Whether a candidate ending at `end` can be an address at all, so that the loop
 * in matchAddr does not spend a parse on a length that cannot be one.
 *
 * A trailing dot is punctuation. A trailing colon is punctuation TOO — except
 * when it is the second half of "::", which is IPv6 syntax and part of the
 * address rather than after it.
 *
 * THIS IS A REPAIR, NOT A PORT. api/internal/logx/scrub.go skipped every
 * candidate ending in a colon, so "peer 2001:db8:: is gone" came out of Scrub
 * unchanged — an address in the log of a service whose privacy page promises
 * none. The Go fuzzer could not find it: its property asks whether the filter
 * still sees an address in its OWN output, and a candidate the matcher never
 * looks at is one the property never asks about. scrub.test.ts checks the output
 * with net.isIP over every substring instead, which shares no code with the
 * matcher, and produced the input in three thousand random cases. The Go side
 * carries the same repair.
 */
function worthParsing(s: string, i: number, end: number): boolean {
  const c = s[end - 1];
  if (c === ".") return false;
  if (c === ":") return end - 2 >= i && s[end - 2] === ":";
  return true;
}

/**
 * Whether one candidate is an address, with or without a port.
 *
 * WHERE THIS DIVERGES FROM GO, said out loud. `net/netip` accepts a zone
 * (`fe80::1%eth0`) and a host:port in one call; Node's `isIP` accepts neither,
 * so the port is split by hand and the zone is not handled at all. That is not a
 * leak: `fe80::1%eth0` fails as a whole run, and matchAddr's shrinking loop then
 * tries `fe80::1`, which parses. The address disappears and a bare `%eth0` stays
 * behind — which is exactly the property ADR 0037 promises and no more: what the
 * filter recognises, it removes.
 */
function parsesAsAddr(token: string): boolean {
  if (isIP(token) !== 0) return true;

  // "[::1]:8080". Brackets mean IPv6 and mean a port follows.
  if (token.startsWith("[")) {
    const close = token.indexOf("]");
    if (close < 2 || close + 1 >= token.length || token[close + 1] !== ":") return false;
    return isPort(token.slice(close + 2)) && isIP(token.slice(1, close)) === 6;
  }

  // "127.0.0.1:8080". The port goes with it: an address is not less identifying
  // for having one.
  const colon = token.lastIndexOf(":");
  if (colon < 1) return false;
  return isPort(token.slice(colon + 1)) && isIP(token.slice(0, colon)) === 4;
}

function isPort(s: string): boolean {
  if (s.length === 0 || s.length > 5) return false;
  for (const c of s) {
    if (c < "0" || c > "9") return false;
  }
  return Number(s) <= 65535;
}

/**
 * Rejects the half of the '@' cases that are not addresses: a domain needs a dot
 * and a last label that reads like a suffix.
 */
function isDomainish(domain: string): boolean {
  const dot = domain.lastIndexOf(".");
  if (dot < 1 || dot === domain.length - 1) return false;

  const tld = domain.slice(dot + 1);
  if (tld.length < 2) return false;

  for (const c of tld) {
    if (!isAlpha(c)) return false;
  }
  return true;
}

function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isAlnum(c: string): boolean {
  return isAlpha(c) || (c >= "0" && c <= "9");
}

function isLocalChar(c: string): boolean {
  return isAlnum(c) || ".!#$%&'*+/=?^_`{|}~-".includes(c);
}

function isDomainChar(c: string): boolean {
  return isAlnum(c) || c === "." || c === "-";
}

/**
 * Every character that can appear in an IPv4 or IPv6 address, its zone, or a
 * bracketed host:port.
 */
function isAddrChar(c: string): boolean {
  return (
    (c >= "0" && c <= "9") ||
    (c >= "a" && c <= "f") ||
    (c >= "A" && c <= "F") ||
    c === "." ||
    c === ":" ||
    c === "[" ||
    c === "]" ||
    c === "%"
  );
}
