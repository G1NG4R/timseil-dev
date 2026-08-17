// Command genstack resolves stack.yaml against the files that actually declare
// the versions and writes the result where the seed can embed it.
//
// Two modes, because they answer two different questions:
//
//	genstack            writes internal/seed/stack.gen.json  (make gen)
//	genstack -verify    prints the resolution table, writes nothing  (make check-stack)
//
// The written file is the drift guard: `make check` regenerates it and compares
// checksums, so bumping next in package.json without running `make gen` is red.
// -verify is the diagnosis — it names the entry that stopped resolving, which a
// checksum mismatch cannot.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/G1NG4R/timseil-dev/api/internal/stack"
)

// Defaults assume the working directory is api/, which is where make gen and
// tools/check-stack.sh run this from.
const (
	defaultRoot = ".."
	defaultOut  = "internal/seed/stack.gen.json"
)

func main() {
	root := flag.String("root", defaultRoot, "repository root, where stack.yaml lives")
	out := flag.String("o", defaultOut, "where to write the resolved bundle")
	verify := flag.Bool("verify", false, "print the resolution table and write nothing")
	flag.Parse()

	if err := run(*root, *out, *verify); err != nil {
		fmt.Fprintf(os.Stderr, "genstack: %v\n", err)
		os.Exit(1)
	}
}

func run(root, out string, verify bool) error {
	manifest, err := stack.Load(root)
	if err != nil {
		return err
	}

	if verify {
		return report(manifest, root)
	}

	bundle, err := manifest.Bundle(root)
	if err != nil {
		return err
	}
	return write(out, bundle)
}

// report prints one line per entry and fails if any of them could not resolve.
// The glyphs and the two-space indent match tools/check-*.sh, because this is
// read as one section of `make check`.
func report(manifest *stack.Manifest, root string) error {
	resolved, resolveErr := manifest.Resolve(root)

	systemWidth, displayWidth := 0, 0
	for _, r := range resolved {
		if n := len(r.System); n > systemWidth {
			systemWidth = n
		}
		if n := len(r.Display()); n > displayWidth {
			displayWidth = n
		}
	}

	for _, r := range resolved {
		if r.Err != nil {
			fmt.Printf("  ✗ %-*s  %s\n", systemWidth, r.System, r.Name)
			fmt.Printf("    → %v\n", r.Err)
			continue
		}
		fmt.Printf("  ✓ %-*s  %-*s  ← %s\n",
			systemWidth, r.System, displayWidth, r.Display(), r.Origin())
	}
	return resolveErr
}

func write(out string, bundle *stack.Bundle) error {
	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		return err
	}
	// Trailing newline: .editorconfig requires one on every file, and
	// tools/check-repo.sh checks that it is there.
	data = append(data, '\n')

	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	return os.WriteFile(out, data, 0o644)
}
