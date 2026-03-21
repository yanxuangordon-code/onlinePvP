import bpy, math, os

MODELS_DIR = "/Users/gordonyanxuan/onlinePvP/.claude/worktrees/wizardly-wilson/client/models"

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def mat(name, hex_col, rough=0.7, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    r = ((hex_col>>16)&0xFF)/255; g = ((hex_col>>8)&0xFF)/255; bv = (hex_col&0xFF)/255
    b.inputs["Base Color"].default_value = (r, g, bv, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m

def add_box(name, sx, sy, sz, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return o

def add_cyl(name, r, h, loc, segs=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=h, location=loc)
    o = bpy.context.active_object; o.name = name; return o

def add_sphere(name, r, loc):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=8, ring_count=6)
    o = bpy.context.active_object; o.name = name; return o

def bevel(obj, w=0.018, seg=2):
    mod = obj.modifiers.new("Bvl", 'BEVEL')
    mod.width = w; mod.segments = seg
    mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(55)

def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)

def select_meshes():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type == 'MESH': o.select_set(True)
    bpy.context.view_layer.objects.active = next(
        o for o in bpy.context.scene.objects if o.type == 'MESH')

def export(name):
    os.makedirs(MODELS_DIR, exist_ok=True)
    select_meshes()
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(MODELS_DIR, name),
        use_selection=True, export_format='GLB',
        export_apply=True, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_yup=True,
    )
    print(f"[HYPERFIRE] Exported {name}")

