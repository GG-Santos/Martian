import { useState } from "react";
import {
  Plus,
  Move,
  Trash2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { RouteState, RouteAction, LocalPoint } from "../mission/types";
import { resolveNodes } from "./route-state";
export type EditMode = "insert" | "move";
export function RouteEditor({
  state,
  onAction,
  editing,
  setEditing,
  mode,
  setMode,
  selectedId,
  setSelectedId,
  edgeId,
  setEdgeId,
}: {
  state: RouteState;
  onAction: (a: RouteAction) => boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  mode: EditMode;
  setMode: (v: EditMode) => void;
  selectedId: string;
  setSelectedId: (v: string) => void;
  edgeId: string;
  setEdgeId: (v: string) => void;
}) {
  const nodes = resolveNodes(state),
    waypoints = state.nodes.filter((n) => n.kind === "waypoint");
  const selected = waypoints.find((n) => n.id === selectedId);
  return (
    <section className="route-editor">
      <div className="section-heading">
        <h2>Route planning</h2>
        <button aria-pressed={editing} onClick={() => setEditing(!editing)}>
          {editing ? "Finish editing" : "Edit route"}
        </button>
      </div>
      {editing && (
        <>
          <p className="fine">
            Click terrain or enter coordinates. Segments are straight; obstacle
            avoidance is manual.
          </p>
          <div className="mode-buttons">
            <button
              aria-pressed={mode === "insert"}
              onClick={() => setMode("insert")}
            >
              <Plus size={14} />
              Add waypoint
            </button>
            <button
              aria-pressed={mode === "move"}
              onClick={() => setMode("move")}
            >
              <Move size={14} />
              Move waypoint
            </button>
          </div>
          <label>
            Insert on edge
            <select
              aria-label="Insert on edge"
              value={edgeId}
              onChange={(e) => setEdgeId(e.target.value)}
            >
              {nodes.slice(0, -1).map((n, i) => (
                <option key={n.id} value={n.id}>
                  {n.kind === "start" ? "Habitat" : n.stopId || n.id} →{" "}
                  {nodes[i + 1].kind === "end"
                    ? "Habitat"
                    : nodes[i + 1].stopId || nodes[i + 1].id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Selected waypoint
            <select
              aria-label="Selected waypoint"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select waypoint</option>
              {waypoints.map((n, i) => (
                <option key={n.id} value={n.id}>
                  Waypoint {i + 1}
                </option>
              ))}
            </select>
          </label>
          <CoordinateForm
            key={`${mode}-${selectedId}-${selected?.point.x}-${selected?.point.y}`}
            initial={selected?.point || { x: 1024, y: 1024 }}
            disabled={mode === "move" && !selected}
            onSubmit={(point) => {
              const id =
                mode === "insert"
                  ? `w-${crypto.randomUUID().slice(0, 6)}`
                  : selectedId;
              const ok = onAction(
                mode === "insert"
                  ? { type: "insert", afterNodeId: edgeId, id, point }
                  : { type: "move", id, point },
              );
              if (ok) setSelectedId(id);
            }}
          />
          <div className="waypoint-actions">
            <button
              disabled={!selected}
              aria-label="Move waypoint earlier"
              onClick={() =>
                onAction({ type: "reorder", id: selectedId, direction: -1 })
              }
            >
              <ArrowUp size={14} />
            </button>
            <button
              disabled={!selected}
              aria-label="Move waypoint later"
              onClick={() =>
                onAction({ type: "reorder", id: selectedId, direction: 1 })
              }
            >
              <ArrowDown size={14} />
            </button>
            <button
              disabled={!selected}
              onClick={() => {
                if (onAction({ type: "remove", id: selectedId }))
                  setSelectedId("");
              }}
            >
              <Trash2 size={14} />
              Remove
            </button>
            <span>{waypoints.length}/12</span>
          </div>
        </>
      )}
      <button
        className="quiet-button"
        onClick={() => {
          if (onAction({ type: "reset" })) {
            setSelectedId("");
            setEdgeId(state.presetNodes[0].id);
          }
        }}
      >
        <RotateCcw size={13} />
        Restore preset route
      </button>
    </section>
  );
}
function CoordinateForm({
  initial,
  disabled,
  onSubmit,
}: {
  initial: LocalPoint;
  disabled: boolean;
  onSubmit: (p: LocalPoint) => void;
}) {
  const [x, setX] = useState(String(Math.round(initial.x))),
    [y, setY] = useState(String(Math.round(initial.y)));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          x: x.trim() ? Number(x) : NaN,
          y: y.trim() ? Number(y) : NaN,
        });
      }}
    >
      <div className="coordinate-inputs">
        <label>
          East (m)
          <input
            aria-label="Waypoint east meters"
            type="number"
            step="any"
            value={x}
            onChange={(e) => setX(e.target.value)}
          />
        </label>
        <label>
          North (m)
          <input
            aria-label="Waypoint north meters"
            type="number"
            step="any"
            value={y}
            onChange={(e) => setY(e.target.value)}
          />
        </label>
      </div>
      <button type="submit" disabled={disabled}>
        Apply waypoint coordinates
      </button>
    </form>
  );
}
