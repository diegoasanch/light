#!/usr/bin/env python3
"""Extract renderable geometry from a KiCad board into JSON for the web viewer.

Runs under KiCad's bundled Python (it imports `pcbnew`), so all geometry comes
from KiCad's own engine: exact pad shapes, stroked text glyphs (including
knockout text on copper), zone fills, solder-mask expansions, and the board
outline with its arcs. Invoked by `pnpm sync-pcb` — see scripts/sync-pcb.ts.

Output units are mm in KiCad board coordinates (+x right, +y down). The web
app maps these to three.js as (x, y_up, z) = (kicad_x, stack height, kicad_y),
which matches kicad-cli's GLB export convention, so the components GLB drops
in with only a mm↔m scale.

Coordinates are rounded to 0.1 µm. Polygons follow GeoJSON-style nesting:
MultiPolygon = [polygon][ring][point][x, y], ring 0 = outer, rest = holes.
"""

import json
import math
import re
import sys
from datetime import datetime, timezone

import pcbnew

MAX_ERROR_MM = 0.005  # arc→polygon tessellation tolerance
ROUND = 4  # decimals (0.1 µm)

COPPER_LAYERS = ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]


def mm(iu: int) -> float:
    return round(pcbnew.ToMM(int(iu)), ROUND)


def max_error_iu() -> int:
    return int(pcbnew.FromMM(MAX_ERROR_MM))


def simplify(ps: pcbnew.SHAPE_POLY_SET) -> None:
    try:
        ps.Simplify()
    except TypeError:
        ps.Simplify(pcbnew.SHAPE_POLY_SET.PM_FAST)


def boolean(ps: pcbnew.SHAPE_POLY_SET, other: pcbnew.SHAPE_POLY_SET, op: str) -> None:
    method = getattr(ps, op)
    try:
        method(other)
    except TypeError:
        method(other, pcbnew.SHAPE_POLY_SET.PM_FAST)


def chain_points(chain) -> list:
    """Chain → rounded [x, y] list with consecutive duplicates (incl. the
    wrap-around pair) removed; returns [] for rings that collapse to fewer
    than 3 distinct points after rounding (boolean-op slivers)."""
    pts = []
    for i in range(chain.PointCount()):
        p = chain.CPoint(i)
        xy = [mm(p.x), mm(p.y)]
        if not pts or xy != pts[-1]:
            pts.append(xy)
    while len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(set(map(tuple, pts))) < 3:
        return []
    return pts


def to_multipolygon(ps: pcbnew.SHAPE_POLY_SET) -> list:
    """SHAPE_POLY_SET → [[outer, hole...], ...], dropping degenerate rings."""
    out = []
    for i in range(ps.OutlineCount()):
        outer = chain_points(ps.Outline(i))
        if not outer:
            continue
        poly = [outer]
        for j in range(ps.HoleCount(i)):
            hole = chain_points(ps.Hole(i, j))
            if hole:
                poly.append(hole)
        out.append(poly)
    return out


def new_ps() -> pcbnew.SHAPE_POLY_SET:
    return pcbnew.SHAPE_POLY_SET()


def add_shape(ps, item, layer_id) -> None:
    item.TransformShapeToPolygon(ps, layer_id, 0, max_error_iu(), pcbnew.ERROR_INSIDE)


def add_text(ps, text_item) -> None:
    text_item.TransformTextToPolySet(ps, 0, max_error_iu(), pcbnew.ERROR_INSIDE)


def flashes(item, layer_id) -> bool:
    """Whether a pad/via puts copper on this layer (unused annular rings removed)."""
    if hasattr(item, "FlashLayer"):
        try:
            return bool(item.FlashLayer(layer_id))
        except TypeError:
            pass
    return bool(item.IsOnLayer(layer_id))


def board_items(board):
    drawings = list(board.GetDrawings())
    footprints = list(board.GetFootprints())
    # GetTracks() yields PCB_TRACK, PCB_ARC (curved traces) and PCB_VIA.
    tracks = [t for t in board.GetTracks() if t.GetClass() in ("PCB_TRACK", "PCB_ARC")]
    vias = [t for t in board.GetTracks() if t.GetClass() == "PCB_VIA"]
    return drawings, footprints, tracks, vias


def is_visible(item) -> bool:
    return bool(item.IsVisible()) if hasattr(item, "IsVisible") else True


