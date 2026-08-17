// Package migrations carries the SQL schema of timseil.dev and nothing else.
//
// The .sql files live next to this one rather than under internal/ for a
// mechanical reason: go:embed cannot reach outside its own directory, and the
// repo layout puts migrations at api/migrations/. Keeping the embed here means
// the directory is both the source a human reads and the artefact the binary
// ships — a migration that is not committed simply does not exist.
//
// Every file is plain SQL with goose annotations. No Go migrations: logic that
// only ever runs forward is logic nobody tests backwards, and sqlc (C1) reads
// this directory as its schema input and would choke on it.
package migrations

import "embed"

// FS holds every migration in lexical order, which is also apply order — the
// five-digit prefix is what makes those two the same thing.
//
//go:embed *.sql
var FS embed.FS
