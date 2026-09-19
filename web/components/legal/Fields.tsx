/**
 * 06.01 — the operator's details as a definition list.
 *
 * A SERVER COMPONENT, AND THAT IS THE DIFFERENCE FROM `Readout`. The panel on
 * `/privacy` is a client island because it shows values only the visitor's
 * browser knows; these five rows are typed into lib/legal/imprint.ts and are
 * the same for everyone who opens the page. They are in the HTML that arrives,
 * which for an imprint is not a nicety — it is a document that has to be
 * readable with scripting off, from a text browser, by a machine that archives
 * it.
 *
 * `<dl>` RATHER THAN A TABLE, because five labelled values are not a grid: there
 * is one column of things and one column of what they are. The stylesheet draws
 * the label column at the sheet's 150px and stacks the pair on a phone.
 *
 * DECIDES NOTHING. Every string comes from lib/legal/imprint.ts, where the
 * tests can reach it. ADR 0044.
 */
import type { Field } from "@/lib/legal/imprint";

export function Fields({ fields, label }: { fields: readonly Field[]; label: string }) {
  return (
    <dl className="lg-def" aria-label={label}>
      {fields.map((field) => (
        <div className="lg-def-row" key={field.key}>
          <dt>{field.key}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