def graphics_on_layer(drawings, footprints, layer_id):
    """(non-text shapes, text items) on a layer, from board level + footprints."""
    shapes, texts = [], []
    for d in drawings:
        if not d.IsOnLayer(layer_id):
            continue
        if d.GetClass() in ("PCB_TEXT", "PCB_TEXTBOX"):
            if is_visible(d):
                texts.append(d)
        else:
            shapes.append(d)
    for fp in footprints:
        for g in fp.GraphicalItems():
            if not g.IsOnLayer(layer_id):
                continue
            if g.GetClass() in ("PCB_TEXT", "PCB_TEXTBOX"):
                if is_visible(g):
                    texts.append(g)
            else:
                shapes.append(g)
        # Reference/Value plus any other footprint fields (KiCad 8+ stores
        # fields outside GraphicalItems()).
        fields = list(fp.GetFields()) if hasattr(fp, "GetFields") else [fp.Reference(), fp.Value()]
        for t in fields:
            if t.IsOnLayer(layer_id) and is_visible(t):
                texts.append(t)
    return shapes, texts


def tech_layer_zone_fills(board, layer_id, ps):
    """Zone fills drawn on technical layers (mask/silk art zones)."""
    for zone in board.Zones():
        if zone.GetIsRuleArea() or not zone.IsOnLayer(layer_id):
            continue
        if hasattr(zone, "TransformSolidAreasShapesToPolygon"):
            zone.TransformSolidAreasShapesToPolygon(layer_id, ps)
        else:
            ps.Append(zone.GetFilledPolysList(layer_id))


def copper_polyset(board, layer_name, drawings, footprints, tracks, vias):
    layer_id = board.GetLayerID(layer_name)
    ps = new_ps()
    for t in tracks:
        if t.IsOnLayer(layer_id):
            add_shape(ps, t, layer_id)
    for v in vias:
        if v.IsOnLayer(layer_id) and flashes(v, layer_id):
            add_shape(ps, v, layer_id)
    for fp in footprints:
        for pad in fp.Pads():
            if pad.IsOnLayer(layer_id) and flashes(pad, layer_id):
                add_shape(ps, pad, layer_id)
    for zone in board.Zones():
        if zone.GetIsRuleArea():
            continue
        if zone.IsOnLayer(layer_id):
            # Plot-accurate: re-inflates fills by min_thickness/2, matching the
            # copper the fab actually produces (GetFilledPolysList is deflated).
            if hasattr(zone, "TransformSolidAreasShapesToPolygon"):
                zone.TransformSolidAreasShapesToPolygon(layer_id, ps)
            else:
                ps.Append(zone.GetFilledPolysList(layer_id))
    shapes, texts = graphics_on_layer(drawings, footprints, layer_id)
    for s in shapes:
        add_shape(ps, s, layer_id)
    for t in texts:
        add_text(ps, t)
    simplify(ps)
    return ps


def circle_segments(radius_iu: int) -> int:
    """Segment count so the tessellation error stays under MAX_ERROR_MM."""
    err = max_error_iu()
    if radius_iu <= err:
        return 16
    return max(16, int(math.ceil(math.pi / math.acos(1 - err / radius_iu))))


def append_circle(ps: pcbnew.SHAPE_POLY_SET, cx: int, cy: int, r: int) -> None:
    segs = circle_segments(r)
    idx = ps.NewOutline()
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ps.Append(int(cx + r * math.cos(a)), int(cy + r * math.sin(a)), idx)


