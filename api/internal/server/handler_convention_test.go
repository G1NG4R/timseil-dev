package server

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// Every package that answers a contract operation has a contract test.
//
// ADR 0024 names this as the one thing the router parity check does not buy:
// parity proves that the fourteen paths are mounted and that nothing else is,
// but it says nothing about what comes back on them. That is what each
// package's contract_test.go is for — and until this file existed it was a
// convention, which is to say a thing that holds until somebody adds a package
// on a busy afternoon.
//
// **The list of handler packages is not written here.** It is derived, for the
// same reason router_parity_test.go derives its routing table instead of
// listing it: a hand-written list is a second copy of the truth, and the copy
// is what goes stale. A package qualifies if it declares a method named after
// an operation of the generated StrictServerInterface — the operation names
// come from reflection on generated code, the declarations from the source.
//
// Generated files do not count. Without that rule internal/store qualifies,
// because sqlc happens to generate methods called ListSystems and
// GetContributions on its Queries type, and demanding a contract test of the
// data layer would be nonsense produced by a coincidence of naming.
// middleware and server declare no such methods and fall out on their own; no
// exclusion list is needed anywhere.

func operationNames(t *testing.T) []string {
	t.Helper()

	iface := reflect.TypeOf((*httpx.StrictServerInterface)(nil)).Elem()
	if iface.NumMethod() == 0 {
		t.Fatal("StrictServerInterface has no methods — this test would pass on anything")
	}

	names := make([]string, 0, iface.NumMethod())
	for i := range iface.NumMethod() {
		names = append(names, iface.Method(i).Name)
	}
	return names
}

// handlerPackages walks api/internal and returns the directories that declare a
// method named after a contract operation, in hand-written code.
func handlerPackages(t *testing.T, ops []string) []string {
	t.Helper()

	const root = ".."

	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("reading %s: %v", root, err)
	}

	var found []string
	fset := token.NewFileSet()

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(root, e.Name())

		files, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("reading %s: %v", dir, err)
		}

		for _, f := range files {
			name := f.Name()
			if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
				continue
			}

			parsed, err := parser.ParseFile(fset, filepath.Join(dir, name), nil, parser.ParseComments)
			if err != nil {
				t.Fatalf("parsing %s: %v", filepath.Join(dir, name), err)
			}
			// The marker sits above the package clause; ast.IsGenerated is the
			// same rule the toolchain uses, so this cannot disagree with it.
			if ast.IsGenerated(parsed) {
				continue
			}

			if declaresOperation(parsed, ops) {
				found = append(found, e.Name())
				break
			}
		}
	}

	if len(found) == 0 {
		t.Fatal("no handler package found at all — the detection is broken, not the tree")
	}
	return found
}

func declaresOperation(f *ast.File, ops []string) bool {
	for _, d := range f.Decls {
		fn, ok := d.(*ast.FuncDecl)
		if !ok || fn.Recv == nil {
			continue // a method, not a function: the handlers hang off a type
		}
		if slices.Contains(ops, fn.Name.Name) {
			return true
		}
	}
	return false
}

func TestEveryHandlerPackageHasAContractTest(t *testing.T) {
	ops := operationNames(t)

	for _, pkg := range handlerPackages(t, ops) {
		path := filepath.Join("..", pkg, "contract_test.go")
		if _, err := os.Stat(path); err != nil {
			t.Errorf("internal/%s answers a contract operation and has no contract_test.go\n"+
				"    router parity proves the path is mounted; only a contract test proves\n"+
				"    what comes back on it (ADR 0024)", pkg)
		}
	}
}

// The set, stated once, so that "seven of seven" is something this suite
// asserts rather than something a commit message claims. It moves when a
// package is added, and moving it is meant to be a deliberate line in a diff.
//
// httpx is deliberately NOT among them, and finding that out is what the
// generated-file rule is worth: its fourteen operation methods all live in
// gen.go. It has a contract_test.go of its own, holding the cache directives
// against the served document — a different claim from "this handler answers
// what the contract says", and not one this rule is about.
func TestTheHandlerPackagesAreTheOnesExpected(t *testing.T) {
	want := []string{"badge", "contact", "contributions", "health", "intake", "systems", "training"}

	got := handlerPackages(t, operationNames(t))
	slices.Sort(got)

	if !slices.Equal(got, want) {
		t.Errorf("handler packages are %v, expected %v — if that is right, this list moves with it", got, want)
	}
}
