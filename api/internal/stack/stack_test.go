package stack

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeTree lays down a miniature repository: one file per source kind the
// resolver supports, with the shapes the real files have — a caret range, an
// `// indirect` marker, an image with a suffixed tag, a bare major.
func writeTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	files := map[string]string{
		"web/package.json": `{
  "dependencies": { "next": "16.3.1", "react": "^19.2.8" },
  "devDependencies": { "typescript": "^5" }
}
`,
		"api/go.mod": "module example.test/api\n\ngo 1.26.0\n\nrequire (\n" +
			"\tgithub.com/jackc/pgx/v5 v5.10.0\n" +
			"\tgolang.org/x/mod v0.38.0 // indirect\n)\n\n" +
			"require github.com/pressly/goose/v3 v3.27.3\n",
		"compose.dev.yaml": "services:\n  db:\n    image: postgres:18.6-alpine\n  api:\n    image: alpine\n",
		".nvmrc":           "24\n",
	}
	for name, body := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir for %s: %v", name, err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatalf("writing %s: %v", name, err)
		}
	}
	return root
}

func writeManifest(t *testing.T, root, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, FileName), []byte(body), 0o644); err != nil {
		t.Fatalf("writing %s: %v", FileName, err)
	}
}

// ------------------------------------------------------------- the good case

func TestResolveReadsEveryKindOfSource(t *testing.T) {
	root := writeTree(t)
	writeManifest(t, root, `systems:
  demo:
    - { name: "Next.js",    from: "web/package.json", key: "dependencies.next" }
    - { name: "React",      from: "web/package.json", key: "dependencies.react" }
    - { name: "TypeScript", from: "web/package.json", key: "devDependencies.typescript" }
    - { name: "Go",         from: "api/go.mod",       key: "go" }
    - { name: "pgx",        from: "api/go.mod",       key: "github.com/jackc/pgx/v5" }
    - { name: "goose",      from: "api/go.mod",       key: "github.com/pressly/goose/v3" }
    - { name: "PostgreSQL", from: "compose.dev.yaml", key: "services.db.image" }
    - { name: "Node",       from: ".nvmrc" }
    - { name: "FastAPI" }
`)

	manifest, err := Load(root)
	if err != nil {
		t.Fatalf("loading the manifest: %v", err)
	}
	resolved, err := manifest.Resolve(root)
	if err != nil {
		t.Fatalf("resolving: %v", err)
	}

	want := []string{
		"Next.js 16.3", "React 19.2", "TypeScript 5", "Go 1.26", "pgx 5.10",
		"goose 3.27", "PostgreSQL 18.6", "Node 24", "FastAPI",
	}
	if len(resolved) != len(want) {
		t.Fatalf("got %d entries, want %d", len(resolved), len(want))
	}
	for i, r := range resolved {
		if got := r.Display(); got != want[i] {
			t.Errorf("entry %d: got %q, want %q", i, got, want[i])
		}
	}
}

func TestBareEntryCarriesNoVersionAndNoTrailingSpace(t *testing.T) {
	r := Resolved{Name: "Python"}
	if got := r.Display(); got != "Python" {
		t.Errorf("got %q, want %q", got, "Python")
	}
	if got := r.Origin(); got != "no source in this repo" {
		t.Errorf("origin: got %q", got)
	}
}

func TestBundleGroupsBySystemInManifestOrder(t *testing.T) {
	root := writeTree(t)
	writeManifest(t, root, `systems:
  second:
    - { name: "Docker" }
  first:
    - { name: "Go", from: "api/go.mod", key: "go" }
    - { name: "Node", from: ".nvmrc" }
`)

	manifest, err := Load(root)
	if err != nil {
		t.Fatalf("loading: %v", err)
	}
	bundle, err := manifest.Bundle(root)
	if err != nil {
		t.Fatalf("bundling: %v", err)
	}

	if got, want := strings.Join(bundle.Systems["first"], " · "), "Go 1.26 · Node 24"; got != want {
		t.Errorf("first: got %q, want %q", got, want)
	}
	if got, want := strings.Join(bundle.Systems["second"], " · "), "Docker"; got != want {
		t.Errorf("second: got %q, want %q", got, want)
	}
	if bundle.Source != FileName {
		t.Errorf("source: got %q, want %q", bundle.Source, FileName)
	}
}

// ---------------------------------------------------------- normalization

