package main

import (
	"fmt"
	"os"
)

// The multi-call surface of this binary, and why it exists at all.
//
// D1 shipped an image carrying one binary. D2 needs two more programs in the
// same container image — the migration that runs before the API starts and the
// seed that runs after it. Three separately linked binaries share nothing: pgx,
// database/sql and crypto/tls are paid for once each time. Measured on this
// commit: 12.06 + 11.07 + 9.02 = 32.15 MiB, against the 20 MiB ceiling
// `make check-images` enforces. Folded into this one binary the same three
// programs are 14.87 MiB — an image of roughly 17 MiB, which still fits.
//
// The ceiling is not an internal preference. It is D1's acceptance criterion,
// it is a number printed in the README, and it is on a site whose whole argument
// is that its numbers were measured. Raising it to make a design fit would be
// the wrong repair.
//
// One image also keeps a promise issue #28 relies on: the seed writes
// systems.stack from a manifest embedded at build time, so a rollback of the
// image must roll its stack claims back with it. With one tag that is a
// mechanism; with three it would be a convention somebody has to keep.
//
// The dispatch happens before config.Load for the same reason the healthcheck
// does: `api migrate up` has nothing to say about GITHUB_TOKEN, and a process
// that refuses to migrate because an unrelated variable is missing is a process
// that cannot fix the database it is complaining about. ADR 0026 §3, ADR 0027.

// subcommands maps a name to its implementation. A map rather than a switch so
// that the usage text below and the dispatch cannot disagree about what exists.
var subcommands = map[string]func(args []string) error{
	"migrate": runMigrate,
	"seed":    runSeed,
}

// wantsSubcommand reports whether the first argument names one.
//
// Only the first, and never a later one: `api migrate up` must reach runMigrate
// with ["up"], and a flag value that happens to read "seed" is an argument to
// the subcommand, not a second subcommand. The healthcheck flag is scanned
// across all arguments because it is a flag; this is a verb and verbs come first.
func wantsSubcommand(args []string) (string, []string, bool) {
	if len(args) == 0 {
		return "", nil, false
	}
	if _, ok := subcommands[args[0]]; !ok {
		return "", nil, false
	}
	return args[0], args[1:], true
}

// runSubcommand runs it and reports the exit code the process should end with.
//
// The error goes to stderr and the exit code carries the verdict, because the
// reader is an init container in a compose file: `service_completed_successfully`
// asks nothing but "was it zero", and the reason belongs in the log next to it.
func runSubcommand(name string, args []string) int {
	run, ok := subcommands[name]
	if !ok {
		fmt.Fprintf(os.Stderr, "api: unknown subcommand %q\n", name)
		return 1
	}
	if err := run(args); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", name, err)
		return 1
	}
	return 0
}
