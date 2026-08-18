package contact

import (
	"crypto/rand"
	"encoding/binary"
	"strings"
	"time"
)

// The receipt.
//
// contact_messages.id is handed out here rather than by a sequence, because it
// appears in the 202 body: it is the one thing a visitor takes away from the
// form, and the contact page keeps their text in the field so that they can
// quote it. 00006_contact.sql says as much in its first column comment.
//
// Crockford's base32 rather than hex or a UUID. It drops I, L, O and U, so
// there is no pair of characters a person can confuse while reading an id off a
// screen and typing it into a mail — which is exactly what a receipt is for.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const (
	// The millisecond timestamp, 50 bits, most significant first. Sortable, and
	// it means a quoted receipt can be found in the table by time even if the
	// row itself has been purged by the L7 retention job.
	idTimeChars = 10

	// Thirty bits of randomness. Two messages in the same millisecond need it;
	// beyond that it is what stops an id from being guessable, which matters
	// only a little — nothing is authorised by one — but costs six characters.
	idRandomChars = 6

	idPrefix = "msg_"
)

// newID returns a receipt.
//
// The contract's example is `msg_01K3F9QX7A`, which is ten characters: a
// millisecond timestamp and nothing else. That is a collision waiting for two
// visitors in one millisecond, so this is six characters longer. `id` is a free
// string in the contract and the example is an example, so the two do not
// disagree — but the difference is deliberate and is written down here rather
// than discovered.
func newID(now time.Time) string {
	var out strings.Builder
	out.Grow(len(idPrefix) + idTimeChars + idRandomChars)
	out.WriteString(idPrefix)

	encode(&out, uint64(now.UnixMilli()), idTimeChars)

	var random [4]byte
	// Documented never to fail; it panics rather than returning short. A
	// receipt with a predictable tail would still be a valid receipt, so there
	// is nothing here worth degrading to.
	_, _ = rand.Read(random[:])
	encode(&out, uint64(binary.BigEndian.Uint32(random[:])), idRandomChars)

	return out.String()
}

// encode writes the low 5×width bits of v as Crockford base32, most significant
// character first, zero padded.
func encode(out *strings.Builder, v uint64, width int) {
	for i := width - 1; i >= 0; i-- {
		out.WriteByte(crockford[(v>>(5*uint(i)))&31])
	}
}
