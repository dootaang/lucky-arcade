/**
 * The Temerosa casino sign: a theatre marquee with a casino chip set into it.
 *
 * Everything visible here is presentation. The chip is drawn rather than
 * shipped as art, so the header costs no image request and no new font, and it
 * stays crisp at every size. Styling lives in `casino.css` under `.ca-marquee`,
 * including the entrance sequence that plays once when this mounts.
 *
 * The heading is named by `title` rather than by its own text: the wordmark is
 * Latin and the venue's real name is Korean, and assistive technology should
 * hear the real one.
 */

export interface VenueMarqueeProps {
  /** The venue's name. Becomes the heading's accessible name. */
  title: string;
  /** Latin wordmark on the sign. */
  word: string;
  /** The small line under the wordmark. */
  sub: string;
  /** Bulbs per rail. Narrow screens drop everything past the seventh in CSS. */
  bulbs?: number;
}

export function VenueMarquee({ title, word, sub, bulbs = 11 }: VenueMarqueeProps): React.ReactElement {
  return <h1 className="ca-marquee" aria-label={title}>
    <span className="ca-marquee-corners" aria-hidden="true"><i /><i /><i /><i /></span>
    <BulbRail count={bulbs} />
    <span className="ca-marquee-body">
      <span className="ca-marquee-chip" aria-hidden="true"><ChipMark /></span>
      <span className="ca-marquee-type">
        <span className="ca-marquee-word">{word}</span>
        <span className="ca-marquee-sub">{sub}</span>
      </span>
    </span>
    <BulbRail count={bulbs} />
  </h1>;
}

function BulbRail({ count }: { count: number }): React.ReactElement {
  return <span className="ca-marquee-rail" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
  </span>;
}

/** Six edge notches and a serif initial: a plaque chip, not a poker token. */
function ChipMark(): React.ReactElement {
  return <svg width="36" height="36" viewBox="0 0 48 48" focusable="false">
    <circle cx="24" cy="24" r="20.5" fill="#12100c" stroke="var(--ca-gold)" strokeWidth="1.5" />
    <g fill="var(--ca-gold)">
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <rect key={angle} x="21.5" y="1.6" width="5" height="6" rx=".6" transform={`rotate(${angle} 24 24)`} />
      ))}
    </g>
    <circle cx="24" cy="24" r="14" fill="none" stroke="var(--ca-gold)" strokeWidth=".7" opacity=".45" />
    <text x="24" y="31.5" textAnchor="middle" fontFamily="Georgia, serif" fontSize="19" fontWeight="700" fill="var(--ca-gold-bright)">T</text>
  </svg>;
}
