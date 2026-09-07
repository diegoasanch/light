"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import type { BoardData } from "@/lib/pcb-types";
import { resolveSelection, type Selection } from "@/lib/selection";
import { netColor } from "@/lib/net-colors";
import { componentDescription } from "@/lib/component-description";
import { COMPONENT_SPECS } from "@/lib/component-specs";
import styles from "./Inspector.module.css";
export function Inspector({
  data,
  selection,
  onSelect,
  isolate,
  onIsolate,
  view = "explorer",
}: {
  view?: "explorer" | "details";
  data: BoardData;
  selection: Selection;
  onSelect: (s: Selection) => void;
  isolate: boolean;
  onIsolate: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"areas" | "parts" | "nets">("areas");
  const [keyboard, setKeyboard] = useState(false);
  const { components, areas, nets } = data.connectivity;
  const graph = useMemo(
    () => resolveSelection(data, selection),
    [data, selection],
  );
  const part =
    selection?.kind === "component"
      ? components.find((p) => p.ref === selection.id)
      : undefined;
  const spec = part ? COMPONENT_SPECS[part.value] : undefined;
  const datasheet = part?.datasheet || spec?.datasheet || "";
  const title = part
    ? `${part.ref} · ${part.value}`
    : selection?.kind === "area"
      ? areas.find((a) => a.id === selection.id)?.name
      : selection?.kind === "net"
        ? nets.find((n) => n.id === selection.id)?.name
        : "Explore the board";
  const matches = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: "spring", duration: 0.22, bounce: 0 }}
    >
      <aside
        className={view === "details" ? `${styles.rightPanel} ${styles.detailStack}` : styles.panel}
        aria-label={view === "details" ? "Selection details" : "Board explorer"}
        onKeyDown={() => setKeyboard(true)}
        onPointerDown={() => setKeyboard(false)}
      >
        {view === "explorer" && <>
        <div className={styles.heading}>
          <span>BOARD EXPLORER</span>
          <span>{nets.length} nets</span>
        </div>
        <div className={styles.tabs}>
          {(["areas", "parts", "nets"] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <input
          aria-label="Search areas, parts or nets"
          placeholder={`Find ${tab}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.list}>
          {tab === "areas" &&
            areas
              .filter(
                (a) =>
                  matches(a.name) && components.some((p) => p.area === a.id),
              )
              .map((a) => (
                <button
                  key={a.id}
                  aria-pressed={
                    selection?.kind === "area" && selection.id === a.id
                  }
                  onClick={() => onSelect({ kind: "area", id: a.id })}
                >
                  <span>{a.name}</span>
                  <small>
                    {components.filter((p) => p.area === a.id).length}
                  </small>
                </button>
              ))}
          {tab === "parts" &&
            components
              .filter((p) => matches(`${p.ref} ${p.value} ${p.footprint}`))
              .sort((a, b) =>
                a.ref.localeCompare(b.ref, undefined, { numeric: true }),
              )
              .map((p) => (
                <button
                  key={p.ref}
                  aria-pressed={part?.ref === p.ref}
                  onClick={() => onSelect({ kind: "component", id: p.ref })}
                >
                  <b>{p.ref}</b>
                  <span>{p.value}</span>
                </button>
              ))}
          {tab === "nets" &&
            nets
              .filter((n) => matches(n.name))
              .map((n) => (
                <button
                  key={n.id}
                  style={{ borderLeft: `3px solid ${netColor(n.name)}` }}
                  aria-pressed={
                    selection?.kind === "net" && selection.id === n.id
                  }
                  onClick={() => onSelect({ kind: "net", id: n.id })}
                >
                  <span>{n.name}</span>
                </button>
              ))}
        </div>
        </>}
        {view === "details" && <>
        <div className={`${styles.panel} ${styles.detailCard}`}>
        <div className={styles.heading}>
          <span>SELECTION DETAILS</span>
          <button aria-label="Close selection details" onClick={() => { onSelect(null); onIsolate(false); }}>×</button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={`${selection?.kind}:${selection?.id}`}
            initial={{ opacity: keyboard ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: keyboard ? 1 : 0 }}
            transition={{ duration: keyboard ? 0 : 0.12 }}
            className={styles.detail}
          >
            <div className={styles.identity}>
              <span className={styles.componentId}>{selection?.id ?? "—"}</span>
              <h2>{part?.value && part.value !== "~" ? part.value : part ? part.footprint : title}</h2>
              {part && <p>{componentDescription(part, data)}</p>}
            </div>
            {part && (/^https?:\/\//.test(datasheet) ? (
              <a href={datasheet} target="_blank" rel="noreferrer">Datasheet ↗</a>
            ) : <p>Datasheet unavailable</p>)}
            {!selection ? (
              <p>
                Select a component on the board, a schematic area, or a net to
                follow its connections.
              </p>
            ) : (
              <>
                <details className={styles.moreDetails}>
                  <summary>More details</summary>
                <p>
                  {graph.connected.size} connected parts · {graph.nets.size}{" "}
                  nets
                </p>
                <div className={styles.actions}>
                  <motion.button
                    whileTap={{ scale: keyboard ? 1 : 0.97 }}
                    aria-pressed={isolate}
                    onClick={() => onIsolate(!isolate)}
                  >
                    {isolate ? "Exit isolation" : "Isolate connections"}
                  </motion.button>
                  <button
                    onClick={() => {
                      onSelect(null);
                      onIsolate(false);
                    }}
                  >
                    Exit
                  </button>
                </div>
                {part && (
                  <>
                    {spec && <p>{spec.specs}</p>}
                    <dl>
                      <dt>Area</dt>
                      <dd>{areas.find((a) => a.id === part.area)?.name}</dd>
                      <dt>Package</dt>
                      <dd>{part.footprint}</dd>
                      <dt>Side</dt>
                      <dd>{part.side === "F" ? "Front" : "Back"}</dd>
                      <dt>Pads</dt>
                      <dd>{part.pads.length}</dd>
                      <dt>3D model</dt>
                      <dd>
                        {part.modelPresent
                          ? "Mapped to " + part.ref
                          : part.models.length
                            ? "Not exported (DNP / excluded)"
                            : "No model assigned"}
                      </dd>
                      {Object.entries(part.properties)
                        .filter(
                          ([k, v]) =>
                            ![
                              "Reference",
                              "Value",
                              "Footprint",
                              "Datasheet",
                            ].includes(k) &&
                            v &&
                            v !== "~",
                        )
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                    </dl>
                  </>
                )}
                {part && (
                  <details>
                    <summary>Pin connections</summary>
                    <div className={styles.connections}>
                      {part.pads.map((pad, i) => (
                        <button
                          key={i}
                          disabled={pad.net <= 0}
                          onClick={() => onSelect({ kind: "net", id: pad.net })}
                        >
                          {pad.number || "—"} · {pad.name || "Unconnected"}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
                {isolate && (
                  <p>
                    {selection.kind === "net"
                      ? "Showing this net’s connections."
                      : "Shared ground is excluded. Power connections remain included."}
                    Drag to orbit this connected group.
                  </p>
                )}
                </details>
              </>
            )}
          </motion.section>
        </AnimatePresence>
        </div>
        <section className={`${styles.panel} ${styles.netsCard}`} aria-label="Selected nets">
                <h3 className={styles.netHeading}>Nets · {graph.nets.size}</h3>
                <ul className={styles.netLegend} aria-label="Active net colors">
                  {nets
                    .filter((n) => graph.nets.has(n.id))
                    .map((n) => (
                      <li key={n.id}>
                        <button onClick={() => onSelect({ kind: "net", id: n.id })}>
                          <span
                            className={styles.netSwatch}
                            style={{ backgroundColor: netColor(n.name) }}
                            aria-hidden="true"
                          />
                          <span>{n.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
        </section>
        </>}
      </aside>
    </MotionConfig>
  );
}
