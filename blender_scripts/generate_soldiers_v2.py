"""
generate_soldiers_v2.py  —  Improved soldier model generator for Blender
Run with: blender --background --python generate_soldiers_v2.py

Improvements over v1:
- Better human proportions (slimmer torso, longer legs)
- Smooth helmet with visor (CT)
- Beret for CT (more distinct from T)
- T side gets keffiyeh face wrap
- Detailed boots with sole
- Tactical vest with multiple pouches
- Knee pads
- Arm sleeves with elbow pads
"""

import bpy
import math
import os

MODELS_DIR = '/Users/gordonyanxuan/onlinePvP/.claude/worktrees/wizardly-wilson/client/models'

# ── helpers ──────────────────────────────────────────────────────────────────

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)


def mat(name, r, g, b, roughness=0.8, metalness=0.0, alpha=1.0):
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (r, g, b, alpha)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    if alpha < 1.0:
        m.blend_method = 'BLEND'
        bsdf.inputs['Alpha'].default_value = alpha
    return m


def box(name, x, y, z, sx, sy, sz, material=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if material:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    return obj


def cylinder(name, x, y, z, radius, depth, material=None, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=(x, y, z)
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    return obj


def sphere(name, x, y, z, radius, material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=(x, y, z), segments=16, ring_count=8)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    return obj


def join_all(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    bpy.context.active_object.name = name
    return bpy.context.active_object


def export_glb(filepath):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
    )


# ── CT soldier (beret, tactical vest, elbow pads) ────────────────────────────

def build_ct():
    clear_scene()

    # Materials
    body_m   = mat('ct_body',    0.12, 0.24, 0.44)          # dark navy
    armor_m  = mat('ct_armor',   0.17, 0.33, 0.60, 0.4, 0.2)  # blue armor
    pants_m  = mat('ct_pants',   0.06, 0.12, 0.26)
    boot_m   = mat('ct_boot',    0.07, 0.07, 0.07)
    sole_m   = mat('ct_sole',    0.15, 0.15, 0.15, 0.5, 0.3)
    glove_m  = mat('ct_glove',   0.10, 0.10, 0.10, 0.6, 0.15)
    skin_m   = mat('ct_skin',    0.78, 0.66, 0.51)
    beret_m  = mat('ct_beret',   0.10, 0.18, 0.36, 0.9)
    visor_m  = mat('ct_visor',   0.27, 0.55, 1.00, 0.05, 0.7, 0.55)
    pouch_m  = mat('ct_pouch',   0.14, 0.18, 0.14, 0.85)
    elbow_m  = mat('ct_elbow',   0.20, 0.28, 0.45, 0.5, 0.15)
    knee_m   = mat('ct_knee',    0.20, 0.28, 0.45, 0.5, 0.15)
    belt_m   = mat('ct_belt',    0.08, 0.08, 0.08, 0.6, 0.3)

    # ── Torso (slimmer) ──
    box('torso',       0, 0.52, 0,  0.50, 0.90, 0.24, body_m)
    # Vest front plate
    box('vest_front',  0, 0.60, -0.13,  0.44, 0.52, 0.06, armor_m)
    # Vest side panels
    box('vest_l',     -0.28, 0.52, 0,  0.06, 0.50, 0.22, armor_m)
    box('vest_r',      0.28, 0.52, 0,  0.06, 0.50, 0.22, armor_m)
    # Pouches on vest
    box('pouch1',     -0.16, 0.62, -0.16,  0.09, 0.11, 0.06, pouch_m)
    box('pouch2',      0.06, 0.62, -0.16,  0.09, 0.11, 0.06, pouch_m)
    box('pouch3',      0.22, 0.40, -0.15,  0.08, 0.10, 0.06, pouch_m)
    # Belt
    box('belt',        0, 0.07, 0,  0.52, 0.07, 0.26, belt_m)
    # Hip pouch
    box('hip_pouch',  -0.22, 0.06, -0.13,  0.09, 0.12, 0.08, pouch_m)
    # Shoulder pads
    box('shoulder_l', -0.32, 0.86, 0,  0.14, 0.16, 0.20, armor_m)
    box('shoulder_r',  0.32, 0.86, 0,  0.14, 0.16, 0.20, armor_m)

    # ── Head ──
    box('head',        0, 1.30, 0,  0.34, 0.34, 0.32, skin_m)
    # Neck
    cylinder('neck',   0, 1.10, 0,  0.08, 0.12, skin_m)
    # Beret (CT-side identifier)
    sphere('beret_base', 0, 1.50, 0,  0.21, beret_m)
    box('beret_flat',  0, 1.48, 0,  0.44, 0.06, 0.44, beret_m)
    # Beret badge stub
    box('badge',      -0.18, 1.52, -0.19,  0.06, 0.03, 0.04, armor_m)
    # Visor / glasses strip
    box('visor',       0, 1.26, -0.18,  0.32, 0.07, 0.04, visor_m)
    # Ear comm pieces
    box('comm_l',     -0.20, 1.30, 0,  0.05, 0.14, 0.18, armor_m)
    box('comm_r',      0.20, 1.30, 0,  0.05, 0.14, 0.18, armor_m)

    # ── Arms (with sleeve + elbow pad) ──
    # Upper arm L
    box('uarm_l',     -0.36, 0.72, 0,  0.17, 0.34, 0.17, body_m)
    # Elbow pad L
    box('elbow_l',    -0.36, 0.52, -0.09,  0.15, 0.12, 0.10, elbow_m)
    # Forearm L
    box('farm_l',     -0.36, 0.36, 0,  0.15, 0.28, 0.15, body_m)
    # Glove L
    box('glove_l',    -0.36, 0.17, -0.03,  0.14, 0.13, 0.09, glove_m)
    # Upper arm R
    box('uarm_r',      0.36, 0.72, 0,  0.17, 0.34, 0.17, body_m)
    # Elbow pad R
    box('elbow_r',     0.36, 0.52, -0.09,  0.15, 0.12, 0.10, elbow_m)
    # Forearm R
    box('farm_r',      0.36, 0.36, 0,  0.15, 0.28, 0.15, body_m)
    # Glove R
    box('glove_r',     0.36, 0.17, -0.03,  0.14, 0.13, 0.09, glove_m)

    # ── Carried weapon on back (simplified) ──
    box('gun_recv',    0.38, 0.78, -0.22,  0.06, 0.07, 0.38, mat('gun_m', 0.13, 0.14, 0.15, 0.3, 0.85))
    box('gun_barrel',  0.38, 0.81, -0.46,  0.035, 0.035, 0.26, mat('gun_m2', 0.13, 0.14, 0.15, 0.25, 0.9))

    # ── Legs (longer, slimmer) ──
    # Left leg upper
    box('upper_l',    -0.13, -0.24, 0,  0.20, 0.46, 0.20, pants_m)
    # Left knee pad
    box('kneepad_l',  -0.13, -0.44, -0.09,  0.18, 0.12, 0.09, knee_m)
    # Left lower leg
    box('lower_l',    -0.13, -0.72, 0,  0.17, 0.38, 0.17, pants_m)
    # Left boot
    box('boot_l',     -0.13, -0.94, -0.02,  0.19, 0.10, 0.24, boot_m)
    # Left boot sole
    box('sole_l',     -0.13, -1.00, -0.01,  0.20, 0.04, 0.26, sole_m)

    # Right leg upper
    box('upper_r',     0.13, -0.24, 0,  0.20, 0.46, 0.20, pants_m)
    # Right knee pad
    box('kneepad_r',   0.13, -0.44, -0.09,  0.18, 0.12, 0.09, knee_m)
    # Right lower leg
    box('lower_r',     0.13, -0.72, 0,  0.17, 0.38, 0.17, pants_m)
    # Right boot
    box('boot_r',      0.13, -0.94, -0.02,  0.19, 0.10, 0.24, boot_m)
    # Right boot sole
    box('sole_r',      0.13, -1.00, -0.01,  0.20, 0.04, 0.26, sole_m)

    obj = join_all('soldier_ct')
    return obj


# ── T soldier (keffiyeh wrap, tactical vest, knee pads) ──────────────────────

def build_t():
    clear_scene()

    body_m   = mat('t_body',    0.42, 0.13, 0.06)          # dark rust
    armor_m  = mat('t_armor',   0.55, 0.17, 0.06, 0.4, 0.2)
    pants_m  = mat('t_pants',   0.13, 0.06, 0.00)
    boot_m   = mat('t_boot',    0.08, 0.06, 0.04)
    sole_m   = mat('t_sole',    0.18, 0.14, 0.10, 0.5, 0.3)
    glove_m  = mat('t_glove',   0.10, 0.08, 0.06, 0.6, 0.15)
    kef_m    = mat('t_kef',     0.82, 0.82, 0.82, 0.9)     # white keffiyeh
    kef2_m   = mat('t_kef2',    0.60, 0.10, 0.10, 0.9)     # red check
    pouch_m  = mat('t_pouch',   0.16, 0.12, 0.06, 0.85)
    elbow_m  = mat('t_elbow',   0.40, 0.24, 0.10, 0.5, 0.15)
    knee_m   = mat('t_knee',    0.40, 0.24, 0.10, 0.5, 0.15)
    belt_m   = mat('t_belt',    0.09, 0.07, 0.04, 0.6, 0.3)
    visor_m  = mat('t_visor',   1.00, 0.40, 0.20, 0.05, 0.3, 0.6)

    # ── Torso ──
    box('torso',       0, 0.52, 0,  0.50, 0.90, 0.24, body_m)
    box('vest_front',  0, 0.60, -0.13,  0.44, 0.52, 0.06, armor_m)
    box('vest_l',     -0.28, 0.52, 0,  0.06, 0.50, 0.22, armor_m)
    box('vest_r',      0.28, 0.52, 0,  0.06, 0.50, 0.22, armor_m)
    box('pouch1',     -0.16, 0.62, -0.16,  0.09, 0.11, 0.06, pouch_m)
    box('pouch2',      0.06, 0.62, -0.16,  0.09, 0.11, 0.06, pouch_m)
    box('pouch3',      0.22, 0.40, -0.15,  0.08, 0.10, 0.06, pouch_m)
    box('belt',        0, 0.07, 0,  0.52, 0.07, 0.26, belt_m)
    box('hip_pouch',  -0.22, 0.06, -0.13,  0.09, 0.12, 0.08, pouch_m)
    box('shoulder_l', -0.32, 0.86, 0,  0.14, 0.16, 0.20, armor_m)
    box('shoulder_r',  0.32, 0.86, 0,  0.14, 0.16, 0.20, armor_m)

    # ── Head with keffiyeh ──
    # Base head (mostly hidden)
    box('head',        0, 1.30, 0,  0.34, 0.30, 0.30)
    # Keffiyeh wrap — layers to simulate cloth
    box('kef_top',     0, 1.52, 0,  0.42, 0.10, 0.42, kef_m)
    box('kef_back',    0, 1.38,  0.18,  0.40, 0.28, 0.08, kef_m)
    box('kef_side_l', -0.22, 1.28,  0.04,  0.08, 0.26, 0.30, kef2_m)
    box('kef_side_r',  0.22, 1.28,  0.04,  0.08, 0.26, 0.30, kef2_m)
    # Face exposed strip (nose/eyes area)
    box('face',        0, 1.31, -0.17,  0.28, 0.18, 0.04)
    # Keffiyeh lower wrap (covers mouth/chin)
    box('kef_mouth',   0, 1.18, -0.15,  0.32, 0.08, 0.06, kef_m)
    # Eye slit visor (tinted)
    box('visor',       0, 1.30, -0.18,  0.28, 0.07, 0.04, visor_m)
    # Head top
    box('kef_crown',   0, 1.54,  0.02,  0.40, 0.08, 0.38, kef2_m)

    # ── Arms ──
    box('uarm_l',     -0.36, 0.72, 0,  0.17, 0.34, 0.17, body_m)
    box('elbow_l',    -0.36, 0.52, -0.09,  0.15, 0.12, 0.10, elbow_m)
    box('farm_l',     -0.36, 0.36, 0,  0.15, 0.28, 0.15, body_m)
    box('glove_l',    -0.36, 0.17, -0.03,  0.14, 0.13, 0.09, glove_m)
    box('uarm_r',      0.36, 0.72, 0,  0.17, 0.34, 0.17, body_m)
    box('elbow_r',     0.36, 0.52, -0.09,  0.15, 0.12, 0.10, elbow_m)
    box('farm_r',      0.36, 0.36, 0,  0.15, 0.28, 0.15, body_m)
    box('glove_r',     0.36, 0.17, -0.03,  0.14, 0.13, 0.09, glove_m)

    # ── Carried weapon ──
    box('gun_recv',    0.38, 0.78, -0.22,  0.06, 0.07, 0.38, mat('gun_m', 0.13, 0.14, 0.15, 0.3, 0.85))
    box('gun_barrel',  0.38, 0.81, -0.46,  0.035, 0.035, 0.26, mat('gun_m2', 0.13, 0.14, 0.15, 0.25, 0.9))

    # ── Legs ──
    box('upper_l',    -0.13, -0.24, 0,  0.20, 0.46, 0.20, pants_m)
    box('kneepad_l',  -0.13, -0.44, -0.09,  0.18, 0.12, 0.09, knee_m)
    box('lower_l',    -0.13, -0.72, 0,  0.17, 0.38, 0.17, pants_m)
    box('boot_l',     -0.13, -0.94, -0.02,  0.19, 0.10, 0.24, boot_m)
    box('sole_l',     -0.13, -1.00, -0.01,  0.20, 0.04, 0.26, sole_m)
    box('upper_r',     0.13, -0.24, 0,  0.20, 0.46, 0.20, pants_m)
    box('kneepad_r',   0.13, -0.44, -0.09,  0.18, 0.12, 0.09, knee_m)
    box('lower_r',     0.13, -0.72, 0,  0.17, 0.38, 0.17, pants_m)
    box('boot_r',      0.13, -0.94, -0.02,  0.19, 0.10, 0.24, boot_m)
    box('sole_r',      0.13, -1.00, -0.01,  0.20, 0.04, 0.26, sole_m)

    obj = join_all('soldier_t')
    return obj


# ── main ─────────────────────────────────────────────────────────────────────

os.makedirs(MODELS_DIR, exist_ok=True)

build_ct()
export_glb(os.path.join(MODELS_DIR, 'soldier_ct.glb'))
print('[v2] Exported soldier_ct.glb')

build_t()
export_glb(os.path.join(MODELS_DIR, 'soldier_t.glb'))
print('[v2] Exported soldier_t.glb')
