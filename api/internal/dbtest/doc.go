// Package dbtest holds the helpers that every test needing a real Postgres
// shares: the two test DSNs, a schema reset between tests, and the two
// assertions that a statement is refused or accepted.
//
// Everything in here sits behind the `db` build tag, so an untagged
// `go test ./...` sees an empty package rather than a skipped one. This file
// carries no tag on purpose — without it the package would have no Go files at
// all in an untagged build, and `go test ./...` treats that as an error instead
// of as "nothing to do".
//
// It lives under internal/ and not in api/migrations because it is needed from
// more than one package: the schema tests of B2 and B3, the fixtures, and from
// C1 on the pool, which has to prove against a running server that its three
// session timeouts arrived.
//
// Run the tests that use it with: make check-db
package dbtest
