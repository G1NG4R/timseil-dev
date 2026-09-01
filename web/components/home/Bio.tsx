import Link from "next/link";

/**
 * The foot of the homepage: two or three sentences, and the way to the long
 * version.
 *
 * NOT THE FOOTER. Everything the sheet draws below this block — `OPEN A
 * CHANNEL`, the address at display size, the three profiles, the meta bar with
 * BUILD and UPTIME and the theme row — is the chrome's long footer and has
 * shipped since G3 in components/SiteFooter.tsx. CHR.01 marks `/` as a `lang`
 * page and FooterLeadGate switches it on. This is the one block of the drawn
 * foot that belongs to the PAGE, and it is the last thing inside `<main>`.
 *
 * THE PORTRAIT IS NOT HERE, and it is not forgotten. The sheet draws a 92x92
 * dashed box labelled `[PORTRAIT]` beside this text. ADR 0055 turned down the
 * case study's two image placeholders with the argument that applies unchanged:
 * an invented picture is the picture version of an invented number, and images
 * are K2's work. So the block is one column rather than two, and K2 decides
 * whether it becomes two.
 *
 * `max-width: 560px` IS THE SHEET'S AND IT IS A MEASURE, not the table switch of
 * the same name. styles/layout.css warns in its own header that the 560 switch
 * "ist keine Zusicherung, sondern ein Ergebnis"; this 560 is a line length for
 * prose and the two numbers being equal is a coincidence worth not building on.
 *
 * NO HEADING. The block is a paragraph and a link, and a `<section>` with a
 * heading here would put a fifth entry in an outline HOME.01 fixes at four
 * markers. lib/home/sections.ts says the same thing from the other side: "There
 * is no fifth. HERO above and FUSS below are not markers."
 */
export function Bio({ text, about }: { text: string; about: { href: string; label: string } }) {
  return (
    <div className="bio">
      <p className="bio-text">{text}</p>
      <p className="home-exit">
        <Link href={about.href}>{about.label} →</Link>
      </p>
    </div>
  );
}
