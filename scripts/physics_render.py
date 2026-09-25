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


def render_parabola_steps(p):
    """抛物线轨迹阶梯分解图（平抛/类平抛/电场偏转）：多条带箭头水平平行线 +
    上凸抛物线轨迹 + 蓝色阶梯投影（曲线上的点竖直投影到下一根线再水平走）。
    params: n_lines, exponent, show_steps, n_steps,
            label_A/label_B/label_C（区域标签，空串不显示）,
            labels_curve（曲线上点标签，逗号分隔，默认 C1,C2）,
            labels_foot（阶梯脚标签，逗号分隔，默认 B1,B2,B3）,
            traj_color, step_color"""
    n_lines = int(p.get("n_lines", 4))
    n_lines = max(2, min(n_lines, 6))
    exponent = float(p.get("exponent", 2))
    traj_c = p.get("traj_color", FORCE)
    step_c = p.get("step_color", "#1d4ed8")

    fig, ax = new_ax()
    y_lo, y_hi = 1.4, 7.0
    ys = np.linspace(y_lo, y_hi, n_lines)          # 平行线高度
    for y in ys:
        ax.annotate("", xy=(9.6, y), xytext=(0.4, y),
                    arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.8,
                                    shrinkA=0, shrinkB=0))

    # 轨迹：从第二根线（自下而上）上一点爬升到顶线；终点右侧留一段给阶梯水平段+右边框
    x_s = 2.2
    x_e = 8.6                      # 右边框位置
    x_end = x_e - 1.1              # 轨迹终点（顶线交点）
    y_s, y_e = ys[1], ys[-1]
    xs = np.linspace(x_s, x_end, 200)
    u = (xs - x_s) / (x_end - x_s)
    ytr = y_s + (y_e - y_s) * u ** exponent
    ax.plot(xs, ytr, color=traj_c, lw=2.6, zorder=4)
    ax.plot([x_s, x_end], [y_s, y_e], "o", color=traj_c, ms=7, zorder=5)
    # 红色右边框 + 底边（原图：曲线与右边、底边围成区域）
    if p.get("show_frame", True):
        ax.plot([x_e, x_e], [y_e + 0.35, y_s], color=traj_c, lw=2.6, zorder=4)
        ax.plot([x_e, x_s], [y_s, y_s], color=traj_c, lw=2.6, zorder=4)

    # 阶梯投影：从曲线上等距点竖直降到下一根线，再水平走到下一竖线
    def split_labels(key, default):
        v = p.get(key, default)
        return [s.strip() for s in str(v).split(",") if s.strip()]
    if p.get("show_steps", True):
        labels_curve = split_labels("labels_curve", "C1,C2")
        labels_foot = split_labels("labels_foot", "B1,B2,B3")
        # 阶梯顶点 = 轨迹与各平行线的交点；水平段沿平行线走，交点处爬升，
        # 最后一级水平延伸到红色右边框为止
        cross_ys = [y for y in ys if y_s + 0.01 < y <= y_e + 0.01]
        crossings = []
        for yc in cross_ys:
            u = ((yc - y_s) / (y_e - y_s)) ** (1.0 / exponent)
            crossings.append((x_s + (x_end - x_s) * u, yc))
        level = y_s
        prev_x = x_s
        for i, (x0, y0) in enumerate(crossings):
            # 水平段沿上一层高度
            ax.plot([prev_x, x0], [level, level], color=step_c, lw=2, zorder=4)
            # 竖直爬升到曲线交点
            ax.plot([x0, x0], [level, y0], color=step_c, lw=2, zorder=4)
            ax.plot([x0], [y0], "o", color=step_c, ms=6, zorder=5)
            # 曲线点标签（左上）
            if i < len(labels_curve):
                label(ax, x0 - 0.55, y0 + 0.3, labels_curve[i], step_c, 14)
            # 脚标签：竖直爬升段的底部右下（B2 等；最后一级留给顶部右端 B3）
            if i + 1 < len(labels_foot) and i + 1 < len(crossings):
                label(ax, x0 + 0.12, level - 0.5, labels_foot[i + 1], step_c, 14)
            level = y0
            prev_x = x0
        # 顶部水平段从最后交点延伸到红色右边框，右端标签（B3）
        ax.plot([prev_x, x_e], [level, level], color=step_c, lw=2, zorder=4)
        if len(labels_foot) > len(crossings) - 1:
            label(ax, x_e - 0.55, level - 0.55, labels_foot[-1], step_c, 14)
        # 起点脚标签（B1）
        if labels_foot:
            label(ax, x_s + 0.4, y_s - 0.7, labels_foot[0], step_c, 14)

    # 区域标签
    if p.get("label_C", "C"):
        label(ax, 7.2, y_hi + 0.55, p.get("label_C", "C"), traj_c, 16)
    if p.get("label_B", "B"):
        label(ax, 9.0, ys[1] - 0.85, p.get("label_B", "B"), traj_c, 16)
    if p.get("label_A", "A"):
        label(ax, 1.2, y_lo - 0.85, p.get("label_A", "A"), traj_c, 16)
    return fig


TEMPLATES = {
    "pendulum_force_decomposition": render_pendulum,
    "parabola_step_decomposition": render_parabola_steps,
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
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0.04, facecolor="white", dpi=150)
    plt.close(fig)
    sys.stdout.write(base64.b64encode(buf.getvalue()).decode())


if __name__ == "__main__":
    main()
