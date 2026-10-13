"""Slide tackle: a procedural Blender animation (two mannequin players, ball, pitch, broadcast camera, slow-motion at contact).
Run with Blender's Python (bpy). Writes slide_tackle.blend and renders PNG frames to ./frames/.
"""
import math, os, sys
import bpy
from mathutils import Vector

OUT = os.path.dirname(os.path.abspath(__file__))
FPS = 24
QUICK = "--quick" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection
rad = math.radians


# ------------------------------------------------------------------ helpers
def mat(name, color, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.05
    col.objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_mode = "XYZ"
    return o


def prim(kind, name, parent, loc, m, scale=(1, 1, 1), **kw):
    if kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=kw.get("r", 0.05), depth=kw.get("L", 0.3))
    elif kind == "sph":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=kw.get("r", 0.1))
    elif kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = kind != "box"
    o.parent = parent
    o.location = loc
    o.scale = scale
    return o


# ------------------------------------------------------------------ world, light, pitch
scene.render.fps = FPS
world = bpy.data.worlds.new("Sky")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.42, 0.58, 0.85, 1)
bg.inputs["Strength"].default_value = 0.9

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 4.0
sun_data.angle = rad(3)
sun = bpy.data.objects.new("Sun", sun_data)
col.objects.link(sun)
sun.rotation_euler = (rad(48), rad(10), rad(35))

g1, g2 = mat("Grass A", (0.09, 0.32, 0.07), 0.9), mat("Grass B", (0.11, 0.40, 0.09), 0.9)
white = mat("Line", (0.95, 0.95, 0.95), 0.5)
for i in range(-10, 10):                            # mown stripes, 5 m wide
    bpy.ops.mesh.primitive_plane_add(size=1, location=(i * 5 + 2.5, 0, 0))
    s = bpy.context.active_object
    s.name = "Stripe %d" % i
    s.scale = (5, 70, 1)
    s.data.materials.append(g1 if i % 2 else g2)


def line(name, loc, sx, sy):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(loc[0], loc[1], 0.004))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, 1)
    o.data.materials.append(white)


line("Touchline", (0, 7.5, 0), 100, 0.12)
line("Halfway", (7, -10, 0), 0.12, 35)
bpy.ops.mesh.primitive_torus_add(major_radius=9.15, minor_radius=0.06, major_segments=96, minor_segments=6, location=(7, -10, 0.0))
circ = bpy.context.active_object
circ.name = "Centre circle"
circ.scale = (1, 1, 0.05)
circ.data.materials.append(white)

# advertising boards behind the play for depth
board_m = [mat("Board %d" % i, c, 0.4, emit=0.6) for i, c in enumerate([(0.85, 0.1, 0.1), (0.05, 0.25, 0.8), (0.95, 0.75, 0.05), (0.1, 0.1, 0.12)])]
for i in range(-9, 10):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(i * 6, -32, 0.5))
    b = bpy.context.active_object
    b.name = "Board %d" % i
    b.scale = (5.8, 0.15, 1)
    b.data.materials.append(board_m[i % 4])


# crowd stand: a raked block with a noisy multicolour "crowd" texture
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -38, 5))
stand = bpy.context.active_object
stand.name = "Crowd"
stand.scale = (140, 14, 1)
stand.rotation_euler = (rad(62), 0, 0)
cm = bpy.data.materials.new("Crowd")
cm.use_nodes = True
nt = cm.node_tree
tex = nt.nodes.new("ShaderNodeTexNoise")
tex.inputs["Scale"].default_value = 900
tex.inputs["Detail"].default_value = 2
ramp = nt.nodes.new("ShaderNodeValToRGB")
els = ramp.color_ramp.elements
els[0].color = (0.05, 0.05, 0.07, 1)
els[1].color = (0.75, 0.75, 0.8, 1)
for pos, c in ((0.42, (0.7, 0.08, 0.1, 1)), (0.5, (0.1, 0.2, 0.65, 1)), (0.58, (0.8, 0.65, 0.5, 1))):
    e = els.new(pos)
    e.color = c
ramp.color_ramp.interpolation = "CONSTANT"
nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
stand.data.materials.append(cm)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -45, 14))
roof = bpy.context.active_object
roof.name = "Stand roof"
roof.scale = (140, 14, 0.6)
roof.data.materials.append(mat("Roof", (0.2, 0.22, 0.25), 0.5))