def build_soldier(side):
    is_ct = side == 'ct'

    # Materials
    if is_ct:
        skin    = mat("skin",   0xd4aa88, 0.6)
        body    = mat("body",   0x1e3d70, 0.65)  # navy
        pants   = mat("pants",  0x0e1e40, 0.75)
        vest    = mat("vest",   0x2a3a2a, 0.6, 0.05)
        helm    = mat("helm",   0x111a11, 0.45, 0.15)
        visor   = mat("visor",  0x4488cc, 0.1,  0.3)
        glove   = mat("glove",  0x111111, 0.6)
        boot    = mat("boot",   0x1a1008, 0.8)
        sole    = mat("sole",   0x080808, 0.9)
        pouch   = mat("pouch",  0x1a2a1a, 0.7)
    else:
        skin    = mat("skin",   0xc49a6c, 0.6)
        body    = mat("body",   0x5a3a18, 0.7)  # brown
        pants   = mat("pants",  0x3a2810, 0.75)
        vest    = mat("vest",   0x4a3820, 0.65, 0.05)
        helm    = mat("helm",   0xe8d4b0, 0.85)  # keffiyeh cloth
        visor   = mat("visor",  0xb89870, 0.9)   # face wrap
        glove   = mat("glove",  0x2a1a08, 0.65)
        boot    = mat("boot",   0x1a1008, 0.8)
        sole    = mat("sole",   0x080808, 0.9)
        pouch   = mat("pouch",  0x3a2a10, 0.7)

    # Build model parts (Y-up, standing)
    # == HEAD ==
    h = add_cyl("Head", 0.17, 0.26, (0, 0, 1.55), segs=16); assign(h, skin); bevel(h, 0.02)

    if is_ct:
        # Helmet: dome shape = cylinder + thin top cap
        hm = add_cyl("Helmet", 0.195, 0.18, (0, 0, 1.72), segs=16); assign(hm, helm); bevel(hm, 0.03)
        # Helmet brim front
        hb = add_box("HelmBrim", 0.38, 0.12, 0.04, (0, -0.10, 1.63)); assign(hb, helm); bevel(hb, 0.01)
        # Visor slit
        vs = add_box("Visor", 0.30, 0.025, 0.06, (0, -0.175, 1.60)); assign(vs, visor)
        # Ear guards
        eg_l = add_box("EarL", 0.04, 0.07, 0.12, (-0.20, 0, 1.68)); assign(eg_l, helm)
        eg_r = add_box("EarR", 0.04, 0.07, 0.12, ( 0.20, 0, 1.68)); assign(eg_r, helm)
    else:
        # Keffiyeh: wrap around head
        kf = add_cyl("Keffiyeh", 0.22, 0.30, (0, 0, 1.66), segs=16); assign(kf, helm); bevel(kf, 0.03)
        # Face cloth (lower half)
        fc = add_box("FaceCloth", 0.36, 0.04, 0.14, (0, -0.16, 1.54)); assign(fc, visor)
        # Goggles
        gg = add_box("Goggles", 0.30, 0.03, 0.07, (0, -0.175, 1.62)); assign(gg, mat("gog", 0x334455, 0.1, 0.2))

    # Eyes (only visible if no visor)
    if not is_ct:
        el = add_box("EyeL", 0.06, 0.025, 0.04, (-0.07, -0.165, 1.57)); assign(el, mat("eye", 0x111111, 0.1))
        er = add_box("EyeR", 0.06, 0.025, 0.04, ( 0.07, -0.165, 1.57)); assign(er, mat("eye", 0x111111, 0.1))

    # == NECK ==
    nk = add_cyl("Neck", 0.07, 0.10, (0, 0, 1.37), segs=10); assign(nk, skin)

    # == TORSO ==
    tr = add_box("Torso", 0.42, 0.26, 0.52, (0, 0, 1.03)); assign(tr, body); bevel(tr, 0.02)
    # Chest vest
    cv = add_box("ChestVest", 0.44, 0.08, 0.48, (0, -0.11, 1.03)); assign(cv, vest); bevel(cv, 0.015)
    # Chest pouches
    cp_l = add_box("CPouch_L", 0.10, 0.06, 0.12, (-0.16, -0.14, 1.05)); assign(cp_l, pouch); bevel(cp_l, 0.01)
    cp_r = add_box("CPouch_R", 0.10, 0.06, 0.12, ( 0.16, -0.14, 1.05)); assign(cp_r, pouch); bevel(cp_r, 0.01)
    cp_c = add_box("CPouch_C", 0.10, 0.06, 0.10, (0,    -0.14, 0.90)); assign(cp_c, pouch); bevel(cp_c, 0.01)
    # Belt
    bt = add_box("Belt", 0.44, 0.25, 0.06, (0, 0, 0.76)); assign(bt, mat("belt", 0x111111, 0.5, 0.2))
    # Belt buckle
    bk = add_box("Buckle", 0.05, 0.06, 0.04, (0, -0.125, 0.76)); assign(bk, mat("bkl", 0x888888, 0.2, 0.8))
    # Shoulder joints
    sj_l = add_sphere("ShouldJL", 0.10, (-0.26, 0, 1.22)); assign(sj_l, body)
    sj_r = add_sphere("ShouldJR", 0.10, ( 0.26, 0, 1.22)); assign(sj_r, body)

    # == PELVIS ==
    pv = add_box("Pelvis", 0.38, 0.24, 0.16, (0, 0, 0.71)); assign(pv, pants); bevel(pv, 0.015)

    # == ARMS ==
    for side_arm, sign in [('L', -1), ('R', 1)]:
        sx = sign * 0.32
        # Upper arm
        ua = add_box(f"UAm_{side_arm}", 0.14, 0.22, 0.32, (sx, 0, 1.08)); assign(ua, body); bevel(ua, 0.015)
        # Elbow joint
        ej = add_sphere(f"ElbowJ_{side_arm}", 0.075, (sx, 0, 0.90)); assign(ej, mat("ej", 0x333333, 0.5) if is_ct else body)
        # Forearm
        fa = add_box(f"FAm_{side_arm}", 0.12, 0.20, 0.28, (sx, 0, 0.74)); assign(fa, skin if not is_ct else body); bevel(fa, 0.012)
        # Glove/Hand
        hnd = add_box(f"Hand_{side_arm}", 0.11, 0.14, 0.11, (sx, -0.01, 0.57)); assign(hnd, glove); bevel(hnd, 0.012)
        # 2 finger nubs
        for fi in range(2):
            fx = sx + (fi - 0.5) * 0.04
            fng = add_cyl(f"Fng_{side_arm}_{fi}", 0.018, 0.06, (fx, -0.065, 0.51), segs=6); assign(fng, glove)

    # == LEGS ==
    for side_leg, sign in [('L', -1), ('R', 1)]:
        lx = sign * 0.12
        # Thigh
        th = add_box(f"Thigh_{side_leg}", 0.18, 0.22, 0.30, (lx, 0, 0.55)); assign(th, pants); bevel(th, 0.015)
        # Knee joint
        kj = add_sphere(f"KneeJ_{side_leg}", 0.09, (lx, 0, 0.38)); assign(kj, mat("kj", 0x1a2a3a, 0.4, 0.1) if is_ct else pants)
        # Shin
        sh_m = add_box(f"Shin_{side_leg}", 0.15, 0.20, 0.26, (lx, 0, 0.23)); assign(sh_m, pants); bevel(sh_m, 0.012)
        # Boot upper
        bu = add_box(f"Boot_{side_leg}", 0.16, 0.20, 0.14, (lx, 0.01, 0.06)); assign(bu, boot); bevel(bu, 0.012)
        # Boot sole
        bs = add_box(f"Sole_{side_leg}", 0.18, 0.24, 0.03, (lx, 0.01, -0.015)); assign(bs, sole)

    print(f"[HYPERFIRE] Built soldier {'CT' if is_ct else 'T'}")

if __name__ == "__main__":
    clear()
    build_soldier('ct')
    export("soldier_ct.glb")

    clear()
    build_soldier('t')
    export("soldier_t.glb")

    clear()
    print("[HYPERFIRE] Both soldiers exported!")
