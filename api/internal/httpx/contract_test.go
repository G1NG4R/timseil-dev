package httpx

import (
	"net/http"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// The contract test for the three routes this phase actually implements.
//
// The handler tests next door check that the routes behave. This one checks that they
// behave the way the contract *says* — and it reads the expectation out of the
// embedded document instead of repeating it, so changing the contract without
// changing the handler fails here rather than in a reader's client six months later.
//
// The endpoints described but not yet built (stage C) have nothing to test against;
// their contract tests arrive with their handlers.

type specDoc struct {
	Paths map[string]struct {
		Get *struct {
			Responses map[string]struct {
				Headers map[string]struct {
					Ref string `yaml:"$ref"`
				} `yaml:"headers"`
				Content map[string]struct{} `yaml:"content"`
			} `yaml:"responses"`
		} `yaml:"get"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`
	} `yaml:"components"`
}

func loadSpec(t *testing.T) specDoc {
	t.Helper()
	var doc specDoc
	if err := yaml.Unmarshal(mustRead(specPath), &doc); err != nil {
		t.Fatalf("embedded document does not parse: %v", err)
	}
	return doc
}

// declared returns the media type and the Cache-Control value the contract promises
// for a 200 on this path, resolving the one level of $ref the bundle keeps.
func declared(t *testing.T, doc specDoc, path string) (mediaType, cacheControl string) {
	t.Helper()

	item, ok := doc.Paths[path]
	if !ok || item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", path)
	}
	ok200, ok := item.Get.Responses["200"]
	if !ok {
		t.Fatalf("GET %s declares no 200 response", path)
	}

	for mt := range ok200.Content {
		if mediaType != "" {
			t.Fatalf("GET %s declares more than one 200 media type", path)
		}
		mediaType = mt
	}
	if mediaType == "" {
		t.Fatalf("GET %s declares no 200 content", path)
	}

	ref := ok200.Headers["Cache-Control"].Ref
	if ref == "" {
		t.Fatalf("GET %s declares no Cache-Control header", path)
	}
	name := ref[strings.LastIndex(ref, "/")+1:]
	cacheControl = doc.Components.Headers[name].Schema.Const
	if cacheControl == "" {
		t.Fatalf("components.headers.%s has no const value", name)
	}
	return mediaType, cacheControl
}

func TestResponsesMatchTheContract(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range []string{"/api/docs", "/api/openapi.yaml", "/api/docs/scalar.js"} {
		t.Run(path, func(t *testing.T) {
			wantType, wantCache := declared(t, doc, path)

			rec := get(t, path, map[string]string{"Accept-Encoding": "gzip"})
			if rec.Code != http.StatusOK {
				t.Fatalf("GET %s = %d, want %d", path, rec.Code, http.StatusOK)
			}

			// The contract names the media type; the response may add a charset.
			if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, wantType) {
				t.Errorf("Content-Type = %q, contract says %q", got, wantType)
			}
			if got := rec.Header().Get("Cache-Control"); got != wantCache {
				t.Errorf("Cache-Control = %q, contract says %q", got, wantCache)
			}
			// Every public GET in this contract promises an ETag.
			if rec.Header().Get("ETag") == "" {
				t.Errorf("no ETag, contract declares one")
			}
		})
	}
}

// Every public operation declares 429, and this is the assertion that keeps it
// true.
//
// The limiter runs on the whole /api/ prefix, so any operation added later is
// rejectable the day it exists — and an endpoint whose contract does not
// mention 429 is an endpoint whose generated client will treat one as a
// protocol error and retry it immediately. That is worse than no limit at all,
// and it is exactly the kind of omission nobody notices while writing a
// handler. So the document is asked rather than the author reminded.
func TestEveryOperationDeclaresARateLimit(t *testing.T) {
	var doc struct {
		Paths map[string]map[string]struct {
			OperationID string                    `yaml:"operationId"`
			Responses   map[string]map[string]any `yaml:"responses"`
		} `yaml:"paths"`
	}
	if err := yaml.Unmarshal(mustRead(specPath), &doc); err != nil {
		t.Fatalf("the embedded document does not parse: %v", err)
	}
	if len(doc.Paths) == 0 {
		t.Fatal("the embedded document describes no paths at all")
	}

	for path, methods := range doc.Paths {
		for method, op := range methods {
			if _, ok := op.Responses["429"]; !ok {
				t.Errorf("%s %s (%s) declares no 429 — the rate limiter can return "+
					"one, so a client cannot be left to discover it",
					strings.ToUpper(method), path, op.OperationID)
			}
		}
	}
}