# ------------------------------------------------------------------ players
def player(name, shirt, shorts, socks, skin=(0.8, 0.58, 0.45), hair=(0.06, 0.04, 0.03)):
    M = {"shirt": mat(name + " shirt", shirt, 0.55), "shorts": mat(name + " shorts", shorts, 0.6), "socks": mat(name + " socks", socks, 0.6),
         "skin": mat(name + " skin", skin, 0.5), "boot": mat(name + " boots", (0.03, 0.03, 0.03), 0.3), "hair": mat(name + " hair", hair, 0.8)}
    J = {}
    root = J["root"] = empty(name + " root")
    pel = J["pelvis"] = empty(name + " pelvis", root, (0, 0, 0.99))
    prim("sph", name + " hips", pel, (0, 0, 0.02), M["shorts"], (1, 1.15, 0.75), r=0.16)
    sp = J["spine"] = empty(name + " spine", pel, (0, 0, 0.06))
    prim("sph", name + " torso", sp, (0, 0, 0.3), M["shirt"], (0.75, 1.05, 1.45), r=0.21)
    hd = J["head"] = empty(name + " neck", sp, (0, 0, 0.6))
    prim("cyl", name + " neckm", hd, (0, 0, 0.04), M["skin"], r=0.05, L=0.1)
    prim("sph", name + " headm", hd, (0.01, 0, 0.17), M["skin"], (1, 0.9, 1.1), r=0.11)
    prim("sph", name + " hairm", hd, (-0.015, 0, 0.21), M["hair"], (1.02, 0.95, 0.8), r=0.11)
    for side, y in (("L", 1), ("R", -1)):
        sh = J["sh" + side] = empty("%s shoulder %s" % (name, side), sp, (0, 0.24 * y, 0.5))
        prim("sph", "%s deltoid %s" % (name, side), sh, (0, 0, 0), M["shirt"], r=0.07)
        prim("cyl", "%s upper arm %s" % (name, side), sh, (0, 0, -0.15), M["shirt"], r=0.05, L=0.3)
        el = J["el" + side] = empty("%s elbow %s" % (name, side), sh, (0, 0, -0.3))
        prim("cyl", "%s forearm %s" % (name, side), el, (0, 0, -0.14), M["skin"], r=0.042, L=0.28)
        prim("sph", "%s hand %s" % (name, side), el, (0, 0, -0.3), M["skin"], r=0.05)
        hp = J["hip" + side] = empty("%s hip %s" % (name, side), pel, (0, 0.1 * y, 0))
        prim("cyl", "%s thigh %s" % (name, side), hp, (0, 0, -0.2), M["shorts"], r=0.078, L=0.42)
        prim("cyl", "%s thighskin %s" % (name, side), hp, (0, 0, -0.38), M["skin"], r=0.068, L=0.14)
        kn = J["kn" + side] = empty("%s knee %s" % (name, side), hp, (0, 0, -0.46))
        prim("sph", "%s kneecap %s" % (name, side), kn, (0, 0, 0), M["skin"], r=0.062)
        prim("cyl", "%s shin %s" % (name, side), kn, (0, 0, -0.22), M["socks"], r=0.056, L=0.44)
        an = J["an" + side] = empty("%s ankle %s" % (name, side), kn, (0, 0, -0.45))
        prim("box", "%s boot %s" % (name, side), an, (0.06, 0, -0.035), M["boot"], (0.27, 0.1, 0.08))
    J["bootR"] = bpy.data.objects[name + " boot R"]
    return J


ATT = player("Attacker", (0.75, 0.05, 0.08), (1, 1, 1), (0.75, 0.05, 0.08))
DEF = player("Defender", (0.08, 0.22, 0.7), (0.05, 0.08, 0.25), (0.08, 0.22, 0.7), skin=(0.45, 0.3, 0.22))

# ball: white with dark panels
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.11)
ball = bpy.context.active_object
ball.name = "Ball"
bpy.ops.object.shade_flat() if False else None
bw, bk = mat("Ball white", (0.95, 0.95, 0.95), 0.35), mat("Ball panel", (0.05, 0.05, 0.06), 0.35)
ball.data.materials.append(bw)
ball.data.materials.append(bk)
for i, p in enumerate(ball.data.polygons):
    p.material_index = 1 if (i * 7) % 5 == 0 else 0
ball.rotation_mode = "XYZ"
BR = 0.11

