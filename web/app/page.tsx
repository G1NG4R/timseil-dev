// Server Component by default — no 'use client' here and none without a
// comment saying why, anywhere.
//
// This page exists so that `make dev` can prove hot reload on the web side.
// The homepage itself is stage H; nothing about it is decided here.

export default function Home() {
  return (
    <main>
      <h1>timseil.dev</h1>
      <p>Development shell. The site itself is built in stage H.</p>
    </main>
  );
}
