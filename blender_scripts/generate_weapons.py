"""
HYPERFIRE - Weapon Model Generator
Run in Blender 3.x / 4.x / 5.x: Scripting tab → Open → Run Script
Exports 7 first-person weapon GLBs to client/models/weapons/
"""

import bpy, math, os

MODELS_DIR = "/Users/gordonyanxuan/onlinePvP/.claude/worktrees/wizardly-wilson/client/models/weapons"

# ── Helpers ───────────────────────────────────────────────────────────────────

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def mat(name, hex_col, rough=0.25, metal=0.85, emit=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    r = ((hex_col>>16)&0xFF)/255; g = ((hex_col>>8)&0xFF)/255; bv = (hex_col&0xFF)/255
    b.inputs["Base Color"].default_value = (r,g,bv,1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit: b.inputs["Emission Strength"].default_value = emit
    return m

def box(name, sx, sy, sz, loc, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return o

def cyl(name, r, h, loc, segs=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=h, location=loc)
    o = bpy.context.active_object; o.name = name; return o

def assign(obj, m):
    obj.data.materials.clear(); obj.data.materials.append(m)

def bevel(obj, w=0.012, seg=2):
    mod = obj.modifiers.new("B",'BEVEL'); mod.width=w; mod.segments=seg
    mod.limit_method='ANGLE'; mod.angle_limit=math.radians(60)

def select_all_mesh(collection_name=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            o.select_set(True)
    bpy.context.view_layer.objects.active = next(
        (o for o in bpy.context.scene.objects if o.type=='MESH'), None)

def export(filename):
    os.makedirs(MODELS_DIR, exist_ok=True)
    select_all_mesh()
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(MODELS_DIR, filename),
        use_selection=True, export_format='GLB',
        export_apply=True, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_yup=True,
    )
    print(f"[HYPERFIRE] Exported {filename}")

# ── Material palette ──────────────────────────────────────────────────────────

def make_palette():
    return {
        'gunmetal':  mat("GM",  0x1a1e22, 0.20, 0.92),
        'dark':      mat("DK",  0x0d0f12, 0.35, 0.80),
        'mid':       mat("MD",  0x2e3338, 0.40, 0.75),
        'barrel':    mat("BR",  0x111418, 0.15, 0.95),
        'stock':     mat("ST",  0x3a2a18, 0.80, 0.05),   # wood
        'grip':      mat("GR",  0x1a1a1a, 0.65, 0.10),   # rubber
        'mag':       mat("MG",  0x14181c, 0.50, 0.60),
        'brass':     mat("BS",  0xc8902a, 0.25, 0.90),
        'scope':     mat("SC",  0x0a0e12, 0.10, 0.95),
        'lens':      mat("LN",  0x223344, 0.05, 0.20),
        'handguard': mat("HG",  0x252b30, 0.55, 0.40),
        'orange':    mat("OR",  0xcc4400, 0.70, 0.05),   # shotgun stock
    }

# ── Weapon builders ───────────────────────────────────────────────────────────

def build_ak47(p):
    # Receiver
    r = box("AK_Receiver", 0.055, 0.45, 0.09, (0, 0, 0)); assign(r, p['gunmetal']); bevel(r)
    # Dust cover
    dc = box("AK_Cover",   0.052, 0.30, 0.055, (0, 0.06, 0.08)); assign(dc, p['dark']); bevel(dc)
    # Barrel
    b1 = box("AK_Barrel",  0.022, 0.36, 0.022, (0,  0.42, 0)); assign(b1, p['barrel']); bevel(b1, 0.005)
    # Gas tube above barrel
    gt = box("AK_GasTube", 0.014, 0.24, 0.014, (0, 0.36, 0.038)); assign(gt, p['barrel'])
    # Front sight
    fs = box("AK_FSight",  0.008, 0.018, 0.045, (0, 0.58, 0.025)); assign(fs, p['gunmetal'])
    # Handguard (wooden)
    hg = box("AK_HGuard",  0.040, 0.20, 0.050, (0, 0.26, 0)); assign(hg, p['stock']); bevel(hg)
    # Pistol grip
    pg = box("AK_Grip",    0.030, 0.13, 0.065, (0, -0.12, -0.07)); assign(pg, p['grip']); bevel(pg, 0.008)
    # Curved magazine
    mg = box("AK_Mag",     0.040, 0.22, 0.07,  (0, -0.05, -0.08)); assign(mg, p['mag']); bevel(mg)
    # Stock
    sk = box("AK_Stock",   0.030, 0.26, 0.055, (0, -0.26, 0.02)); assign(sk, p['stock']); bevel(sk)
    # Muzzle brake
    mb = box("AK_Muzzle",  0.030, 0.038, 0.030,(0,  0.64, 0));  assign(mb, p['gunmetal']); bevel(mb)
    # Charging handle
    ch = box("AK_Charge",  0.015, 0.030, 0.020,(0.038, 0.05, 0.055)); assign(ch, p['dark'])

def build_m4a1(p):
    # Receiver
    r = box("M4_Receiver",  0.048, 0.42, 0.085, (0, 0, 0)); assign(r, p['gunmetal']); bevel(r)
    # Upper receiver
    ur = box("M4_Upper",    0.044, 0.28, 0.060, (0, 0.08, 0.075)); assign(ur, p['dark']); bevel(ur)
    # Barrel (longer, thinner)
    b1 = box("M4_Barrel",   0.018, 0.38, 0.018, (0, 0.44, 0)); assign(b1, p['barrel']); bevel(b1,0.004)
    # Handguard (quad-rail)
    hg = box("M4_HGuard",   0.050, 0.26, 0.050, (0, 0.22, 0)); assign(hg, p['handguard']); bevel(hg)
    # Rail top
    rt = box("M4_RailTop",  0.012, 0.30, 0.008, (0, 0.14, 0.032)); assign(rt, p['dark'])
    # Magazine (straight, 30-rnd)
    mg = box("M4_Mag",      0.038, 0.25, 0.068, (0, -0.06, -0.06)); assign(mg, p['mag']); bevel(mg)
    # Pistol grip
    pg = box("M4_Grip",     0.028, 0.12, 0.062, (0, -0.13,-0.065)); assign(pg, p['grip']); bevel(pg,0.008)
    # Collapsible stock
    sk1 = box("M4_Stock1",  0.030, 0.20, 0.045, (0, -0.25, 0.015)); assign(sk1, p['gunmetal']); bevel(sk1)
    sk2 = box("M4_Stock2",  0.044, 0.06, 0.065, (0, -0.33, 0.012)); assign(sk2, p['dark']); bevel(sk2)
    # Muzzle device
    mb = box("M4_Muzzle",   0.026, 0.05, 0.026, (0,  0.65, 0));  assign(mb, p['gunmetal']); bevel(mb)
    # Charging handle
    ch = box("M4_Charge",   0.010, 0.028, 0.016,(0, 0.06, 0.048)); assign(ch, p['dark'])

def build_awp(p):
    # Long receiver
    r = box("AWP_Receiver", 0.060, 0.62, 0.095, (0,  0.08, 0)); assign(r, p['gunmetal']); bevel(r)
    # Long barrel
    b1 = box("AWP_Barrel",  0.022, 0.55, 0.022, (0,  0.58, 0)); assign(b1, p['barrel']); bevel(b1,0.005)
    # Bolt handle
    bh = box("AWP_Bolt",    0.014, 0.055, 0.014,(0.045, 0.08, 0.050)); assign(bh, p['gunmetal'])
    bh2= box("AWP_BoltEnd", 0.022, 0.022, 0.022,(0.058, 0.08, 0.050)); assign(bh2, p['mid'])
    # Magazine (short box)
    mg = box("AWP_Mag",     0.048, 0.14, 0.078, (0, -0.04, -0.072)); assign(mg, p['mag']); bevel(mg)
    # Pistol grip (angled)
    pg = box("AWP_Grip",    0.035, 0.14, 0.068, (0, -0.18, -0.072)); assign(pg, p['grip']); bevel(pg,0.010)
    # Wooden cheek-piece stock
    sk = box("AWP_Stock",   0.055, 0.42, 0.085, (0, -0.38,  0.012)); assign(sk, p['stock']); bevel(sk)
    # Scope body
    sc = box("AWP_Scope",   0.038, 0.28, 0.038, (0,  0.10,  0.078)); assign(sc, p['scope']); bevel(sc)
    # Scope lenses
    sl = cyl("AWP_ScopeLensF", 0.017, 0.012, (0, 0.246, 0.078)); assign(sl, p['lens'])
    sr = cyl("AWP_ScopeLensR", 0.014, 0.012, (0, -0.042, 0.078)); assign(sr, p['lens'])
    # Scope turrets
    st1= box("AWP_TurretV", 0.010, 0.010, 0.035, (0, 0.10, 0.110)); assign(st1, p['dark'])
    st2= box("AWP_TurretH", 0.035, 0.010, 0.010, (0.022, 0.10, 0.078)); assign(st2, p['dark'])
    # Muzzle
    mb = box("AWP_Muzzle",  0.028, 0.025, 0.028, (0, 0.85, 0)); assign(mb, p['gunmetal'])

def build_shotgun(p):
    # Receiver
    r = box("SG_Receiver",  0.065, 0.38, 0.095, (0, 0, 0)); assign(r, p['gunmetal']); bevel(r)
    # Magazine tube (under barrel)
    mt = cyl("SG_MagTube",  0.022, 0.46, (0, 0.25, -0.042), segs=10); assign(mt, p['dark'])
    # Barrel (wide bore)
    b1 = box("SG_Barrel",   0.032, 0.44, 0.032, (0, 0.36, 0.010)); assign(b1, p['barrel']); bevel(b1,0.008)
    # Wooden pump
    pm = box("SG_Pump",     0.058, 0.12, 0.068, (0, 0.19, 0)); assign(pm, p['stock']); bevel(pm)
    # Wooden stock
    sk = box("SG_Stock",    0.055, 0.32, 0.078, (0, -0.26, 0.010)); assign(sk, p['orange']); bevel(sk)
    # Pistol grip
    pg = box("SG_Grip",     0.040, 0.11, 0.062, (0, -0.08,-0.055)); assign(pg, p['grip']); bevel(pg,0.010)
    # Muzzle (wide)
    mb = box("SG_Muzzle",   0.040, 0.040, 0.040, (0, 0.59, 0.010)); assign(mb, p['gunmetal']); bevel(mb)
    # Sight bead
    sd = cyl("SG_SightBead",0.008, 0.008, (0, 0.58, 0.038), segs=6); assign(sd, p['mid'])

def build_smg(p):
    # Receiver (compact)
    r = box("SMG_Receiver", 0.042, 0.28, 0.075, (0, 0, 0)); assign(r, p['gunmetal']); bevel(r)
    # Short barrel
    b1 = box("SMG_Barrel",  0.016, 0.18, 0.016, (0, 0.25, 0)); assign(b1, p['barrel']); bevel(b1,0.004)
    # Handguard
    hg = box("SMG_HGuard",  0.038, 0.14, 0.045, (0, 0.14, 0)); assign(hg, p['handguard']); bevel(hg)
    # Magazine (double-stack pistol mag)
    mg = box("SMG_Mag",     0.036, 0.22, 0.055, (0, -0.04,-0.048)); assign(mg, p['mag']); bevel(mg)
    # Pistol grip
    pg = box("SMG_Grip",    0.028, 0.10, 0.052, (0, -0.11,-0.050)); assign(pg, p['grip']); bevel(pg,0.008)
    # Folding stock (folded position)
    sk = box("SMG_Stock",   0.014, 0.16, 0.040, (0, -0.22, 0.038)); assign(sk, p['gunmetal']); bevel(sk)
    # Muzzle device
    mb = cyl("SMG_Muzzle",  0.014, 0.030, (0, 0.37, 0), segs=8); assign(mb, p['gunmetal'])
    # Rear sight notch
    rs = box("SMG_RSight",  0.010, 0.018, 0.025, (0, -0.04, 0.042)); assign(rs, p['dark'])

def build_pistol(p):
    # Slide
    sl = box("P_Slide",    0.038, 0.18, 0.070, (0, 0.06, 0)); assign(sl, p['gunmetal']); bevel(sl)
    # Frame
    fr = box("P_Frame",    0.036, 0.14, 0.080, (0, -0.04, 0)); assign(fr, p['grip']); bevel(fr)
    # Barrel (peeking out front)
    b1 = box("P_Barrel",   0.016, 0.06, 0.016, (0, 0.18, 0)); assign(b1, p['barrel']); bevel(b1,0.003)
    # Magazine
    mg = box("P_Mag",      0.034, 0.12, 0.060, (0, -0.10,-0.008)); assign(mg, p['mag']); bevel(mg)
    # Trigger guard
    tg = box("P_TGuard",   0.010, 0.025, 0.050, (0, -0.01,-0.048)); assign(tg, p['grip'])
    # Front sight
    fs = box("P_FSight",   0.006, 0.010, 0.020, (0, 0.155, 0.040)); assign(fs, p['gunmetal'])
    # Rear sight
    rs = box("P_RSight",   0.028, 0.010, 0.016, (0, 0.038, 0.040)); assign(rs, p['gunmetal'])

def build_deagle(p):
    # Large slide
    sl = box("DE_Slide",   0.050, 0.22, 0.088, (0, 0.06, 0)); assign(sl, p['gunmetal']); bevel(sl)
    # Frame (chunky)
    fr = box("DE_Frame",   0.048, 0.16, 0.095, (0, -0.05, 0)); assign(fr, p['dark']); bevel(fr)
    # Barrel (long)
    b1 = box("DE_Barrel",  0.020, 0.08, 0.020, (0, 0.22, 0)); assign(b1, p['barrel']); bevel(b1,0.004)
    # Magazine (large)
    mg = box("DE_Mag",     0.042, 0.15, 0.075, (0, -0.11,-0.008)); assign(mg, p['mag']); bevel(mg)
    # Trigger guard (larger)
    tg = box("DE_TGuard",  0.012, 0.030, 0.060, (0, -0.01,-0.058)); assign(tg, p['grip'])
    # Polygonal rib on slide
    rb = box("DE_Rib",     0.008, 0.20, 0.005, (0, 0.06, 0.048)); assign(rb, p['mid'])
    # Front sight (taller)
    fs = box("DE_FSight",  0.006, 0.014, 0.022, (0, 0.195, 0.050)); assign(fs, p['gunmetal'])
    # Rear sight (tritium-style two dots)
    rs = box("DE_RSight",  0.036, 0.012, 0.018, (0, 0.040, 0.050)); assign(rs, p['gunmetal'])

# ── Main ──────────────────────────────────────────────────────────────────────

weapons = [
    ("ak47",    build_ak47),
    ("m4a1",    build_m4a1),
    ("awp",     build_awp),
    ("shotgun", build_shotgun),
    ("smg",     build_smg),
    ("pistol",  build_pistol),
    ("deagle",  build_deagle),
]

if __name__ == "__main__":
    p = make_palette()
    for name, fn in weapons:
        clear()
        fn(p)
        export(f"weapon_{name}.glb")

    clear()
    print("[HYPERFIRE] All 7 weapon models exported!")
    print(f"  → {MODELS_DIR}/")
