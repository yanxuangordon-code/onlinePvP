"""
HYPERFIRE - Soldier Model Generator
Run this script inside Blender: Scripting tab → Open → Run Script
Exports: ../client/models/soldier_ct.glb and ../client/models/soldier_t.glb

Blender 3.x or 4.x required.
"""

import bpy
import math
import os

# ── Helpers ──────────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)

def add_box(name, w, h, d, loc, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True)
    if parent:
        obj.parent = parent
    return obj

def add_cylinder(name, r, h, loc, parent=None, segs=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=r, depth=h, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    if parent:
        obj.parent = parent
    return obj

def make_mat(name, color_hex, roughness=0.7, metallic=0.0, alpha=1.0):
    """Create a PBR material from a hex integer like 0x3a5f3a."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r = ((color_hex >> 16) & 0xFF) / 255
    g = ((color_hex >> 8)  & 0xFF) / 255
    b = ( color_hex        & 0xFF) / 255
    bsdf.inputs["Base Color"].default_value = (r, g, b, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

def assign_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)

def bevel_obj(obj, width=0.015, segments=2):
    """Add a bevel modifier for nice edges."""
    mod = obj.modifiers.new("Bevel", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(60)

def set_origin_bottom(obj):
    """Move origin to the bottom-center of the object."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    obj.location.z -= obj.dimensions.z / 2

# ── Soldier builder ───────────────────────────────────────────────────────────

def build_soldier(side):
    """
    side: 'ct' or 't'
    Returns the root empty (armature stand-in).
    All measurements in meters (1 unit ≈ 1 m in Three.js).
    """
    is_ct = (side == 'ct')

    # ---------- materials ----------
    if is_ct:
        body_mat    = make_mat("CT_Body",   0x2b5797, roughness=0.65)   # navy blue
        leg_mat     = make_mat("CT_Legs",   0x1a2e4a, roughness=0.75)   # dark trousers
        head_mat    = make_mat("CT_Head",   0xd4aa88, roughness=0.55)   # skin
        helmet_mat  = make_mat("CT_Helmet", 0x1e2d1e, roughness=0.5, metallic=0.15)  # dark green
        glove_mat   = make_mat("CT_Gloves", 0x222222, roughness=0.6)
        boot_mat    = make_mat("CT_Boots",  0x111111, roughness=0.8)
        visor_mat   = make_mat("CT_Visor",  0x88aacc, roughness=0.15, metallic=0.2)
        vest_mat    = make_mat("CT_Vest",   0x3a4a3a, roughness=0.6, metallic=0.05)
    else:
        body_mat    = make_mat("T_Body",    0x7a3a1a, roughness=0.7)    # brown shirt
        leg_mat     = make_mat("T_Legs",    0x4a3520, roughness=0.75)   # camo trousers
        head_mat    = make_mat("T_Head",    0xc49a6c, roughness=0.55)
        helmet_mat  = make_mat("T_Keffiyeh",0xd4b896, roughness=0.9)   # cloth wrap
        glove_mat   = make_mat("T_Gloves",  0x3a2a18, roughness=0.65)
        boot_mat    = make_mat("T_Boots",   0x2a1a0a, roughness=0.85)
        visor_mat   = make_mat("T_Goggle",  0x445533, roughness=0.2, metallic=0.1)
        vest_mat    = make_mat("T_Vest",    0x5a4a2a, roughness=0.65, metallic=0.05)

    # ---------- root empty ----------
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = f"Soldier_{side.upper()}"

    # ---------- TORSO (main body) ----------
    torso = add_box("Torso", 0.38, 0.50, 0.26, (0, 0, 0.93), root)
    assign_mat(torso, body_mat)
    bevel_obj(torso, 0.012)

    # Body armor / vest overlay
    vest = add_box("Vest", 0.40, 0.46, 0.10, (0, -0.06, 0.93), root)
    assign_mat(vest, vest_mat)
    bevel_obj(vest, 0.01)

    # Ammo pouch on vest
    pouch = add_box("Pouch_L", 0.09, 0.10, 0.06, (-0.13, -0.11, 0.88), root)
    assign_mat(pouch, vest_mat)
    pouch2 = add_box("Pouch_R", 0.09, 0.10, 0.06, (0.13, -0.11, 0.88), root)
    assign_mat(pouch2, vest_mat)

    # ---------- PELVIS ----------
    pelvis = add_box("Pelvis", 0.34, 0.18, 0.24, (0, 0, 0.66), root)
    assign_mat(pelvis, leg_mat)
    bevel_obj(pelvis, 0.01)

    # ---------- LEGS ----------
    # Upper legs
    ul = add_box("UpperLeg_L", 0.15, 0.26, 0.17, (-0.11, 0, 0.46), root)
    assign_mat(ul, leg_mat)
    bevel_obj(ul, 0.01)
    ur = add_box("UpperLeg_R", 0.15, 0.26, 0.17, ( 0.11, 0, 0.46), root)
    assign_mat(ur, leg_mat)
    bevel_obj(ur, 0.01)

    # Lower legs (shin)
    ll = add_box("LowerLeg_L", 0.13, 0.27, 0.15, (-0.11, 0, 0.20), root)
    assign_mat(ll, leg_mat)
    bevel_obj(ll, 0.01)
    lr = add_box("LowerLeg_R", 0.13, 0.27, 0.15, ( 0.11, 0, 0.20), root)
    assign_mat(lr, leg_mat)
    bevel_obj(lr, 0.01)

    # Boots
    bl = add_box("Boot_L", 0.14, 0.10, 0.20, (-0.11, 0.03, 0.05), root)
    assign_mat(bl, boot_mat)
    bevel_obj(bl, 0.01)
    br = add_box("Boot_R", 0.14, 0.10, 0.20, ( 0.11, 0.03, 0.05), root)
    assign_mat(br, boot_mat)
    bevel_obj(br, 0.01)

    # ---------- NECK ----------
    neck = add_cylinder("Neck", 0.075, 0.12, (0, 0, 1.20), root)
    assign_mat(neck, head_mat)

    # ---------- HEAD ----------
    head = add_box("Head", 0.24, 0.28, 0.24, (0, 0, 1.36), root)
    assign_mat(head, head_mat)
    bevel_obj(head, 0.025)

    # Eyes (black indents)
    eye_l = add_box("Eye_L", 0.055, 0.04, 0.022, (-0.07, -0.116, 1.36), root)
    assign_mat(eye_l, make_mat("Eye", 0x111111, 0.1))
    eye_r = add_box("Eye_R", 0.055, 0.04, 0.022, ( 0.07, -0.116, 1.36), root)
    assign_mat(eye_r, make_mat("Eye", 0x111111, 0.1))

    # ---------- HELMET / HEAD GEAR ----------
    if is_ct:
        helmet = add_box("Helmet", 0.27, 0.15, 0.26, (0, 0.01, 1.51), root)
        assign_mat(helmet, helmet_mat)
        bevel_obj(helmet, 0.018)
        # Visor slit
        visor = add_box("Visor", 0.22, 0.025, 0.06, (0, -0.125, 1.38), root)
        assign_mat(visor, visor_mat)
        # Ear guard bumps
        ear_l = add_box("Ear_L", 0.04, 0.06, 0.07, (-0.145, 0.0, 1.42), root)
        assign_mat(ear_l, helmet_mat)
        ear_r = add_box("Ear_R", 0.04, 0.06, 0.07, ( 0.145, 0.0, 1.42), root)
        assign_mat(ear_r, helmet_mat)
    else:
        # Keffiyeh (cloth wrap) — slightly bulgy box
        keffiyeh = add_box("Keffiyeh", 0.30, 0.28, 0.30, (0, 0.015, 1.46), root)
        assign_mat(keffiyeh, helmet_mat)
        bevel_obj(keffiyeh, 0.03)
        # Goggle strap
        goggle = add_box("Goggle", 0.26, 0.03, 0.065, (0, -0.12, 1.36), root)
        assign_mat(goggle, visor_mat)
        bevel_obj(goggle, 0.01)

    # ---------- SHOULDERS ----------
    sh_l = add_box("Shoulder_L", 0.12, 0.12, 0.12, (-0.27, 0, 1.11), root)
    assign_mat(sh_l, body_mat)
    bevel_obj(sh_l, 0.015)
    sh_r = add_box("Shoulder_R", 0.12, 0.12, 0.12, ( 0.27, 0, 1.11), root)
    assign_mat(sh_r, body_mat)
    bevel_obj(sh_r, 0.015)

    # ---------- ARMS ----------
    # Upper arms
    ua_l = add_box("UpperArm_L", 0.12, 0.27, 0.14, (-0.29, 0, 0.90), root)
    assign_mat(ua_l, body_mat)
    bevel_obj(ua_l, 0.01)
    ua_r = add_box("UpperArm_R", 0.12, 0.27, 0.14, ( 0.29, 0, 0.90), root)
    assign_mat(ua_r, body_mat)
    bevel_obj(ua_r, 0.01)

    # Lower arms (forearm)
    la_l = add_box("ForeArm_L", 0.10, 0.25, 0.12, (-0.29, 0, 0.66), root)
    assign_mat(la_l, head_mat)   # skin
    bevel_obj(la_l, 0.01)
    la_r = add_box("ForeArm_R", 0.10, 0.25, 0.12, ( 0.29, 0, 0.66), root)
    assign_mat(la_r, head_mat)
    bevel_obj(la_r, 0.01)

    # Gloves / Hands
    gl_l = add_box("Hand_L", 0.095, 0.11, 0.095, (-0.29, 0, 0.50), root)
    assign_mat(gl_l, glove_mat)
    bevel_obj(gl_l, 0.01)
    gl_r = add_box("Hand_R", 0.095, 0.11, 0.095, ( 0.29, 0, 0.50), root)
    assign_mat(gl_r, glove_mat)
    bevel_obj(gl_r, 0.01)

    # ---------- Sleeve patches ----------
    if is_ct:
        patch = make_mat("Patch", 0xffffff, 0.9)
        p_l = add_box("Patch_L", 0.065, 0.065, 0.01, (-0.295, -0.07, 0.95), root)
        assign_mat(p_l, patch)
        p_r = add_box("Patch_R", 0.065, 0.065, 0.01, ( 0.295, -0.07, 0.95), root)
        assign_mat(p_r, patch)

    return root


def select_hierarchy(root):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.select_grouped(extend=True, type='CHILDREN_RECURSIVE')


def export_glb(root, filepath):
    select_hierarchy(root)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_apply=True,         # apply modifiers (bevel)
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_yup=True,           # Y-up for Three.js
    )
    print(f"[HYPERFIRE] Exported {filepath}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.normpath(os.path.join(script_dir, "..", "client", "models"))

    clear_scene()

    # CT soldier
    ct_root = build_soldier('ct')
    export_glb(ct_root, os.path.join(models_dir, "soldier_ct.glb"))

    clear_scene()

    # T soldier
    t_root = build_soldier('t')
    export_glb(t_root, os.path.join(models_dir, "soldier_t.glb"))

    clear_scene()
    print("[HYPERFIRE] Both models exported successfully!")
    print(f"  → {models_dir}/soldier_ct.glb")
    print(f"  → {models_dir}/soldier_t.glb")
