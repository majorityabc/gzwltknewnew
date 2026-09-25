#!/usr/bin/env python3
# physics_render.py —— 物理模型渲染器：stdin 读 JSON，stdout 输出 base64 PNG
# 用法: echo '{"model":"pendulum_force_decomposition","params":{...}}' | python3 physics_render.py
import sys, json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Arc
import io, base64

INK = "#111111"
FORCE = "#c81e1e"


def new_ax(w=6, h=5, xlim=(0, 10), ylim=(0, 8.4)):
    fig, ax = plt.subplots(figsize=(w, h), dpi=150)
    ax.set_xlim(*xlim); ax.set_ylim(*ylim)
    ax.set_aspect("equal"); ax.axis("off")
    return fig, ax


def ceiling(ax, x0, x1, y, hatch_up=0.35):
    ax.plot([x0, x1], [y, y], color=INK, lw=2.5)
    for x in np.arange(x0 + 0.15, x1, 0.42):
        ax.plot([x, x - 0.28], [y, y + hatch_up], color=INK, lw=1.4)


def arrow(ax, x0, y0, dx, dy, color=FORCE, lw=2.2):
    ax.annotate("", xy=(x0 + dx, y0 + dy), xytext=(x0, y0),
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, mutation_scale=22))


def label(ax, x, y, text, color=INK, size=15):
    ax.text(x, y, text, fontsize=size, color=color)


def angle_arc(ax, center, r, a1, a2, text=None, color=INK, text_r=None):
    arc = Arc(center, r * 2, r * 2, angle=0, theta1=min(a1, a2), theta2=max(a1, a2), color=color, lw=1.4)
    ax.add_patch(arc)
    if text:
        tr = text_r or (r + 0.35)
        mid = np.radians((a1 + a2) / 2)
        ax.text(center[0] + tr * np.cos(mid), center[1] + tr * np.sin(mid),
                text, fontsize=14, color=color, style="italic")


def render_pendulum(p):
    """单摆受力分解模板。params: theta_deg, angle_label, show_mg, show_mgcos, show_mgsin,
    label_mg, label_cos, label_sin, ball_label"""
    theta_deg = float(p.get("theta_deg", 32))
    th = np.radians(theta_deg)
    pivot = (6.2, 7.6); L = 5.2; R = 0.22
    bx, by = pivot[0] - L * np.sin(th), pivot[1] - L * np.cos(th)

    fig, ax = new_ax()
    ceiling(ax, 3.6, 8.8, 7.9)
    # 竖直虚线
    ax.plot([pivot[0], pivot[0]], [pivot[1], by - 1.2], "k--", lw=1.2)
    # 摆绳
    ax.plot([pivot[0], bx], [pivot[1], by], color=INK, lw=2)
    # 悬点 θ
    alabel = p.get("angle_label", "θ")
    angle_arc(ax, pivot, 1.5, -90 - theta_deg, -90, alabel)
    # 摆球
    ax.add_patch(plt.Circle((bx, by), R, fill=True, facecolor="white", edgecolor=INK, lw=2, zorder=5))
    if p.get("ball_label"):
        label(ax, bx - 0.15, by - 0.75, p["ball_label"], size=13)

    ux, uy = -np.sin(th), -np.cos(th)   # 沿绳向外
    vx, vy = np.cos(th), -np.sin(th)    # 垂直绳
    FL = 2.1
    if p.get("show_mgcos", True):
        arrow(ax, bx, by, ux * FL, uy * FL)
        label(ax, bx + ux * FL - 0.2, by + uy * FL - 0.5, p.get("label_cos", "mgcosθ"), FORCE, 14)
    if p.get("show_mgsin", True):
        arrow(ax, bx, by, vx * FL, vy * FL)
        label(ax, bx + vx * FL + 0.1, by + vy * FL - 0.3, p.get("label_sin", "mgsinθ"), FORCE, 14)
    if p.get("show_mg", True):
        arrow(ax, bx, by, 0, -FL * 0.95)
        label(ax, bx + 0.15, by - FL * 0.95 - 0.25, p.get("label_mg", "mg"), FORCE, 14)
        # 球心 θ 弧：竖直向下与沿绳向外之间
        ang_cos = np.degrees(np.arctan2(uy, ux))
        angle_arc(ax, (bx, by), 0.85, min(ang_cos, -90), max(ang_cos, -90), alabel, FORCE)
    return fig


TEMPLATES = {
    "pendulum_force_decomposition": render_pendulum,
}


def main():
    spec = json.load(sys.stdin)
    model = spec.get("model")
    fn = TEMPLATES.get(model)
    if not fn:
        print(json.dumps({"error": f"unknown model: {model}", "known": list(TEMPLATES)}))
        sys.exit(2)
    fig = fn(spec.get("params", {}))
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white", dpi=150)
    plt.close(fig)
    sys.stdout.write(base64.b64encode(buf.getvalue()).decode())


if __name__ == "__main__":
    main()
