"""Writes kits.json (who wears what, in which pose) and jobs_final.json (the pictures)."""
import json
import os

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace("\\", "/")
o = lambda n: f"{H}/out/{n}"
r = lambda n: f"{H}/renders/{n}.png"

kits = [
    dict(name="trainee", src=o("worker_a.blend"), out=o("h_trainee.blend"), pose="seated", headset="on", controllers=True, chair=True),
    dict(name="trainee_b", src=o("worker_b.blend"), out=o("h_trainee_b.blend"), pose="seated", headset="on", controllers=True, chair=True,
         head_turn=13, head_pitch=2, fore={"L": [-0.10, -0.90, 0.42], "R": [0.20, -0.95, 0.22]}),
    dict(name="trainee_c", src=o("worker_a.blend"), out=o("h_trainee_c.blend"), pose="seated", headset="on", controllers=True, chair=True,
         head_turn=-12, head_pitch=9, fore={"L": [-0.22, -0.95, 0.20], "R": [0.12, -0.90, 0.40]}),
    dict(name="trainee_d", src=o("worker_b.blend"), out=o("h_trainee_d.blend"), pose="seated", headset="on", controllers=True, chair=True,
         head_turn=-5, head_pitch=6, fore={"L": [-0.14, -0.97, 0.16], "R": [0.14, -0.97, 0.18]}),
    dict(name="worker", src=o("worker_a.blend"), out=o("h_worker.blend"), pose="stand", helmet=True, vest=True, headset="hand", head_turn=10),
]
json.dump(kits, open(f"{H}/kits.json", "w"), indent=1)

BLUE, ORANGE, GREEN, GREY = (0.05, 0.16, 0.42), (0.50, 0.13, 0.03), (0.06, 0.24, 0.12), (0.16, 0.17, 0.19)
YEL, RED, GRN, CYA = (0.95, 0.72, 0.02), (1.0, 0.25, 0.08), (0.2, 0.9, 0.3), (0.2, 0.7, 1.0)
t = lambda kit, **kw: dict(blend=o(f"h_{kit}.blend"), name=kw.pop("name", "P_" + kit), **kw)

jobs = [
    dict(people=[t("trainee")], shots=[
        dict(out=r("vr_trainee"), az=32, el=4, lens=70, w=1800, h=2400, samples=320),
        dict(out=r("vr_trainee_side"), az=84, el=2, lens=70, w=1800, h=2400, samples=320, key_side=-1.0),
        dict(out=r("vr_headset"), az=40, el=2, lens=85, w=1800, h=1500, samples=320, margin=0.20, light_fit=True,
             fit=["H_trainee_HS_Visor", "H_trainee_HS_Cradle", "H_trainee_HS_Top"]),
    ]),
    dict(people=[t("worker")], shots=[
        dict(out=r("worker"), az=-24, el=3, lens=70, w=1600, h=2400, samples=320),
        dict(out=r("worker_b"), az=28, el=3, lens=70, w=1600, h=2400, samples=320, key_side=-1.0),
    ]),
    dict(people=[
        t("trainee_c", name="P1", loc=[-1.62, -0.42, 0], rot=180 - 22, suit=ORANGE, accent=RED),
        t("trainee", name="P2", loc=[-0.55, 0.0, 0], rot=180 - 7, suit=BLUE, accent=YEL),
        t("trainee_b", name="P3", loc=[0.55, 0.0, 0], rot=180 + 7, suit=GREEN, accent=GRN),
        t("trainee_d", name="P4", loc=[1.62, -0.42, 0], rot=180 + 22, suit=GREY, accent=CYA),
    ], shots=[
        dict(out=r("vr_crew"), az=0, el=5, lens=60, w=3600, h=1700, samples=320, margin=0.05),
        dict(out=r("vr_pair"), az=-8, el=4, lens=70, w=2400, h=1900, samples=320, margin=0.06, fit=["P2", "P3"], hide_people=["P1", "P4"]),
    ]),
    dict(machine=dict(machine="Excavator", pose=dict(boom=14, stick=66, bucket=28)),
         people=[t("worker", name="PW", loc=[-3.1, 3.6, 0], rot=180 + 58 - 24)],
         shots=[dict(out=r("worker_scale"), az=58, el=2, lens=30, w=3400, h=1700, samples=300)]),
]
json.dump(jobs, open(f"{H}/jobs_final.json", "w"), indent=1)
print("wrote kits.json and jobs_final.json")