def append_capsule(ps: pcbnew.SHAPE_POLY_SET, ax, ay, bx, by, width_iu: int) -> None:
    """Stadium shape around segment a→b (slot drills)."""
    r = width_iu // 2
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 1:
        append_circle(ps, ax, ay, r)
        return
    ang = math.atan2(dy, dx)
    segs = max(8, circle_segments(r) // 2)
    idx = ps.NewOutline()
    for i in range(segs + 1):
        a = ang - math.pi / 2 + math.pi * i / segs
        ps.Append(int(bx + r * math.cos(a)), int(by + r * math.sin(a)), idx)
    for i in range(segs + 1):
        a = ang + math.pi / 2 + math.pi * i / segs
        ps.Append(int(ax + r * math.cos(a)), int(ay + r * math.sin(a)), idx)


def drill_polyset(footprints, vias, layer_id=None) -> pcbnew.SHAPE_POLY_SET:
    """Drills as a polygon set. With a layer_id, via drills are included only
    for vias that actually span that layer (blind/buried vias must not punch
    copper they never touch); pad drills always go through the whole board."""
    ps = new_ps()
    for v in vias:
        d = v.GetDrillValue()
        if d > 0 and (layer_id is None or v.IsOnLayer(layer_id)):
            pos = v.GetPosition()
            append_circle(ps, pos.x, pos.y, d // 2)
    for fp in footprints:
        for pad in fp.Pads():
            ds = pad.GetDrillSize()
            if ds.x <= 0 or ds.y <= 0:
                continue
            hole = pad.GetEffectiveHoleShape()
            seg = hole.GetSeg()
            # SHAPE_SEGMENT covers both round holes and slots.
            append_capsule(ps, seg.A.x, seg.A.y, seg.B.x, seg.B.y, hole.GetWidth())
    simplify(ps)
    return ps


def mask_openings_polyset(board, side, drawings, footprints, vias):
    """Union of everything that opens the solder mask on one side."""
    layer_id = board.GetLayerID(f"{side}.Mask")
    ps = new_ps()
    err = max_error_iu()
    for fp in footprints:
        for pad in fp.Pads():
            if not pad.IsOnLayer(layer_id):
                continue
            try:
                margin = pad.GetSolderMaskExpansion(layer_id)
            except TypeError:
                margin = pad.GetSolderMaskExpansion()
            pad.TransformShapeToPolygon(ps, layer_id, int(margin), err, pcbnew.ERROR_OUTSIDE)
    # Tented vias get no opening; untented ones get pad-style apertures
    # (solder-mask expansion applied, tessellation error outward).
    for v in vias:
        tented = True
        if hasattr(v, "IsTented"):
            try:
                tented = bool(v.IsTented(layer_id))
            except TypeError:
                tented = True
        if not tented and v.IsOnLayer(layer_id):
            margin = 0
            if hasattr(v, "GetSolderMaskExpansion"):
                try:
                    margin = v.GetSolderMaskExpansion(layer_id)
                except TypeError:
                    try:
                        margin = v.GetSolderMaskExpansion()
                    except TypeError:
                        margin = 0
            v.TransformShapeToPolygon(
                ps, layer_id, int(margin), err, pcbnew.ERROR_OUTSIDE
            )
    shapes, texts = graphics_on_layer(drawings, footprints, layer_id)
    for s in shapes:
        add_shape(ps, s, layer_id)
    for t in texts:
        add_text(ps, t)
    tech_layer_zone_fills(board, layer_id, ps)
    simplify(ps)
    return ps


def silk_polyset(board, side, drawings, footprints):
    layer_id = board.GetLayerID(f"{side}.Silkscreen")
    ps = new_ps()
    shapes, texts = graphics_on_layer(drawings, footprints, layer_id)
    for s in shapes:
        add_shape(ps, s, layer_id)
    for t in texts:
        add_text(ps, t)
    tech_layer_zone_fills(board, layer_id, ps)
    simplify(ps)
    return ps


def read_stackup(board_path):
    """Physical stackup top→bottom, parsed from the board file's `(stackup`
    block (BOARD_STACKUP is not SWIG-wrapped in KiCad 10, so the file text is
    the reliable source). Returns None if the board has no stackup block."""
    try:
        text = open(board_path, encoding="utf-8", errors="replace").read()
    except OSError as e:
        print(f"cannot re-read board for stackup ({e})", file=sys.stderr)
        return None
    m = re.search(r"\(stackup\b(.*?)\(copper_finish", text, re.S)
    if not m:
        m = re.search(r"\(stackup\b(.*?)\n\t\t\)", text, re.S)
    if not m:
        return None
    block = m.group(1)
    out = []
    # Each entry: (layer "NAME" (type "TYPE") [(color ...)] [(thickness X)] ...)
    chunks = re.split(r'\(layer "', block)[1:]
    for chunk in chunks:
        name_m = re.match(r'([^"]+)"', chunk)
        type_m = re.search(r'\(type "([^"]+)"\)', chunk)
        # Dielectrics may have sublayers, each with its own (thickness N) —
        # the physical slab is their sum.
        thicknesses = re.findall(r"\(thickness ([0-9.]+)", chunk)
        if not name_m or not type_m:
            continue
        out.append({
            "name": name_m.group(1),
            "type": type_m.group(1),
            "thickness": round(sum(float(t) for t in thicknesses), 6),
        })
    return out or None


def main():
    if len(sys.argv) != 3:
        print("usage: extract_board.py <board.kicad_pcb> <out.json>", file=sys.stderr)
        sys.exit(2)
    board_path, out_path = sys.argv[1], sys.argv[2]
    board = pcbnew.LoadBoard(board_path)
    drawings, footprints, tracks, vias = board_items(board)

    outline = new_ps()
    board.GetBoardPolygonOutlines(outline, True)
    bb = outline.BBox()
    bbox = {
        "minX": mm(bb.GetLeft()),
        "minY": mm(bb.GetTop()),
        "maxX": mm(bb.GetRight()),
        "maxY": mm(bb.GetBottom()),
    }

    copper = {}
    for layer_name in COPPER_LAYERS:
        layer_id = board.GetLayerID(layer_name)
        ps = copper_polyset(board, layer_name, drawings, footprints, tracks, vias)
        boolean(ps, drill_polyset(footprints, vias, layer_id), "BooleanSubtract")
        boolean(ps, outline, "BooleanIntersection")
        copper[layer_name] = ps

    mask = {}
    silk = {}
    exposed = {}
    for side, cu_name in (("F", "F.Cu"), ("B", "B.Cu")):
        openings = mask_openings_polyset(board, side, drawings, footprints, vias)

        slab = new_ps()
        slab.Append(outline)
        boolean(slab, openings, "BooleanSubtract")
        mask[side] = slab

        exp = new_ps()
        exp.Append(copper[cu_name])
        boolean(exp, openings, "BooleanIntersection")
        exposed[side] = exp
        boolean(copper[cu_name], openings, "BooleanSubtract")

        sps = silk_polyset(board, side, drawings, footprints)
        boolean(sps, openings, "BooleanSubtract")
        boolean(sps, outline, "BooleanIntersection")
        silk[side] = sps

    f_cu = board.GetLayerID("F.Cu")
    via_list = []
    for v in vias:
        try:
            size = v.GetWidth(f_cu)  # KiCad 10 padstacks: width is per-layer
        except TypeError:
            size = v.GetWidth()
        via_list.append(
            [mm(v.GetPosition().x), mm(v.GetPosition().y), mm(size), mm(v.GetDrillValue())]
        )

    holes_round = []
    holes_slot = []
    for fp in footprints:
        for pad in fp.Pads():
            ds = pad.GetDrillSize()
            if ds.x <= 0 or ds.y <= 0:
                continue
            plated = 0 if pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH else 1
            pos = pad.GetPosition()
            if ds.x == ds.y:
                holes_round.append([mm(pos.x), mm(pos.y), mm(ds.x), plated])
            else:
                hole = pad.GetEffectiveHoleShape()
                seg = hole.GetSeg()
                holes_slot.append({
                    "a": [mm(seg.A.x), mm(seg.A.y)],
                    "b": [mm(seg.B.x), mm(seg.B.y)],
                    "width": mm(hole.GetWidth()),
                    "plated": plated,
                })

    stackup = read_stackup(board_path)

    copper_json = {}
    for layer_name in COPPER_LAYERS:
        entry = {"covered": to_multipolygon(copper[layer_name])}
        side = {"F.Cu": "F", "B.Cu": "B"}.get(layer_name)
        entry["exposed"] = to_multipolygon(exposed[side]) if side else []
        copper_json[layer_name] = entry

    data = {
        "meta": {
            "source": board_path.split("/")[-1],
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "kicad": pcbnew.GetBuildVersion(),
            "boardThickness": mm(board.GetDesignSettings().GetBoardThickness()),
        },
        "bbox": bbox,
        "stackup": stackup,
        "outline": to_multipolygon(outline),
        "copper": copper_json,
        "mask": {s: to_multipolygon(mask[s]) for s in mask},
        "silk": {s: to_multipolygon(silk[s]) for s in silk},
        "vias": via_list,
        "holes": {"round": holes_round, "slots": holes_slot},
        "counts": {
            "tracks": len(tracks),
            "vias": len(vias),
            "footprints": len(footprints),
            "zones": len(list(board.Zones())),
        },
    }

    with open(out_path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    size_mb = len(json.dumps(data, separators=(",", ":"))) / 1e6
    print(f"wrote {out_path} ({size_mb:.2f} MB)")
    for layer_name in COPPER_LAYERS:
        c = copper_json[layer_name]
        print(f"  {layer_name}: {len(c['covered'])} covered / {len(c['exposed'])} exposed polys")
    print(f"  mask F/B: {len(data['mask']['F'])}/{len(data['mask']['B'])} polys")
    print(f"  silk F/B: {len(data['silk']['F'])}/{len(data['silk']['B'])} polys")
    print(f"  vias: {len(via_list)}, holes: {len(holes_round)} round + {len(holes_slot)} slots")


if __name__ == "__main__":
    main()
