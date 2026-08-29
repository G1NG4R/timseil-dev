// A Server Component with no interactivity at all, which is the point: it holds
// the largest block in the chrome and ships no JavaScript for it.

/**
 * The long footer's head: the address and the three profiles.
 *
 * THE THREE PROFILE ROWS ARE NOT PROSE. `GITHUB`, `LINKEDIN` and `X` are the
 * names of the services, and `[SOON]` is one placeholder token in all three
 * languages since design-correction #6 unified it — so none of them is in the
 * dictionary.
 *
 * TWO OF THE THREE ARE NOT LINKS. GitHub exists; LinkedIn and X are `[SOON]` in
 * the sheet and are rendered as text, because a link to a profile that does not
 * exist is the same class of claim as a number nobody measured.
 */
export function FooterLead({ channel, respond }: { channel: string; respond: string }) {
  return (
    <div className="foot-lead">
      <div>
        <p className="foot-label">{channel}</p>
        <a className="foot-mail" href="mailto:contact@timseil.dev">
          contact@timseil.dev
        </a>
        <p className="foot-label" style={{ marginTop: "9px" }}>
          {respond}
        </p>
      </div>
      <span className="head-spacer" />
      <div className="foot-social">
        <a
          className="foot-social-link"
          href="https://github.com/G1NG4R"
          rel="me noreferrer"
          target="_blank"
        >
          GITHUB ↗ <span className="value">github.com/G1NG4R</span>
        </a>
        <p>
          LINKEDIN ↗ <span className="value">[SOON]</span>
        </p>
        <p>
          X ↗ <span className="value">[SOON]</span>
        </p>
      </div>
    </div>
  );
}
