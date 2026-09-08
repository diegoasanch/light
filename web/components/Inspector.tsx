"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import type { BoardData } from "@/lib/pcb-types";
import { resolveSelection, type Selection } from "@/lib/selection";
import { netColor } from "@/lib/net-colors";
import { componentDescription } from "@/lib/component-description";
import { COMPONENT_SPECS } from "@/lib/component-specs";
import styles from "./Inspector.module.css";

type Filter = "all" | "area" | "component" | "net";
export function Inspector({ data, selection, onSelect, isolate, onIsolate }: {
  data: BoardData; selection: Selection; onSelect: (s: Selection) => void;
  isolate: boolean; onIsolate: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const { components, areas, nets } = data.connectivity;
  const graph = useMemo(() => resolveSelection(data, selection), [data, selection]);
  const part = selection?.kind === "component" ? components.find(p => p.ref === selection.id) : undefined;
  const spec = part ? COMPONENT_SPECS[part.value] : undefined;
  const datasheet = part?.datasheet || spec?.datasheet || "";
  const title = part ? (part.value === "~" ? part.footprint : part.value)
    : selection?.kind === "area" ? areas.find(a => a.id === selection.id)?.name
    : nets.find(n => n.id === selection?.id)?.name;
  const entries = useMemo(() => [
    ...areas.filter(a => components.some(p => p.area === a.id)).map(a => ({ kind: "area" as const, id: a.id, name: a.name, extra: "Area" })),
    ...components.map(p => ({ kind: "component" as const, id: p.ref, name: p.value, extra: `${p.ref} ${p.footprint}` })),
    ...nets.map(n => ({ kind: "net" as const, id: n.id, name: n.name, extra: "Net" })),
  ], [areas, components, nets]);
  const needle = query.trim().toLowerCase();
  const results = entries.filter(e => (filter === "all" || e.kind === filter) &&
    (needle ? `${e.name} ${e.extra}`.toLowerCase().includes(needle) : browse ? e.kind === "area" : filter !== "all"))
    .sort((a, b) => Number(String(b.id).toLowerCase() === needle) - Number(String(a.id).toLowerCase() === needle));
  const showResults = !!needle || browse || filter !== "all";
  const choose = (next: Selection) => { onSelect(next); setQuery(""); setBrowse(false); setFilter("all"); setFiltersOpen(false); };
  const close = () => { onSelect(null); onIsolate(false); };
  return <MotionConfig reducedMotion="user">
    <aside className={styles.panel} aria-label="Board explorer">
      <div className={styles.searchCard}>
      <div className={styles.searchRow}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <input aria-label="Search areas, parts and nets" placeholder="Search the board…" value={query}
          onChange={e => { setQuery(e.target.value); setBrowse(false); }}
          onKeyDown={e => { if (e.key === "Enter" && results.length) { e.preventDefault(); choose(results[0]); } }} />
        {query && <button aria-label="Clear search" onClick={() => setQuery("")}>×</button>}
        <button aria-label="Search filters" aria-expanded={filtersOpen} aria-pressed={filter !== "all"} onClick={() => setFiltersOpen(!filtersOpen)}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M10 17h4"/></svg>
        </button>
      </div>
      {filtersOpen && <div className={styles.filters} aria-label="Search categories">
        {([['all','All'],['area','Areas'],['component','Parts'],['net','Nets']] as const).map(([value,label]) =>
          <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setBrowse(false); }}>{label}</button>)}
      </div>}
      {!needle && filter === "all" && <button className={styles.browse} aria-expanded={browse} onClick={() => setBrowse(!browse)}>
        {browse ? "Hide areas −" : "Browse areas +"}
      </button>}
      {showResults && <div className={styles.results} aria-label="Search results">
        {!results.length && <p className={styles.empty}>No matches. Try a part ID, signal, or area.</p>}
        {results.map(e => <button key={`${e.kind}:${e.id}`} onClick={() => choose(e)} aria-pressed={selection?.kind === e.kind && selection.id === e.id}>
          {e.kind === "net" && <i className={styles.swatch} style={{background: netColor(e.name)}}/>}
          <span>{e.kind === "component" && <b>{e.id} </b>}{e.name === "~" ? "Connector" : e.name}</span>
          <small>{e.kind === "component" ? "Part" : e.kind === "area" ? "Area" : "Net"}</small>
        </button>)}
      </div>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {selection && <motion.section className={styles.selection} key={`${selection.kind}:${selection.id}`}
          initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.12}} aria-label="Selection details">
          <div className={styles.identity}><span>{selection.kind === "area" ? "AREA" : selection.kind === "net" ? `NET ${selection.id}` : selection.id}</span>
            <button aria-label="Close selection details" onClick={close}>×</button></div>
          <h2>{title}</h2>
          {part && <p>{componentDescription(part, data)}</p>}
          {part && (/^https?:\/\//.test(datasheet) ? <a href={datasheet} target="_blank" rel="noreferrer">Datasheet ↗</a> : <p className={styles.muted}>Datasheet unavailable</p>)}
          <details className={styles.disclosure}>
            <summary>Nets <span>{graph.nets.size}</span></summary>
            <ul className={styles.netList}>{nets.filter(n => graph.nets.has(n.id)).map(n => <li key={n.id}>
              <button onClick={() => choose({kind: "net", id: n.id})}><i className={styles.swatch} style={{background: netColor(n.name)}}/>{n.name}</button>
            </li>)}</ul>
          </details>
          <details className={styles.disclosure}>
            <summary>More details</summary>
            <p>{graph.connected.size} connected parts · {graph.nets.size} nets</p>
            <button className={styles.isolate} onClick={() => onIsolate(!isolate)}>{isolate ? "Exit isolation" : "Isolate connections"}</button>
            {part && <>
              {spec && <p>{spec.specs}</p>}
              <dl><dt>Area</dt><dd>{areas.find(a => a.id === part.area)?.name}</dd><dt>Package</dt><dd>{part.footprint}</dd>
                <dt>Side</dt><dd>{part.side === "F" ? "Front" : "Back"}</dd><dt>3D model</dt><dd>{part.modelPresent ? `Mapped to ${part.ref}` : "Not exported"}</dd>
                {Object.entries(part.properties).filter(([k,v]) => !["Reference","Value","Footprint","Datasheet"].includes(k) && v && v !== "~").map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              <details><summary>Pin connections · {part.pads.length}</summary><ul className={styles.netList}>{part.pads.map((p,i) => <li key={i}><button disabled={p.net <= 0} onClick={() => choose({kind:"net",id:p.net})}>{p.number || "—"} · {p.name || "Unconnected"}</button></li>)}</ul></details>
            </>}
          </details>
        </motion.section>}
      </AnimatePresence>
    </aside>
  </MotionConfig>;
}