func TestNormalizeTakesAtMostTwoComponents(t *testing.T) {
	cases := map[string]string{
		"16.3.1":         "16.3",
		"^19.2.8":        "19.2",
		"~5.4.2":         "5.4",
		"v1.26.0":        "1.26",
		"1.26.0":         "1.26",
		">= 1.21":        "1.21",
		"^5":             "5",
		"24":             "24",
		"24\n":           "24",
		"  18.6-alpine ": "18.6",
		"3.27.3":         "3.27",
	}
	for raw, want := range cases {
		got, err := normalize(raw)
		if err != nil {
			t.Errorf("normalize(%q): unexpected error %v", raw, err)
			continue
		}
		if got != want {
			t.Errorf("normalize(%q) = %q, want %q", raw, got, want)
		}
	}
}

// The broken case that matters most: a range no page can honestly render. `0`
// would be a number where there is no measurement, which is invariant 1 wearing
// a version number.
func TestNormalizeRefusesWhatIsNotANumber(t *testing.T) {
	for _, raw := range []string{"latest", "*", "", "   ", "^", "next", "alpine"} {
		if got, err := normalize(raw); err == nil {
			t.Errorf("normalize(%q) returned %q — it must refuse", raw, got)
		}
	}
}

// ------------------------------------------------------------ broken cases