# ------------------------------------------------------------------ time with slow motion around the tackle
TS, SLIDE = 2.0, 0.75                 # slide start, slide duration (real seconds)
TC = TS + 0.30                        # contact
END = 4.7
SLOW0, SLOW1, SLOWK = TC - 0.22, TC + 0.42, 0.3
times = [0.0]
while times[-1] < END:
    t = times[-1]
    times.append(t + (SLOWK if SLOW0 <= t <= SLOW1 else 1.0) / FPS)
NF = len(times)
scene.frame_start, scene.frame_end = 1, NF


def smooth(a, b, x):
    x = max(0.0, min(1.0, (x - a) / (b - a)))
    return x * x * (3 - 2 * x)


# ------------------------------------------------------------------ poses
def run_pose(phase, lean=10, amp=1.0):
    s, c = math.sin(phase), math.cos(phase)
    return {"pelvis_z": 0.93 + 0.05 * abs(s), "pelvis": (0, 0, 0), "spine": (0, rad(lean), 0), "head": (0, rad(-lean * 0.7), 0),
            "hipL": (0, -rad(42 * s * amp), 0), "hipR": (0, rad(42 * s * amp), 0),
            "knL": (0, rad(12 + 85 * max(0.0, c) * amp), 0), "knR": (0, rad(12 + 85 * max(0.0, -c) * amp), 0),
            "anL": (0, rad(-10 * s), 0), "anR": (0, rad(10 * s), 0),
            "shL": (0, rad(38 * s * amp), rad(-6)), "shR": (0, -rad(38 * s * amp), rad(6)),
            "elL": (0, -rad(85), 0), "elR": (0, -rad(85), 0)}


SLIDE_POSE = {"pelvis_z": 0.27, "pelvis": (rad(18), -rad(58), 0), "spine": (0, -rad(18), 0), "head": (0, rad(35), 0),
              "hipR": (0, -rad(26), 0), "knR": (0, rad(4), 0), "anR": (0, rad(20), 0),           # lead leg straight along the turf
              "hipL": (0, rad(8), 0), "knL": (0, rad(125), 0), "anL": (0, 0, 0),               # trailing leg folded underneath
              "shL": (rad(-25), rad(40), 0), "elL": (0, -rad(15), 0),                          # left hand down behind for balance
              "shR": (rad(30), -rad(95), 0), "elR": (0, -rad(40), 0)}

SIT_POSE = dict(SLIDE_POSE, pelvis_z=0.24, pelvis=(rad(6), -rad(28), 0), spine=(0, rad(5), 0), head=(0, rad(5), 0),
                shR=(rad(15), -rad(175), 0), elR=(0, -rad(25), 0), shL=(rad(-20), rad(30), 0))   # sits up, fist in the air

JUMP_POSE = {"pelvis_z": 1.45, "pelvis": (0, rad(-5), 0), "spine": (0, rad(20), 0), "head": (0, -rad(20), 0),
             "hipL": (0, -rad(70), 0), "knL": (0, rad(110), 0), "hipR": (0, rad(25), 0), "knR": (0, rad(100), 0),
             "anL": (0, 0, 0), "anR": (0, 0, 0), "shL": (rad(-60), -rad(40), 0), "shR": (rad(60), -rad(40), 0),
             "elL": (0, -rad(40), 0), "elR": (0, -rad(40), 0)}


def mix(a, b, w):
    out = {}
    for k in a:
        if k == "pelvis_z":
            out[k] = a[k] + (b[k] - a[k]) * w
        else:
            out[k] = tuple(x + (y - x) * w for x, y in zip(a[k], b[k]))
    return out


def apply(J, pose, frame):
    J["pelvis"].location.z = pose["pelvis_z"]
    J["pelvis"].keyframe_insert("location", frame=frame)
    for k, v in pose.items():
        if k == "pelvis_z":
            continue
        J[k].rotation_euler = v
        J[k].keyframe_insert("rotation_euler", frame=frame)


def place(J, x, y, heading, frame):
    J["root"].location = (x, y, 0)
    J["root"].rotation_euler = (0, 0, heading)
    J["root"].keyframe_insert("location", frame=frame)
    J["root"].keyframe_insert("rotation_euler", frame=frame)


# ------------------------------------------------------------------ choreography
D = Vector((0.42, 0.91, 0)).normalized()             # slide direction (across the attacker's path, towards camera)
HEAD_D = math.atan2(D.y, D.x)
SLIDE_LEN = 3.6
P0 = Vector((-1.45, -3.15, 0))                       # where the defender leaves his feet
DEF_SPEED = 6.6
ATT_SPEED = 6.4


