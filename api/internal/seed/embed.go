package seed

import "embed"

// The two halves of the seed, embedded so the binary carries them: the rows in
// seed.sql, and the stack strings that `make gen` resolved out of go.mod,
// package.json and compose.dev.yaml.
//
// Both directives live in this file because go:embed cannot reach outside its
// own directory — the same reason make gen copies the contract bundle into
// api/internal/httpx/assets and the migrations keep their embed.go beside the
// .sql files.
//
//go:embed seed.sql
//go:embed stack.gen.json
var files embed.FS
