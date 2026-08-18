package main

import "testing"

// The dispatch decides whether this process is a server or a one-shot tool, and
// it decides it from argv alone, before any configuration is read. These are the
// cases where getting it wrong is silent: a server that starts as a migration,
// or a migration that starts a server against a schema it never applied.

func TestWantsSubcommandRecognisesEachName(t *testing.T) {
	// Every key in the map, so a subcommand added without a test is a failure
	// here rather than a discovery in production.
	for name := range subcommands {
		got, rest, ok := wantsSubcommand([]string{name, "up"})
		if !ok {
			t.Errorf("wantsSubcommand(%q) = not a subcommand, want one", name)
			continue
		}
		if got != name {
			t.Errorf("wantsSubcommand(%q) named %q", name, got)
		}
		if len(rest) != 1 || rest[0] != "up" {
			t.Errorf("wantsSubcommand(%q) rest = %v, want [up]", name, rest)
		}
	}
}

func TestWantsSubcommandIgnoresEverythingElse(t *testing.T) {
	// The empty case is the server, and it is the one that must never be a
	// subcommand by accident: `api` with no arguments is how the image starts.
	cases := map[string][]string{
		"no arguments at all":      {},
		"the healthcheck flag":     {"-healthcheck"},
		"an unknown verb":          {"serve"},
		"a verb that is not first": {"-dir", "migrate"},
		"a flag before the verb":   {"-x", "seed"},
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, ok := wantsSubcommand(args); ok {
				t.Errorf("wantsSubcommand(%v) = a subcommand, want the server", args)
			}
		})
	}
}

// A verb only counts in first position. `api migrate -dir seed up` passes "seed"
// to the migrate flag set; reading it as a second subcommand would run the wrong
// program against the wrong role.
func TestWantsSubcommandTakesOnlyTheFirstWord(t *testing.T) {
	name, rest, ok := wantsSubcommand([]string{"migrate", "seed"})
	if !ok || name != "migrate" {
		t.Fatalf("wantsSubcommand = %q, %v, want migrate", name, ok)
	}
	if len(rest) != 1 || rest[0] != "seed" {
		t.Fatalf("rest = %v, want [seed] — the second word is an argument", rest)
	}
}

// The exit code is the entire message an init container sends: compose's
// service_completed_successfully asks nothing else.
func TestRunSubcommandReportsFailureAsNonZero(t *testing.T) {
	if code := runSubcommand("nosuch", nil); code == 0 {
		t.Error("an unknown subcommand exited 0 — compose would treat it as applied")
	}
	// seed rejects a stray argument before it dials, so this needs no database.
	if code := runSubcommand("seed", []string{"unexpected"}); code == 0 {
		t.Error("seed with a stray argument exited 0")
	}
}

// The migrate verb list and the switch that handles it are two spellings of one
// list. This is the test that notices when only one of them is edited.
func TestKnownMigrateCommandsRejectsATypo(t *testing.T) {
	for _, verb := range []string{"up", "down", "reset", "status", "version"} {
		if !knownMigrateCommands[verb] {
			t.Errorf("%q is handled by runMigrate but not listed as known", verb)
		}
	}
	// `create` is deliberately absent: it is handled earlier because it is the
	// one verb that writes a file and never opens a connection.
	if knownMigrateCommands["create"] {
		t.Error("create must not be in the list that requires a database")
	}
	if knownMigrateCommands["destroy"] {
		t.Error("an unknown verb is listed as known")
	}
}

// A typo must not report a missing DSN. That error names the wrong problem and
// sends you to .env instead of to the command you mistyped.
func TestRunMigrateRejectsAnUnknownVerbWithoutADatabase(t *testing.T) {
	t.Setenv("MIGRATE_DATABASE_URL", "")
	err := runMigrate([]string{"destroy"})
	if err == nil {
		t.Fatal("runMigrate accepted an unknown verb")
	}
	if got := err.Error(); got != `unknown command "destroy"` {
		t.Errorf("error = %q, want it to name the verb, not the environment", got)
	}
}

func TestRunMigrateNeedsAVerb(t *testing.T) {
	if err := runMigrate(nil); err == nil {
		t.Error("runMigrate with no verb was accepted")
	}
}