def slide_s(t):
    u = max(0.0, min(1.0, (t - TS) / SLIDE))
    return SLIDE_LEN * (1 - (1 - u) ** 2)


def def_pos(t):
    if t < TS:
        return P0 - D * DEF_SPEED * (TS - t)
    return P0 + D * slide_s(t)


# contact point = defender's lead boot at TC (computed from the rig below), ball must be there
for f, t in enumerate(times, start=1):
    p = def_pos(t)
    place(DEF, p.x, p.y, HEAD_D, f)
    if t < TS - 0.12:
        pose = run_pose((DEF_SPEED * t) / 2.1 * 2 * math.pi, lean=14)
    elif t < TS + SLIDE + 0.45:
        pose = mix(run_pose((DEF_SPEED * t) / 2.1 * 2 * math.pi, lean=14), SLIDE_POSE, smooth(TS - 0.12, TS + 0.08, t))
    else:
        pose = mix(SLIDE_POSE, SIT_POSE, smooth(TS + SLIDE + 0.45, TS + SLIDE + 1.0, t))
    apply(DEF, pose, f)

scene.frame_set(next(i for i, t in enumerate(times, start=1) if t >= TC))
bpy.context.view_layer.update()
boot = DEF["bootR"].matrix_world.translation.copy()
CONTACT = Vector((boot.x + D.x * 0.18, boot.y + D.y * 0.18, BR))     # the ball sits just in front of the boot
print("contact point", tuple(round(v, 2) for v in CONTACT))

AHEAD = 0.8                                           # ball distance in front of the attacker while dribbling
ATT_Y = CONTACT.y


def att_x(t):
    if t <= TC:
        return CONTACT.x - AHEAD + ATT_SPEED * (t - TC)
    # carries on through the jump, then decelerates to a stop
    tl = t - TC
    v = ATT_SPEED if tl < 0.5 else max(0.0, ATT_SPEED - (tl - 0.5) * 5.0)
    if tl < 0.5:
        return CONTACT.x - AHEAD + ATT_SPEED * tl
    d1 = ATT_SPEED * 0.5
    tt = min(tl - 0.5, ATT_SPEED / 5.0)
    return CONTACT.x - AHEAD + d1 + ATT_SPEED * tt - 2.5 * tt * tt


VB = Vector((3.2, 6.4, 3.0))                          # ball velocity off the tackle


def ball_pos(t):
    if t <= TC:
        k = (ATT_SPEED * (t - TC)) / 2.1 * 2 * math.pi
        off = AHEAD + 0.18 * math.sin(k) ** 2 * (1 if t < TC - 0.15 else 0)      # little touches while dribbling
        return Vector((att_x(t) + off, ATT_Y, BR)), ATT_SPEED
    # flight with bounces and grass drag
    tl, pos, vel = t - TC, CONTACT.copy(), VB.copy()
    dt = 1 / 240
    tt = 0.0
    while tt < tl:
        vel.z -= 9.81 * dt
        vel.x *= 0.999
        vel.y *= 0.999
        pos += vel * dt
        if pos.z < BR:
            pos.z = BR
            if vel.z < -0.6:
                vel.z = -vel.z * 0.55
                vel.x *= 0.8
                vel.y *= 0.8
            else:
                vel.z = 0
                vel.x *= 0.985
                vel.y *= 0.985
        tt += dt
    return pos, vel.length


roll = 0.0
prev_t = 0.0
for f, t in enumerate(times, start=1):
    x = att_x(t)
    place(ATT, x, ATT_Y, 0.0, f)
    if t < TC - 0.12:
        pose = run_pose((ATT_SPEED * t) / 2.1 * 2 * math.pi, lean=8)
    elif t < TC + 0.5:
        w = smooth(TC - 0.12, TC + 0.05, t) * (1 - smooth(TC + 0.3, TC + 0.5, t))
        pose = mix(run_pose((ATT_SPEED * t) / 2.1 * 2 * math.pi, lean=8), JUMP_POSE, w)
        arc = math.sin(math.pi * max(0.0, min(1.0, (t - TC + 0.08) / 0.55)))
        pose["pelvis_z"] = 0.95 + 0.42 * arc
    else:
        tl = t - TC - 0.5
        spd = max(0.0, 1 - tl / 1.3)
        pose = run_pose((ATT_SPEED * t) / 2.1 * 2 * math.pi, lean=8 * spd, amp=spd)
        pose["head"] = (0, 0, rad(70) * smooth(0.6, 1.2, tl))                      # looks back at the ball
        pose["shL"] = (rad(-70) * smooth(0.9, 1.4, tl), 0, 0)                      # arms out: "ref!"
        pose["shR"] = (rad(70) * smooth(0.9, 1.4, tl), 0, 0)
        pose["elL"] = pose["elR"] = (0, -rad(20), 0)
    apply(ATT, pose, f)
    p, v = ball_pos(t)
    roll += v * (t - prev_t) / BR
    prev_t = t
    ball.location = p
    ball.rotation_euler = (roll * 0.3 if t > TC else 0, roll, 0)
    ball.keyframe_insert("location", frame=f)
    ball.keyframe_insert("rotation_euler", frame=f)