// A literal version is the whole thing the manifest exists to prevent, so it
// gets the error message that explains itself.
func TestParseRefusesALiteralVersion(t *testing.T) {
	_, err := Parse([]byte(`systems:
  demo:
    - { name: "PostgreSQL", version: "18.6" }
`))
	if err == nil {
		t.Fatal("a literal version was accepted — stack.yaml must never carry one")
	}
	for _, want := range []string{"PostgreSQL", "never versions"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

// `form:` instead of `from:` used to be the dangerous typo: the entry would
// silently become a bare name and the version would vanish from the page.
func TestParseRefusesAnUnknownKey(t *testing.T) {
	_, err := Parse([]byte(`systems:
  demo:
    - { name: "Go", form: "api/go.mod", key: "go" }
`))
	if err == nil {
		t.Fatal("an unknown key was accepted — a typo must not turn into a bare name")
	}
}

func TestParseRefusesKeyWithoutFrom(t *testing.T) {
	_, err := Parse([]byte(`systems:
  demo:
    - { name: "Go", key: "go" }
`))
	if err == nil {
		t.Fatal("key without from was accepted")
	}
	if !strings.Contains(err.Error(), "without from") {
		t.Errorf("error %q does not say what is missing", err)
	}
}

func TestParseRefusesTheEmptyShapes(t *testing.T) {
	cases := map[string]string{
		"no systems":  "systems: {}\n",
		"no entries":  "systems:\n  demo: []\n",
		"no name":     "systems:\n  demo:\n    - { from: \".nvmrc\" }\n",
		"not yaml":    "systems: [\n",
		"empty file":  "",
		"wrong shape": "systems: 3\n",
	}
	for what, body := range cases {
		if _, err := Parse([]byte(body)); err == nil {
			t.Errorf("%s was accepted", what)
		}
	}
}

func TestResolveNamesTheMissingKeyAndTheMissingFile(t *testing.T) {
	root := writeTree(t)
	writeManifest(t, root, `systems:
  demo:
    - { name: "Tailwind", from: "web/package.json", key: "dependencies.tailwindcss" }
    - { name: "Traefik",  from: "compose.observability.yaml", key: "services.proxy.image" }
    - { name: "Go",       from: "api/go.mod", key: "go" }
`)

	manifest, err := Load(root)
	if err != nil {
		t.Fatalf("loading: %v", err)
	}
	resolved, err := manifest.Resolve(root)
	if err == nil {
		t.Fatal("two unresolvable entries went through")
	}

	// One run reports every broken entry. Being sent back for the next one is
	// how a check stops being read.
	if !strings.Contains(err.Error(), "tailwindcss") {
		t.Errorf("error %q does not name the missing key", err)
	}
	if !strings.Contains(err.Error(), "compose.observability.yaml") {
		t.Errorf("error %q does not name the missing file", err)
	}
	if len(resolved) != 3 {
		t.Fatalf("got %d rows, want all 3 so the table stays printable", len(resolved))
	}
	if resolved[0].Err == nil || resolved[1].Err == nil {
		t.Error("the broken rows do not carry their own error")
	}
	if resolved[2].Err != nil || resolved[2].Display() != "Go 1.26" {
		t.Errorf("the healthy row was spoiled: %+v", resolved[2])
	}
}

func TestResolveRefusesAnUntaggedImage(t *testing.T) {
	root := writeTree(t)
	writeManifest(t, root, `systems:
  demo:
    - { name: "Alpine", from: "compose.dev.yaml", key: "services.api.image" }
`)

	manifest, err := Load(root)
	if err != nil {
		t.Fatalf("loading: %v", err)
	}
	if _, err := manifest.Resolve(root); err == nil {
		t.Fatal("an image without a tag resolved — there is no version to show")
	} else if !strings.Contains(err.Error(), "no tag") {
		t.Errorf("error %q does not say the tag is missing", err)
	}
}

// The whole point of #93: a digest-pinned image still shows its tag.
//
// Until this worked, compose.yaml could not pin the db image, because the
// resolver read the last colon and put `sha256:…` on the page. That left one
// image in the system on a movable tag and made "every image is pinned" false.
func TestResolveReadsTheTagOfADigestPinnedImage(t *testing.T) {
	digest := "sha256:c8a1f4c3f0e2b6d5a9748f1e0b3c2d5a6e7f8091a2b3c4d5e6f708192a3b4c5d"

	cases := map[string]struct{ image, want string }{
		"tag and digest":  {"postgres:18.6-alpine@" + digest, "18.6"},
		"tag alone":       {"postgres:18.6-alpine", "18.6"},
		"registry port":   {"registry.example:5000/postgres:18.6-alpine", "18.6"},
		"port and digest": {"registry.example:5000/postgres:18.6-alpine@" + digest, "18.6"},
	}

	for what, tc := range cases {
		root := writeTree(t)
		body := "services:\n  db:\n    image: " + tc.image + "\n"
		if err := os.WriteFile(filepath.Join(root, "compose.dev.yaml"), []byte(body), 0o644); err != nil {
			t.Fatalf("%s: writing compose: %v", what, err)
		}
		writeManifest(t, root, `systems:
  demo:
    - { name: "PostgreSQL", from: "compose.dev.yaml", key: "services.db.image" }
`)

		manifest, err := Load(root)
		if err != nil {
			t.Errorf("%s: loading: %v", what, err)
			continue
		}
		resolved, err := manifest.Resolve(root)
		if err != nil {
			t.Errorf("%s: resolving: %v", what, err)
			continue
		}
		if got := resolved[0].Version; got != tc.want {
			t.Errorf("%s: image %q resolved to %q, want %q", what, tc.image, got, tc.want)
		}
	}
}

// A digest with no tag in front of it is still refused. It pins the bytes, but
// it is not a version a reader can do anything with, and invariant 1 says an
// unreadable number does not go on the page.
func TestResolveRefusesADigestWithoutATag(t *testing.T) {
	root := writeTree(t)
	body := "services:\n  db:\n    image: postgres@sha256:c8a1f4c3f0e2b6d5a9748f1e0b3c2d5a6e7f8091a2b3c4d5e6f708192a3b4c5d\n"
	if err := os.WriteFile(filepath.Join(root, "compose.dev.yaml"), []byte(body), 0o644); err != nil {
		t.Fatalf("writing compose: %v", err)
	}
	writeManifest(t, root, `systems:
  demo:
    - { name: "PostgreSQL", from: "compose.dev.yaml", key: "services.db.image" }
`)

	manifest, err := Load(root)
	if err != nil {
		t.Fatalf("loading: %v", err)
	}
	if _, err := manifest.Resolve(root); err == nil {
		t.Fatal("a digest without a tag resolved — there is no version to show")
	} else if !strings.Contains(err.Error(), "no tag") {
		t.Errorf("error %q does not say the tag is missing", err)
	}
}

func TestResolveRefusesAnUnsupportedSourceAndAMissingKey(t *testing.T) {
	root := writeTree(t)
	if err := os.WriteFile(filepath.Join(root, "VERSION"), []byte("1.2.3\n"), 0o644); err != nil {
		t.Fatalf("writing VERSION: %v", err)
	}

	cases := map[string]string{
		"unsupported source": `{ name: "Thing", from: "VERSION" }`,
		"go.mod without key": `{ name: "Go", from: "api/go.mod" }`,
		"json without key":   `{ name: "Next.js", from: "web/package.json" }`,
		"yaml without key":   `{ name: "Postgres", from: "compose.dev.yaml" }`,
		"path into a string": `{ name: "Nope", from: "compose.dev.yaml", key: "services.db.image.tag" }`,
		"value not a string": `{ name: "Nope", from: "compose.dev.yaml", key: "services" }`,
	}
	for what, entry := range cases {
		writeManifest(t, root, "systems:\n  demo:\n    - "+entry+"\n")
		manifest, err := Load(root)
		if err != nil {
			t.Errorf("%s: loading: %v", what, err)
			continue
		}
		if _, err := manifest.Resolve(root); err == nil {
			t.Errorf("%s was accepted", what)
		}
	}
}

func TestLoadReportsAMissingManifest(t *testing.T) {
	if _, err := Load(t.TempDir()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("got %v, want a not-exist error", err)
	}
}
