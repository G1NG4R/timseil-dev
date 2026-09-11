/**
 * The four shapes a legal section is made of, rendered.
 *
 * DECIDES NOTHING. Every string comes from lib/legal/content.ts, which is where
 * the tests can reach it; this file is markup plus one switch, the division ADR
 * 0044 draws and ADR 0048 restates.
 *
 * THE TABLES ARE REAL TABLES, and at 390 the stylesheet turns them into stacked
 * rows with their headers repeated through `data-head`. ADR 0055 settled that
 * for the case study's spec rail: a table that stays a table on a phone is four
 * words per line, and one that becomes a list loses the header its cells are
 * only meaningful under.
 */
import type { Block } from "@/lib/legal/content";

export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "p":
            return (
              <p className="lg-p" key={index}>
                {block.text}
              </p>
            );

          case "note":
            return (
              <p className="lg-note" key={index}>
                {block.text}
              </p>
            );

          case "numbered":
            return (
              <ol className="lg-numbered" key={index}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            );

          case "table":
            return (
              <div className="lg-table-wrap" key={index}>
                <table className="lg-table">
                  <thead>
                    <tr>
                      {block.head.map((cell) => (
                        <th key={cell} scope="col">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={row.join("|")}>
                        {row.map((cell, column) => (
                          <td key={column} data-head={block.head[column]}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