# make all animation curves linear (every frame is already a key)
for o in bpy.data.objects:
    ad = o.animation_data
    if ad and ad.action:
        try:
            fcs = ad.action.fcurves
        except AttributeError:     # Blender 5 layered actions
            fcs = [fc for layer in ad.action.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]
        for fc in fcs:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

# ------------------------------------------------------------------ grass spray from the slide
f_slide0 = next(i for i, t in enumerate(times, start=1) if t >= TS + 0.02)
f_slide1 = next(i for i, t in enumerate(times, start=1) if t >= TS + SLIDE)
emit = empty("Spray emitter", DEF["root"], (0.55, 0, 0.03))
bpy.ops.mesh.primitive_plane_add(size=0.35, location=(0, 0, 0))
em = bpy.context.active_object
em.name = "Spray"
em.parent = DEF["root"]
em.location = (0.65, 0, 0.03)
em.hide_render = False
ps = em.modifiers.new("spray", "PARTICLE_SYSTEM").particle_system.settings
ps.count = 260
ps.frame_start, ps.frame_end = f_slide0, f_slide1
ps.lifetime = 28
ps.normal_factor = 2.2
ps.object_align_factor = (2.0, 0, 0)
ps.factor_random = 1.4
ps.render_type = "OBJECT"
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.025, location=(0, 0, -20))
clod = bpy.context.active_object
clod.name = "Clod"
clod.data.materials.append(mat("Turf", (0.12, 0.28, 0.06), 0.9))
ps.instance_object = clod
ps.particle_size = 1.0
ps.size_random = 0.7
em.show_instancer_for_render = False

# ------------------------------------------------------------------ broadcast camera with a zoom at the tackle
cam_data = bpy.data.cameras.new("Camera")
cam = bpy.data.objects.new("Camera", cam_data)
col.objects.link(cam)
scene.camera = cam
aim = empty("Camera target")
con = cam.constraints.new("TRACK_TO")
con.target = aim
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
fx = None
for f, t in enumerate(times, start=1):
    bx = ball_pos(t)[0].x
    ax = att_x(t)
    tx = (ax * 0.6 + bx * 0.4) if t < TC + 0.6 else (ax * 0.5 + bx * 0.5)
    fx = tx if fx is None else fx + (tx - fx) * 0.18
    z = smooth(SLOW0 - 0.15, SLOW0 + 0.1, t) * (1 - smooth(SLOW1, SLOW1 + 0.5, t))
    # broadcast angle ahead of the play; at the tackle it swings low and in front so the slide is not hidden
    cam.location = (fx + 4.5 + 1.0 * z, 12.0 - 5.0 * z, 2.8 - 1.9 * z)
    aim.location = (fx + 0.3, -0.6 + 0.3 * z, 0.7 - 0.25 * z)
    cam_data.lens = 32 + 16 * z
    cam.keyframe_insert("location", frame=f)
    aim.keyframe_insert("location", frame=f)
    cam_data.keyframe_insert("lens", frame=f)
cam_data.dof.use_dof = True
cam_data.dof.focus_object = aim
cam_data.dof.aperture_fstop = 4.0

# ------------------------------------------------------------------ render settings
r = scene.render
r.resolution_x, r.resolution_y = (640, 360) if QUICK else (1280, 720)
r.resolution_percentage = 100
r.image_settings.file_format = "PNG"
r.filepath = os.path.join(OUT, "frames", "f_")
r.use_motion_blur = not QUICK
engine = os.environ.get("ENGINE", "CYCLES")
r.engine = engine
if engine == "CYCLES":
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12 if QUICK else 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.use_adaptive_sampling = True
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "slide_tackle.blend"))
print("frames", NF, "seconds", round(NF / FPS, 2))
