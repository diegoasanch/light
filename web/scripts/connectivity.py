"""Electrical identities from pcbnew; areas from schematic enclosure rectangles."""
import re
from pathlib import Path

def sexpr(text):
    root, stack = [], []; current = root
    for t in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', text):
        if t == '(':
            child=[]; current.append(child); stack.append(current); current=child
        elif t == ')': current=stack.pop()
        else: current.append(t[1:-1].replace('\\n','\n') if t.startswith('"') else t)
    return root[0]
def children(n,k): return [v for v in n if isinstance(v,list) and v and v[0]==k]
def one(n,k,d=None): return next(iter(children(n,k)),d or [k])
def schematic(path):
    root=sexpr(Path(path).read_text()); areas=[]
    for i,r in enumerate(children(root,'rectangle')):
        a,b=one(r,'start')[1:],one(r,'end')[1:]
        x0,x1=sorted([float(a[0]),float(b[0])]); y0,y1=sorted([float(a[1]),float(b[1])]); labels=[]
        for t in children(root,'text'):
            x,y=map(float,one(t,'at')[1:3])
            if x0<=x<=x1 and y0<=y<=y1:
                size=float(one(one(one(t,'effects'),'font'),'size',['size','1'])[1]); labels.append((-size,y,t[1].strip()))
        areas.append(dict(id=str(i),name=sorted(labels)[0][2] if labels else 'Other',bounds=[x0,y0,x1,y1]))
    parts={}
    for s in children(root,'symbol'):
        props={p[1]:p[2] for p in children(s,'property')}; x,y=map(float,one(s,'at')[1:3])
        matches=[a for a in areas if a['bounds'][0]<=x<=a['bounds'][2] and a['bounds'][1]<=y<=a['bounds'][3]]
        a=min(matches,key=lambda a:(a['bounds'][2]-a['bounds'][0])*(a['bounds'][3]-a['bounds'][1])) if matches else None
        parts[props.get('Reference','')]=dict(area=a['id'] if a else 'other',properties=props)
    areas.sort(key=lambda a:(a['bounds'][1],a['bounds'][0])); areas.append(dict(id='other',name='Other / mechanical',bounds=[]))
    return areas,parts

def extract(board,path,footprints,tracks,vias,outline,api):
    areas,parts=schematic(str(Path(path).with_suffix('.kicad_sch')))
    mm,psnew,add,simplify,boolean,polys,drill=[api[k] for k in ['mm','new_ps','add_shape','simplify','boolean','to_multipolygon','drill_polyset']]
    components=[]
    for fp in footprints:
        ref=fp.GetReference(); info=parts.get(ref,dict(area='other',properties={})); pos=fp.GetPosition(); props=info['properties']
        components.append(dict(ref=ref,value=fp.GetValue(),footprint=str(fp.GetFPID().GetLibItemName()),side='B' if fp.IsFlipped() else 'F',position=[mm(pos.x),mm(pos.y)],area=info['area'],properties=props,datasheet=props.get('Datasheet',''),pads=[dict(number=p.GetNumber(),net=p.GetNetCode(),name=p.GetNetname(),position=[mm(p.GetPosition().x),mm(p.GetPosition().y)]) for p in fp.Pads()],models=[m.m_Filename for m in fp.Models()]))
    nets=[]
    for code,net in board.GetNetsByNetcode().items():
        if code<=0: continue
        layers={}; routed={}
        for name in api['COPPER_LAYERS']:
            lid=board.GetLayerID(name); ps=psnew()
            for item in list(tracks)+list(vias)+[p for fp in footprints for p in fp.Pads()]:
                if item.GetNetCode()==code and item.IsOnLayer(lid) and api['flashes'](item,lid): add(ps,item,lid)
            route=psnew(); route.Append(ps); simplify(route); boolean(route,drill(footprints,vias,lid),'BooleanSubtract'); boolean(route,outline,'BooleanIntersection'); routed[name]=polys(route)
            # Net-assigned copper graphics can be the sole physical connection
            # (for example the filled polygon from J3 to D69).
            shapes, _ = api['graphics_on_layer'](list(board.GetDrawings()), footprints, lid)
            for shape in shapes:
                if hasattr(shape, 'GetNetCode') and shape.GetNetCode() == code:
                    add(ps, shape, lid)
            for zone in board.Zones():
                if zone.GetNetCode()==code and not zone.GetIsRuleArea() and zone.IsOnLayer(lid): zone.TransformSolidAreasShapesToPolygon(lid,ps)
            simplify(ps); boolean(ps,drill(footprints,vias,lid),'BooleanSubtract'); boolean(ps,outline,'BooleanIntersection'); layers[name]=polys(ps)
        nets.append(dict(id=code,name=net.GetNetname(),copper=layers,routed=routed,vias=[i for i,v in enumerate(vias) if v.GetNetCode()==code]))
    return dict(areas=areas,components=components,nets=nets)
